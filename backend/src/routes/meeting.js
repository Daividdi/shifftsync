const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

function isAdmin(role)  { return role === "hr" || role === "ti"; }
function isLeader(role) { return role === "leader" || role === "gerencia" || isAdmin(role); }

function ensurePart(db) {
  db.exec("CREATE TABLE IF NOT EXISTS meeting_participants (booking_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (booking_id, user_id))");
}
function notifyParticipants(db, userIds, type, title, body, refId) {
  const ins = db.prepare("INSERT INTO notifications (id, user_id, type, ref_id, title, body) VALUES (?,?,?,?,?,?)");
  try { db.transaction(() => { for (const uid of userIds) ins.run(uuidv4(), uid, type, refId, title, body); })(); }
  catch (e) { console.error("[meeting notify]", e.message); }
}

function fmt(b, db) {
  const user = db.prepare("SELECT full_name, username FROM users WHERE id=?").get(b.created_by);
  let participants = [];
  try {
    participants = db.prepare(
      "SELECT u.id, u.full_name name FROM meeting_participants mp JOIN users u ON u.id=mp.user_id WHERE mp.booking_id=? ORDER BY u.full_name"
    ).all(b.id);
  } catch { /* tabela ainda não criada */ }
  return {
    id: b.id, title: b.title, description: b.description,
    date: b.date, startTime: b.start_time, endTime: b.end_time,
    recurrence: b.recurrence, recurrenceEnd: b.recurrence_end,
    createdBy: b.created_by,
    createdByName: user?.full_name || b.created_by,
    createdByUsername: user?.username,
    createdAt: b.created_at,
    participants,
  };
}

// Gera datas recorrentes a partir de uma reserva
function expandRecurrence(booking, rangeFrom, rangeTo) {
  const dates = [];
  const from = new Date(rangeFrom + "T00:00:00");
  const to   = new Date(rangeTo   + "T23:59:59");
  const end  = booking.recurrence_end ? new Date(booking.recurrence_end + "T23:59:59") : to;
  const effectiveEnd = end < to ? end : to;

  let cur = new Date(booking.date + "T00:00:00");

  while (cur <= effectiveEnd) {
    if (cur >= from) dates.push(cur.toISOString().slice(0, 10));
    if (booking.recurrence === "weekly")  cur.setDate(cur.getDate() + 7);
    else if (booking.recurrence === "monthly") cur.setMonth(cur.getMonth() + 1);
    else break;
  }
  return dates;
}

// GET /api/meeting?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/", requireAuth, (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: "from e to obrigatórios" });

  const rows = db.prepare(`
    SELECT * FROM meeting_bookings
    WHERE (recurrence != 'none' OR (date BETWEEN ? AND ?))
    ORDER BY date, start_time
  `).all(from, to);

  // Expande recorrências no intervalo
  const expanded = [];
  for (const b of rows) {
    if (b.recurrence === "none") {
      expanded.push({ ...fmt(b, db), expandedDate: b.date });
    } else {
      const dates = expandRecurrence(b, from, to);
      for (const d of dates) {
        expanded.push({ ...fmt(b, db), expandedDate: d });
      }
    }
  }

  expanded.sort((a, b) => {
    if (a.expandedDate !== b.expandedDate) return a.expandedDate.localeCompare(b.expandedDate);
    return a.startTime.localeCompare(b.startTime);
  });

  return res.json(expanded);
});

// GET /api/meeting/conflicts?date=&start=&end=&excludeId=
router.get("/conflicts", requireAuth, (req, res) => {
  const db = getDb();
  const { date, start, end, excludeId } = req.query;
  if (!date || !start || !end) return res.status(400).json({ error: "date, start, end obrigatórios" });

  const rows = db.prepare(`SELECT * FROM meeting_bookings`).all();
  const conflicts = [];

  for (const b of rows) {
    if (excludeId && b.id === excludeId) continue;
    const dates = b.recurrence === "none" ? [b.date] : expandRecurrence(b, date, date);
    if (!dates.includes(date)) continue;
    if (start < b.end_time && end > b.start_time) {
      conflicts.push(fmt(b, db));
    }
  }

  return res.json(conflicts);
});

