const express = require("express");
const { getDb } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const WEEK_NAMES  = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const LIMIT_SEC   = 900; // 15 min

function today() { return new Date().toISOString().slice(0,10); }

function scopeFilter(req, db, { groupIdParam, userIdParam } = {}) {
  const role = req.user.role;
  let filter = ""; const params = [];
  if (role === "leader" && role !== "gerencia") {
    const grp = db.prepare("SELECT id FROM groups WHERE leader_id=?").get(req.user.id);
    if (!grp) return null;
    filter = "AND a.group_id=? AND EXISTS (SELECT 1 FROM users u WHERE u.id=a.user_id AND u.role='employee')";
    params.push(grp.id);
  } else if (groupIdParam) {
    filter = "AND a.group_id=?"; params.push(groupIdParam);
  } else if (userIdParam) {
    filter = "AND a.user_id=?"; params.push(userIdParam);
  }
  return { filter, params };
}

// ── Escalas overview ──────────────────────────────────────────────────────────
router.get("/overview", requireAuth, requireRole("hr","leader"), (req, res) => {
  const db = getDb();
  const totalUsers        = db.prepare("SELECT COUNT(*) as c FROM users WHERE active=1").get().c;
  const totalUsersHistory = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
  const deactivatedUsers  = db.prepare("SELECT COUNT(*) as c FROM users WHERE active=0 AND deactivated_at IS NOT NULL").get().c;
  const totalGroups       = db.prepare("SELECT COUNT(*) as c FROM groups").get().c;
  const pendingSwaps      = db.prepare("SELECT COUNT(*) as c FROM swap_requests WHERE status='pending'").get().c;
  const totalSatScheduled = db.prepare("SELECT COUNT(DISTINCT date) as c FROM schedules").get().c;
  const approvedSwaps     = db.prepare("SELECT COUNT(*) as c FROM swap_requests WHERE status='approved'").get().c;
  const rejectedSwaps     = db.prepare("SELECT COUNT(*) as c FROM swap_requests WHERE status='rejected'").get().c;
  const totalSwaps        = db.prepare("SELECT COUNT(*) as c FROM swap_requests").get().c;
  const swapsByStatus     = db.prepare("SELECT status, COUNT(*) as count FROM swap_requests GROUP BY status").all();

  const groupSizes = db.prepare(`
    SELECT g.id, g.name, g.color, g.team, COUNT(gm.user_id) as member_count
    FROM groups g LEFT JOIN group_members gm ON gm.group_id=g.id
    JOIN users u ON u.id=gm.user_id AND u.active=1
    GROUP BY g.id ORDER BY g.name
  `).all();

  const monthlyWorking = db.prepare(`
    SELECT strftime('%Y-%m',date) as month, COUNT(*) as total_people, COUNT(DISTINCT date) as saturdays
    FROM schedules WHERE status='working'
    GROUP BY month ORDER BY month DESC LIMIT 6
  `).all().reverse().map(m => {
    const [y,mo] = m.month.split("-");
    return { ...m, label: `${MONTH_NAMES[parseInt(mo)-1]}/${y.slice(2)}` };
  });

  const monthlySwaps = db.prepare(`
    SELECT strftime('%Y-%m',created_at) as month,
      SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status='pending'  THEN 1 ELSE 0 END) as pending,
      COUNT(*) as total
    FROM swap_requests GROUP BY month ORDER BY month DESC LIMIT 6
  `).all().reverse().map(m => {
    const [y,mo] = m.month.split("-");
    return { ...m, label: `${MONTH_NAMES[parseInt(mo)-1]}/${y.slice(2)}` };
  });

  const deptDistribution = db.prepare(`
    SELECT dept, COUNT(*) as count FROM users
    WHERE active=1 AND dept IS NOT NULL AND dept!=''
    GROUP BY dept ORDER BY count DESC LIMIT 10
  `).all();

  const groupSwapActivity = db.prepare(`
    SELECT g.name, g.color, COUNT(sr.id) as swap_count
    FROM groups g LEFT JOIN swap_requests sr ON sr.group_id=g.id
    GROUP BY g.id ORDER BY swap_count DESC LIMIT 8
  `).all();

  const recentlyDeactivated = db.prepare(`
    SELECT username, full_name, dept, deactivated_at FROM users
    WHERE active=0 AND deactivated_at IS NOT NULL
    ORDER BY deactivated_at DESC LIMIT 10
  `).all();

  const approvalRate = totalSwaps>0 ? Math.round((approvedSwaps/totalSwaps)*100) : 0;

  return res.json({
    stats: { totalUsers, totalUsersHistory, deactivatedUsers, totalGroups, pendingSwaps, totalSatScheduled, totalSwaps, approvedSwaps, rejectedSwaps, approvalRate },
    swapsByStatus, groupSizes, monthlyWorking, monthlySwaps, deptDistribution, groupSwapActivity, recentlyDeactivated,
  });
});

