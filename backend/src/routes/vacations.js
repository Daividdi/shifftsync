const express  = require("express");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function today() { return new Date().toISOString().slice(0, 10); }
function isAdmin(role)  { return ["hr","ti","gerencia"].includes(role); }
function isLeader(role) { return role === "leader" || isAdmin(role); }

function getLeaderGroupIds(db, userId) {
  const primary = db.prepare("SELECT id FROM groups WHERE leader_id=?").all(userId);
  const co      = db.prepare("SELECT group_id as id FROM group_co_leaders WHERE user_id=?").all(userId);
  return [...new Set([...primary.map(g => g.id), ...co.map(g => g.id)])];
}

function calcDays(start, end) {
  const ms = new Date(end + "T12:00:00") - new Date(start + "T12:00:00");
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

function fmtRecord(v, db) {
  const user     = db.prepare("SELECT full_name, username, dept, hire_date FROM users WHERE id=?").get(v.user_id);
  const creator  = db.prepare("SELECT full_name FROM users WHERE id=?").get(v.created_by);
  const approver = v.approved_by ? db.prepare("SELECT full_name FROM users WHERE id=?").get(v.approved_by) : null;
  const group    = v.group_id ? db.prepare("SELECT name, color FROM groups WHERE id=?").get(v.group_id) : null;
  return {
    id: v.id, userId: v.user_id,
    fullName: user?.full_name, username: user?.username,
    dept: user?.dept, hireDate: user?.hire_date,
    groupId: v.group_id, groupName: group?.name, groupColor: group?.color,
    startDate: v.start_date, endDate: v.end_date, days: v.days,
    acqStart: v.acq_start, acqEnd: v.acq_end, daysEntitled: v.days_entitled,
    status: v.status, notes: v.notes,
    approvedBy: v.approved_by, approvedByName: approver?.full_name, approvedAt: v.approved_at,
    createdBy: v.created_by, createdByName: creator?.full_name,
    createdAt: v.created_at, updatedAt: v.updated_at,
  };
}

// Compute used/remaining days for a user within an acq period
function userSummary(db, userId) {
  const user = db.prepare("SELECT hire_date, acq_override_start, acq_override_end, conc_override_end FROM users WHERE id=?").get(userId);
  const hireDate = user?.hire_date;
  const allRecords = db.prepare(
    "SELECT * FROM vacation_records WHERE user_id=? AND status NOT IN ('cancelled') ORDER BY start_date DESC"
  ).all(userId);

  // Current acquisition period: use HR overrides if set, otherwise calc from hire_date anniversary
  let acqStart = user?.acq_override_start || null;
  let acqEnd   = user?.acq_override_end   || null;
  let concEnd  = user?.conc_override_end  || null;
  let acqAutoCalc = false;

  if (!acqStart && hireDate) {
    acqAutoCalc = true;
    const hire = new Date(hireDate + "T12:00:00");
    const now  = new Date();
    const anniv = new Date(now.getFullYear(), hire.getMonth(), hire.getDate());
    if (anniv > now) anniv.setFullYear(anniv.getFullYear() - 1);
    acqStart = anniv.toISOString().slice(0, 10);
    const acqEndDate = new Date(anniv);
    acqEndDate.setFullYear(acqEndDate.getFullYear() + 1);
    acqEndDate.setDate(acqEndDate.getDate() - 1);
    acqEnd = acqEndDate.toISOString().slice(0, 10);
  }

  // Concessivo deadline = 1 year after acquisition period ends (CLT art. 134)
  if (!concEnd && acqEnd) {
    const concEndDate = new Date(acqEnd + "T12:00:00");
    concEndDate.setFullYear(concEndDate.getFullYear() + 1);
    concEnd = concEndDate.toISOString().slice(0, 10);
  }

  const periodRecords = acqStart
    ? allRecords.filter(r => r.start_date >= acqStart && r.start_date <= (acqEnd || "9999"))
    : allRecords.slice(0, 10);

  const daysUsed = periodRecords.reduce((s, r) => s + r.days, 0);
  const daysEntitled = 30;
  const daysRemaining = Math.max(0, daysEntitled - daysUsed);

  const lastVacation = allRecords.find(r => r.end_date < today());
  const nextVacation = [...allRecords].reverse().find(r => r.start_date >= today() && r.status !== "cancelled");

  const hasOverride = !!(user?.acq_override_start || user?.conc_override_end);

  return { hireDate, acqStart, acqEnd, concEnd, acqAutoCalc, hasOverride, daysEntitled, daysUsed, daysRemaining, lastVacation, nextVacation, periodRecords };
}

// GET /api/vacations
router.get("/", requireAuth, (req, res) => {
  const db = getDb();
  const { dateFrom, dateTo, status, userId, groupId, page = 1, limit = 2000 } = req.query;
  const role = req.user.role;

  let where = "WHERE 1=1";
  const params = [];

  if (role === "employee") {
    where += " AND v.user_id = ?"; params.push(req.user.id);
  } else if (role === "leader") {
    const leaderGids = getLeaderGroupIds(db, req.user.id);
    if (leaderGids.length) {
      const ph = leaderGids.map(() => "?").join(",");
      where += ` AND (v.user_id = ? OR v.user_id IN (SELECT user_id FROM group_members WHERE group_id IN (${ph})))`;
      params.push(req.user.id, ...leaderGids);
    } else {
      where += " AND v.user_id = ?"; params.push(req.user.id);
    }
    if (userId)  { where += " AND v.user_id = ?";  params.push(userId); }
    if (groupId) { where += " AND v.group_id = ?"; params.push(groupId); }
  } else {
    if (userId)  { where += " AND v.user_id = ?";  params.push(userId); }
    if (groupId) { where += " AND v.group_id = ?"; params.push(groupId); }
  }
  if (dateFrom) { where += " AND v.end_date >= ?";   params.push(dateFrom); }
  if (dateTo)   { where += " AND v.start_date <= ?"; params.push(dateTo); }
  if (status)   { where += " AND v.status = ?";      params.push(status); }

  const offset = (Number(page) - 1) * Number(limit);
  const rows  = db.prepare(`SELECT v.* FROM vacation_records v ${where} ORDER BY v.start_date DESC LIMIT ? OFFSET ?`)
    .all(...params, Number(limit), offset);
  const total = db.prepare(`SELECT COUNT(*) as c FROM vacation_records v ${where}`).get(...params).c;

  return res.json({ rows: rows.map(v => fmtRecord(v, db)), total });
});


// PATCH /api/vacations/period-override/:userId — HR sets acquisition/concessivo override
router.patch("/period-override/:userId", requireAuth, (req, res) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: "Sem permissão" });
  const db = getDb();
  const { userId } = req.params;
  const { acqOverrideStart, acqOverrideEnd, concOverrideEnd, clearOverride } = req.body;
  const user = db.prepare("SELECT id FROM users WHERE id=?").get(userId);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

  if (clearOverride) {
    db.prepare("UPDATE users SET acq_override_start=NULL, acq_override_end=NULL, conc_override_end=NULL WHERE id=?").run(userId);
    return res.json({ ok: true, cleared: true });
  }
  if (acqOverrideStart !== undefined) db.prepare("UPDATE users SET acq_override_start=? WHERE id=?").run(acqOverrideStart || null, userId);
  if (acqOverrideEnd   !== undefined) db.prepare("UPDATE users SET acq_override_end=?   WHERE id=?").run(acqOverrideEnd   || null, userId);
  if (concOverrideEnd  !== undefined) db.prepare("UPDATE users SET conc_override_end=?  WHERE id=?").run(concOverrideEnd  || null, userId);
  return res.json({ ok: true });
});

