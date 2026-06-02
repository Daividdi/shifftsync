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

function getScopedMemberIds(db, userId) {
  const groupIds = getLeaderGroupIds(db, userId);
  const memberSet = new Set([userId]);
  for (const gid of groupIds) {
    db.prepare("SELECT user_id FROM group_members WHERE group_id=?").all(gid)
      .forEach(m => memberSet.add(m.user_id));
    // Include the group's own leader and co-leaders (not stored in group_members)
    const g = db.prepare("SELECT leader_id FROM groups WHERE id=?").get(gid);
    if (g?.leader_id) memberSet.add(g.leader_id);
    db.prepare("SELECT user_id FROM group_co_leaders WHERE group_id=?").all(gid)
      .forEach(m => memberSet.add(m.user_id));
  }
  return [...memberSet];
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
    editedByName: r.edited_by_name, editedAt: r.edited_at,
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
    const memberIds = getScopedMemberIds(db, req.user.id);
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
      cb.full_name as created_by_name,
      eb.full_name as edited_by_name
    FROM ponto_records p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN group_members gm ON gm.user_id = p.user_id
    LEFT JOIN groups g ON g.id = gm.group_id
    LEFT JOIN users jb ON jb.id = p.justified_by
    LEFT JOIN users cb ON cb.id = p.created_by
    LEFT JOIN users eb ON eb.id = p.edited_by
    ${where}
    GROUP BY p.id
    ORDER BY p.recorded_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);

  const total = db.prepare(`SELECT COUNT(*) as c FROM ponto_records p ${where}`).get(...params).c;
  return res.json({ rows: rows.map(fmt), total, page: Number(page), limit: Number(limit) });
});

// GET /api/ponto/team — scoped user list
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
  const ids = getScopedMemberIds(db, userId);
  const ph = ids.map(() => "?").join(",");
  const users = db.prepare(`SELECT id, full_name FROM users WHERE id IN (${ph}) AND active=1 ORDER BY full_name`).all(...ids);
  return res.json(users.map(u => ({ id: u.id, fullName: u.full_name })));
});

// GET /api/ponto/analytics/summary
router.get("/analytics/summary", requireAuth, (req, res) => {
  const db = getDb();
  const {
    dateFrom = new Date(Date.now()-30*86400000).toISOString().slice(0,10),
    dateTo = today(), groupId, userId,
  } = req.query;
  const role = req.user.role;

  let where = "WHERE b.date BETWEEN ? AND ?";
  const params = [dateFrom, dateTo];

  if (role === "employee") {
    where += " AND b.user_id = ?"; params.push(req.user.id);
  } else if (isLeader(role) && !isAdmin(role)) {
    const ids = getScopedMemberIds(db, req.user.id);
    const ph = ids.map(() => "?").join(",");
    where += ` AND b.user_id IN (${ph})`; params.push(...ids);
  } else if (isAdmin(role)) {
    if (groupId) { where += " AND b.user_id IN (SELECT user_id FROM group_members WHERE group_id=?)"; params.push(groupId); }
    if (userId)  { where += " AND b.user_id = ?"; params.push(userId); }
  }

  const totalBatidas = db.prepare(`SELECT COUNT(*) as c FROM ponto_batidas b ${where}`).get(...params).c;
  const totalUsers   = db.prepare(`SELECT COUNT(DISTINCT b.user_id) as c FROM ponto_batidas b ${where}`).get(...params).c;
  const byDay        = db.prepare(`SELECT b.date, COUNT(*) as c FROM ponto_batidas b ${where} GROUP BY b.date ORDER BY b.date`).all(...params);

  const incompleteRows = db.prepare(`
    SELECT b.user_id, u.full_name, COUNT(*) as incomplete_days
    FROM (
      SELECT b.user_id, b.date, COUNT(*) as c
      FROM ponto_batidas b ${where}
      GROUP BY b.user_id, b.date
      HAVING c % 2 = 1
    ) b JOIN users u ON u.id = b.user_id
    GROUP BY b.user_id
    ORDER BY incomplete_days DESC
    LIMIT 10
  `).all(...params);

  return res.json({ totalBatidas, totalUsers, byDay, topIncomplete: incompleteRows });
});

