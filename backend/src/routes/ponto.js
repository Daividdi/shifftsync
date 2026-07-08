const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

function today() { return new Date().toISOString().slice(0, 10); }
function yesterday() { const d = new Date(Date.now() - 86400000); return d.toISOString().slice(0, 10); }
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

  // Dia incompleto = nº ímpar de registros VÁLIDOS (batidas não excluídas +
  // correções manuais/abono) — assim o dia sai da lista conforme o RH corrige.
  const incompleteRows = db.prepare(`
    SELECT b.user_id, u.full_name, COUNT(*) as incomplete_days
    FROM (
      SELECT b.user_id, b.date, COUNT(*) as c FROM (
        SELECT b.user_id, b.date FROM ponto_batidas b ${where} AND b.deleted_at IS NULL
        UNION ALL
        SELECT b.user_id, b.date FROM ponto_records b ${where} AND b.source IN ('manual','abono')
      ) b
      GROUP BY b.user_id, b.date
      HAVING c % 2 = 1
    ) b JOIN users u ON u.id = b.user_id
    GROUP BY b.user_id
    ORDER BY incomplete_days DESC
    LIMIT 10
  `).all(...params, ...params);

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
      SELECT b.user_id, b.date, COUNT(*) as c FROM (
        SELECT b.user_id, b.date FROM ponto_batidas b ${where} AND b.deleted_at IS NULL
        UNION ALL
        SELECT b.user_id, b.date FROM ponto_records b ${where} AND b.source IN ('manual','abono')
      ) b
      GROUP BY b.user_id, b.date
      HAVING c % 2 = 1
    ) b
    GROUP BY b.user_id
  `).all(...params, ...params);

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

function getDayExpected(dateStr, fullDayMin) {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay();
  if (dow === 0) return 0;
  if (dow === 6) return 240;
  return fullDayMin;
}

// Daily extras cap — anything above this is "Hora Extra 50%" (paid OT, NOT banked).
const PAID_OT_DAILY_CAP = 120; // 2h
// Splits gross extras into the portion that goes to the bank and the portion paid as 50% OT.
function splitExtrasForOT(extraMin) {
  const paidOTMin = Math.max(0, extraMin - PAID_OT_DAILY_CAP);
  return { bankableExtras: extraMin - paidOTMin, paidOTMin };
}
// Entry/exit deviation tolerance — events ≤ this many minutes are ignored.
// Lunch deviations are NOT tolerated (every minute counts).
const TOL_ENTRY_EXIT = 5;

// Deviation-model formula matching the PDF reference.
// Tracks buckets per-event (PDF-style):
//   atrasoMin   = entry late + extra lunch (PDF: "Atraso A")
//   saMin       = early exit               (PDF: "Saída Antecipada SA")
//   extraMin    = early entry + short lunch + late exit (PDF: "Extras do período" — gross)
//   paidOTMin   = portion of extras above PAID_OT_DAILY_CAP (PDF: "Hora Extra 50%")
// Banked extras = extraMin - paidOTMin   (PDF: "Extras a Compensar")
// Saldo = (extraMin - paidOTMin) - atrasoMin - saMin   (matches PDF formula exactly).
function computeDayDev(batidas, expected, isSat, schedStart) {
  const SS = schedStart !== undefined ? schedStart : 480;
  const toMin = ms => { const d = new Date(ms || 0); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const sorted = [...batidas].sort((a, b) => (a.time_millis || 0) - (b.time_millis || 0));
  const N = sorted.length;
  let worked = 0, totalBreaks = 0;
  for (let i = 0; i + 1 < N; i += 2) {
    const from = toMin(sorted[i].time_millis), to = toMin(sorted[i+1].time_millis);
    const dur = to >= from ? to - from : to + 1440 - from;
    if (dur > 0) worked += dur;
  }
  for (let i = 1; i + 1 < N; i += 2) {
    const from = toMin(sorted[i].time_millis), to = toMin(sorted[i+1].time_millis);
    const dur = to >= from ? to - from : to + 1440 - from;
    if (dur > 0) totalBreaks += dur;
  }
  if (N === 0 || N % 2 === 1) return { balance: 0, worked, lunchMin: null, atrasoMin: 0, saMin: 0, extraMin: 0, paidOTMin: 0 };

  // Saturday: 4h obligation starting at 08:00, no lunch.
  // Entry has 5-min tolerance (early-entry ≤5 not credited); exit always counted in full.
  if (isSat) {
    const SAT_START = 480;
    const SAT_END = SAT_START + expected;
    const P1 = toMin(sorted[0].time_millis), Plast = toMin(sorted[N-1].time_millis);
    let atrasoMin = 0, saMin = 0, extraMin = 0;
    const entryDev = P1 - SAT_START;
    if (Math.abs(entryDev) > TOL_ENTRY_EXIT) {
      if (entryDev > 0) atrasoMin += entryDev; else extraMin += -entryDev;
    }
    const exitDev = Plast - SAT_END;
    if (exitDev > 0) extraMin += exitDev; else if (exitDev < 0) saMin += -exitDev;
    const { bankableExtras, paidOTMin } = splitExtrasForOT(extraMin);
    return { balance: bankableExtras - atrasoMin - saMin, worked, lunchMin: null, atrasoMin, saMin, extraMin, paidOTMin };
  }

  // Half-period (no lunch, N=2): flexible timing — use simple worked-vs-expected (no tolerance).
  // This applies to Designer 6h, half-day shifts with 2 punches only.
  const isHalfPeriod = N === 2 && expected < 480;
  if (isHalfPeriod) {
    const raw = worked - expected;
    const ex  = raw > 0 ? raw : 0;
    const at  = raw < 0 ? -raw : 0;
    const { bankableExtras, paidOTMin } = splitExtrasForOT(ex);
    return { balance: bankableExtras - at, worked, lunchMin: null, atrasoMin: at, saMin: 0, extraMin: ex, paidOTMin };
  }
  const fullWeekday = expected >= 360;
  if (!fullWeekday) {
    const raw = worked - expected;
    const ex  = raw > 0 ? raw : 0;
    const at  = raw < 0 ? -raw : 0;
    const { bankableExtras, paidOTMin } = splitExtrasForOT(ex);
    return { balance: bankableExtras - at, worked, lunchMin: null, atrasoMin: at, saMin: 0, extraMin: ex, paidOTMin };
  }

  // Full weekday — entry/exit have 5-min tolerance; lunch has none.
  // Add +60 only if employee takes a lunch break (i.e., full 8h day OR has 4+ punches recorded).
  const hasLunch = expected >= 480 || N >= 4;
  const SCHED_END = SS + expected + (hasLunch ? 60 : 0);
  const P1 = toMin(sorted[0].time_millis), Plast = toMin(sorted[N-1].time_millis);
  let atrasoMin = 0, saMin = 0, extraMin = 0;
  const entryDev = P1 - SS;
  if (Math.abs(entryDev) > TOL_ENTRY_EXIT) {
    if (entryDev > 0) atrasoMin += entryDev; else extraMin += -entryDev;
  }
  let lunchMin = null;
  if (N >= 4) {
    lunchMin = totalBreaks;
    const bd = totalBreaks - 60;
    if (bd > 0) atrasoMin += bd; else if (bd < 0) extraMin += -bd;
  }
  const exitDev = Plast - SCHED_END;
  if (Math.abs(exitDev) > TOL_ENTRY_EXIT) {
    if (exitDev > 0) extraMin += exitDev; else saMin += -exitDev;
  }
  const { bankableExtras, paidOTMin } = splitExtrasForOT(extraMin);
  const balance = bankableExtras - atrasoMin - saMin;
  return { balance, worked, lunchMin, atrasoMin, saMin, extraMin, paidOTMin };
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
  const to   = dateTo   || yesterday();

  // Find active period using the 'to' date
  try { ensureBancoPeriodos(db); } catch (e) {}
  const periodo = db.prepare(
    "SELECT * FROM banco_horas_periodos WHERE start_date <= ? ORDER BY start_date DESC LIMIT 1"
  ).get(to);
  const periodStart = periodo ? periodo.start_date : "2026-01-01";
  const effectiveFrom = isAdmin(role) ? from : (from < periodStart ? periodStart : from);

  const batidas = db.prepare(
    "SELECT * FROM ponto_batidas WHERE user_id=? AND date BETWEEN ? AND ? AND deleted_at IS NULL ORDER BY date, time_millis ASC"
  ).all(userId, effectiveFrom, to);

  const manualMain = db.prepare(
    "SELECT recorded_at, CAST(ROUND((julianday(REPLACE(recorded_at,'Z',''))-2440587.5)*86400000.0) AS INTEGER) as time_millis, date FROM ponto_records WHERE user_id=? AND source IN ('manual','abono') AND date BETWEEN ? AND ?"
  ).all(userId, effectiveFrom, to);

  const adjustments = db.prepare(`
    SELECT bha.*, u.full_name as created_by_name
    FROM banco_horas_ajustes bha
    LEFT JOIN users u ON u.id = bha.created_by
    WHERE bha.user_id=? AND bha.date BETWEEN ? AND ?
    ORDER BY bha.date, bha.created_at
  `).all(userId, effectiveFrom, to);

  // Approved abonos overlapping the period — used to compute per-day "Abono" time granted.
  const abonosApproved = db.prepare(`
    SELECT punch_date, punch_date_to, punch_time, punch_time_to, reason, justification
    FROM abono_requests
    WHERE user_id=? AND status='approved'
      AND COALESCE(punch_date_to, punch_date) >= ? AND punch_date <= ?
  `).all(userId, periodStart, to);   // from periodStart: sumBalance (previous
  // balance) also needs abonos that predate the current view range
  function abonoMinutesForDate(date) {
    let total = 0;
    for (const ab of abonosApproved) {
      const start = ab.punch_date;
      const end   = ab.punch_date_to || ab.punch_date;
      if (date < start || date > end) continue;
      const dow = new Date(date + "T12:00:00Z").getUTCDay();
      if (dow === 0) continue; // Sunday: not obligated, no abono relevance
      if (ab.punch_time && ab.punch_time_to) {
        const [h1, m1] = ab.punch_time.split(':').map(Number);
        const [h2, m2] = ab.punch_time_to.split(':').map(Number);
        total += Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1));
      } else if (!ab.punch_time) {
        // Full-day default — 4h for Saturday, 8h for weekday.
        total += (dow === 6) ? 240 : 480;
      }
    }
    return total;
  }

  const prevBatidas = db.prepare(
    "SELECT date, time_millis FROM ponto_batidas WHERE user_id=? AND date >= ? AND date < ? AND deleted_at IS NULL ORDER BY date, time_millis ASC"
  ).all(userId, periodStart, effectiveFrom);

  const manualPrev = db.prepare(
    "SELECT recorded_at, CAST(ROUND((julianday(REPLACE(recorded_at,'Z',''))-2440587.5)*86400000.0) AS INTEGER) as time_millis, date FROM ponto_records WHERE user_id=? AND source IN ('manual','abono') AND date >= ? AND date < ?"
  ).all(userId, periodStart, effectiveFrom);

  const prevAdjs = db.prepare(
    "SELECT date, tipo, minutos FROM banco_horas_ajustes WHERE user_id=? AND date >= ? AND date < ?"
  ).all(userId, periodStart, effectiveFrom);

  const meioPeriodoUser = db.prepare('SELECT meio_periodo, no_saturday, title, sched_start_minutes, hire_date, created_at, deactivated_at FROM users WHERE id=?').get(userId);
  const userSchedStart = meioPeriodoUser?.sched_start_minutes ?? 480;
  // Effective "hired-from" date: when the user actually started counting time.
  // Priority: hire_date → first batida ever → created_at (date only).
  let firstBatidaRow = db.prepare("SELECT MIN(date) as d FROM ponto_batidas WHERE user_id=? AND deleted_at IS NULL").get(userId);
  const userEffectiveStart = meioPeriodoUser?.hire_date
    || firstBatidaRow?.d
    || (meioPeriodoUser?.created_at ? meioPeriodoUser.created_at.slice(0,10) : null);
  const userEffectiveEnd = meioPeriodoUser?.deactivated_at ? meioPeriodoUser.deactivated_at.slice(0,10) : null;
  function isWithinEmployment(date) {
    if (userEffectiveStart && date < userEffectiveStart) return false;
    if (userEffectiveEnd   && date > userEffectiveEnd)   return false;
    return true;
  }
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
  // "Does not work Saturdays" → Saturday obligation = 0 (handled uniformly by the
  // daySchedule[6] override that every Saturday code path already respects).
  if (meioPeriodoUser?.no_saturday) daySchedule[6] = 0;
  const hasDaySchedule = Object.keys(daySchedule).length > 0;

  // Business rule: every Saturday counts as 4h obligation in saldo (rotating schedules table
  // is for calendar display only and does NOT affect balance calculation).

  const _hlRows = db.prepare(
    `SELECT date FROM holidays WHERE date >= ? AND date <= ?`
  ).all(periodStart, to);
  const _hlSet = new Set(_hlRows.map(h => h.date));

  const vacRows = db.prepare(
    "SELECT start_date, end_date FROM vacation_records WHERE user_id=? AND status='approved' AND start_date <= ? AND end_date >= ?"
  ).all(userId, to, periodStart);
  const vacationSet = new Set();
  for (const v of vacRows) {
    const vs = new Date(v.start_date + "T12:00:00Z");
    const ve = new Date(v.end_date   + "T12:00:00Z");
    for (let c = new Date(vs); c <= ve; c.setUTCDate(c.getUTCDate() + 1))
      vacationSet.add(c.toISOString().slice(0, 10));
  }

  // Returns expected minutes for a day
  function getEffectiveDayExpected(dateStr, fallback) {
    if (_hlSet.has(dateStr)) return 0;
    const d = new Date(dateStr + "T12:00:00Z");
    const dow = d.getUTCDay();
    if (dow === 0) return 0;
    if (dow === 6) {
      return hasDaySchedule && daySchedule[6] !== undefined ? daySchedule[6] : 240; // all saturdays = 4h obligation
    }
    if (hasDaySchedule && daySchedule[dow] !== undefined) return daySchedule[dow];
    return getDayExpected(dateStr, fallback);
  }

  function sumBalance(batidasArr, adjsArr, fromDate, toDate) {
    const bd = {}, ad = {};
    for (const b of batidasArr) (bd[b.date] = bd[b.date] || []).push(b);
    for (const a of adjsArr)   (ad[a.date] = ad[a.date] || []).push(a);
    const dates = new Set([...Object.keys(bd), ...Object.keys(ad)]);
    // Include all weekdays + Saturdays in range so absent obligated days get deducted as Falta
    if (fromDate && toDate) {
      const cur = new Date(fromDate + "T12:00:00Z");
      const end = new Date(toDate   + "T12:00:00Z");
      // toDate is EXCLUSIVE: it is the first day of the current view range —
      // counting it here (always as falta, since its batidas are excluded by the
      // prev queries) double-counted day 1 and broke the month-to-month carryover.
      while (cur < end) {
        const dw = cur.getUTCDay();
        if (dw >= 1 && dw <= 6) dates.add(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }
    let total = 0;
    for (const date of dates) {
      const dayBs = bd[date] || [];
      const adjM  = (ad[date] || []).reduce((s, a) => s + (a.tipo === "credito" ? a.minutos : -a.minutos), 0);
      const d     = new Date(date + "T12:00:00Z");
      const dow   = d.getUTCDay();
      if (_hlSet.has(date) || dow === 0) { total += adjM; continue; }
      if (vacationSet.has(date)) { total += adjM; continue; }
      if (dow === 6) {
        const exp = hasDaySchedule && daySchedule[6] !== undefined ? daySchedule[6] : 240;
        if (dayBs.length === 0) {
          if (isWithinEmployment(date)) {
            const falta = Math.max(0, exp - abonoMinutesForDate(date));
            total += -falta + adjM;
          } else total += adjM;
        } else {
          let _b = computeDayDev(dayBs, exp, true, userSchedStart).balance;
          if (_b < 0) _b += Math.min(abonoMinutesForDate(date), -_b);
          total += _b + adjM;
        }
      } else {
        const exp = getEffectiveDayExpected(date, dailyExpected);
        if (dayBs.length === 0) {
          if (isWithinEmployment(date)) {
            const falta = Math.max(0, exp - abonoMinutesForDate(date));
            total += -falta + adjM;
          } else total += adjM;
        } else {
          // Mirror the period pipeline: meio_periodo non-Designer gets dynamic
          // expected (4 punches = full day, 2 = half) + afternoon-shift start.
          // Without this the previous-balance diverged for meio_periodo users.
          let dayExpected = exp;
          let dayStart = userSchedStart;
          if (meioPeriodoUser?.meio_periodo) {
            const _t = (meioPeriodoUser.title || '').toLowerCase();
            const _isDesigner = _t.includes('designer') && !_t.includes('doctor');
            if (!_isDesigner) dayExpected = dayBs.length >= 4 ? 480 : 240;
            if (dayBs.length === 2 || dayBs.length === 4) {
              const _firstMs = Math.min(...dayBs.map(b => b.time_millis));
              const _firstMin = new Date(_firstMs).getUTCHours() * 60 + new Date(_firstMs).getUTCMinutes();
              if (_firstMin >= 720) dayStart = 780; // 13:00 afternoon shift
            }
          }
          let _b = computeDayDev(dayBs, dayExpected, false, dayStart).balance;
          if (_b < 0) _b += Math.min(abonoMinutesForDate(date), -_b);
          total += _b + adjM;
        }
      }
    }
    return total;
  }

  // Merge prev batidas with manual prev for previousBalance calc
  const prevBatidasMerged = [...prevBatidas, ...manualPrev];
  const previousBalanceMin = sumBalance(prevBatidasMerged, prevAdjs, periodStart, effectiveFrom);

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
  const rangeEnd = to < yesterday() ? to : yesterday();
  // Include vacation days so they always appear in the response
  for (const d of vacationSet) { if (d >= effectiveFrom && d <= rangeEnd) allDates.add(d); }
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
    const dayBatidas = batidasByDate[date] || [];
    const dayAdjs    = adjByDate[date]     || [];
    const adjMin     = dayAdjs.reduce((s, a) => s + (a.tipo === "credito" ? a.minutos : -a.minutos), 0);
    const d          = new Date(date + "T12:00:00Z");
    const dow        = d.getUTCDay();
    const isSat      = dow === 6;
    const isHoliday  = _hlSet.has(date);
    const isVacation = vacationSet.has(date);
    const isOblSat   = isSat && !isHoliday && !isVacation;
    // Pre-compute abono coverage for this date so we can offset Falta on absent days.
    const _abonoCover = abonoMinutesForDate(date);

    let workedMin, expectedMin, diffMin, lunchMin = null, atrasoMin = 0, saMin = 0, extraMin = 0, paidOTMin = 0, faltaMin = 0, dayLabel;
    if (isVacation && dow !== 0) {
      workedMin   = computeDayDev(dayBatidas, 0, isSat, userSchedStart).worked;
      expectedMin = 0;
      diffMin     = 0;
      dayLabel    = 'ferias';
    } else if (isOblSat) {
      expectedMin = getEffectiveDayExpected(date, dailyExpected);
      if (dayBatidas.length === 0) {
        if (!isWithinEmployment(date)) { workedMin = 0; expectedMin = 0; diffMin = 0; }
        else {
          // Falta = expected minus abono coverage; if abono fully covers, no Falta.
          workedMin = 0;
          faltaMin = Math.max(0, expectedMin - _abonoCover);
          diffMin = -faltaMin;
        }
      } else {
        const dev = computeDayDev(dayBatidas, expectedMin, true, userSchedStart);
        workedMin = dev.worked; diffMin = dev.balance; atrasoMin = dev.atrasoMin; saMin = dev.saMin; extraMin = dev.extraMin; paidOTMin = dev.paidOTMin;
        if (_abonoCover > 0 && diffMin < 0) {
          const cover = Math.min(_abonoCover, -diffMin);
          diffMin += cover;
          const c1 = Math.min(saMin, cover); saMin -= c1;
          const c2 = Math.min(atrasoMin, cover - c1); atrasoMin -= c2;
        }
      }
    } else if (!isSat && dow !== 0 && !isHoliday) {
      expectedMin = getEffectiveDayExpected(date, dailyExpected);
      if (dayBatidas.length === 0) {
        // Weekday with no punches: if outside employment → not obligated; otherwise Falta minus abono.
        if (!isWithinEmployment(date)) { workedMin = 0; expectedMin = 0; diffMin = 0; }
        else {
          workedMin = 0;
          faltaMin = Math.max(0, expectedMin - _abonoCover);
          diffMin = -faltaMin;
        }
      } else {
        // Dynamic expected for meio_periodo non-Designer (rotating shift):
        //   4 punches → full day (8h with lunch); 2 punches → half day (4h)
        let dayExpected = expectedMin;
        let daySchedStart = userSchedStart;
        if (meioPeriodoUser?.meio_periodo) {
          const title = (meioPeriodoUser.title || '').toLowerCase();
          const isDesigner = title.includes('designer') && !title.includes('doctor');
          if (!isDesigner) {
            if (dayBatidas.length >= 4) dayExpected = 480;
            else dayExpected = 240;
          }
          // Afternoon-shift detection: if first punch is after midday → shift starts at 13:00.
          // Applies to both N=2 (half-day afternoon) and N=4 (full afternoon→night).
          if (dayBatidas.length === 2 || dayBatidas.length === 4) {
            const firstMs = Math.min(...dayBatidas.map(b => b.time_millis));
            const firstMin = new Date(firstMs).getUTCHours() * 60 + new Date(firstMs).getUTCMinutes();
            if (firstMin >= 720) daySchedStart = 780; // 13:00 afternoon shift
          }
        }
        const dev = computeDayDev(dayBatidas, dayExpected, false, daySchedStart);
        workedMin = dev.worked; diffMin = dev.balance; lunchMin = dev.lunchMin; expectedMin = dayExpected;
        atrasoMin = dev.atrasoMin; saMin = dev.saMin; extraMin = dev.extraMin; paidOTMin = dev.paidOTMin;
        // Abono (atestado etc.) neutraliza o que faltou no dia — como no ERP:
        // cobre até o gap, nunca gera crédito; abate primeiro SA, depois atraso.
        if (_abonoCover > 0 && diffMin < 0) {
          const cover = Math.min(_abonoCover, -diffMin);
          diffMin += cover;
          const c1 = Math.min(saMin, cover); saMin -= c1;
          const c2 = Math.min(atrasoMin, cover - c1); atrasoMin -= c2;
        }
      }
    } else {
      const dev = computeDayDev(dayBatidas, 0, isSat, userSchedStart);
      workedMin = dev.worked; expectedMin = 0; diffMin = 0;
    }

    if (dayBatidas.length > 0 || dayAdjs.length > 0 || (isOblSat && expectedMin > 0) || isVacation || faltaMin > 0) {
      periodBalance += diffMin + adjMin;
      cumulative    += diffMin + adjMin;
    }
    const abonoMin = _abonoCover;
    const dayResult = { date, punchCount: dayBatidas.length, workedMin, expectedMin, diffMin, lunchMin, atrasoMin, saMin, extraMin, paidOTMin, faltaMin, abonoMin, adjustmentMin: adjMin, adjustments: dayAdjs, cumulativeMin: cumulative };
    if (dayLabel) dayResult.label = dayLabel;
    return dayResult;
  });

  const userInfo = db.prepare("SELECT id, full_name, dept FROM users WHERE id=?").get(userId);
  // PDF-style period buckets
  const periodTotals = days.reduce((acc, d) => {
    acc.worked    += d.workedMin     || 0;
    acc.expected  += d.expectedMin   || 0;
    acc.extras    += d.extraMin      || 0;
    acc.paidOT    += d.paidOTMin     || 0;
    acc.atraso    += d.atrasoMin     || 0;
    acc.sa        += d.saMin         || 0;
    acc.falta     += d.faltaMin      || 0;
    acc.abono     += (d.abonoMin || 0) + (d.adjustmentMin || 0);
    return acc;
  }, { worked: 0, expected: 0, extras: 0, paidOT: 0, atraso: 0, sa: 0, falta: 0, abono: 0 });
  periodTotals.extrasACompensar = periodTotals.extras - periodTotals.paidOT;
  return res.json({
    user: userInfo, dateFrom: effectiveFrom, dateTo: to, days,
    previousBalanceMin,
    periodBalanceMin:  periodBalance,
    currentBalanceMin: previousBalanceMin + periodBalance,
    totalCumulativeMin: previousBalanceMin + periodBalance,
    schedStartMin: userSchedStart,
    periodTotals,
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
  try { ensureBancoPeriodos(db); } catch (e) {}
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

// Rola os períodos do banco automaticamente: quando o período vigente termina
// (dia 23), cria o próximo (24 → dia 23 três meses depois) e fecha o anterior.
// Ex.: T2 24/04–23/07 → em 24/07 nasce T3 24/07–23/10, e assim sucessivamente.
const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function ensureBancoPeriodos(db) {
  const todayStr = today();
  let guard = 0;
  for (;;) {
    const last = db.prepare("SELECT * FROM banco_horas_periodos ORDER BY start_date DESC LIMIT 1").get();
    if (!last || last.end_date >= todayStr || ++guard > 24) return;
    const st = new Date(last.end_date + "T12:00:00Z");
    st.setUTCDate(st.getUTCDate() + 1);
    const en = new Date(st);
    en.setUTCMonth(en.getUTCMonth() + 3);
    en.setUTCDate(en.getUTCDate() - 1);
    const sd = st.toISOString().slice(0, 10), ed = en.toISOString().slice(0, 10);
    const label = `T${Math.floor(st.getUTCMonth() / 3) + 1}/${st.getUTCFullYear()} — ${MESES_ABREV[st.getUTCMonth()]}–${MESES_ABREV[en.getUTCMonth()]}`;
    db.prepare("INSERT INTO banco_horas_periodos (start_date, end_date, label, closed, created_at) VALUES (?,?,?,0,datetime('now'))").run(sd, ed, label);
    if (!last.closed) db.prepare("UPDATE banco_horas_periodos SET closed=1, closed_at=datetime('now'), closed_by='auto' WHERE id=?").run(last.id);
  }
}

// GET /api/ponto/banco-horas/equipe — team banco de horas summary
router.get("/banco-horas/equipe", requireAuth, (req, res) => {
  const db = getDb();
  const role = req.user.role;
  try { ensureBancoPeriodos(db); } catch (e) {}

  const todayStr     = today();
  const yesterdayStr = yesterday();
  // ?until=YYYY-MM-DD: além do saldo do período todo, devolve o saldo acumulado
  // ANTES dessa data (previousBalanceMin) — a tela usa como "saldo anterior".
  const untilStr = /^\d{4}-\d{2}-\d{2}$/.test(req.query.until || "") ? req.query.until : null;

  // Employees can call this endpoint but scoped to themselves only, so the PontoSaldoPage
  // shows correct schedStartMin / workingSaturdayDates / dailyExpByDow for their own view.
  let scopedIds;
  if (isAdmin(role)) {
    scopedIds = db.prepare("SELECT id FROM users WHERE active=1").all().map(u => u.id);
  } else if (isLeader(role)) {
    scopedIds = getScopedMemberIds(db, req.user.id);
  } else {
    scopedIds = [req.user.id];
  }
  if (!scopedIds.length) return res.json([]);

  const periodo = db.prepare(
    "SELECT * FROM banco_horas_periodos WHERE start_date <= ? ORDER BY start_date DESC LIMIT 1"
  ).get(todayStr);
  const periodStart = periodo ? periodo.start_date : todayStr.slice(0, 4) + "-01-01";

  const ph = scopedIds.map(() => "?").join(",");

  const users = db.prepare(`
    SELECT u.id, u.full_name, u.meio_periodo, u.no_saturday, u.title, u.sched_start_minutes, u.hire_date, u.created_at, u.deactivated_at,
      g.name as group_name, g.color as group_color,
      (SELECT MIN(date) FROM ponto_batidas WHERE user_id=u.id AND deleted_at IS NULL) as first_batida_date
    FROM users u
    LEFT JOIN group_members gm ON gm.user_id = u.id
    LEFT JOIN groups g ON g.id = gm.group_id
    WHERE u.id IN (${ph}) AND u.active=1
  `).all(...scopedIds);

  const allBatidas = db.prepare(
    `SELECT user_id, date, time_millis FROM ponto_batidas WHERE user_id IN (${ph}) AND date >= ? AND deleted_at IS NULL`
  ).all(...scopedIds, periodStart);

  const allManual = db.prepare(
    `SELECT user_id, date, CAST(ROUND((julianday(REPLACE(recorded_at,'Z',''))-2440587.5)*86400000.0) AS INTEGER) as time_millis
     FROM ponto_records WHERE user_id IN (${ph}) AND source IN ('manual','abono') AND date >= ?`
  ).all(...scopedIds, periodStart);

  const allAdjs = db.prepare(
    `SELECT user_id, date, tipo, minutos FROM banco_horas_ajustes WHERE user_id IN (${ph}) AND date >= ?`
  ).all(...scopedIds, periodStart);

  const allSchedules = db.prepare(
    `SELECT user_id, dow, expected_minutes FROM user_day_schedule WHERE user_id IN (${ph})`
  ).all(...scopedIds);

  // Saturday rotating schedules table is used only for calendar display, not balance.

  // Approved abonos for all users in scope — used to offset Falta on absent days.
  const allAbonos = db.prepare(
    `SELECT user_id, punch_date, punch_date_to, punch_time, punch_time_to FROM abono_requests
     WHERE user_id IN (${ph}) AND status='approved' AND COALESCE(punch_date_to, punch_date) >= ? AND punch_date <= ?`
  ).all(...scopedIds, periodStart, todayStr);
  const abonosByUser = {};
  for (const a of allAbonos) {
    (abonosByUser[a.user_id] = abonosByUser[a.user_id] || []).push(a);
  }
  function abonoCoverForUserDate(userId, date) {
    const list = abonosByUser[userId] || [];
    let total = 0;
    for (const ab of list) {
      const start = ab.punch_date;
      const end   = ab.punch_date_to || ab.punch_date;
      if (date < start || date > end) continue;
      const dow = new Date(date + "T12:00:00Z").getUTCDay();
      if (dow === 0) continue;
      if (ab.punch_time && ab.punch_time_to) {
        const [h1, m1] = ab.punch_time.split(':').map(Number);
        const [h2, m2] = ab.punch_time_to.split(':').map(Number);
        total += Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1));
      } else if (!ab.punch_time) {
        total += (dow === 6) ? 240 : 480;
      }
    }
    return total;
  }

  const allVacations = db.prepare(
    `SELECT user_id, start_date, end_date FROM vacation_records WHERE user_id IN (${ph}) AND status='approved' AND start_date <= ? AND end_date >= ?`
  ).all(...scopedIds, todayStr, periodStart);
  const vacByUser = {};
  for (const v of allVacations) {
    if (!vacByUser[v.user_id]) vacByUser[v.user_id] = new Set();
    const vs = new Date(v.start_date + "T12:00:00Z");
    const ve = new Date(v.end_date   + "T12:00:00Z");
    for (let c = new Date(vs); c <= ve; c.setUTCDate(c.getUTCDate() + 1))
      vacByUser[v.user_id].add(c.toISOString().slice(0, 10));
  }

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
    const schedStart = u.sched_start_minutes ?? 480;
    const daySched = scheduleByUser[u.id] || {};
    // "Does not work Saturdays" → Saturday obligation = 0 (same override used everywhere).
    if (u.no_saturday) daySched[6] = 0;
    const hasSched = Object.keys(daySched).length > 0;
    const effStart = u.hire_date || u.first_batida_date || (u.created_at ? u.created_at.slice(0, 10) : null);
    const effEnd   = u.deactivated_at ? u.deactivated_at.slice(0, 10) : null;
    const withinEmp = d => (!effStart || d >= effStart) && (!effEnd || d <= effEnd);

    const userVacSet   = vacByUser[u.id] || new Set();
    function effExp(dateStr) {
      if (holidaySet.has(dateStr)) return 0;
      const d = new Date(dateStr + "T12:00:00Z");
      const dow = d.getUTCDay();
      if (dow === 0) return 0;
      if (dow === 6) {
        // Business rule: every Saturday counts as 4h obligation regardless of rotating schedule.
        return hasSched && daySched[6] !== undefined ? daySched[6] : 240;
      }
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
    const endDate = new Date(yesterdayStr + "T12:00:00Z");
    while (cursor <= endDate) {
      allDates.add(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    let balance = 0, prevBalance = 0, periodExtras = 0, periodAtraso = 0, periodSA = 0, periodFalta = 0, periodAbono = 0, periodPaidOT = 0;
    const add = (date, delta) => { balance += delta; if (untilStr && date < untilStr) prevBalance += delta; };
    for (const date of allDates) {
      const dayBs  = bByDate[date] || [];
      const dayAs  = aByDate[date] || [];
      const dObj   = new Date(date + "T12:00:00Z");
      const dow    = dObj.getUTCDay();
      const isSat  = dow === 6;
      const isHol  = holidaySet.has(date);
      const adjMin = dayAs.reduce((s, a) => s + (a.tipo === "credito" ? a.minutos : -a.minutos), 0);

      if (dow === 0 || isHol) { if (adjMin) { add(date, adjMin); periodAbono += adjMin; } continue; }
      if (userVacSet.has(date)) { if (adjMin) { add(date, adjMin); periodAbono += adjMin; } continue; }

      if (isSat) {
        const exp = hasSched && daySched[6] !== undefined ? daySched[6] : 240;
        let satBal = 0;
        if (dayBs.length === 0) {
          if (withinEmp(date)) {
            const falta = Math.max(0, exp - abonoCoverForUserDate(u.id, date));
            satBal = -falta;
            periodFalta += falta;
          }
        } else {
          const dev = computeDayDev(dayBs, exp, true, schedStart);
          satBal = dev.balance;
          let sAtr = dev.atrasoMin, sSA = dev.saMin;
          if (satBal < 0) {
            const cover = Math.min(abonoCoverForUserDate(u.id, date), -satBal);
            satBal += cover;
            const c1 = Math.min(sSA, cover); sSA -= c1;
            sAtr -= Math.min(sAtr, cover - c1);
          }
          periodExtras += dev.extraMin;
          periodPaidOT += dev.paidOTMin;
          periodAtraso += sAtr;
          periodSA     += sSA;
        }
        add(date, satBal + adjMin);
        if (adjMin) periodAbono += adjMin;
      } else {
        const exp = hasSched && daySched[dow] !== undefined ? daySched[dow] : dailyExp;
        if (dayBs.length > 0) {
          // Meio período (não-Designer): expediente dinâmico — 4 batidas = dia
          // cheio (8h), 2 = meio (4h); turno da tarde inicia 13:00 (mesma regra
          // do extrato individual, para os saldos baterem entre as telas).
          let dayExp = exp;
          let dayStart = schedStart;
          if (u.meio_periodo) {
            const _t = (u.title || "").toLowerCase();
            const _isDesigner = _t.includes("designer") && !_t.includes("doctor");
            if (!_isDesigner) dayExp = dayBs.length >= 4 ? 480 : 240;
            if (dayBs.length === 2 || dayBs.length === 4) {
              const _firstMs = Math.min(...dayBs.map(b => b.time_millis));
              const _firstMin = new Date(_firstMs).getUTCHours() * 60 + new Date(_firstMs).getUTCMinutes();
              if (_firstMin >= 720) dayStart = 780;
            }
          }
          const dev = computeDayDev(dayBs, dayExp, false, dayStart);
          let dBal = dev.balance, dAtr = dev.atrasoMin, dSA = dev.saMin;
          if (dBal < 0) {
            const cover = Math.min(abonoCoverForUserDate(u.id, date), -dBal);
            dBal += cover;
            const c1 = Math.min(dSA, cover); dSA -= c1;
            dAtr -= Math.min(dAtr, cover - c1);
          }
          add(date, dBal);
          periodExtras += dev.extraMin;
          periodPaidOT += dev.paidOTMin;
          periodAtraso += dAtr;
          periodSA     += dSA;
        } else if (withinEmp(date)) {
          const falta = Math.max(0, exp - abonoCoverForUserDate(u.id, date));
          add(date, -falta);
          periodFalta += falta;
        }
        add(date, adjMin);
        if (adjMin) periodAbono += adjMin;
      }
    }

    const dailyExpByDow = {};
    for (let dow = 0; dow <= 6; dow++) {
      if (dow === 0) dailyExpByDow[dow] = 0;
      else if (dow === 6) dailyExpByDow[dow] = daySched[6] !== undefined ? daySched[6] : 240;
      else dailyExpByDow[dow] = daySched[dow] !== undefined ? daySched[dow] : dailyExp;
    }
    // Enumerate all obligated dates in the period (weekdays + Saturdays, excluding holidays/vacation/Sundays/pre-hire)
    const workingSaturdayDates = [];
    const workingWeekdayDates  = [];
    {
      const cur = new Date(periodStart + "T12:00:00Z");
      const end = new Date(yesterdayStr + "T12:00:00Z");
      while (cur <= end) {
        const dw = cur.getUTCDay();
        const ds = cur.toISOString().slice(0, 10);
        if (dw !== 0 && !holidaySet.has(ds) && !userVacSet.has(ds) && withinEmp(ds)) {
          if (dw === 6) { if (dailyExpByDow[6] > 0) workingSaturdayDates.push(ds); }
          else          workingWeekdayDates.push(ds);
        }
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }
    results.push({
      userId: u.id,
      fullName: u.full_name,
      groupName: u.group_name || "Sem grupo",
      groupColor: u.group_color || "#94a3b8",
      schedStartMin: schedStart,
      periodBalanceMin: balance,
      previousBalanceMin: prevBalance,
      periodoStartDate: periodStart,
      // PDF-style per-event buckets
      periodExtrasMin: periodExtras,
      periodAtrasoMin: periodAtraso,
      periodSAMin:     periodSA,
      periodFaltaMin:  periodFalta,
      periodAbonoMin:  periodAbono,
      // Backwards-compat aliases (old UI summed positive/negative day balances)
      periodFaltasMin: periodAtraso + periodSA + periodFalta,
      periodPaidOTMin: periodPaidOT,
      periodo: periodo ? { id: periodo.id, label: periodo.label, startDate: periodo.start_date, endDate: periodo.end_date } : null,
      dailyExpByDow,
      workingSaturdayDates,
      workingWeekdayDates,
    });
  }

  return res.json(results);
});


module.exports = router;