// GET /api/vacations/summary/:userId
router.get("/summary/:userId", requireAuth, (req, res) => {
  const db = getDb();
  const { userId } = req.params;
  const role = req.user.role;
  if (role === "employee" && userId !== req.user.id)
    return res.status(403).json({ error: "Sem permissão" });
  const summary = userSummary(db, userId);
  return res.json(summary);
});

// GET /api/vacations/analytics
router.get("/analytics", requireAuth, (req, res) => {
  const db = getDb();
  const { dateFrom, dateTo, groupId } = req.query;
  const role = req.user.role;
  const from = dateFrom || new Date(Date.now() - 365*86400000).toISOString().slice(0,10);
  const to   = dateTo   || new Date(Date.now() + 800*86400000).toISOString().slice(0,10);

  let uWhere = "WHERE u.active=1";
  const uParams = [];
  let vWhere = "WHERE v.start_date <= ? AND v.end_date >= ? AND v.status NOT IN ('cancelled')";
  const vParams = [to, from];

  if (role === "employee") {
    uWhere += " AND u.id = ?"; uParams.push(req.user.id);
    vWhere += " AND v.user_id = ?"; vParams.push(req.user.id);
  } else if (role === "leader") {
    const leaderGids = getLeaderGroupIds(db, req.user.id);
    if (leaderGids.length) {
      const ph = leaderGids.map(() => "?").join(",");
      uWhere += ` AND u.id IN (SELECT id FROM users WHERE id=? OR id IN (SELECT user_id FROM group_members WHERE group_id IN (${ph})))`;
      uParams.push(req.user.id, ...leaderGids);
      vWhere += ` AND (v.user_id = ? OR v.user_id IN (SELECT user_id FROM group_members WHERE group_id IN (${ph})))`;
      vParams.push(req.user.id, ...leaderGids);
    }
    if (groupId) {
      uWhere += " AND u.id IN (SELECT user_id FROM group_members WHERE group_id=?)"; uParams.push(groupId);
      vWhere += " AND v.group_id = ?"; vParams.push(groupId);
    }
  } else if (groupId) {
    uWhere += " AND u.id IN (SELECT user_id FROM group_members WHERE group_id=?)"; uParams.push(groupId);
    vWhere += " AND v.group_id = ?"; vParams.push(groupId);
  }

  const vacations = db.prepare(`
    SELECT v.*, u.full_name, u.dept, u.hire_date, g.name as group_name, g.color as group_color
    FROM vacation_records v
    JOIN users u ON u.id = v.user_id
    LEFT JOIN groups g ON g.id = v.group_id
    ${vWhere} ORDER BY v.start_date
  `).all(...vParams);

  const byStatus = db.prepare(`SELECT v.status, COUNT(*) as c, SUM(v.days) as total_days FROM vacation_records v ${vWhere} GROUP BY v.status`)
    .all(...vParams);

  const upcoming = vacations.filter(v => v.start_date >= today() && v.status !== "cancelled")
    .slice(0, 20)
    .map(v => ({ ...fmtRecord(v, db) }));

  const byMonth = {};
  vacations.forEach(v => {
    const m = v.start_date.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + v.days;
  });

  return res.json({
    vacations: vacations.map(v => fmtRecord(v, db)),
    byStatus,
    upcoming,
    byMonth: Object.entries(byMonth).sort().map(([month, days]) => ({ month, days })),
    totalVacations: vacations.length,
    totalDays: vacations.reduce((s, v) => s + v.days, 0),
  });
});