// GET /api/ponto/analytics/by-employee
router.get("/analytics/by-employee", requireAuth, (req, res) => {
  const db = getDb();
  const {
    dateFrom = new Date(Date.now()-30*86400000).toISOString().slice(0,10),
    dateTo = today(), groupId,
  } = req.query;
  const role = req.user.role;

  let where = "WHERE b.date BETWEEN ? AND ?";
  const params = [dateFrom, dateTo];

  if (role === "employee") {
    where += " AND b.user_id = ?"; params.push(req.user.id);
  } else if (isLeader(role) && !isAdmin(role)) {
    const ids = getScopedMemberIds(db, req.user.id);
    const ph = ids.map(() => "?").join(",");
    where += ` AND b.user_id IN (${ph})`; params.push(...ids);
  } else if (isAdmin(role) && groupId) {
    where += " AND b.user_id IN (SELECT user_id FROM group_members WHERE group_id=?)"; params.push(groupId);
  }

  const rows = db.prepare(`
    SELECT b.user_id, u.full_name, u.dept,
      COUNT(*) as total_batidas,
      COUNT(DISTINCT b.date) as days_with_batidas
    FROM ponto_batidas b JOIN users u ON u.id=b.user_id
    ${where}
    GROUP BY b.user_id
    ORDER BY total_batidas DESC
  `).all(...params);

  const incompleteDaysByUser = db.prepare(`
    SELECT b.user_id, COUNT(*) as incomplete_days
    FROM (
      SELECT b.user_id, b.date, COUNT(*) as c
      FROM ponto_batidas b ${where}
      GROUP BY b.user_id, b.date
      HAVING c % 2 = 1
    ) b
    GROUP BY b.user_id
  `).all(...params);

  const incMap = {};
  incompleteDaysByUser.forEach(r => { incMap[r.user_id] = r.incomplete_days; });

  const result = rows.map(r => ({
    userId: r.user_id, fullName: r.full_name, dept: r.dept,
    totalBatidas: r.total_batidas,
    daysWorked: r.days_with_batidas,
    incompleteDays: incMap[r.user_id] || 0,
  }));

  return res.json({ rows: result });
});