// ── Relatórios de ausências ───────────────────────────────────────────────────

// GET /reports/absences/overview — KPIs + ranking + desvios
router.get("/absences/overview", requireAuth, requireRole("hr","leader"), (req, res) => {
  const db = getDb();
  const {
    dateFrom = new Date(Date.now()-30*86400000).toISOString().slice(0,10),
    dateTo   = today(),
    groupId, userId,
  } = req.query;

  const sc = scopeFilter(req, db, { groupIdParam: groupId, userIdParam: userId });
  if (!sc) return res.json({ rows:[], globalAvg:0, totalAbsences:0, overLimitCount:0 });

  const rows = db.prepare(`
    SELECT a.user_id, u.full_name, u.username, g.name as group_name, g.color as group_color,
      COUNT(*) as total_absences,
      COALESCE(SUM(a.duration_sec),0) as total_sec,
      COALESCE(AVG(a.duration_sec),0) as avg_sec,
      SUM(CASE WHEN a.duration_sec>${LIMIT_SEC} THEN 1 ELSE 0 END) as over_limit_count,
      COUNT(DISTINCT a.date) as days_with_absence,
      MAX(a.started_at) as last_absence
    FROM absences a
    JOIN users u ON u.id=a.user_id
    LEFT JOIN groups g ON g.id=a.group_id
    WHERE a.date BETWEEN ? AND ? AND a.ended_at IS NOT NULL ${sc.filter}
    GROUP BY a.user_id ORDER BY total_sec DESC
  `).all(dateFrom, dateTo, ...sc.params);

  const globalAvg = rows.length>0 ? rows.reduce((s,r)=>s+r.avg_sec,0)/rows.length : 0;
  const totalAbsences  = rows.reduce((s,r)=>s+r.total_absences,0);
  const overLimitCount = rows.reduce((s,r)=>s+r.over_limit_count,0);
  const complianceRate = totalAbsences>0 ? Math.round(((totalAbsences-overLimitCount)/totalAbsences)*100) : 100;

  return res.json({
    rows: rows.map(r => ({
      ...r,
      avg_sec:    Math.round(r.avg_sec),
      total_sec:  Math.round(r.total_sec),
      deviation:  Math.round(r.avg_sec - globalAvg),
    })),
    globalAvg: Math.round(globalAvg),
    totalAbsences, overLimitCount, complianceRate, dateFrom, dateTo,
  });
});

// GET /reports/absences/by-group — comparativo entre grupos
router.get("/absences/by-group", requireAuth, requireRole("hr","leader"), (req, res) => {
  const db = getDb();
  const { dateFrom = new Date(Date.now()-30*86400000).toISOString().slice(0,10), dateTo = today() } = req.query;

  const rows = db.prepare(`
    SELECT g.id, g.name, g.color, g.team,
      COUNT(a.id) as total_absences,
      COALESCE(AVG(a.duration_sec),0) as avg_sec,
      SUM(CASE WHEN a.duration_sec>${LIMIT_SEC} THEN 1 ELSE 0 END) as over_limit,
      COUNT(DISTINCT a.user_id) as unique_users
    FROM groups g
    LEFT JOIN absences a ON a.group_id=g.id AND a.date BETWEEN ? AND ? AND a.ended_at IS NOT NULL
    GROUP BY g.id ORDER BY avg_sec DESC
  `).all(dateFrom, dateTo);

  return res.json(rows.map(r => ({ ...r, avg_sec: Math.round(r.avg_sec) })));
});

