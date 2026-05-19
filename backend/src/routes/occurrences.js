const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

const TYPES = [
  "Atestado Médico",
  "Férias",
  "Falta Justificada",
  "Falta Injustificada",
  "Licença Médica",
  "Licença Maternidade/Paternidade",
  "Declaração de Comparecimento",
  "Banco de Horas",
  "Outros",
];

function isAdmin(role) { return role === "hr" || role === "ti" || role === "gerencia"; }
function isLeader(role) { return role === "leader" || role === "gerencia" || isAdmin(role); }
function today() { return new Date().toISOString().slice(0, 10); }

// Returns all group IDs a leader manages (primary leader + co-leader)
function getLeaderGroupIds(db, userId) {
  const primary = db.prepare("SELECT id FROM groups WHERE leader_id=?").all(userId);
  const co      = db.prepare("SELECT group_id as id FROM group_co_leaders WHERE user_id=?").all(userId);
  return [...new Set([...primary.map(g => g.id), ...co.map(g => g.id)])];
}

function fmt(o, db) {
  const user    = db.prepare("SELECT full_name, username FROM users WHERE id=?").get(o.user_id);
  const creator = db.prepare("SELECT full_name, username FROM users WHERE id=?").get(o.created_by);
  const group   = o.group_id ? db.prepare("SELECT name, color FROM groups WHERE id=?").get(o.group_id) : null;
  return {
    id: o.id, userId: o.user_id, groupId: o.group_id,
    type: o.type, dateStart: o.date_start, dateEnd: o.date_end, days: o.days,
    description: o.description, createdBy: o.created_by,
    fullName: user?.full_name, username: user?.username,
    createdByName: creator?.full_name,
    groupName: group?.name, groupColor: group?.color,
    createdAt: o.created_at, updatedAt: o.updated_at,
  };
}

// GET /api/occurrences/types
router.get("/types", requireAuth, (req, res) => res.json(TYPES));

// GET /api/occurrences
router.get("/", requireAuth, requireRole("hr", "leader"), (req, res) => {
  const db = getDb();
  const {
    dateFrom = new Date(Date.now()-30*86400000).toISOString().slice(0,10),
    dateTo   = today(),
    groupId, userId, type,
    page = 1, limit = 100,
  } = req.query;

  let where = "WHERE o.date_start BETWEEN ? AND ?";
  const params = [dateFrom, dateTo];

  if (req.user.role === "leader") {
    const groupIds = getLeaderGroupIds(db, req.user.id);
    if (!groupIds.length) return res.json({ rows: [], total: 0 });
    const ph = groupIds.map(() => "?").join(",");
    where += ` AND o.group_id IN (${ph})`; params.push(...groupIds);
  } else {
    if (groupId) { where += " AND o.group_id=?"; params.push(groupId); }
    if (userId)  { where += " AND o.user_id=?";  params.push(userId); }
  }
  if (type) { where += " AND o.type=?"; params.push(type); }

  const offset = (Number(page)-1)*Number(limit);
  const rows = db.prepare(`
    SELECT o.* FROM occurrences o ${where}
    ORDER BY o.date_start DESC LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);
  const total = db.prepare(`SELECT COUNT(*) as c FROM occurrences o ${where}`).get(...params).c;

  return res.json({ rows: rows.map(o=>fmt(o,db)), total, page: Number(page), limit: Number(limit) });
});

// POST /api/occurrences
router.post("/", requireAuth, (req, res) => {
  if (!isLeader(req.user.role)) return res.status(403).json({ error: "Sem permissão" });

  const { userId, type, dateStart, dateEnd, description } = req.body;
  if (!userId || !type || !dateStart)
    return res.status(400).json({ error: "userId, type e dateStart são obrigatórios" });
  if (!TYPES.includes(type))
    return res.status(400).json({ error: "Tipo inválido" });

  const db = getDb();

  // Valida que líder só registra para membros dos seus grupos
  if (req.user.role === "leader") {
    const groupIds = getLeaderGroupIds(db, req.user.id);
    if (!groupIds.length) return res.status(403).json({ error: "Você não lidera nenhum grupo" });
    const isMember = groupIds.some(gid =>
      db.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?").get(gid, userId)
    );
    if (!isMember) return res.status(403).json({ error: "Usuário não pertence ao seu grupo" });
  }

  // Calcula dias corridos
  const start = new Date(dateStart+"T12:00:00");
  const end   = dateEnd ? new Date(dateEnd+"T12:00:00") : start;
  const days  = Math.max(1, Math.round((end-start)/86400000)+1);

  // Grupo do funcionário
  const grpData = db.prepare("SELECT group_id FROM group_members WHERE user_id=? LIMIT 1").get(userId);

  const id = uuidv4();
  db.prepare(`
    INSERT INTO occurrences (id, user_id, group_id, type, date_start, date_end, days, description, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, grpData?.group_id||null, type, dateStart, dateEnd||null, days, description||null, req.user.id);

  return res.status(201).json(fmt(db.prepare("SELECT * FROM occurrences WHERE id=?").get(id), db));
});

// PATCH /api/occurrences/:id — edit (HR/gerência only)
router.patch("/:id", requireAuth, (req, res) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: "Apenas RH/Gerência pode editar ocorrências" });
  const db = getDb();
  const o = db.prepare("SELECT * FROM occurrences WHERE id=?").get(req.params.id);
  if (!o) return res.status(404).json({ error: "Não encontrado" });

  const { type, dateStart, dateEnd, description } = req.body;
  if (type && !TYPES.includes(type)) return res.status(400).json({ error: "Tipo inválido" });

  const newType  = type      !== undefined ? type      : o.type;
  const newStart = dateStart !== undefined ? dateStart : o.date_start;
  const newEnd   = dateEnd   !== undefined ? (dateEnd || null) : o.date_end;
  const newDesc  = description !== undefined ? (description || null) : o.description;

  const start = new Date(newStart + "T12:00:00");
  const end   = newEnd ? new Date(newEnd + "T12:00:00") : start;
  const days  = Math.max(1, Math.round((end - start) / 86400000) + 1);

  db.prepare(`UPDATE occurrences SET type=?, date_start=?, date_end=?, days=?, description=?, updated_at=datetime('now') WHERE id=?`)
    .run(newType, newStart, newEnd, days, newDesc, req.params.id);

  return res.json(fmt(db.prepare("SELECT * FROM occurrences WHERE id=?").get(req.params.id), db));
});

