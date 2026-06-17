const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { ldapListUsers } = require("../config/ldap");
const { getDb } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// ─── CASCADE DEACTIVATION ──────────────────────────────────────────────────
// Called whenever a user is deactivated (manual toggle or LDAP sync).
// Removes them from groups, future schedules, pending swaps, open absences.
function deactivateUser(db, userId) {
  const today = new Date().toISOString().slice(0, 10);

  db.transaction(() => {
    // 1. Mark inactive
    db.prepare("UPDATE users SET active=0, deactivated_at=datetime('now') WHERE id=?").run(userId);

    // 2. Remove from all groups
    db.prepare("DELETE FROM group_members WHERE user_id=?").run(userId);

    // 3. Delete future schedule entries (today and forward)
    db.prepare("DELETE FROM schedules WHERE user_id=? AND date>=?").run(userId, today);

    // 4. Cancel pending swap requests they're part of
    db.prepare(
      "UPDATE swap_requests SET status='cancelled' WHERE status='pending' AND (requester_id=? OR coverer_id=?)"
    ).run(userId, userId);

    // 5. Close any open absence
    db.prepare(
      "UPDATE absences SET ended_at=datetime('now'), is_open=0, duration_sec=CAST((julianday('now')-julianday(started_at))*86400 AS INTEGER) WHERE user_id=? AND is_open=1"
    ).run(userId);
  })();
}

// ─── ROUTES ───────────────────────────────────────────────────────────────