// POST /api/meeting — criar reserva (líder e admin)
router.post("/", requireAuth, (req, res) => {
  if (!isLeader(req.user.role)) return res.status(403).json({ error: "Sem permissão" });

  const { title, description, date, startTime, endTime, recurrence = "none", recurrenceEnd, participants } = req.body;
  if (!title || !date || !startTime || !endTime)
    return res.status(400).json({ error: "title, date, startTime e endTime obrigatórios" });
  if (startTime >= endTime)
    return res.status(400).json({ error: "Horário de fim deve ser após o início" });

  const db = getDb();

  // Verifica conflitos
  const rows = db.prepare("SELECT * FROM meeting_bookings").all();
  for (const b of rows) {
    const dates = b.recurrence === "none" ? [b.date] : expandRecurrence(b, date, recurrenceEnd || date);
    if (!dates.includes(date)) continue;
    if (startTime < b.end_time && endTime > b.start_time) {
      return res.status(409).json({
        error: `Conflito com "${b.title}" (${b.start_time}–${b.end_time})`,
        conflict: fmt(b, db),
      });
    }
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO meeting_bookings (id, title, description, date, start_time, end_time, recurrence, recurrence_end, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, description||null, date, startTime, endTime, recurrence, recurrenceEnd||null, req.user.id);

  // Participantes + alerta
  const partIds = Array.isArray(participants) ? [...new Set(participants.filter(Boolean))] : [];
  if (partIds.length) {
    ensurePart(db);
    const ip = db.prepare("INSERT OR IGNORE INTO meeting_participants (booking_id, user_id) VALUES (?,?)");
    db.transaction(() => { for (const uid of partIds) ip.run(id, uid); })();
    const creator = db.prepare("SELECT full_name FROM users WHERE id=?").get(req.user.id)?.full_name || "Alguém";
    const recur = recurrence !== "none" ? ` · recorrente (${recurrence === "weekly" ? "semanal" : "mensal"})` : "";
    const title2 = `📅 Reunião: ${title}`;
    const body2 = `${date} · ${startTime}–${endTime}${recur}${description ? " · " + description : ""} — convidado por ${creator}`;
    notifyParticipants(db, partIds, "meeting_invite", title2, body2, id);
  }

  return res.status(201).json(fmt(db.prepare("SELECT * FROM meeting_bookings WHERE id=?").get(id), db));
});

// PUT /api/meeting/:id — editar reserva
router.put("/:id", requireAuth, (req, res) => {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM meeting_bookings WHERE id=?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Reserva não encontrada" });
  if (existing.created_by !== req.user.id && !isAdmin(req.user.role))
    return res.status(403).json({ error: "Sem permissão" });

  const { title, description, date, startTime, endTime, recurrence = "none", recurrenceEnd, participants } = req.body;
  if (!title || !date || !startTime || !endTime)
    return res.status(400).json({ error: "title, date, startTime e endTime obrigatórios" });
  if (startTime >= endTime)
    return res.status(400).json({ error: "Horário de fim deve ser após o início" });

  // Conflitos (exceto a própria reserva)
  const rows = db.prepare("SELECT * FROM meeting_bookings WHERE id != ?").all(req.params.id);
  for (const b of rows) {
    const dates = b.recurrence === "none" ? [b.date] : expandRecurrence(b, date, recurrenceEnd || date);
    if (!dates.includes(date)) continue;
    if (startTime < b.end_time && endTime > b.start_time) {
      return res.status(409).json({ error: `Conflito com "${b.title}" (${b.start_time}–${b.end_time})`, conflict: fmt(b, db) });
    }
  }

  db.prepare(`
    UPDATE meeting_bookings SET title=?, description=?, date=?, start_time=?, end_time=?, recurrence=?, recurrence_end=?
    WHERE id=?
  `).run(title, description||null, date, startTime, endTime, recurrence, recurrenceEnd||null, req.params.id);

  // Participantes — substitui e avisa da atualização
  ensurePart(db);
  const partIds = Array.isArray(participants) ? [...new Set(participants.filter(Boolean))] : [];
  db.prepare("DELETE FROM meeting_participants WHERE booking_id=?").run(req.params.id);
  if (partIds.length) {
    const ip = db.prepare("INSERT OR IGNORE INTO meeting_participants (booking_id, user_id) VALUES (?,?)");
    db.transaction(() => { for (const uid of partIds) ip.run(req.params.id, uid); })();
    const editor = db.prepare("SELECT full_name FROM users WHERE id=?").get(req.user.id)?.full_name || "Alguém";
    const recur = recurrence !== "none" ? ` · recorrente (${recurrence === "weekly" ? "semanal" : "mensal"})` : "";
    notifyParticipants(db, partIds, "meeting_invite", `📅 Reunião atualizada: ${title}`, `${date} · ${startTime}–${endTime}${recur}${description ? " · " + description : ""} — por ${editor}`, req.params.id);
  }

  return res.json(fmt(db.prepare("SELECT * FROM meeting_bookings WHERE id=?").get(req.params.id), db));
});

// DELETE /api/meeting/:id
router.delete("/:id", requireAuth, (req, res) => {
  const db = getDb();
  const b = db.prepare("SELECT * FROM meeting_bookings WHERE id=?").get(req.params.id);
  if (!b) return res.status(404).json({ error: "Reserva não encontrada" });
  if (b.created_by !== req.user.id && !isAdmin(req.user.role))
    return res.status(403).json({ error: "Sem permissão" });
  // Avisa os participantes do cancelamento e limpa
  ensurePart(db);
  const parts = db.prepare("SELECT user_id FROM meeting_participants WHERE booking_id=?").all(req.params.id).map(r => r.user_id);
  if (parts.length) notifyParticipants(db, parts, "meeting_cancel", `❌ Reunião cancelada: ${b.title}`, `${b.date} · ${b.start_time}–${b.end_time} foi cancelada`, req.params.id);
  db.prepare("DELETE FROM meeting_participants WHERE booking_id=?").run(req.params.id);
  db.prepare("DELETE FROM meeting_bookings WHERE id=?").run(req.params.id);
  return res.json({ ok: true });
});

// GET /api/meeting/stats — relatórios
router.get("/stats", requireAuth, requireRole("hr", "leader"), (req, res) => {
  const db = getDb();
  const { from = new Date(Date.now()-30*86400000).toISOString().slice(0,10), to = new Date().toISOString().slice(0,10) } = req.query;

  const rows = db.prepare(`
    SELECT mb.*, u.full_name, u.username
    FROM meeting_bookings mb JOIN users u ON u.id = mb.created_by
  `).all();

  // Expande no período
  const expanded = [];
  for (const b of rows) {
    const dates = b.recurrence === "none" ? [b.date] : expandRecurrence(b, from, to);
    for (const d of dates) {
      if (d >= from && d <= to) {
        const dur = (new Date("2000-01-01T"+b.end_time) - new Date("2000-01-01T"+b.start_time)) / 60000;
        expanded.push({ ...b, expandedDate: d, durationMin: dur });
      }
    }
  }

  // Total de horas disponíveis no período (8h-18h = 10h/dia útil)
  const days = Math.ceil((new Date(to) - new Date(from)) / 86400000) + 1;
  const totalAvailMin = days * 10 * 60;
  const totalBookedMin = expanded.reduce((s, b) => s + b.durationMin, 0);
  const occupancyRate = totalAvailMin > 0 ? Math.min(100, Math.round(totalBookedMin / totalAvailMin * 100)) : 0;
  const avgDuration = expanded.length > 0 ? Math.round(totalBookedMin / expanded.length) : 0;

  // Por líder
  const byUser = {};
  for (const b of expanded) {
    if (!byUser[b.created_by]) byUser[b.created_by] = { name: b.full_name, count: 0, totalMin: 0 };
    byUser[b.created_by].count++;
    byUser[b.created_by].totalMin += b.durationMin;
  }

  // Por hora do dia
  const byHour = {};
  for (const b of expanded) {
    const h = parseInt(b.start_time.split(":")[0]);
    byHour[h] = (byHour[h] || 0) + 1;
  }

  // Por dia da semana
  const byDow = [0,0,0,0,0,0,0];
  for (const b of expanded) {
    const dow = new Date(b.expandedDate + "T12:00:00").getDay();
    byDow[dow]++;
  }

  // Por mês
  const byMonth = {};
  for (const b of expanded) {
    const m = b.expandedDate.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = { count: 0, totalMin: 0 };
    byMonth[m].count++;
    byMonth[m].totalMin += b.durationMin;
  }

  return res.json({
    totalBookings: expanded.length,
    totalBookedMin,
    occupancyRate,
    avgDuration,
    byUser: Object.values(byUser).sort((a,b) => b.count - a.count),
    byHour: Array.from({length:24},(_,i) => ({ hour:i, count: byHour[i]||0 })).filter(h => h.hour >= 7 && h.hour <= 18),
    byDow: byDow.map((c,i) => ({ dow:i, label:["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][i], count:c })),
    byMonth: Object.entries(byMonth).map(([m, v]) => ({ month:m, ...v })).sort((a,b)=>a.month.localeCompare(b.month)),
    from, to,
  });
});

module.exports = router;