// POST /api/ponto — manual entry
router.post("/", requireAuth, (req, res) => {
  const db = getDb();
  const role = req.user.role;
  if (!isLeader(role) && !isAdmin(role)) {
    req.body.userId = req.user.id;
  }
  const { userId = req.user.id, type, recordedAt, reason, justification, notes } = req.body;
  if (!type || !recordedAt) return res.status(400).json({ error: "type e recordedAt são obrigatórios" });
  const validTypes = ["entrada", "saida", "inicio_intervalo", "fim_intervalo"];
  if (!validTypes.includes(type)) return res.status(400).json({ error: "Tipo inválido" });

  if (!isAdmin(role) && userId !== req.user.id) {
    return res.status(403).json({ error: "Apenas RH/Admin pode lançar ponto para outros usuários" });
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

// PATCH /api/ponto/:id/justify
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

// PATCH /api/ponto/:id — edit a manual record
router.patch("/:id", requireAuth, (req, res) => {
  const { role } = req.user;
  if (!isAdmin(role)) return res.status(403).json({ error: "Apenas RH/Admin pode editar registros de ponto" });

  const db = getDb();
  const record = db.prepare("SELECT * FROM ponto_records WHERE id=?").get(req.params.id);
  if (!record) return res.status(404).json({ error: "Não encontrado" });

  const { type, recordedAt, reason, notes } = req.body;
  const validTypes = ["entrada", "saida", "inicio_intervalo", "fim_intervalo"];
  if (type && !validTypes.includes(type)) return res.status(400).json({ error: "Tipo inválido" });
  if (!type && !recordedAt) return res.status(400).json({ error: "Nenhum campo para atualizar" });

  const newType = type || record.type;
  const newRecordedAt = recordedAt || record.recorded_at;
  const newDate = newRecordedAt.slice(0, 10);
  const newReason = reason !== undefined ? (reason || null) : record.reason;
  const newNotes  = notes  !== undefined ? (notes  || null) : record.notes;

  db.prepare(`
    UPDATE ponto_records SET
      type        = ?,
      recorded_at = ?,
      date        = ?,
      reason      = ?,
      notes       = ?,
      edited_by   = ?,
      edited_at   = datetime('now'),
      updated_at  = datetime('now')
    WHERE id = ?
  `).run(newType, newRecordedAt, newDate, newReason, newNotes, req.user.id, record.id);

  const updated = db.prepare(`
    SELECT p.*, u.full_name, u.username, u.dept,
      g.name as group_name, g.color as group_color,
      jb.full_name as justified_by_name,
      cb.full_name as created_by_name,
      eb.full_name as edited_by_name
    FROM ponto_records p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN group_members gm ON gm.user_id = p.user_id
    LEFT JOIN groups g ON g.id = gm.group_id
    LEFT JOIN users jb ON jb.id = p.justified_by
    LEFT JOIN users cb ON cb.id = p.created_by
    LEFT JOIN users eb ON eb.id = p.edited_by
    WHERE p.id = ?
    GROUP BY p.id
  `).get(record.id);

  return res.json(fmt(updated));
});

// DELETE /api/ponto/:id
router.delete("/:id", requireAuth, (req, res) => {
  const { role } = req.user;
  if (!isAdmin(role)) return res.status(403).json({ error: "Apenas RH/Admin pode excluir registros de ponto" });

  const db = getDb();
  const record = db.prepare("SELECT * FROM ponto_records WHERE id=?").get(req.params.id);
  if (!record) return res.status(404).json({ error: "Não encontrado" });

  db.prepare("DELETE FROM ponto_records WHERE id=?").run(req.params.id);
  return res.json({ success: true });
});

// ── Banco de Horas ──────────────────────────────────────

function computeWorkedMinutes(batidas) {
  const sorted = [...batidas].sort((a, b) => (a.time_millis || 0) - (b.time_millis || 0));
  let totalMs = 0;
  for (let i = 0; i + 1 < sorted.length; i += 2) {
    const ms = (sorted[i + 1].time_millis || 0) - (sorted[i].time_millis || 0);
    if (ms > 0) totalMs += ms;
  }
  // Odd-punch heuristic: last punch looks like end-of-day (>=15h local/BRT=UTC-3)
  // → assume 1h lunch break occurred in the orphaned gap, credit the rest as work
  if (sorted.length >= 3 && sorted.length % 2 === 1) {
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const lastLocalHour = ((new Date(last.time_millis || 0).getUTCHours() - 3) + 24) % 24;
    if (lastLocalHour >= 15) {
      const gapMs = (last.time_millis || 0) - (prev.time_millis || 0);
      totalMs += Math.max(0, gapMs - 60 * 60000);
    }
  }
  return Math.round(totalMs / 60000);
}

function getDayExpected(dateStr, fullDayMin) {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay();
  if (dow === 0) return 0;    // domingo: nao trabalha
  if (dow === 6) return 240;  // sabado: meio periodo (4h)
  return fullDayMin;           // dias uteis: padrao do usuario
}

// Cap Saturday worked minutes at 4h (240 min) — extra time is not credited
function capWorkedSat(dateStr, minutes) {
  const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
  return dow === 6 ? Math.min(minutes, 240) : minutes;
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
      const ids = getScopedMemberIds(db, req.user.id);
      if (!ids.includes(userId)) return res.status(403).json({ error: "Sem permissão para este usuário" });
    }
  }

  const now = new Date();
  const from = dateFrom || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to   = dateTo   || now.toISOString().slice(0, 10);

  // Find active period using the 'to' date
  const periodo = db.prepare(
    "SELECT * FROM banco_horas_periodos WHERE start_date <= ? ORDER BY start_date DESC LIMIT 1"
  ).get(to);
  const periodStart = periodo ? periodo.start_date : "2026-01-01";
  const effectiveFrom = isAdmin(role) ? from : (from < periodStart ? periodStart : from);

  const batidas = db.prepare(
    "SELECT * FROM ponto_batidas WHERE user_id=? AND date BETWEEN ? AND ? ORDER BY date, time_millis ASC"
  ).all(userId, effectiveFrom, to);

  const manualMain = db.prepare(
    "SELECT recorded_at, CAST((julianday(REPLACE(recorded_at,'Z',''))-2440587.5)*86400000.0 AS INTEGER) as time_millis, date FROM ponto_records WHERE user_id=? AND source='manual' AND date BETWEEN ? AND ?"
  ).all(userId, effectiveFrom, to);

  const adjustments = db.prepare(`
    SELECT bha.*, u.full_name as created_by_name
    FROM banco_horas_ajustes bha
    LEFT JOIN users u ON u.id = bha.created_by
    WHERE bha.user_id=? AND bha.date BETWEEN ? AND ?
    ORDER BY bha.date, bha.created_at
  `).all(userId, effectiveFrom, to);

  const prevBatidas = db.prepare(
    "SELECT date, time_millis FROM ponto_batidas WHERE user_id=? AND date >= ? AND date < ? ORDER BY date, time_millis ASC"
  ).all(userId, periodStart, effectiveFrom);

  const manualPrev = db.prepare(
    "SELECT recorded_at, CAST((julianday(REPLACE(recorded_at,'Z',''))-2440587.5)*86400000.0 AS INTEGER) as time_millis, date FROM ponto_records WHERE user_id=? AND source='manual' AND date >= ? AND date < ?"
  ).all(userId, periodStart, effectiveFrom);

  const prevAdjs = db.prepare(
    "SELECT date, tipo, minutos FROM banco_horas_ajustes WHERE user_id=? AND date >= ? AND date < ?"
  ).all(userId, periodStart, effectiveFrom);

  const meioPeriodoUser = db.prepare('SELECT meio_periodo, title FROM users WHERE id=?').get(userId);
  function calcDailyExpected(u) {
    if (!u || !u.meio_periodo) return 480;
    const t = (u.title || '').toLowerCase();
    if (t.includes('doctor'))   return 240; // Design Doctor meio periodo = 4h
    if (t.includes('designer')) return 360; // Designer meio periodo = 6h
    return 240; // demais meio periodo = 4h por padrao
  }
  const dailyExpected = calcDailyExpected(meioPeriodoUser);

  // Load per-user, per-day-of-week custom schedule (e.g. doctors with mixed shifts)
  const scheduleRows = db.prepare(
    "SELECT dow, expected_minutes FROM user_day_schedule WHERE user_id=?"
  ).all(userId);
  const daySchedule = {};
  for (const r of scheduleRows) daySchedule[r.dow] = r.expected_minutes;
  const hasDaySchedule = scheduleRows.length > 0;

  const _hlRows = db.prepare(
    `SELECT date FROM holidays WHERE date >= ? AND date <= ?`
  ).all(periodStart, to);
  const _hlSet = new Set(_hlRows.map(h => h.date));

  // Returns expected minutes for a day, using custom schedule when available
  function getEffectiveDayExpected(dateStr, fallback) {
    if (_hlSet.has(dateStr)) return 0;
    const d = new Date(dateStr + "T12:00:00Z");
    const dow = d.getUTCDay();
    if (dow === 0) return 0;
    if (dow === 6) return hasDaySchedule && daySchedule[6] !== undefined ? daySchedule[6] : 240;
    if (hasDaySchedule && daySchedule[dow] !== undefined) return daySchedule[dow];
    return getDayExpected(dateStr, fallback);
  }

  function sumBalance(batidasArr, adjsArr) {
    const bd = {}, ad = {};
    for (const b of batidasArr) (bd[b.date] = bd[b.date] || []).push(b);
    for (const a of adjsArr)   (ad[a.date] = ad[a.date] || []).push(a);
    const dates = new Set([...Object.keys(bd), ...Object.keys(ad)]);
    let total = 0;
    for (const date of dates) {
      const w = computeWorkedMinutes(bd[date] || []);
      const e = getEffectiveDayExpected(date, dailyExpected);
      const adjM = (ad[date] || []).reduce((s, a) => s + (a.tipo === "credito" ? a.minutos : -a.minutos), 0);
      const surplus = w - e;
      // Cap daily banco credit at 2h (120 min); excess is paid overtime, not credited
      const cappedSurplus = e > 0 && surplus > 120 ? 120 : surplus;
      total += cappedSurplus + adjM;
    }
    return total;
  }

  // Merge prev batidas with manual prev for previousBalance calc
  const prevBatidasMerged = [...prevBatidas, ...manualPrev];
  const previousBalanceMin = sumBalance(prevBatidasMerged, prevAdjs);

  // Merge main batidas with manual main
  const batidasMerged = [...batidas, ...manualMain];
  const batidasByDate = {};
  for (const b of batidasMerged) {
    (batidasByDate[b.date] = batidasByDate[b.date] || []).push(b);
  }
  const adjByDate = {};
  for (const a of adjustments) {
    (adjByDate[a.date] = adjByDate[a.date] || []).push(a);
  }

  const allDates = new Set([...Object.keys(batidasByDate), ...Object.keys(adjByDate)]);
  // Fill every calendar day in the range so days without batidas still appear
  const todayIso = new Date().toISOString().slice(0, 10);
  const rangeEnd = to < todayIso ? to : todayIso;
  const cursor = new Date(effectiveFrom + "T12:00:00Z");
  const rangeEndDate = new Date(rangeEnd + "T12:00:00Z");
  while (cursor <= rangeEndDate) {
    allDates.add(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const sortedDates = [...allDates].sort();

  let periodBalance = 0;
  let cumulative    = previousBalanceMin;
  const days = sortedDates.map(date => {
    const dayBatidas  = batidasByDate[date] || [];
    const dayAdjs     = adjByDate[date]     || [];
    const workedMin   = computeWorkedMinutes(dayBatidas);
    const expectedMin = getEffectiveDayExpected(date, dailyExpected);
    const diffMin     = workedMin - expectedMin;
    const adjMin      = dayAdjs.reduce((s, a) => s + (a.tipo === "credito" ? a.minutos : -a.minutos), 0);
    if (dayBatidas.length > 0 || dayAdjs.length > 0) {
      periodBalance += diffMin + adjMin;
      cumulative    += diffMin + adjMin;
    }
    return { date, punchCount: dayBatidas.length, workedMin, expectedMin, diffMin, adjustmentMin: adjMin, adjustments: dayAdjs, cumulativeMin: cumulative };
  });

  const userInfo = db.prepare("SELECT id, full_name, dept FROM users WHERE id=?").get(userId);
  return res.json({
    user: userInfo, dateFrom: effectiveFrom, dateTo: to, days,
    previousBalanceMin,
    periodBalanceMin:  periodBalance,
    currentBalanceMin: previousBalanceMin + periodBalance,
    totalCumulativeMin: previousBalanceMin + periodBalance,
    periodo: periodo ? {
      id: periodo.id, startDate: periodo.start_date, endDate: periodo.end_date,
      label: periodo.label, closed: Boolean(periodo.closed)
    } : null,
  });
});

// GET /api/ponto/banco-horas/periodos
router.get("/banco-horas/periodos", requireAuth, (req, res) => {
  if (!isLeader(req.user.role)) return res.status(403).json({ error: "Sem permissão" });
  const db = getDb();
  const rows = db.prepare(`SELECT p.*, u.full_name as closed_by_name FROM banco_horas_periodos p LEFT JOIN users u ON u.id=p.closed_by ORDER BY p.start_date DESC`).all();
  return res.json(rows.map(r => ({ id: r.id, startDate: r.start_date, endDate: r.end_date, label: r.label, closed: Boolean(r.closed), closedAt: r.closed_at, closedByName: r.closed_by_name, createdAt: r.created_at })));
});

// POST /api/ponto/banco-horas/periodos
router.post("/banco-horas/periodos", requireAuth, requireRole("hr", "ti", "gerencia"), (req, res) => {
  const db = getDb();
  const { startDate, endDate, label } = req.body;
  if (!startDate || !endDate) return res.status(400).json({ error: "startDate e endDate são obrigatórios" });
  if (startDate >= endDate) return res.status(400).json({ error: "startDate deve ser anterior ao endDate" });
  try {
    const result = db.prepare("INSERT INTO banco_horas_periodos (start_date, end_date, label, created_by, created_at) VALUES (?,?,?,?,datetime('now'))").run(startDate, endDate, label || null, req.user.id);
    return res.status(201).json({ id: result.lastInsertRowid, startDate, endDate, label, closed: false });
  } catch(e) {
    if (e.message && e.message.includes("UNIQUE")) return res.status(409).json({ error: "Já existe um período com esta data de início" });
    throw e;
  }
});

// PATCH /api/ponto/banco-horas/periodos/:id/fechar
router.patch("/banco-horas/periodos/:id/fechar", requireAuth, requireRole("hr", "ti", "gerencia"), (req, res) => {
  const db = getDb();
  const p = db.prepare("SELECT * FROM banco_horas_periodos WHERE id=?").get(req.params.id);
  if (!p) return res.status(404).json({ error: "Período não encontrado" });
  if (p.closed) return res.status(409).json({ error: "Período já foi fechado" });
  db.prepare("UPDATE banco_horas_periodos SET closed=1, closed_at=datetime('now'), closed_by=? WHERE id=?").run(req.user.id, req.params.id);
  return res.json({ ok: true });
});

// DELETE /api/ponto/banco-horas/periodos/:id
router.delete("/banco-horas/periodos/:id", requireAuth, requireRole("hr", "ti", "gerencia"), (req, res) => {
  const db = getDb();
  const p = db.prepare("SELECT * FROM banco_horas_periodos WHERE id=?").get(req.params.id);
  if (!p) return res.status(404).json({ error: "Período não encontrado" });
  if (p.closed) return res.status(409).json({ error: "Não é possível excluir período fechado" });
  db.prepare("DELETE FROM banco_horas_periodos WHERE id=?").run(req.params.id);
  return res.json({ ok: true });
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

// GET /api/ponto/banco-horas/equipe — team banco de horas summary
router.get("/banco-horas/equipe", requireAuth, (req, res) => {
  const db = getDb();
  const role = req.user.role;
  if (!isLeader(role)) return res.status(403).json({ error: "Sem permissão" });

  const todayStr = today();

  const scopedIds = isAdmin(role)
    ? db.prepare("SELECT id FROM users WHERE active=1").all().map(u => u.id)
    : getScopedMemberIds(db, req.user.id);
  if (!scopedIds.length) return res.json([]);

  const periodo = db.prepare(
    "SELECT * FROM banco_horas_periodos WHERE start_date <= ? ORDER BY start_date DESC LIMIT 1"
  ).get(todayStr);
  const periodStart = periodo ? periodo.start_date : todayStr.slice(0, 4) + "-01-01";

  const ph = scopedIds.map(() => "?").join(",");

  const users = db.prepare(`
    SELECT u.id, u.full_name, u.meio_periodo, u.title,
      g.name as group_name, g.color as group_color
    FROM users u
    LEFT JOIN group_members gm ON gm.user_id = u.id
    LEFT JOIN groups g ON g.id = gm.group_id
    WHERE u.id IN (${ph}) AND u.active=1
  `).all(...scopedIds);

  const allBatidas = db.prepare(
    `SELECT user_id, date, time_millis FROM ponto_batidas WHERE user_id IN (${ph}) AND date >= ? AND deleted_at IS NULL`
  ).all(...scopedIds, periodStart);

  const allManual = db.prepare(
    `SELECT user_id, date, CAST((julianday(REPLACE(recorded_at,'Z',''))-2440587.5)*86400000.0 AS INTEGER) as time_millis
     FROM ponto_records WHERE user_id IN (${ph}) AND source IN ('manual','abono') AND date >= ?`
  ).all(...scopedIds, periodStart);

  const allAdjs = db.prepare(
    `SELECT user_id, date, tipo, minutos FROM banco_horas_ajustes WHERE user_id IN (${ph}) AND date >= ?`
  ).all(...scopedIds, periodStart);

  const allSchedules = db.prepare(
    `SELECT user_id, dow, expected_minutes FROM user_day_schedule WHERE user_id IN (${ph})`
  ).all(...scopedIds);

  const batidasByUser = {};
  for (const b of [...allBatidas, ...allManual]) {
    (batidasByUser[b.user_id] = batidasByUser[b.user_id] || []).push(b);
  }
  const adjsByUser = {};
  for (const a of allAdjs) {
    (adjsByUser[a.user_id] = adjsByUser[a.user_id] || []).push(a);
  }
  const scheduleByUser = {};
  for (const s of allSchedules) {
    if (!scheduleByUser[s.user_id]) scheduleByUser[s.user_id] = {};
    scheduleByUser[s.user_id][s.dow] = s.expected_minutes;
  }
  const holidayRows = db.prepare(
    `SELECT date FROM holidays WHERE date >= ? AND date <= ?`
  ).all(periodStart, todayStr);
  const holidaySet = new Set(holidayRows.map(h => h.date));
  function calcDailyExpected(u) {
    if (!u || !u.meio_periodo) return 480;
    const t = (u.title || "").toLowerCase();
    if (t.includes("doctor"))   return 240;
    if (t.includes("designer")) return 360;
    return 240;
  }

  const results = [];
  for (const u of users) {
    const dailyExp = calcDailyExpected(u);
    const daySched = scheduleByUser[u.id] || {};
    const hasSched = Object.keys(daySched).length > 0;

    function effExp(dateStr) {
      if (holidaySet.has(dateStr)) return 0;
      const d = new Date(dateStr + "T12:00:00Z");
      const dow = d.getUTCDay();
      if (dow === 0) return 0;
      if (dow === 6) return hasSched && daySched[6] !== undefined ? daySched[6] : 240;
      if (hasSched && daySched[dow] !== undefined) return daySched[dow];
      return getDayExpected(dateStr, dailyExp);
    }

    const bByDate = {};
    for (const b of (batidasByUser[u.id] || [])) {
      (bByDate[b.date] = bByDate[b.date] || []).push(b);
    }
    const aByDate = {};
    for (const a of (adjsByUser[u.id] || [])) {
      (aByDate[a.date] = aByDate[a.date] || []).push(a);
    }

    const allDates = new Set([...Object.keys(bByDate), ...Object.keys(aByDate)]);
    const cursor = new Date(periodStart + "T12:00:00Z");
    const endDate = new Date(todayStr + "T12:00:00Z");
    while (cursor <= endDate) {
      allDates.add(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    let balance = 0, periodExtras = 0, periodFaltas = 0, periodPaidOT = 0;
    for (const date of allDates) {
      if (date === todayStr && (bByDate[date] || []).length % 2 === 1) continue;
      const dayBs = bByDate[date] || [];
      const dayAs = aByDate[date] || [];
      if (dayBs.length === 0 && dayAs.length === 0) continue;
      const worked = computeWorkedMinutes(dayBs);
      const expected = effExp(date);
      const adjMin = dayAs.reduce((s, a) => s + (a.tipo === "credito" ? a.minutos : -a.minutos), 0);
      const surplus = worked - expected;
      const paidOT = expected > 0 && surplus > 120 ? surplus - 120 : 0;
      // Cap daily banco credit at 2h (120 min); excess is paid overtime, not credited
      const cappedSurplus = expected > 0 && surplus > 120 ? 120 : surplus;
      balance += cappedSurplus + adjMin;
      if (surplus > 0) periodExtras += surplus;
      else if (surplus < 0 && expected > 0) periodFaltas += Math.abs(surplus);
      periodPaidOT += paidOT;
    }

    const dailyExpByDow = {};
    for (let dow = 0; dow <= 6; dow++) {
      if (dow === 0) dailyExpByDow[dow] = 0;
      else if (dow === 6) dailyExpByDow[dow] = daySched[6] !== undefined ? daySched[6] : 240;
      else dailyExpByDow[dow] = daySched[dow] !== undefined ? daySched[dow] : dailyExp;
    }
    results.push({
      userId: u.id,
      fullName: u.full_name,
      groupName: u.group_name || "Sem grupo",
      groupColor: u.group_color || "#94a3b8",
      periodBalanceMin: balance,
      previousBalanceMin: 0,
      periodoStartDate: periodStart,
      periodExtrasMin: periodExtras,
      periodFaltasMin: periodFaltas,
      periodPaidOTMin: periodPaidOT,
      periodo: periodo ? { id: periodo.id, label: periodo.label, startDate: periodo.start_date, endDate: periodo.end_date } : null,
      dailyExpByDow,
    });
  }

  return res.json(results);
});


module.exports = router;