// DELETE /api/occurrences/:id
router.delete("/:id", requireAuth, (req, res) => {
  if (!isLeader(req.user.role)) return res.status(403).json({ error: "Sem permissão" });
  const db = getDb();
  const o = db.prepare("SELECT * FROM occurrences WHERE id=?").get(req.params.id);
  if (!o) return res.status(404).json({ error: "Não encontrado" });
  if (o.created_by !== req.user.id && !isAdmin(req.user.role))
    return res.status(403).json({ error: "Sem permissão" });
  db.prepare("DELETE FROM occurrences WHERE id=?").run(req.params.id);
  return res.json({ ok: true });
});

// GET /api/occurrences/stats — relatórios
router.get("/stats", requireAuth, requireRole("hr","leader"), (req, res) => {
  const db = getDb();
  const {
    dateFrom = new Date(Date.now()-90*86400000).toISOString().slice(0,10),
    dateTo   = today(),
    groupId,
  } = req.query;

  let filter = ""; const params = [dateFrom, dateTo];
  if (req.user.role === "leader") {
    const groupIds = getLeaderGroupIds(db, req.user.id);
    if (groupIds.length) {
      const ph = groupIds.map(() => "?").join(",");
      filter = `AND o.group_id IN (${ph})`;
      params.push(...groupIds);
    }
  } else if (groupId) {
    filter = "AND o.group_id=?"; params.push(groupId);
  }

  // Por tipo
  const byType = db.prepare(`
    SELECT type, COUNT(*) as count, SUM(days) as total_days
    FROM occurrences o
    WHERE date_start BETWEEN ? AND ? ${filter}
    GROUP BY type ORDER BY count DESC
  `).all(...params);

  // Por mês
  const byMonth = db.prepare(`
    SELECT strftime('%Y-%m', date_start) as month,
      COUNT(*) as count, SUM(days) as total_days
    FROM occurrences o
    WHERE date_start BETWEEN ? AND ? ${filter}
    GROUP BY month ORDER BY month
  `).all(...params);

  // Por pessoa
  const byUser = db.prepare(`
    SELECT o.user_id, u.full_name, g.name as group_name, g.color as group_color,
      COUNT(*) as count, SUM(o.days) as total_days,
      COUNT(CASE WHEN o.type='Falta Injustificada' THEN 1 END) as unexcused,
      COUNT(CASE WHEN o.type='Atestado Médico' THEN 1 END) as medical,
      COUNT(CASE WHEN o.type='Férias' THEN 1 END) as vacation
    FROM occurrences o
    JOIN users u ON u.id=o.user_id
    LEFT JOIN groups g ON g.id=o.group_id
    WHERE o.date_start BETWEEN ? AND ? ${filter}
    GROUP BY o.user_id ORDER BY count DESC
  `).all(...params);

  // Por grupo
  const byGroup = db.prepare(`
    SELECT g.id, g.name, g.color,
      COUNT(o.id) as count, SUM(o.days) as total_days,
      COUNT(CASE WHEN o.type='Falta Injustificada' THEN 1 END) as unexcused
    FROM groups g
    LEFT JOIN occurrences o ON o.group_id=g.id AND o.date_start BETWEEN ? AND ? ${filter.replace(/AND o\.group_id IN \([^)]+\)/,'')}
    GROUP BY g.id ORDER BY count DESC
  `).all(...params.filter((_,i)=>i<2));

  // Totais
  const totals = db.prepare(`
    SELECT COUNT(*) as total, SUM(days) as total_days,
      COUNT(CASE WHEN type='Falta Injustificada' THEN 1 END) as unexcused,
      COUNT(CASE WHEN type='Atestado Médico' THEN 1 END) as medical,
      COUNT(CASE WHEN type='Férias' THEN 1 END) as vacation
    FROM occurrences o WHERE date_start BETWEEN ? AND ? ${filter}
  `).get(...params);

  return res.json({ byType, byMonth, byUser, byGroup, totals, dateFrom, dateTo });
});