// GET /api/users/birthdays
router.get("/birthdays", requireAuth, (req, res) => {
  const db = getDb();
  const users = db.prepare(
    "SELECT id, username, full_name, dept, birth_date FROM users WHERE active=1 AND birth_date IS NOT NULL ORDER BY full_name"
  ).all();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMMDD = `${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  const result = users.map(u => {
    const parts = u.birth_date.split("-");
    if (parts.length < 3) return null;
    const [, m, d] = parts;
    const mmdd = `${m}-${d}`;
    const month = parseInt(m, 10);
    const day   = parseInt(d, 10);
    const thisYear = new Date(today.getFullYear(), month - 1, day);
    const nextBday = thisYear < today
      ? new Date(today.getFullYear() + 1, month - 1, day)
      : thisYear;
    const daysUntil = Math.ceil((nextBday - today) / 86400000);
    return {
      id: u.id, fullName: u.full_name, username: u.username, dept: u.dept,
      birthDate: u.birth_date, month, day, mmdd,
      isToday: mmdd === todayMMDD, daysUntil,
    };
  }).filter(Boolean).sort((a, b) => a.daysUntil - b.daysUntil);

  return res.json(result);
});

// GET /api/users
router.get("/", requireAuth, (req, res) => {
  const db = getDb();
  const includeInactive = req.query.includeInactive === "1";
  const users = db.prepare(
    includeInactive
      ? "SELECT * FROM users ORDER BY full_name"
      : "SELECT * FROM users WHERE active=1 ORDER BY full_name"
  ).all();
  return res.json(users.map(formatUser));
});

// GET /api/users/:id
router.get("/:id", requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
  return res.json(formatUser(user));
});

// PATCH /api/users/:id/role
router.patch("/:id/role", requireAuth, requireRole("hr"), (req, res) => {
  const { role } = req.body;
  if (!["hr", "ti", "leader", "gerencia", "employee"].includes(role)) {
    return res.status(400).json({ error: "Role inválido" });
  }
  const db = getDb();
  db.prepare("UPDATE users SET role=? WHERE id=?").run(role, req.params.id);
  return res.json({ ok: true });
});

// PATCH /api/users/:id/birthdate
router.patch("/:id/birthdate", requireAuth, requireRole("hr"), (req, res) => {
  const { birthDate } = req.body;
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return res.status(400).json({ error: "Formato inválido. Use YYYY-MM-DD" });
  }
  const db = getDb();
  db.prepare("UPDATE users SET birth_date=? WHERE id=?").run(birthDate || null, req.params.id);
  return res.json({ ok: true });
});

// PATCH /api/users/:id/exempt — toggle sync_exempt (protects user from LDAP auto-deactivation)
router.patch("/:id/exempt", requireAuth, requireRole("hr"), (req, res) => {
  const { exempt } = req.body;
  const db = getDb();
  db.prepare("UPDATE users SET sync_exempt=? WHERE id=?").run(exempt ? 1 : 0, req.params.id);
  return res.json({ ok: true });
});

// PATCH /api/users/:id/active — manual activate/deactivate with full cascade on deactivation
router.patch("/:id/active", requireAuth, requireRole("hr"), (req, res) => {
  const { active } = req.body;
  const db = getDb();
  if (active) {
    db.prepare("UPDATE users SET active=1, deactivated_at=NULL WHERE id=?").run(req.params.id);
  } else {
    deactivateUser(db, req.params.id);
  }
  return res.json({ ok: true });
});


// PATCH /api/users/:id/profile — manually set dept and/or title (HR only)
router.patch("/:id/profile", requireAuth, requireRole("hr"), (req, res) => {
  const { dept, title } = req.body;
  const db = getDb();
  const user = db.prepare("SELECT id FROM users WHERE id=?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
  if (dept !== undefined)  db.prepare("UPDATE users SET dept=?  WHERE id=?").run(dept  || null, req.params.id);
  if (title !== undefined) db.prepare("UPDATE users SET title=? WHERE id=?").run(title || null, req.params.id);
  return res.json({ ok: true });
});

// DELETE /api/users/:id — soft delete with cascade
router.delete("/:id", requireAuth, requireRole("hr"), (req, res) => {
  const db = getDb();
  deactivateUser(db, req.params.id);
  return res.json({ ok: true });
});

// POST /api/users/sync — LDAP sync: upsert active users, deactivate removed ones (respects sync_exempt)
router.post("/sync", requireAuth, requireRole("hr"), async (req, res) => {
  try {
    const ldapUsers = await ldapListUsers();
    const db = getDb();

    const upsert = db.prepare(`
      INSERT INTO users (id, username, full_name, email, dept, title, synced_at, active)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 1)
      ON CONFLICT(username) DO UPDATE SET
        full_name  = excluded.full_name,
        email      = excluded.email,
        dept       = CASE WHEN excluded.dept  IS NOT NULL THEN excluded.dept  ELSE dept  END,
        title      = CASE WHEN excluded.title IS NOT NULL THEN excluded.title ELSE title END,
        synced_at  = datetime('now'),
        active     = 1,
        deactivated_at = NULL
    `);

    const ldapUsernames = new Set(
      ldapUsers.filter(u => u.username).map(u => u.username.toLowerCase())
    );

    // Upsert all LDAP users first
    db.transaction((users) => {
      for (const u of users) {
        if (!u.username) continue;
        upsert.run(uuidv4(), u.username.toLowerCase(), u.fullName || u.username, u.email, u.dept, u.title);
      }
    })(ldapUsers);

    // Deactivate LDAP-synced users no longer present — skip sync_exempt ones
    const synced = db.prepare(
      "SELECT id, username FROM users WHERE synced_at IS NOT NULL AND active=1 AND sync_exempt=0"
    ).all();

    let deactivated = 0;
    for (const u of synced) {
      if (!ldapUsernames.has(u.username.toLowerCase())) {
        deactivateUser(db, u.id);
        deactivated++;
      }
    }

    return res.json({ ok: true, synced: ldapUsers.length, deactivated });
  } catch (err) {
    console.error("[LDAP Sync]", err.message);
    return res.status(500).json({ error: "Falha na sincronização LDAP: " + err.message });
  }
});

function formatUser(u) {
  return {
    id: u.id, username: u.username, fullName: u.full_name,
    email: u.email, dept: u.dept, title: u.title,
    role: u.role, active: Boolean(u.active),
    syncedAt: u.synced_at, birthDate: u.birth_date || null,
    syncExempt: Boolean(u.sync_exempt),
    meioPeriodo: Boolean(u.meio_periodo),
    noSaturday: Boolean(u.no_saturday),
  };
}

// PATCH /api/users/:id/meio-periodo
router.patch('/:id/meio-periodo', requireAuth, requireRole('hr','ti','gerencia'), (req, res) => {
  const { meioperiodo } = req.body;
  const db = getDb();
  db.prepare('UPDATE users SET meio_periodo=? WHERE id=?').run(meioperiodo ? 1 : 0, req.params.id);
  return res.json({ ok: true });
});

// PATCH /api/users/:id/no-saturday — mark whether the user works Saturdays
router.patch('/:id/no-saturday', requireAuth, requireRole('hr','ti','gerencia'), (req, res) => {
  const { nosaturday } = req.body;
  const db = getDb();
  db.prepare('UPDATE users SET no_saturday=? WHERE id=?').run(nosaturday ? 1 : 0, req.params.id);
  return res.json({ ok: true });
});

module.exports = router;