// GET /reports/absences/by-day — distribuição por dia da semana
router.get("/absences/by-day", requireAuth, requireRole("hr","leader"), (req, res) => {
  const db = getDb();
  const { dateFrom = new Date(Date.now()-30*86400000).toISOString().slice(0,10), dateTo = today(), groupId } = req.query;

  const sc = scopeFilter(req, db, { groupIdParam: groupId });
  if (!sc) return res.json([]);

  const rows = db.prepare(`
    SELECT strftime('%w', a.date) as dow,
      COUNT(*) as count,
      COALESCE(AVG(a.duration_sec),0) as avg_sec
    FROM absences a
    WHERE a.date BETWEEN ? AND ? AND a.ended_at IS NOT NULL ${sc.filter}
    GROUP BY dow ORDER BY dow
  `).all(dateFrom, dateTo, ...sc.params);

  // Preenche dias sem dados
  const result = Array.from({length:7},(_,i) => {
    const found = rows.find(r=>parseInt(r.dow)===i);
    return { dow:i, label:WEEK_NAMES[i], count:found?.count||0, avg_sec:Math.round(found?.avg_sec||0) };
  });
  return res.json(result);
});

// GET /reports/absences/heatmap — horários de saída (hora x dia da semana)
router.get("/absences/heatmap", requireAuth, requireRole("hr","leader"), (req, res) => {
  const db = getDb();
  const { dateFrom = new Date(Date.now()-30*86400000).toISOString().slice(0,10), dateTo = today(), groupId } = req.query;

  const sc = scopeFilter(req, db, { groupIdParam: groupId });
  if (!sc) return res.json([]);

  const rows = db.prepare(`
    SELECT
      strftime('%w', a.started_at) as dow,
      CAST(strftime('%H', a.started_at) AS INTEGER) as hour,
      COUNT(*) as count
    FROM absences a
    WHERE a.date BETWEEN ? AND ? AND a.ended_at IS NOT NULL ${sc.filter}
    GROUP BY dow, hour
  `).all(dateFrom, dateTo, ...sc.params);

  return res.json(rows.map(r => ({ dow:parseInt(r.dow), hour:r.hour, count:r.count, label:`${WEEK_NAMES[parseInt(r.dow)]} ${r.hour}h` })));
});

// GET /reports/absences/trend — evolução mensal/semanal
router.get("/absences/trend", requireAuth, requireRole("hr","leader"), (req, res) => {
  const db = getDb();
  const { period = "month", dateFrom = new Date(Date.now()-180*86400000).toISOString().slice(0,10), dateTo = today(), groupId } = req.query;

  const sc = scopeFilter(req, db, { groupIdParam: groupId });
  if (!sc) return res.json([]);

  const fmt = period==="week" ? "%Y-W%W" : "%Y-%m";
  const rows = db.prepare(`
    SELECT strftime('${fmt}', a.date) as period,
      COUNT(*) as count,
      COALESCE(AVG(a.duration_sec),0) as avg_sec,
      SUM(CASE WHEN a.duration_sec>${LIMIT_SEC} THEN 1 ELSE 0 END) as over_limit
    FROM absences a
    WHERE a.date BETWEEN ? AND ? AND a.ended_at IS NOT NULL ${sc.filter}
    GROUP BY period ORDER BY period
  `).all(dateFrom, dateTo, ...sc.params);

  return res.json(rows.map(r => ({ ...r, avg_sec:Math.round(r.avg_sec) })));
});