// ─── ABONO ROUTES ──────────────────────────────────────────────────────────

const ABONO_REASONS = [
  "Inclusão Manual",
  "Esquecimento de Marcação",
  "Falha no Sistema",
  "Equipamento com Defeito",
  "Trabalho Externo",
  "Ponto em Local Diferente",
  "Outros",
];

function fmtAbono(a, db) {
  const user    = db.prepare("SELECT full_name, username FROM users WHERE id=?").get(a.user_id);
  const creator = db.prepare("SELECT full_name, username FROM users WHERE id=?").get(a.created_by);
  const reviewer = a.reviewed_by ? db.prepare("SELECT full_name FROM users WHERE id=?").get(a.reviewed_by) : null;
  const group   = a.group_id ? db.prepare("SELECT name, color FROM groups WHERE id=?").get(a.group_id) : null;
  return {
    id: a.id, userId: a.user_id, groupId: a.group_id,
    punchDate: a.punch_date, punchDateTo: a.punch_date_to || null, punchTime: a.punch_time, punchTimeTo: a.punch_time_to, punchType: a.punch_type,
    reason: a.reason, justification: a.justification,
    status: a.status, reviewNote: a.review_note,
    reviewedAt: a.reviewed_at,
    fullName: user?.full_name, username: user?.username,
    createdByName: creator?.full_name, createdBy: a.created_by,
    reviewedByName: reviewer?.full_name,
    groupName: group?.name, groupColor: group?.color,
    createdAt: a.created_at,
  };
}

// GET /api/occurrences/abono/reasons
router.get("/abono/reasons", requireAuth, (req, res) => res.json(ABONO_REASONS));

