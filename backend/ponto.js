const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

function today() { return new Date().toISOString().slice(0, 10); }
function isAdmin(role)  { return ["hr","ti","gerencia"].includes(role); }
function isLeader(role) { return role === "leader" || isAdmin(role); }

function getLeaderGroupIds(db, userId) {
  const primary = db.prepare("SELECT id FROM groups WHERE leader_id=?").all(userId);
  const co      = db.prepare("SELECT group_id as id FROM group_co_leaders WHERE user_id=?").all(userId);
  return [...new Set([...primary.map(g => g.id), ...co.map(g => g.id)])];
}

function fmt(r) {
  return {
    id: r.id, userId: r.user_id, fullName: r.full_name, username: r.username,
    dept: r.dept, groupName: r.group_name, groupColor: r.group_color,
    type: r.type, recordedAt: r.recorded_at, date: r.date,
    source: r.source, reason: r.reason, justification: r.justification,
    justifiedBy: r.justified_by_name, justifiedAt: r.justified_at,
    createdByName: r.created_by_name, notes: r.notes,
    createdAt: r.created_at,
  };
}

// GET /api/ponto — list records
router.get("/", requireAuth, (req, res) => {
  const db = getDb();
  const { dateFrom = new Date(Date.now()-30*86400000).toISOString().slice(0,10), dateTo = today(), userId, groupId, type, page = 1, limit = 100 } = req.query;
  const role = req.user.role;

  let where = "WHERE p.date BETWEEN ? AND ?";
  const params = [dateFrom, dateTo];

  if (role === "employee") {
    where += " AND p.user_id = ?"; params.push(req.user.id);
  } else if (isLeader(role) && !isAdmin(role)) {
    const groupIds = getLeaderGroupIds(db, req.user.id);
    const memberIds = [req.user.id];
    for (const gid of groupIds) {
      db.prepare("SELECT user_id FROM group_members WHERE group_id=?").all(gid)
        .forEach(m => { if (!memberIds.includes(m.user_id)) memberIds.push(m.user_id); });
    }
    const ph = memberIds.map(() => "?").join(",");
    if (userId) { where += " AND p.user_id = ?"; params.push(userId); }
    else { where += ` AND p.user_id IN (${ph})`; params.push(...memberIds); }
  } else if (isAdmin(role)) {
    if (userId)  { where += " AND p.user_id = ?";  params.push(userId); }
    if (groupId) { where += ` AND p.user_id IN (SELECT user_id FROM group_members WHERE group_id = ?)`; params.push(groupId); }
  }

  if (type) { where += " AND p.type = ?"; params.push(type); }

  const offset = (Number(page)-1) * Number(limit);
  const rows = db.prepare(`
    SELECT p.*, u.full_name, u.username, u.dept,
      g.name as group_name, g.color as group_color,
      jb.full_name as justified_by_name,
      cb.full_name as created_by_name
    FROM ponto_records p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN group_members gm ON gm.user_id = p.user_id
    LEFT JOIN groups g ON g.id = gm.group_id
    LEFT JOIN users jb ON jb.id = p.justified_by
    LEFT JOIN users cb ON cb.id = p.created_by
    ${where}
    GROUP BY p.id
    ORDER BY p.recorded_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);

  const total = db.prepare(`SELECT COUNT(*) as c FROM ponto_records p ${where}`).get(...params).c;
  return res.json({ rows: rows.map(fmt), total, page: Number(page), limit: Number(limit) });
});

// POST /api/ponto — manual entry
router.post("/", requireAuth, (req, res) => {
  const db = getDb();
  const role = req.user.role;
  if (!isLeader(role) && !isAdmin(role)) {
    // employees can only create their own
    req.body.userId = req.user.id;
  }
  const { userId = req.user.id, type, recordedAt, reason, justification, notes } = req.body;
  if (!type || !recordedAt) return res.status(400).json({ error: "type e recordedAt são obrigatórios" });
  const validTypes = ["entrada", "saida", "inicio_intervalo", "fim_intervalo"];
  if (!validTypes.includes(type)) return res.status(400).json({ error: "Tipo inválido" });

  // Scope check: non-admin leaders can only add for their group members
  if (!isAdmin(role) && userId !== req.user.id) {
    if (!isLeader(role)) return res.status(403).json({ error: "Sem permissão" });
    const groupIds = getLeaderGroupIds(db, req.user.id);
    const isMember = groupIds.some(gid =>
      db.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?").get(gid, userId)
    );
    if (!isMember) return res.status(403).json({ error: "Usuário não pertence ao seu grupo" });
  }

  const id = uuidv4();
  const date = recordedAt.slice(0, 10);
  db.prepare(`
    INSERT INTO ponto_records (id, user_id, type, recorded_at, date, source, reason, justification, created_by, notes)
    VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?)
  `).run(id, userId, type, recordedAt, date, reason || null, justification || null, req.user.id, notes || null);

  const record = db.prepare("SELECT p.*, u.full_name, u.username, u.dept FROM ponto_records p JOIN users u ON u.id=p.user_id WHERE p.id=?").get(id);
  return res.status(201).json(fmt(record));
});

// PATCH /api/ponto/:id/justify — add/edit justification (hr/admin only)
router.patch("/:id/justify", requireAuth, (req, res) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: "Apenas RH/Admin pode justificar" });
  const db = getDb();
  const record = db.prepare("SELECT * FROM ponto_records WHERE id=?").get(req.params.id);
  if (!record) return res.status(404).json({ error: "Registro não encontrado" });
  const { justification } = req.body;
  if (!justification) return res.status(400).json({ error: "Justificativa é obrigatória" });
  db.prepare("UPDATE ponto_records SET justification=?, justified_by=?, justified_at=datetime('now'), updated_at=datetime('now') WHERE id=?")
    .run(justification, req.user.id, req.params.id);
  return res.json({ success: true });
});

// DELETE /api/ponto/:id
router.delete("/:id", requireAuth, (req, res) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: "Sem permissão" });
  const db = getDb();
  const record = db.prepare("SELECT * FROM ponto_records WHERE id=?").get(req.params.id);
  if (!record) return res.status(404).json({ error: "Não encontrado" });
  db.prepare("DELETE FROM ponto_records WHERE id=?").run(req.params.id);
  return res.json({ success: true });
});


// GET /api/ponto/analytics/summary
router.get("/analytics/summary", requireAuth, (req, res) => {
  const db = getDb();
  const {
    dateFrom = new Date(Date.now()-30*86400000).toISOString().slice(0,10),
    dateTo = today(), groupId, userId,
  } = req.query;
  const role = req.user.role;

  let pWhere = "WHERE p.date BETWEEN ? AND ?";
  let fWhere = "WHERE f.falta_date BETWEEN ? AND ?";
  const pParams = [dateFrom, dateTo];
  const fParams = [dateFrom, dateTo];

  if (role === "employee") {
    pWhere += " AND p.user_id = ?"; pParams.push(req.user.id);
    fWhere += " AND f.user_id = ?"; fParams.push(req.user.id);
  } else if (isLeader(role) && !isAdmin(role)) {
    const groupIds = getLeaderGroupIds(db, req.user.id);
    const memberIds = [req.user.id];
    for (const gid of groupIds) {
      db.prepare("SELECT user_id FROM group_members WHERE group_id=?").all(gid)
        .forEach(m => memberIds.includes(m.user_id) || memberIds.push(m.user_id));
    }
    const ph = memberIds.map(() => "?").join(",");
    pWhere += ` AND p.user_id IN (${ph})`; pParams.push(...memberIds);
    fWhere += ` AND f.user_id IN (${ph})`; fParams.push(...memberIds);
  } else if (isAdmin(role)) {
    if (groupId) {
      pWhere += " AND p.user_id IN (SELECT user_id FROM group_members WHERE group_id=?)"; pParams.push(groupId);
      fWhere += " AND f.group_id = ?"; fParams.push(groupId);
    }
    if (userId) {
      pWhere += " AND p.user_id = ?"; pParams.push(userId);
      fWhere += " AND f.user_id = ?"; fParams.push(userId);
    }
  }

  const totalPontos = db.prepare(`SELECT COUNT(*) as c FROM ponto_records p ${pWhere}`).get(...pParams).c;
  const manualPontos = db.prepare(`SELECT COUNT(*) as c FROM ponto_records p ${pWhere} AND p.source='manual'`).get(...pParams).c;
  const byType = db.prepare(`SELECT p.type, COUNT(*) as c FROM ponto_records p ${pWhere} GROUP BY p.type`).all(...pParams);
  const totalFaltas = db.prepare(`SELECT COUNT(*) as c FROM ponto_faltas f ${fWhere}`).get(...fParams).c;
  const faltasByStatus = db.prepare(`SELECT f.status, COUNT(*) as c FROM ponto_faltas f ${fWhere} GROUP BY f.status`).all(...fParams);
  const byDay = db.prepare(`SELECT p.date, COUNT(*) as c FROM ponto_records p ${pWhere} GROUP BY p.date ORDER BY p.date`).all(...pParams);
  const topFaltas = db.prepare(`
    SELECT f.user_id, u.full_name, COUNT(*) as c
    FROM ponto_faltas f
    JOIN users u ON u.id = f.user_id
    ${fWhere}
    GROUP BY f.user_id ORDER BY c DESC LIMIT 10
  `).all(...fParams);

  return res.json({ totalPontos, manualPontos, byType, totalFaltas, faltasByStatus, byDay, topFaltas });
});

// GET /api/ponto/analytics/by-employee
router.get("/analytics/by-employee", requireAuth, (req, res) => {
  const db = getDb();
  const {
    dateFrom = new Date(Date.now()-30*86400000).toISOString().slice(0,10),
    dateTo = today(), groupId,
  } = req.query;
  const role = req.user.role;

  let pWhere = "WHERE p.date BETWEEN ? AND ?";
  const pParams = [dateFrom, dateTo];
  let fWhere = "WHERE f.falta_date BETWEEN ? AND ?";
  const fParams = [dateFrom, dateTo];

  if (role === "employee") {
    pWhere += " AND p.user_id = ?"; pParams.push(req.user.id);
    fWhere += " AND f.user_id = ?"; fParams.push(req.user.id);
  } else if (isLeader(role) && !isAdmin(role)) {
    const groupIds = getLeaderGroupIds(db, req.user.id);
    const memberIds = [req.user.id];
    for (const gid of groupIds) {
      db.prepare("SELECT user_id FROM group_members WHERE group_id=?").all(gid)
        .forEach(m => memberIds.includes(m.user_id) || memberIds.push(m.user_id));
    }
    const ph = memberIds.map(() => "?").join(",");
    pWhere += ` AND p.user_id IN (${ph})`; pParams.push(...memberIds);
    fWhere += ` AND f.user_id IN (${ph})`; fParams.push(...memberIds);
  } else if (isAdmin(role) && groupId) {
    pWhere += " AND p.user_id IN (SELECT user_id FROM group_members WHERE group_id=?)"; pParams.push(groupId);
    fWhere += " AND f.group_id = ?"; fParams.push(groupId);
  }

  const pontos = db.prepare(`
    SELECT p.user_id, u.full_name, u.dept,
      COUNT(*) as total, SUM(CASE WHEN p.source='manual' THEN 1 ELSE 0 END) as manual_count
    FROM ponto_records p JOIN users u ON u.id=p.user_id
    ${pWhere} GROUP BY p.user_id ORDER BY total DESC
  `).all(...pParams);

  const faltas = db.prepare(`
    SELECT f.user_id, COUNT(*) as total,
      SUM(CASE WHEN f.status='pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN f.status='confirmed' THEN 1 ELSE 0 END) as confirmed
    FROM ponto_faltas f ${fWhere} GROUP BY f.user_id
  `).all(...fParams);

  const faltaMap = {};
  faltas.forEach(f => { faltaMap[f.user_id] = f; });

  const result = pontos.map(p => ({
    userId: p.user_id, fullName: p.full_name, dept: p.dept,
    totalPontos: p.total, manualPontos: p.manual_count,
    totalFaltas: faltaMap[p.user_id]?.total || 0,
    pendingFaltas: faltaMap[p.user_id]?.pending || 0,
  }));

  return res.json({ rows: result });
});

// GET /api/ponto/team — scoped user list for current user
router.get("/team", requireAuth, (req, res) => {
  const db = getDb();
  const { role, id: userId } = req.user;
  if (role === "employee") {
    const me = db.prepare("SELECT id, full_name FROM users WHERE id=?").get(userId);
    return res.json(me ? [{ id: me.id, fullName: me.full_name }] : []);
  }
  if (isAdmin(role)) {
    const users = db.prepare("SELECT id, full_name FROM users WHERE active=1 ORDER BY full_name").all();
    return res.json(users.map(u => ({ id: u.id, fullName: u.full_name })));
  }
  // leader: self + group members
  const groupIds = getLeaderGroupIds(db, userId);
  const memberSet = new Set([userId]);
  for (const gid of groupIds) {
    db.prepare("SELECT user_id FROM group_members WHERE group_id=?").all(gid)
      .forEach(m => memberSet.add(m.user_id));
  }
  const ids = [...memberSet];
  const ph = ids.map(() => "?").join(",");
  const users = db.prepare(`SELECT id, full_name FROM users WHERE id IN (${ph}) AND active=1 ORDER BY full_name`).all(...ids);
  return res.json(users.map(u => ({ id: u.id, fullName: u.full_name })));
});

// ── Banco de Horas ──────────────────────────────────────

function computeWorkedMinutes(batidas) {
  const sorted = [...batidas].sort((a, b) => (a.time_millis || 0) - (b.time_millis || 0));
  let totalMs = 0;
  for (let i = 0; i + 1 < sorted.length; i += 2) {
    const ms = (sorted[i + 1].time_millis || 0) - (sorted[i].time_millis || 0);
    if (ms > 0) totalMs += ms;
  }
  return Math.round(totalMs / 60000);
}

function isWeekend(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

// GET /api/ponto/banco-horas
router.get("/banco-horas", requireAuth, (req, res) => {
  const db = getDb();
  const role = req.user.role;
  let { userId, dateFrom, dateTo } = req.query;

  if (role === "employee") userId = req.user.id;
  if (!userId) return res.status(400).json({ error: "userId é obrigatório" });

  if (userId !== req.user.id) {
    if (!isAdmin(role) && !isLeader(role)) return res.status(403).json({ error: "Sem permissão" });
    if (!isAdmin(role) && isLeader(role)) {
      const groupIds = getLeaderGroupIds(db, req.user.id);
      const memberSet = new Set();
      for (const gid of groupIds) {
        db.prepare("SELECT user_id FROM group_members WHERE group_id=?").all(gid)
          .forEach(m => memberSet.add(m.user_id));
      }
      if (!memberSet.has(userId)) return res.status(403).json({ error: "Sem permissão para este usuário" });
    }
  }

  const now = new Date();
  const from = dateFrom || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to   = dateTo   || now.toISOString().slice(0, 10);

  const batidas = db.prepare(
    "SELECT * FROM ponto_batidas WHERE user_id=? AND date BETWEEN ? AND ? ORDER BY date, time_millis ASC"
  ).all(userId, from, to);

  const adjustments = db.prepare(`
    SELECT bha.*, u.full_name as created_by_name
    FROM banco_horas_ajustes bha
    LEFT JOIN users u ON u.id = bha.created_by
    WHERE bha.user_id=? AND bha.date BETWEEN ? AND ?
    ORDER BY bha.date, bha.created_at
  `).all(userId, from, to);

  // Previous balance: all records strictly before the selected period
  const prevBatidas = db.prepare(
    "SELECT date, time_millis FROM ponto_batidas WHERE user_id=? AND date < ? ORDER BY date, time_millis ASC"
  ).all(userId, from);
  const prevAdjs = db.prepare(
    "SELECT date, tipo, minutos FROM banco_horas_ajustes WHERE user_id=? AND date < ?"
  ).all(userId, from);

  function sumBalance(batidasArr, adjsArr) {
    const bd = {}, ad = {};
    for (const b of batidasArr) (bd[b.date] = bd[b.date] || []).push(b);
    for (const a of adjsArr)   (ad[a.date] = ad[a.date] || []).push(a);
    const dates = new Set([...Object.keys(bd), ...Object.keys(ad)]);
    let total = 0;
    for (const date of dates) {
      const w = computeWorkedMinutes(bd[date] || []);
      const e = isWeekend(date) ? 0 : 480;
      const adjM = (ad[date] || []).reduce((s, a) => s + (a.tipo === "credito" ? a.minutos : -a.minutos), 0);
      total += (w - e) + adjM;
    }
    return total;
  }

  const previousBalanceMin = sumBalance(prevBatidas, prevAdjs);

  const batidasByDate = {};
  for (const b of batidas) {
    (batidasByDate[b.date] = batidasByDate[b.date] || []).push(b);
  }
  const adjByDate = {};
  for (const a of adjustments) {
    (adjByDate[a.date] = adjByDate[a.date] || []).push(a);
  }

  const allDates = new Set([...Object.keys(batidasByDate), ...Object.keys(adjByDate)]);
  const sortedDates = [...allDates].sort();

  let periodBalance = 0;
  let cumulative    = previousBalanceMin;
  const days = sortedDates.map(date => {
    const dayBatidas  = batidasByDate[date] || [];
    const dayAdjs     = adjByDate[date]     || [];
    const workedMin   = computeWorkedMinutes(dayBatidas);
    const expectedMin = isWeekend(date) ? 0 : 480;
    const diffMin     = workedMin - expectedMin;
    const adjMin      = dayAdjs.reduce((s, a) => s + (a.tipo === "credito" ? a.minutos : -a.minutos), 0);
    periodBalance += diffMin + adjMin;
    cumulative    += diffMin + adjMin;
    return { date, punchCount: dayBatidas.length, workedMin, expectedMin, diffMin, adjustmentMin: adjMin, adjustments: dayAdjs, cumulativeMin: cumulative };
  });

  const userInfo = db.prepare("SELECT id, full_name, dept FROM users WHERE id=?").get(userId);
  return res.json({
    user: userInfo, dateFrom: from, dateTo: to, days,
    previousBalanceMin,
    periodBalanceMin:  periodBalance,
    currentBalanceMin: previousBalanceMin + periodBalance,
    totalCumulativeMin: previousBalanceMin + periodBalance,
  });
});

// POST /api/ponto/banco-horas/ajuste
router.post("/banco-horas/ajuste", requireAuth, (req, res) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: "Apenas RH/Admin pode adicionar ajustes" });
  const db = getDb();
  const { userId, date, tipo, minutos, motivo } = req.body;
  if (!userId || !date || !tipo || minutos == null) return res.status(400).json({ error: "userId, date, tipo e minutos são obrigatórios" });
  if (!["credito", "debito"].includes(tipo)) return res.status(400).json({ error: "tipo deve ser credito ou debito" });
  const id = uuidv4();
  db.prepare(
    "INSERT INTO banco_horas_ajustes (id, user_id, date, tipo, minutos, motivo, created_by) VALUES (?,?,?,?,?,?,?)"
  ).run(id, userId, date, tipo, Math.abs(Number(minutos)), motivo || null, req.user.id);
  return res.status(201).json({ id, userId, date, tipo, minutos: Math.abs(Number(minutos)), motivo });
});

// DELETE /api/ponto/banco-horas/ajuste/:id
router.delete("/banco-horas/ajuste/:id", requireAuth, (req, res) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: "Sem permissão" });
  const db = getDb();
  const adj = db.prepare("SELECT * FROM banco_horas_ajustes WHERE id=?").get(req.params.id);
  if (!adj) return res.status(404).json({ error: "Ajuste não encontrado" });
  db.prepare("DELETE FROM banco_horas_ajustes WHERE id=?").run(req.params.id);
  return res.json({ success: true });
});

module.exports = router;