// GET /reports/absences/compare — comparativo mês a mês
router.get("/absences/compare", requireAuth, requireRole("hr","leader"), (req, res) => {
  const db = getDb();
  const { month1, month2, groupId } = req.query;
  if (!month1 || !month2) return res.status(400).json({ error: "month1 e month2 obrigatórios (YYYY-MM)" });

  const sc = scopeFilter(req, db, { groupIdParam: groupId });
  if (!sc) return res.json({ m1:[], m2:[] });

  const query = (m) => db.prepare(`
    SELECT a.user_id, u.full_name, g.name as group_name, g.color as group_color,
      COUNT(*) as count, COALESCE(AVG(a.duration_sec),0) as avg_sec,
      SUM(CASE WHEN a.duration_sec>${LIMIT_SEC} THEN 1 ELSE 0 END) as over_limit
    FROM absences a JOIN users u ON u.id=a.user_id LEFT JOIN groups g ON g.id=a.group_id
    WHERE strftime('%Y-%m',a.date)=? AND a.ended_at IS NOT NULL ${sc.filter}
    GROUP BY a.user_id ORDER BY avg_sec DESC
  `).all(m, ...sc.params).map(r=>({...r, avg_sec:Math.round(r.avg_sec)}));

  const [m1data, m2data] = [query(month1), query(month2)];

  // Merge para comparação lado a lado
  const userIds = [...new Set([...m1data.map(r=>r.user_id), ...m2data.map(r=>r.user_id)])];
  const merged = userIds.map(uid => ({
    user_id: uid,
    full_name: (m1data.find(r=>r.user_id===uid)||m2data.find(r=>r.user_id===uid)).full_name,
    group_name: (m1data.find(r=>r.user_id===uid)||m2data.find(r=>r.user_id===uid)).group_name,
    group_color: (m1data.find(r=>r.user_id===uid)||m2data.find(r=>r.user_id===uid)).group_color,
    m1: m1data.find(r=>r.user_id===uid) || { count:0, avg_sec:0, over_limit:0 },
    m2: m2data.find(r=>r.user_id===uid) || { count:0, avg_sec:0, over_limit:0 },
  })).map(r=>({ ...r, delta: r.m2.avg_sec - r.m1.avg_sec }))
    .sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));

  return res.json({ merged, month1, month2, m1data, m2data });
});

// GET /reports/absences/alerts — padrões anormais
router.get("/absences/alerts", requireAuth, requireRole("hr","leader"), (req, res) => {
  const db = getDb();
  const { dateFrom = new Date(Date.now()-30*86400000).toISOString().slice(0,10), dateTo = today(), groupId } = req.query;

  const sc = scopeFilter(req, db, { groupIdParam: groupId });
  if (!sc) return res.json([]);

  const rows = db.prepare(`
    SELECT a.user_id, u.full_name, g.name as group_name, g.color as group_color,
      COUNT(*) as total,
      SUM(CASE WHEN a.duration_sec>${LIMIT_SEC} THEN 1 ELSE 0 END) as over_limit,
      COALESCE(AVG(a.duration_sec),0) as avg_sec,
      MAX(a.duration_sec) as max_sec,
      COUNT(DISTINCT a.date) as days
    FROM absences a JOIN users u ON u.id=a.user_id LEFT JOIN groups g ON g.id=a.group_id
    WHERE a.date BETWEEN ? AND ? AND a.ended_at IS NOT NULL ${sc.filter}
    GROUP BY a.user_id HAVING over_limit>=2 OR avg_sec>${LIMIT_SEC}
    ORDER BY over_limit DESC, avg_sec DESC
  `).all(dateFrom, dateTo, ...sc.params);

  // Calcula global avg para detectar desvio
  const globalData = db.prepare(`
    SELECT COALESCE(AVG(duration_sec),0) as gavg FROM absences
    WHERE date BETWEEN ? AND ? AND ended_at IS NOT NULL
  `).get(dateFrom, dateTo);
  const gAvg = globalData.gavg;

  return res.json(rows.map(r => {
    const alerts = [];
    if (r.over_limit>=3) alerts.push({ level:"high",   msg:`Ultrapassou o limite ${r.over_limit}x no período` });
    else if (r.over_limit>=2) alerts.push({ level:"medium", msg:`Ultrapassou o limite ${r.over_limit}x no período` });
    if (r.avg_sec>gAvg*1.5) alerts.push({ level:"medium", msg:`Média ${Math.round((r.avg_sec/gAvg-1)*100)}% acima da empresa` });
    if (r.total>10) alerts.push({ level:"low", msg:`${r.total} saídas registradas — frequência elevada` });
    return { ...r, avg_sec:Math.round(r.avg_sec), max_sec:Math.round(r.max_sec), gAvg:Math.round(gAvg), alerts };
  }));
});