// GET /api/vacations/dashboard-summary  (leaders + HR only)
router.get("/dashboard-summary", requireAuth, (req, res) => {
  const db   = getDb();
  const role = req.user.role;
  if (!isLeader(role)) return res.status(403).json({ error: "Forbidden" });

  const todayStr = today();
  const in30  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  let memberWhere  = "";
  let memberParams = [];
  if (!isAdmin(role)) {
    const leaderGids = getLeaderGroupIds(db, req.user.id);
    if (leaderGids.length) {
      const ph = leaderGids.map(() => "?").join(",");
      memberWhere  = ` AND (v.user_id = ? OR v.user_id IN (SELECT user_id FROM group_members WHERE group_id IN (${ph})))`;
      memberParams = [req.user.id, ...leaderGids];
    }
  }

  const pendingApprovals = db.prepare(
    `SELECT COUNT(*) as c FROM vacation_records v WHERE v.status='scheduled'${memberWhere}`
  ).get(...memberParams).c;

  const onVacationNow = db.prepare(
    `SELECT COUNT(*) as c FROM vacation_records v WHERE v.status IN ('approved','completed','scheduled') AND v.start_date<=? AND v.end_date>=?${memberWhere}`
  ).get(todayStr, todayStr, ...memberParams).c;

  const onVacationList = db.prepare(
    `SELECT v.id, v.user_id, v.start_date, v.end_date, v.days, v.status,
            u.full_name, g.name as group_name, g.color as group_color
     FROM vacation_records v
     JOIN users u ON u.id=v.user_id
     LEFT JOIN groups g ON g.id=v.group_id
     WHERE v.status IN ('approved','completed','scheduled') AND v.start_date<=? AND v.end_date>=?${memberWhere}
     ORDER BY v.start_date ASC`
  ).all(todayStr, todayStr, ...memberParams).map(r => ({
    id: r.id, userId: r.user_id, fullName: r.full_name,
    groupName: r.group_name, groupColor: r.group_color,
    startDate: r.start_date, endDate: r.end_date, days: r.days, status: r.status,
  }));

  const approaching30 = db.prepare(
    `SELECT COUNT(*) as c FROM vacation_records v WHERE v.status IN ('approved','scheduled') AND v.start_date>? AND v.start_date<=?${memberWhere}`
  ).get(todayStr, in30, ...memberParams).c;

  const pendingList = db.prepare(
    `SELECT v.id, v.user_id, v.start_date, v.end_date, v.days, v.days_entitled, v.notes, v.created_at,
            u.full_name, u.dept, g.name as group_name, g.color as group_color,
            cb.full_name as created_by_name
     FROM vacation_records v
     JOIN users u ON u.id=v.user_id
     LEFT JOIN groups g ON g.id=v.group_id
     LEFT JOIN users cb ON cb.id=v.created_by
     WHERE v.status='scheduled'${memberWhere}
     ORDER BY v.created_at ASC LIMIT 8`
  ).all(...memberParams).map(r => ({
    id: r.id, userId: r.user_id, fullName: r.full_name,
    dept: r.dept, groupName: r.group_name, groupColor: r.group_color,
    startDate: r.start_date, endDate: r.end_date, days: r.days, daysEntitled: r.days_entitled,
    notes: r.notes, createdByName: r.created_by_name, createdAt: r.created_at,
  }));

  res.json({ pendingApprovals, onVacationNow, onVacationList, approaching30, pendingList });
});