// GET /api/occurrences/abono
router.get("/abono", requireAuth, requireRole("hr", "leader"), (req, res) => {
  const db = getDb();
  const {
    dateFrom = new Date(Date.now()-30*86400000).toISOString().slice(0,10),
    dateTo   = today(),
    status, userId, groupId,
    page = 1, limit = 100,
  } = req.query;

  let where = "WHERE a.punch_date BETWEEN ? AND ?";
  const params = [dateFrom, dateTo];

  if (req.user.role === "leader") {
    const groupIds = getLeaderGroupIds(db, req.user.id);
    if (!groupIds.length) return res.json({ rows: [], total: 0 });
    const ph = groupIds.map(() => "?").join(",");
    where += ` AND a.group_id IN (${ph})`; params.push(...groupIds);
  } else {
    if (groupId) { where += " AND a.group_id=?"; params.push(groupId); }
    if (userId)  { where += " AND a.user_id=?";  params.push(userId); }
  }
  if (status) { where += " AND a.status=?"; params.push(status); }

  const offset = (Number(page)-1)*Number(limit);
  const rows = db.prepare(`SELECT a.* FROM abono_requests a ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, Number(limit), offset);
  const total = db.prepare(`SELECT COUNT(*) as c FROM abono_requests a ${where}`).get(...params).c;

  return res.json({ rows: rows.map(a => fmtAbono(a, db)), total, page: Number(page), limit: Number(limit) });
});

// POST /api/occurrences/abono
router.post("/abono", requireAuth, (req, res) => {
  if (!isLeader(req.user.role)) return res.status(403).json({ error: "Sem permissão" });
  const { userId, punchDate, punchDateTo, punchTime, punchTimeTo, punchType, reason, justification } = req.body;
  const isRange = !!(punchTime && punchTimeTo);
  if (!userId || !punchDate || (!punchTime && !punchTimeTo) || !reason || !justification)
    return res.status(400).json({ error: "Todos os campos são obrigatórios" });
  if (!isRange && !["entrada", "saida"].includes(punchType))
    return res.status(400).json({ error: "punchType inválido" });
  if (!ABONO_REASONS.includes(reason))
    return res.status(400).json({ error: "Motivo inválido" });

  const db = getDb();

  if (req.user.role === "leader") {
    const groupIds = getLeaderGroupIds(db, req.user.id);
    const isMember = groupIds.some(gid =>
      db.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?").get(gid, userId)
    );
    if (!isMember) return res.status(403).json({ error: "Usuário não pertence ao seu grupo" });
  }

  const grpData = db.prepare("SELECT group_id FROM group_members WHERE user_id=? LIMIT 1").get(userId);
  const id = uuidv4();
  const effectivePunchType = isRange ? "saida" : punchType;
  db.prepare(`
    INSERT INTO abono_requests (id, user_id, group_id, punch_date, punch_date_to, punch_time, punch_time_to, punch_type, reason, justification, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, grpData?.group_id || null, punchDate, punchDateTo || null, punchTime || null, punchTimeTo || null, effectivePunchType, reason, justification, req.user.id);

  return res.status(201).json(fmtAbono(db.prepare("SELECT * FROM abono_requests WHERE id=?").get(id), db));
});

// PATCH /api/occurrences/abono/:id — approve or reject (HR only)
router.patch("/abono/:id", requireAuth, (req, res) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: "Apenas RH pode revisar abonos" });
  const db = getDb();
  const a = db.prepare("SELECT * FROM abono_requests WHERE id=?").get(req.params.id);
  if (!a) return res.status(404).json({ error: "Não encontrado" });
  const { status, reviewNote } = req.body;
  if (!["approved", "rejected"].includes(status))
    return res.status(400).json({ error: "Status inválido" });

  db.prepare(`UPDATE abono_requests SET status=?, review_note=?, reviewed_by=?, reviewed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`)
    .run(status, reviewNote || null, req.user.id, req.params.id);

  // On approval: insert virtual punch(es) into ponto_records so they appear in batidas/saldo
  if (status === "approved") {
    const ins = db.prepare(`
      INSERT OR IGNORE INTO ponto_records (id, user_id, type, recorded_at, date, source, created_by)
      VALUES (?, ?, ?, ?, ?, 'abono', ?)
    `);
    db.transaction(() => {
      const dateStart = new Date((a.punch_date || '').slice(0, 10) + 'T12:00:00Z');
      const dateEnd   = a.punch_date_to
        ? new Date(a.punch_date_to.slice(0, 10) + 'T12:00:00Z')
        : new Date(dateStart);
      for (let cur = new Date(dateStart); cur <= dateEnd; cur.setUTCDate(cur.getUTCDate() + 1)) {
        const dow = cur.getUTCDay();
        if (dow === 0 || dow === 6) continue; // skip weekends
        const d = cur.toISOString().slice(0, 10);
        if (a.punch_time && a.punch_time_to) {
          ins.run(uuidv4(), a.user_id, "saida",   `${d}T${a.punch_time}:00`,    d, req.user.id);
          ins.run(uuidv4(), a.user_id, "entrada", `${d}T${a.punch_time_to}:00`, d, req.user.id);
        } else if (a.punch_time) {
          ins.run(uuidv4(), a.user_id, a.punch_type, `${d}T${a.punch_time}:00`, d, req.user.id);
        }
      }
    })();
  }

  return res.json(fmtAbono(db.prepare("SELECT * FROM abono_requests WHERE id=?").get(req.params.id), db));
});

