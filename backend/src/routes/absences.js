const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const LIMIT_SECONDS = 900;
const WEEK_NAMES = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function today() { return new Date().toISOString().slice(0, 10); }
function nowISO() { return new Date().toISOString(); }
function isAdmin(role)  { return role === "hr" || role === "ti" || role === "gerencia"; }
function isLeader(role) { return role === "leader" || role === "gerencia" || isAdmin(role); }

// Returns all group IDs a leader manages (primary leader + co-leader)
function getLeaderGroupIds(db, userId) {
  const primary = db.prepare("SELECT id FROM groups WHERE leader_id=?").all(userId);
  const co      = db.prepare("SELECT group_id as id FROM group_co_leaders WHERE user_id=?").all(userId);
  return [...new Set([...primary.map(g => g.id), ...co.map(g => g.id)])];
}

// POST /start
router.post("/start", requireAuth, (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const open = db.prepare("SELECT id FROM absences WHERE user_id=? AND ended_at IS NULL").get(uid);
  if (open) return res.status(400).json({ error: "Já existe uma ausência em aberto" });
  const group = db.prepare("SELECT group_id FROM group_members WHERE user_id=? LIMIT 1").get(uid);
  const id = uuidv4(); const now = nowISO();
  db.prepare("INSERT INTO absences (id, user_id, group_id, date, started_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, uid, group?.group_id || null, today(), now);
  return res.status(201).json({ id, startedAt: now });
});

// POST /end
router.post("/end", requireAuth, (req, res) => {
  const db = getDb();
  const open = db.prepare("SELECT * FROM absences WHERE user_id=? AND ended_at IS NULL").get(req.user.id);
  if (!open) return res.status(400).json({ error: "Nenhuma ausência em aberto" });
  const now = new Date();
  const durSec = Math.round((now - new Date(open.started_at)) / 1000);
  db.prepare("UPDATE absences SET ended_at=?, duration_sec=? WHERE id=?")
    .run(now.toISOString(), durSec, open.id);
  return res.json({ id: open.id, startedAt: open.started_at, endedAt: now.toISOString(), durationSec: durSec, overLimit: durSec > LIMIT_SECONDS });
});

// GET /status
router.get("/status", requireAuth, (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const open = db.prepare("SELECT * FROM absences WHERE user_id=? AND ended_at IS NULL").get(uid);
  const todayTotal = db.prepare("SELECT COALESCE(SUM(duration_sec),0) as total FROM absences WHERE user_id=? AND date=? AND ended_at IS NOT NULL").get(uid, today());
  return res.json({ isOut: !!open, openAbsence: open || null, todayTotalSec: todayTotal.total });
});

// GET /me/stats — estatísticas pessoais completas com comparativos
router.get("/me/stats", requireAuth, (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const {
    dateFrom = new Date(Date.now()-30*86400000).toISOString().slice(0,10),
    dateTo   = today(),
  } = req.query;

  // Dados pessoais no período
  const myRows = db.prepare(`
    SELECT * FROM absences
    WHERE user_id=? AND date BETWEEN ? AND ? AND ended_at IS NOT NULL
    ORDER BY started_at
  `).all(uid, dateFrom, dateTo);

  const totalAbsences  = myRows.length;
  const totalSec       = myRows.reduce((s,r)=>s+(r.duration_sec||0),0);
  const avgSec         = totalAbsences>0 ? Math.round(totalSec/totalAbsences) : 0;
  const overLimitCount = myRows.filter(r=>r.duration_sec>LIMIT_SECONDS).length;
  const maxSec         = myRows.length>0 ? Math.max(...myRows.map(r=>r.duration_sec||0)) : 0;
  const minSec         = myRows.filter(r=>r.duration_sec>0).length>0 ? Math.min(...myRows.filter(r=>r.duration_sec>0).map(r=>r.duration_sec)) : 0;

  // Saídas hoje
  const todaySecs = db.prepare(`SELECT COALESCE(SUM(duration_sec),0) as t, COUNT(*) as c FROM absences WHERE user_id=? AND date=? AND ended_at IS NOT NULL`).get(uid, today());

  // Por dia da semana
  const byDow = Array.from({length:7},(_,i)=>({ dow:i, label:WEEK_NAMES[i], count:0, total_sec:0, avg_sec:0 }));
  for (const r of myRows) {
    const dow = new Date(r.date+"T12:00:00").getDay();
    byDow[dow].count++;
    byDow[dow].total_sec += r.duration_sec||0;
  }
  byDow.forEach(d=>{ d.avg_sec = d.count>0 ? Math.round(d.total_sec/d.count) : 0; });

  // Por hora do dia
  const byHour = {};
  for (const r of myRows) {
    const h = parseInt((r.started_at||"").slice(11,13));
    if (!byHour[h]) byHour[h] = { hour:h, count:0, total_sec:0 };
    byHour[h].count++;
    byHour[h].total_sec += r.duration_sec||0;
  }
  const byHourArr = Object.values(byHour)
    .map(h=>({ ...h, avg_sec:Math.round(h.total_sec/h.count) }))
    .sort((a,b)=>a.hour-b.hour);

  // Evolução diária
  const byDay = {};
  for (const r of myRows) {
    if (!byDay[r.date]) byDay[r.date] = { date:r.date, count:0, total_sec:0 };
    byDay[r.date].count++;
    byDay[r.date].total_sec += r.duration_sec||0;
  }
  const byDayArr = Object.values(byDay)
    .map(d=>({ ...d, avg_sec:Math.round(d.total_sec/d.count), label:d.date.slice(5) }))
    .sort((a,b)=>a.date.localeCompare(b.date));

  // Média do grupo do usuário (exceto o próprio)
  const grp = db.prepare("SELECT group_id FROM group_members WHERE user_id=? LIMIT 1").get(uid);
  let teamAvg = null;
  if (grp) {
    const teamData = db.prepare(`
      SELECT COALESCE(AVG(duration_sec),0) as avg FROM absences
      WHERE group_id=? AND user_id!=? AND date BETWEEN ? AND ? AND ended_at IS NOT NULL
    `).get(grp.group_id, uid, dateFrom, dateTo);
    teamAvg = Math.round(teamData.avg);
  }

  // Média global da empresa
  const globalData = db.prepare(`
    SELECT COALESCE(AVG(duration_sec),0) as avg FROM absences
    WHERE user_id!=? AND date BETWEEN ? AND ? AND ended_at IS NOT NULL
  `).get(uid, dateFrom, dateTo);
  const globalAvg = Math.round(globalData.avg);

  // Dias com mais de 1 saída
  const daysMultiple = Object.values(byDay).filter(d=>d.count>1).length;

  // Tendência: compara primeira metade vs segunda metade do período
  const mid = new Date((new Date(dateFrom).getTime()+new Date(dateTo).getTime())/2).toISOString().slice(0,10);
  const firstHalf  = myRows.filter(r=>r.date<=mid);
  const secondHalf = myRows.filter(r=>r.date>mid);
  const avgFirst  = firstHalf.length>0  ? Math.round(firstHalf.reduce((s,r)=>s+r.duration_sec,0)/firstHalf.length)  : 0;
  const avgSecond = secondHalf.length>0 ? Math.round(secondHalf.reduce((s,r)=>s+r.duration_sec,0)/secondHalf.length) : 0;
  const trend = avgSecond>avgFirst ? "alta" : avgSecond<avgFirst ? "queda" : "estável";

  return res.json({
    summary: { totalAbsences, totalSec, avgSec, overLimitCount, maxSec, minSec, daysMultiple, trend,
      todayCount: todaySecs.c, todaySec: todaySecs.t },
    comparison: { myAvg: avgSec, teamAvg, globalAvg,
      vsTeam:   teamAvg   ? Math.round(avgSec-teamAvg)   : null,
      vsGlobal: globalAvg ? Math.round(avgSec-globalAvg) : null },
    byDow, byHourArr, byDayArr,
    dateFrom, dateTo,
  });
});

// GET / — listagem com escopo por role
router.get("/", requireAuth, (req, res) => {
  const db = getDb();
  const role = req.user.role;
  const { userId, groupId, dateFrom = new Date(Date.now()-30*86400000).toISOString().slice(0,10), dateTo = today(), page = 1, limit = 100 } = req.query;

  let where = "WHERE a.date BETWEEN ? AND ?";
  const params = [dateFrom, dateTo];

  if (role === "employee") {
    where += " AND a.user_id = ?"; params.push(req.user.id);
  } else if (role === "leader" || role === "gerencia") {
    const groupIds = getLeaderGroupIds(db, req.user.id);
    if (!groupIds.length) return res.json({ rows: [], total: 0 });
    if (userId) {
      const isMember = groupIds.some(gid =>
        db.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?").get(gid, userId)
      );
      if (!isMember) return res.status(403).json({ error: "Usuário não pertence ao seu grupo" });
      where += " AND a.user_id = ?"; params.push(userId);
    } else {
      const ph = groupIds.map(() => "?").join(",");
      where += ` AND a.group_id IN (${ph}) AND EXISTS (SELECT 1 FROM users u WHERE u.id=a.user_id AND u.role='employee')`;
      params.push(...groupIds);
    }
  } else if (isAdmin(role)) {
    if (userId)  { where += " AND a.user_id = ?";  params.push(userId); }
    if (groupId) { where += " AND a.group_id = ?"; params.push(groupId); }
  }

  const offset = (Number(page)-1)*Number(limit);
  const rows = db.prepare(`
    SELECT a.*, u.full_name, u.username, u.dept, g.name as group_name, g.color as group_color
    FROM absences a JOIN users u ON u.id=a.user_id LEFT JOIN groups g ON g.id=a.group_id
    ${where} ORDER BY a.started_at DESC LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);
  const total = db.prepare(`SELECT COUNT(*) as c FROM absences a ${where}`).get(...params).c;

  return res.json({ rows: rows.map(fmt), total, page: Number(page), limit: Number(limit) });
});

// GET /summary
router.get("/summary", requireAuth, requireRole("hr","leader"), (req, res) => {
  const db = getDb();
  const { dateFrom = new Date(Date.now()-7*86400000).toISOString().slice(0,10), dateTo = today(), groupId } = req.query;
  let filter = ""; const params = [dateFrom, dateTo];
  if (req.user.role === "leader") {
    const groupIds = getLeaderGroupIds(db, req.user.id);
    if (!groupIds.length) return res.json({ rows: [], globalAvg: 0 });
    const ph = groupIds.map(() => "?").join(",");
    filter = `AND a.group_id IN (${ph}) AND EXISTS (SELECT 1 FROM users u WHERE u.id=a.user_id AND u.role='employee')`;
    params.push(...groupIds);
  } else if (groupId) {
    filter = "AND a.group_id=?"; params.push(groupId);
  }
  const rows = db.prepare(`
    SELECT a.user_id, u.full_name, u.username, g.name as group_name, g.color as group_color,
      COUNT(*) as total_absences, COALESCE(SUM(a.duration_sec),0) as total_sec,
      COALESCE(AVG(a.duration_sec),0) as avg_sec,
      SUM(CASE WHEN a.duration_sec>${LIMIT_SECONDS} THEN 1 ELSE 0 END) as over_limit_count,
      COUNT(DISTINCT a.date) as days_with_absence,
      MAX(a.duration_sec) as max_sec
    FROM absences a JOIN users u ON u.id=a.user_id LEFT JOIN groups g ON g.id=a.group_id
    WHERE a.date BETWEEN ? AND ? AND a.ended_at IS NOT NULL ${filter}
    GROUP BY a.user_id ORDER BY total_sec DESC
  `).all(...params);
  const globalAvg = rows.length>0 ? rows.reduce((s,r)=>s+r.avg_sec,0)/rows.length : 0;
  return res.json({
    rows: rows.map(r=>({ ...r, avg_sec:Math.round(r.avg_sec), total_sec:Math.round(r.total_sec), deviation:Math.round(r.avg_sec-globalAvg), globalAvg:Math.round(globalAvg) })),
    globalAvg:Math.round(globalAvg), dateFrom, dateTo,
  });
});

// GET /daily
router.get("/daily", requireAuth, requireRole("hr","leader"), (req, res) => {
  const db = getDb();
  const { dateFrom = new Date(Date.now()-30*86400000).toISOString().slice(0,10), dateTo = today(), groupId, userId } = req.query;
  let filter = ""; const params = [dateFrom, dateTo];
  if (req.user.role === "leader") {
    const groupIds = getLeaderGroupIds(db, req.user.id);
    if (groupIds.length) {
      const ph = groupIds.map(() => "?").join(",");
      filter = `AND a.group_id IN (${ph}) AND EXISTS (SELECT 1 FROM users u WHERE u.id=a.user_id AND u.role='employee')`;
      params.push(...groupIds);
    }
  } else if (groupId) { filter = "AND a.group_id=?"; params.push(groupId); }
  else if (userId)    { filter = "AND a.user_id=?";  params.push(userId); }
  const rows = db.prepare(`
    SELECT a.date, COUNT(*) as count, COALESCE(AVG(a.duration_sec),0) as avg_sec,
      SUM(CASE WHEN a.duration_sec>${LIMIT_SECONDS} THEN 1 ELSE 0 END) as over_limit
    FROM absences a WHERE a.date BETWEEN ? AND ? AND a.ended_at IS NOT NULL ${filter}
    GROUP BY a.date ORDER BY a.date
  `).all(...params);
  return res.json(rows.map(r=>({ ...r, avg_sec:Math.round(r.avg_sec), label:r.date.slice(5) })));
});

function fmt(a) {
  return { id:a.id, userId:a.user_id, groupId:a.group_id, date:a.date, startedAt:a.started_at, endedAt:a.ended_at, durationSec:a.duration_sec, isOpen:!a.ended_at, overLimit:a.duration_sec>LIMIT_SECONDS, fullName:a.full_name, username:a.username, dept:a.dept, groupName:a.group_name, groupColor:a.group_color };
}


// GET /api/absences/leader-panel
router.get("/leader-panel", requireAuth, requireRole("hr","leader"), (req, res) => {
  const db = getDb();
  const {
    dateFrom = new Date(Date.now()-30*86400000).toISOString().slice(0,10),
    dateTo   = today(),
    groupId,
  } = req.query;

  const WEEK_NAMES = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

  // Resolve membros conforme role
  let members = [];
  if (req.user.role === "leader") {
    const groupIds = getLeaderGroupIds(db, req.user.id);
    if (!groupIds.length) return res.json({ members:[], teamAvg:0, globalAvg:0, noRecord:[], underRecord:[], problematic:[], compliant:[] });
    const ph = groupIds.map(() => "?").join(",");
    members = db.prepare(`
      SELECT DISTINCT u.id, u.full_name, u.username
      FROM group_members gm JOIN users u ON u.id=gm.user_id
      WHERE gm.group_id IN (${ph}) AND u.role='employee' AND u.active=1
    `).all(...groupIds);
  } else {
    if (groupId) {
      members = db.prepare("SELECT u.id,u.full_name,u.username FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=? AND u.role='employee' AND u.active=1").all(groupId);
    } else {
      members = db.prepare("SELECT u.id,u.full_name,u.username FROM users u WHERE u.role='employee' AND u.active=1 LIMIT 100").all();
    }
  }

  // Global avg (excluindo o próprio líder)
  const globalData = db.prepare("SELECT COALESCE(AVG(duration_sec),0) as avg FROM absences WHERE date BETWEEN ? AND ? AND ended_at IS NOT NULL").get(dateFrom, dateTo);
  const globalAvg = Math.round(globalData.avg);

  // Stats por membro
  const memberStats = members.map(m => {
    const rows = db.prepare("SELECT * FROM absences WHERE user_id=? AND date BETWEEN ? AND ? AND ended_at IS NOT NULL ORDER BY started_at").all(m.id, dateFrom, dateTo);

    const totalAbsences  = rows.length;
    const totalSec       = rows.reduce((s,r)=>s+(r.duration_sec||0),0);
    const avgSec         = totalAbsences>0 ? Math.round(totalSec/totalAbsences) : 0;
    const overLimitCount = rows.filter(r=>r.duration_sec>LIMIT_SECONDS).length;
    const maxSec         = rows.length>0 ? Math.max(...rows.map(r=>r.duration_sec||0)) : 0;
    const daysActive     = new Set(rows.map(r=>r.date)).size;
    const daysMultiple   = Object.values(rows.reduce((acc,r)=>{ acc[r.date]=(acc[r.date]||0)+1; return acc; },{})).filter(c=>c>1).length;

    // Tendência
    const mid = new Date((new Date(dateFrom).getTime()+new Date(dateTo).getTime())/2).toISOString().slice(0,10);
    const fH  = rows.filter(r=>r.date<=mid);
    const sH  = rows.filter(r=>r.date>mid);
    const avgF = fH.length>0 ? Math.round(fH.reduce((s,r)=>s+r.duration_sec,0)/fH.length) : 0;
    const avgS = sH.length>0 ? Math.round(sH.reduce((s,r)=>s+r.duration_sec,0)/sH.length) : 0;
    const trend = avgS>avgF+60?"alta":avgS<avgF-60?"queda":"estável";

    // Pico hora/dia
    const hourMap = {}; const dowMap = [0,0,0,0,0,0,0];
    rows.forEach(r => {
      const h = parseInt((r.started_at||"T").split("T")[1]?.slice(0,2)||0);
      hourMap[h] = (hourMap[h]||0)+1;
      dowMap[new Date(r.date+"T12:00:00").getDay()]++;
    });
    const peakHour = Object.keys(hourMap).length>0 ? parseInt(Object.keys(hourMap).reduce((a,b)=>hourMap[b]>hourMap[a]?b:a)) : null;
    const peakDow  = dowMap.indexOf(Math.max(...dowMap));

    // Score de risco 0-100
    let risk = 0;
    if (totalAbsences===0)       risk += 15;
    if (totalAbsences>0 && totalAbsences<3) risk += 10;
    if (overLimitCount>=3)       risk += 40;
    else if (overLimitCount>=1)  risk += 20;
    if (avgSec>LIMIT_SECONDS)    risk += 30;
    else if (avgSec>720)         risk += 12;
    if (trend==="alta")          risk += 15;
    if (maxSec>1800)             risk += 10;
    if (daysMultiple>=3)         risk += 8;
    risk = Math.min(100, risk);

    // Insights automáticos
    const insights = [];
    if (totalAbsences===0)                    insights.push({level:"warn",  msg:"Sem registros — provável não uso da plataforma."});
    if (totalAbsences>0&&totalAbsences<3)     insights.push({level:"info",  msg:`Apenas ${totalAbsences} registro${totalAbsences>1?"s":""} — possível sub-registro.`});
    if (overLimitCount>=3)                    insights.push({level:"high",  msg:`${overLimitCount}x acima do limite — padrão crítico.`});
    else if (overLimitCount>=1)               insights.push({level:"medium",msg:`${overLimitCount}x acima do limite de 15 min.`});
    if (avgSec>LIMIT_SECONDS)                 insights.push({level:"high",  msg:`Média de ${Math.round(avgSec/60)}m — excede o permitido.`});
    else if (avgSec>720&&avgSec<=LIMIT_SECONDS) insights.push({level:"medium",msg:`Média de ${Math.round(avgSec/60)}m — próxima do limite.`});
    if (trend==="alta")                       insights.push({level:"medium",msg:"Tendência de alta nas ausências."});
    if (trend==="queda")                      insights.push({level:"ok",    msg:"Tendência de redução — bom sinal."});
    if (maxSec>1800)                          insights.push({level:"high",  msg:`Ausência máxima de ${Math.round(maxSec/60)}m registrada.`});
    if (daysMultiple>=3)                      insights.push({level:"info",  msg:`${daysMultiple} dias com múltiplas saídas.`});
    if (peakHour!==null&&totalAbsences>2)     insights.push({level:"info",  msg:`Pico de saídas às ${peakHour}h.`});
    if (risk<20&&totalAbsences>2)             insights.push({level:"ok",    msg:"Dentro dos padrões esperados."});

    return { ...m, totalAbsences, totalSec, avgSec, overLimitCount, maxSec, daysActive, daysMultiple, trend, peakHour, peakDow, riskScore:risk, insights };
  });

  // Team avg
  const withData = memberStats.filter(m=>m.totalAbsences>0);
  const teamAvg  = withData.length>0 ? Math.round(withData.reduce((s,m)=>s+m.avgSec,0)/withData.length) : 0;

  // Desvios
  memberStats.forEach(m => {
    m.deviationTeam   = m.totalAbsences>0 ? Math.round(m.avgSec-teamAvg)   : null;
    m.deviationGlobal = m.totalAbsences>0 ? Math.round(m.avgSec-globalAvg) : null;
    m.teamAvg = teamAvg; m.globalAvg = globalAvg;
  });

  return res.json({
    members:     memberStats.sort((a,b)=>b.riskScore-a.riskScore),
    teamAvg, globalAvg,
    noRecord:    memberStats.filter(m=>m.totalAbsences===0),
    underRecord: memberStats.filter(m=>m.totalAbsences>0&&m.totalAbsences<3),
    problematic: memberStats.filter(m=>m.riskScore>=50).sort((a,b)=>b.riskScore-a.riskScore),
    compliant:   memberStats.filter(m=>m.riskScore<25&&m.totalAbsences>2).sort((a,b)=>a.avgSec-b.avgSec),
    totalMembers: memberStats.length,
    dateFrom, dateTo,
  });
});


// PATCH /api/absences/:id — líder edita/fecha ausência do seu grupo
router.patch("/:id", requireAuth, (req, res) => {
  if (!isLeader(req.user.role)) return res.status(403).json({ error: "Sem permissão" });
  const db = getDb();
  const absence = db.prepare("SELECT * FROM absences WHERE id=?").get(req.params.id);
  if (!absence) return res.status(404).json({ error: "Não encontrado" });

  // Valida que líder só edita membros dos seus grupos (admin pode tudo)
  if (!isAdmin(req.user.role)) {
    const groupIds = getLeaderGroupIds(db, req.user.id);
    if (!groupIds.length) return res.status(403).json({ error: "Você não lidera nenhum grupo" });
    const isMember = groupIds.some(gid =>
      db.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?").get(gid, absence.user_id)
    );
    if (!isMember) return res.status(403).json({ error: "Usuário não pertence ao seu grupo" });
  }

  const { endedAt, note } = req.body;
  if (!endedAt) return res.status(400).json({ error: "endedAt é obrigatório" });

  const startedAt = new Date(absence.started_at);
  const endedAtDate = new Date(endedAt);
  if (endedAtDate <= startedAt) return res.status(400).json({ error: "Retorno deve ser após a saída" });

  const durationSec = Math.round((endedAtDate - startedAt) / 1000);
  const overLimit = durationSec > 900;

  db.prepare(`
    UPDATE absences SET
      ended_at = ?,
      duration_sec = ?,
      over_limit = ?,
      is_open = 0,
      edited_by = ?,
      edit_note = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(endedAt, durationSec, overLimit ? 1 : 0, req.user.id, note || null, req.params.id);

  const updated = db.prepare("SELECT * FROM absences WHERE id=?").get(req.params.id);
  return res.json({
    id: updated.id,
    durationSec: updated.duration_sec,
    overLimit: updated.over_limit === 1,
    editedBy: req.user.username,
    message: "Ausência atualizada com sucesso"
  });
});

module.exports = router;