// POST /api/vacations
router.post("/", requireAuth, (req, res) => {
  if (!isLeader(req.user.role)) return res.status(403).json({ error: "Sem permissão" });
  const db = getDb();
  const { userId, startDate, endDate, acqStart, acqEnd, daysEntitled = 30, notes, status = "scheduled" } = req.body;
  if (!userId || !startDate || !endDate)
    return res.status(400).json({ error: "userId, startDate e endDate são obrigatórios" });
  if (startDate > endDate)
    return res.status(400).json({ error: "Data de início deve ser antes da data de fim" });

  const role = req.user.role;
  if (!isAdmin(role)) {
    const groupIds = getLeaderGroupIds(db, req.user.id);
    const isMember = groupIds.some(gid =>
      db.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?").get(gid, userId)
    );
    if (!isMember && userId !== req.user.id)
      return res.status(403).json({ error: "Funcionário não pertence ao seu grupo" });
  }

  const days = calcDays(startDate, endDate);
  const grp  = db.prepare("SELECT group_id FROM group_members WHERE user_id=? LIMIT 1").get(userId);
  const id   = uuidv4();

  db.prepare(`
    INSERT INTO vacation_records
      (id, user_id, group_id, start_date, end_date, days, acq_start, acq_end, days_entitled, status, notes, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, userId, grp?.group_id || null, startDate, endDate, days, acqStart || null, acqEnd || null, daysEntitled, status, notes || null, req.user.id);

  return res.status(201).json(fmtRecord(db.prepare("SELECT * FROM vacation_records WHERE id=?").get(id), db));
});

// PATCH /api/vacations/:id
router.patch("/:id", requireAuth, (req, res) => {
  if (!isLeader(req.user.role)) return res.status(403).json({ error: "Sem permissão" });
  const db = getDb();
  const v = db.prepare("SELECT * FROM vacation_records WHERE id=?").get(req.params.id);
  if (!v) return res.status(404).json({ error: "Não encontrado" });

  const { startDate, endDate, status, notes, acqStart, acqEnd, daysEntitled } = req.body;

  // Only admins (hr/ti/gerencia) can change vacation dates — leaders/co-leaders cannot
  const datesChanged = (startDate && startDate !== v.start_date) || (endDate && endDate !== v.end_date);
  if (datesChanged && !isAdmin(req.user.role)) {
    return res.status(403).json({ error: "Apenas RH e gerência podem alterar as datas de férias" });
  }

  const newStart = startDate || v.start_date;
  const newEnd   = endDate   || v.end_date;
  const days     = calcDays(newStart, newEnd);
  const validStatuses = ["scheduled", "approved", "completed", "cancelled"];
  if (status && !validStatuses.includes(status))
    return res.status(400).json({ error: "Status inválido" });

  const approvedBy  = (status === "approved" && isAdmin(req.user.role)) ? req.user.id : v.approved_by;
  const approvedAt  = (status === "approved" && isAdmin(req.user.role)) ? new Date().toISOString() : v.approved_at;

  db.prepare(`UPDATE vacation_records SET
    start_date=?, end_date=?, days=?,
    status=COALESCE(?,status), notes=COALESCE(?,notes),
    acq_start=COALESCE(?,acq_start), acq_end=COALESCE(?,acq_end),
    days_entitled=COALESCE(?,days_entitled),
    approved_by=?, approved_at=?, updated_at=datetime('now')
    WHERE id=?
  `).run(newStart, newEnd, days, status||null, notes||null, acqStart||null, acqEnd||null, daysEntitled||null, approvedBy, approvedAt, req.params.id);

  return res.json(fmtRecord(db.prepare("SELECT * FROM vacation_records WHERE id=?").get(req.params.id), db));
});

// DELETE /api/vacations/:id
router.delete("/:id", requireAuth, (req, res) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: "Apenas RH pode excluir" });
  const db = getDb();
  const v = db.prepare("SELECT * FROM vacation_records WHERE id=?").get(req.params.id);
  if (!v) return res.status(404).json({ error: "Não encontrado" });
  db.prepare("DELETE FROM vacation_records WHERE id=?").run(req.params.id);
  return res.json({ ok: true });
});

// POST /api/vacations/import — batch CSV (HR only)
router.post("/import", requireAuth, (req, res) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: "Apenas RH pode importar" });
  const { rows } = req.body; // [{ username, startDate, endDate, notes, daysEntitled }]
  if (!Array.isArray(rows) || !rows.length)
    return res.status(400).json({ error: "Nenhuma linha para importar" });

  const db = getDb();
  const imported = [], errors = [];

  for (const [i, row] of rows.entries()) {
    try {
      const user = db.prepare("SELECT id FROM users WHERE username=? OR full_name=?")
        .get(row.username?.trim(), row.username?.trim());
      if (!user) { errors.push({ line: i+1, error: `Usuário "${row.username}" não encontrado` }); continue; }
      if (!row.startDate || !row.endDate) { errors.push({ line: i+1, error: "startDate/endDate ausente" }); continue; }
      const days = calcDays(row.startDate, row.endDate);
      const grp  = db.prepare("SELECT group_id FROM group_members WHERE user_id=? LIMIT 1").get(user.id);
      const id   = uuidv4();
      db.prepare(`
        INSERT INTO vacation_records (id, user_id, group_id, start_date, end_date, days, acq_start, acq_end, days_entitled, status, notes, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(id, user.id, grp?.group_id||null, row.startDate, row.endDate, days,
             row.acqStart||null, row.acqEnd||null, Number(row.daysEntitled)||30,
             row.status||"completed", row.notes||null, req.user.id);
      imported.push(id);
    } catch (e) { errors.push({ line: i+1, error: e.message }); }
  }

  return res.json({ imported: imported.length, errors });
});