// DELETE /api/occurrences/abono/:id
router.delete("/abono/:id", requireAuth, (req, res) => {
  if (!isLeader(req.user.role)) return res.status(403).json({ error: "Sem permissão" });
  const db = getDb();
  const a = db.prepare("SELECT * FROM abono_requests WHERE id=?").get(req.params.id);
  if (!a) return res.status(404).json({ error: "Não encontrado" });
  if (a.created_by !== req.user.id && !isAdmin(req.user.role))
    return res.status(403).json({ error: "Sem permissão" });
  if (a.status !== "pending" && !isAdmin(req.user.role))
    return res.status(400).json({ error: "Só é possível excluir abonos pendentes" });
  // Remove any virtual punches that were inserted on approval
  if (a.status === "approved") {
    const _ds = new Date((a.punch_date||'').slice(0,10)+'T12:00:00Z');
    const _de = a.punch_date_to ? new Date(a.punch_date_to.slice(0,10)+'T12:00:00Z') : new Date(_ds);
    for (let _c = new Date(_ds); _c <= _de; _c.setUTCDate(_c.getUTCDate()+1)) {
      const _d = _c.toISOString().slice(0,10);
      if (a.punch_time)    db.prepare("DELETE FROM ponto_records WHERE user_id=? AND date=? AND recorded_at=? AND source='abono'").run(a.user_id, _d, `${_d}T${a.punch_time}:00`);
      if (a.punch_time_to) db.prepare("DELETE FROM ponto_records WHERE user_id=? AND date=? AND recorded_at=? AND source='abono'").run(a.user_id, _d, `${_d}T${a.punch_time_to}:00`);
    }
  }
  db.prepare("DELETE FROM abono_requests WHERE id=?").run(req.params.id);
  return res.json({ ok: true });
});


// ── FALTA DE PONTO ──────────────────────────────────────────────────────────

function fmtFalta(f, db) {
  const user    = db.prepare("SELECT full_name, username FROM users WHERE id=?").get(f.user_id);
  const creator = db.prepare("SELECT full_name, username FROM users WHERE id=?").get(f.created_by);
  const reviewer = f.reviewed_by ? db.prepare("SELECT full_name FROM users WHERE id=?").get(f.reviewed_by) : null;
  const group   = f.group_id ? db.prepare("SELECT name, color FROM groups WHERE id=?").get(f.group_id) : null;
  return {
    id: f.id, userId: f.user_id, groupId: f.group_id,
    faltaDate: f.falta_date, expectedType: f.expected_type,
    reason: f.reason, notes: f.notes,
    status: f.status, reviewNote: f.review_note, reviewedAt: f.reviewed_at,
    fullName: user?.full_name, username: user?.username,
    createdBy: f.created_by, createdByName: creator?.full_name,
    reviewedByName: reviewer?.full_name,
    groupName: group?.name, groupColor: group?.color,
    createdAt: f.created_at,
  };
}