// ── Relatório individual de usuário ──────────────────────────────────────────
router.get("/user/:id", requireAuth, (req, res) => {
  if (req.user.role==="employee" && req.user.id!==req.params.id)
    return res.status(403).json({ error:"Sem permissão" });
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);
  if (!user) return res.status(404).json({ error:"Não encontrado" });

  const workDays = db.prepare(`SELECT s.date,s.group_id,g.name as group_name,g.color FROM schedules s JOIN groups g ON g.id=s.group_id WHERE s.user_id=? AND s.status='working' ORDER BY s.date`).all(req.params.id);
  const offDays  = db.prepare(`SELECT s.date,s.group_id,g.name as group_name,g.color FROM schedules s JOIN groups g ON g.id=s.group_id WHERE s.user_id=? AND s.status='off' ORDER BY s.date`).all(req.params.id);
  const swaps    = db.prepare(`SELECT sr.*,req.full_name as requester_name,cov.full_name as coverer_name FROM swap_requests sr JOIN users req ON req.id=sr.requester_id JOIN users cov ON cov.id=sr.coverer_id WHERE sr.requester_id=? OR sr.coverer_id=? ORDER BY sr.created_at DESC`).all(req.params.id,req.params.id);
  const monthlyActivity = db.prepare(`SELECT strftime('%Y-%m',date) as month, SUM(CASE WHEN status='working' THEN 1 ELSE 0 END) as working, SUM(CASE WHEN status='off' THEN 1 ELSE 0 END) as off FROM schedules WHERE user_id=? GROUP BY month ORDER BY month`).all(req.params.id).map(m=>{const[y,mo]=m.month.split("-");return{...m,label:`${MONTH_NAMES[parseInt(mo)-1]}/${y.slice(2)}`};});

  return res.json({
    user:{id:user.id,username:user.username,fullName:user.full_name,email:user.email,dept:user.dept,title:user.title,role:user.role,active:Boolean(user.active),deactivatedAt:user.deactivated_at},
    working:workDays,off:offDays,swaps,monthlyActivity,
  });
});

router.get("/group/:id", requireAuth, requireRole("hr","leader"), (req, res) => {
  const db = getDb();
  const group = db.prepare("SELECT * FROM groups WHERE id=?").get(req.params.id);
  if (!group) return res.status(404).json({ error:"Não encontrado" });
  const membersStats = db.prepare(`
    SELECT u.id,u.full_name,u.username,u.active,
      SUM(CASE WHEN s.status='working' THEN 1 ELSE 0 END) as working_count,
      SUM(CASE WHEN s.status='off'     THEN 1 ELSE 0 END) as off_count
    FROM group_members gm JOIN users u ON u.id=gm.user_id
    LEFT JOIN schedules s ON s.user_id=u.id AND s.group_id=?
    WHERE gm.group_id=? GROUP BY u.id ORDER BY u.active DESC,working_count DESC
  `).all(req.params.id,req.params.id);
  return res.json({ group, membersStats });
});

module.exports = router;