// GET /api/vacations/compliance
// Returns per-employee CLT vacation compliance data
router.get("/compliance", requireAuth, (req, res) => {
  if (!isLeader(req.user.role)) return res.status(403).json({ error: "Sem permissão" });
  const db  = getDb();
  const tod = today();

  // Determine which users to include
  let users;
  if (isAdmin(req.user.role)) {
    users = db.prepare("SELECT u.*, g.id as group_id, g.name as group_name, g.color as group_color FROM users u LEFT JOIN group_members gm ON gm.user_id=u.id LEFT JOIN groups g ON g.id=gm.group_id WHERE u.active=1 GROUP BY u.id ORDER BY u.full_name").all();
  } else {
    const groupIds = getLeaderGroupIds(db, req.user.id);
    if (!groupIds.length) return res.json([]);
    const ph = groupIds.map(()=>"?").join(",");
    users = db.prepare(`SELECT u.*, g.id as group_id, g.name as group_name, g.color as group_color FROM users u JOIN group_members gm ON gm.user_id=u.id JOIN groups g ON g.id=gm.group_id WHERE gm.group_id IN (${ph}) AND u.active=1 ORDER BY u.full_name`).all(...groupIds);
  }

  const result = users.map(u => {
    const hireDate = u.hire_date;

    // Compute current acquisition period
    let acqStart = null, acqEnd = null, concStart = null, concEnd = null;
    if (hireDate) {
      const hire  = new Date(hireDate + "T12:00:00");
      const now   = new Date();
      const anniv = new Date(now.getFullYear(), hire.getMonth(), hire.getDate());
      if (anniv > now) anniv.setFullYear(now.getFullYear() - 1);
      acqStart = anniv.toISOString().slice(0, 10);
      const acqEndDate = new Date(anniv); acqEndDate.setFullYear(acqEndDate.getFullYear()+1); acqEndDate.setDate(acqEndDate.getDate()-1);
      acqEnd = acqEndDate.toISOString().slice(0, 10);
      // Concessivo period = same as next aquisitivo (employee has 12 months after acqEnd to use vacation)
      const concEndDate = new Date(acqEndDate); concEndDate.setFullYear(concEndDate.getFullYear()+1);
      concStart = new Date(acqEndDate); concStart.setDate(concStart.getDate()+1);
      concStart = concStart.toISOString().slice(0, 10);
      concEnd   = concEndDate.toISOString().slice(0, 10);
    }

    // All non-cancelled vacation records for this user
    const allRecs = db.prepare("SELECT * FROM vacation_records WHERE user_id=? AND status!='cancelled' ORDER BY start_date DESC").all(u.id);

    // Days taken in current acq period
    const periodRecs = acqStart ? allRecs.filter(r => r.start_date >= acqStart) : allRecs.slice(0, 5);
    const daysTaken  = periodRecs.reduce((s,r) => s+r.days, 0);
    const daysEntitled = 30;
    const daysRemaining = Math.max(0, daysEntitled - daysTaken);

    // Current vacation?
    const onVacNow = allRecs.find(r => r.start_date <= tod && r.end_date >= tod);
    const returnDate = onVacNow ? onVacNow.end_date : null;

    // Next scheduled
    const nextScheduled = [...allRecs].reverse().find(r => r.start_date > tod);

    // Periods breakdown (split vacations)
    const periods = periodRecs.map(r => ({
      startDate: r.start_date, endDate: r.end_date, days: r.days, status: r.status,
    }));

    // Deadline logic: if user has remaining days, they must schedule within 30 days of concEnd
    const deadlineDate = concEnd;
    let daysUntilDeadline = null;
    let urgency = "ok"; // ok | warn | critical | overdue
    if (daysRemaining > 0 && deadlineDate) {
      const deadlineDiff = Math.ceil((new Date(deadlineDate+"T12:00:00") - new Date()) / 86400000);
      daysUntilDeadline = deadlineDiff;
      if (deadlineDiff < 0)        urgency = "overdue";
      else if (deadlineDiff <= 30) urgency = "critical";
      else if (deadlineDiff <= 90) urgency = "warn";
    }

    // Check if second period needs to be scheduled (e.g. took 15, remaining 15, no future schedule)
    const hasRemainingUnscheduled = daysRemaining > 0 && !nextScheduled && !onVacNow;

    const scheduledCount = allRecs.filter(r => r.status === 'scheduled').length;
    const approvedCount  = allRecs.filter(r => r.status === 'approved').length;
    const completedCount = allRecs.filter(r => r.status === 'completed').length;
    const totalHistDays  = allRecs.reduce((s, r) => s + r.days, 0);

    return {
      userId: u.id, fullName: u.full_name, username: u.username,
      dept: u.dept, groupId: u.group_id, groupName: u.group_name, groupColor: u.group_color,
      hireDate, acqStart, acqEnd, concStart, concEnd,
      daysEntitled, daysTaken, daysRemaining,
      isOnVacation: !!onVacNow,
      returnDate,
      nextScheduledStart: nextScheduled?.start_date || null,
      nextScheduledEnd:   nextScheduled?.end_date   || null,
      nextScheduledDays:  nextScheduled?.days       || null,
      nextScheduledStatus: nextScheduled?.status    || null,
      periods,
      deadlineDate,
      daysUntilDeadline,
      urgency,
      hasRemainingUnscheduled,
      scheduledCount, approvedCount, completedCount, totalHistDays,
    };
  });

  return res.json(result);
});