// GET /api/occurrences/falta-ponto
router.get("/falta-ponto", requireAuth, (req, res) => {
  const db = getDb();
  const {
    dateFrom = new Date(Date.now()-30*86400000).toISOString().slice(0,10),
    dateTo = today(), status, userId, groupId, page = 1, limit = 100,
  } = req.query;
  const role = req.user.role;

  let where = "WHERE f.falta_date BETWEEN ? AND ?";
  const params = [dateFrom, dateTo];

  if (role === "employee") {
    where += " AND f.user_id = ?"; params.push(req.user.id);
  } else if (isLeader(role) && !isAdmin(role)) {
    const groupIds = getLeaderGroupIds(db, req.user.id);
    // leader sees own + team; include self
    const memberIds = [req.user.id];
    for (const gid of groupIds) {
      const members = db.prepare("SELECT user_id FROM group_members WHERE group_id=?").all(gid);
      members.forEach(m => memberIds.includes(m.user_id) || memberIds.push(m.user_id));
    }
    if (!memberIds.length) return res.json({ rows: [], total: 0 });
    const ph = memberIds.map(() => "?").join(",");
    where += ` AND f.user_id IN (${ph})`; params.push(...memberIds);
  } else {
    if (groupId) { where += " AND f.group_id = ?"; params.push(groupId); }
    if (userId)  { where += " AND f.user_id = ?";  params.push(userId); }
  }
  if (status) { where += " AND f.status = ?"; params.push(status); }

  const offset = (Number(page)-1)*Number(limit);
  const rows = db.prepare(`SELECT f.* FROM ponto_faltas f ${where} ORDER BY f.falta_date DESC LIMIT ? OFFSET ?`)
    .all(...params, Number(limit), offset);
  const total = db.prepare(`SELECT COUNT(*) as c FROM ponto_faltas f ${where}`).get(...params).c;
  return res.json({ rows: rows.map(f => fmtFalta(f, db)), total, page: Number(page), limit: Number(limit) });
});

// POST /api/occurrences/falta-ponto (HR/admin only)
router.post("/falta-ponto", requireAuth, (req, res) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: "Apenas RH pode registrar falta de ponto" });
  const { userId, faltaDate, expectedType, reason, notes } = req.body;
  if (!userId || !faltaDate || !expectedType)
    return res.status(400).json({ error: "userId, faltaDate e expectedType são obrigatórios" });
  const validTypes = ["entrada", "saida", "inicio_intervalo", "fim_intervalo"];
  if (!validTypes.includes(expectedType))
    return res.status(400).json({ error: "expectedType inválido" });
  const db = getDb();
  const grpData = db.prepare("SELECT group_id FROM group_members WHERE user_id=? LIMIT 1").get(userId);
  const id = uuidv4();
  db.prepare(`
    INSERT INTO ponto_faltas (id, user_id, group_id, falta_date, expected_type, reason, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, grpData?.group_id || null, faltaDate, expectedType, reason || null, notes || null, req.user.id);
  return res.status(201).json(fmtFalta(db.prepare("SELECT * FROM ponto_faltas WHERE id=?").get(id), db));
});

// PATCH /api/occurrences/falta-ponto/:id (HR/admin only)
router.patch("/falta-ponto/:id", requireAuth, (req, res) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: "Apenas RH pode modificar falta de ponto" });
  const db = getDb();
  const f = db.prepare("SELECT * FROM ponto_faltas WHERE id=?").get(req.params.id);
  if (!f) return res.status(404).json({ error: "Não encontrado" });
  const { status, reviewNote, reason, notes } = req.body;
  const validStatuses = ["pending", "confirmed", "dismissed"];
  if (status && !validStatuses.includes(status))
    return res.status(400).json({ error: "Status inválido" });
  db.prepare(`UPDATE ponto_faltas SET
    status = COALESCE(?, status),
    review_note = COALESCE(?, review_note),
    reason = COALESCE(?, reason),
    notes = COALESCE(?, notes),
    reviewed_by = CASE WHEN ? IS NOT NULL THEN ? ELSE reviewed_by END,
    reviewed_at = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE reviewed_at END,
    updated_at = datetime('now')
    WHERE id=?`).run(
      status || null, reviewNote || null, reason || null, notes || null,
      status || null, req.user.id,
      status || null,
      req.params.id
    );
  return res.json(fmtFalta(db.prepare("SELECT * FROM ponto_faltas WHERE id=?").get(req.params.id), db));
});

// DELETE /api/occurrences/falta-ponto/:id (HR/admin only)
router.delete("/falta-ponto/:id", requireAuth, (req, res) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: "Apenas RH pode excluir" });
  const db = getDb();
  const f = db.prepare("SELECT * FROM ponto_faltas WHERE id=?").get(req.params.id);
  if (!f) return res.status(404).json({ error: "Não encontrado" });
  db.prepare("DELETE FROM ponto_faltas WHERE id=?").run(req.params.id);
  return res.json({ ok: true });
});

module.exports = router;