// GET /api/vacations/team-view
router.get("/team-view", requireAuth, (req, res) => {
  if (!isLeader(req.user.role)) return res.status(403).json({ error: "Sem permissão" });
  const db  = getDb();
  const tod = today();

  // Which groups to show
  let groups;
  if (isAdmin(req.user.role)) {
    groups = db.prepare(`
      SELECT g.*, u.full_name as leader_name, u.id as leader_id, u.dept as leader_dept,
             u.title as leader_title
      FROM groups g
      LEFT JOIN users u ON u.id = g.leader_id
      ORDER BY g.name
    `).all();
  } else {
    const primary = db.prepare("SELECT id FROM groups WHERE leader_id=?").all(req.user.id);
    const co      = db.prepare("SELECT group_id as id FROM group_co_leaders WHERE user_id=?").all(req.user.id);
    const ids     = [...new Set([...primary.map(g=>g.id), ...co.map(g=>g.id)])];
    if (!ids.length) return res.json([]);
    const ph = ids.map(()=>"?").join(",");
    groups = db.prepare(`
      SELECT g.*, u.full_name as leader_name, u.id as leader_id, u.dept as leader_dept,
             u.title as leader_title
      FROM groups g
      LEFT JOIN users u ON u.id = g.leader_id
      WHERE g.id IN (${ph})
      ORDER BY g.name
    `).all(...ids);
  }

  const result = groups.map(g => {
    // Members
    const members = db.prepare(`
      SELECT u.id, u.full_name, u.username, u.dept, u.title, u.hire_date
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ? AND u.active = 1
      ORDER BY u.full_name
    `).all(g.id);

    const membersWithVac = members.map(m => {
      // All non-cancelled vacations
      const recs = db.prepare(
        "SELECT * FROM vacation_records WHERE user_id=? AND status!='cancelled' ORDER BY start_date DESC"
      ).all(m.id);

      const lastVac = recs.find(r => r.end_date < tod) || null;
      const nextVac = [...recs].reverse().find(r => r.start_date >= tod) || null;
      const onVacNow = recs.find(r => r.start_date <= tod && r.end_date >= tod) || null;

      // Days used in current acq period
      let acqStart = null, acqEnd = null, daysUsed = 0;
      if (m.hire_date) {
        const hire = new Date(m.hire_date + "T12:00:00");
        const now  = new Date();
        const anniv = new Date(now.getFullYear(), hire.getMonth(), hire.getDate());
        if (anniv > now) anniv.setFullYear(now.getFullYear() - 1);
        acqStart = anniv.toISOString().slice(0, 10);
        const acqEndDate = new Date(anniv);
        acqEndDate.setFullYear(acqEndDate.getFullYear() + 1);
        acqEndDate.setDate(acqEndDate.getDate() - 1);
        acqEnd = acqEndDate.toISOString().slice(0, 10);
        daysUsed = recs.filter(r => r.start_date >= acqStart).reduce((s,r) => s+r.days, 0);
      } else {
        daysUsed = recs.slice(0, 5).reduce((s,r) => s+r.days, 0);
      }

      const daysRemaining = Math.max(0, 30 - daysUsed);
      const yearFloor = acqStart || (new Date().getFullYear() + "-01-01");
      const allPeriods = recs.filter(r => r.start_date >= yearFloor).sort((a, b) => a.start_date.localeCompare(b.start_date)).map(r => ({ startDate: r.start_date, endDate: r.end_date, days: r.days, status: r.status }));
      const daysUntilNext = nextVac
        ? Math.ceil((new Date(nextVac.start_date+"T12:00:00") - new Date()) / 86400000)
        : null;

      return {
        id: m.id, fullName: m.full_name, username: m.username,
        dept: m.dept, title: m.title, hireDate: m.hire_date,
        acqStart, acqEnd, daysUsed, daysRemaining,
        isOnVacation: !!onVacNow,
        onVacationUntil: onVacNow?.end_date || null,
        lastVacStart: lastVac?.start_date || null,
        lastVacEnd:   lastVac?.end_date   || null,
        lastVacDays:  lastVac?.days       || null,
        nextVacStart: nextVac?.start_date || null,
        nextVacEnd:   nextVac?.end_date   || null,
        nextVacDays:  nextVac?.days       || null,
        nextVacStatus: nextVac?.status    || null,
        daysUntilNext,
        allPeriods,
      };
    });

    // Co-leaders
    const coLeaders = db.prepare(`
      SELECT u.id, u.full_name, u.title
      FROM group_co_leaders gcl JOIN users u ON u.id=gcl.user_id
      WHERE gcl.group_id=?
    `).all(g.id);

    return {
      id: g.id, name: g.name, color: g.color, dept: g.dept,
      leaderId: g.leader_id, leaderName: g.leader_name,
      leaderDept: g.leader_dept, leaderTitle: g.leader_title,
      coLeaders,
      members: membersWithVac,
      onVacationCount: membersWithVac.filter(m => m.isOnVacation).length,
      scheduledCount:  membersWithVac.filter(m => m.nextVacStart && !m.isOnVacation).length,
    };
  });

  return res.json(result);
});

module.exports = router;
