const express = require("express");
const { getDb } = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, (req, res) => {
  const db = getDb();
  const notifications = db.prepare(`
    SELECT id, type, ref_id, title, body, read, created_at
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.user.id);
  return res.json(notifications);
});

router.get("/unread-count", requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0"
  ).get(req.user.id);
  return res.json({ count: row.count });
});

router.patch("/:id/read", requireAuth, (req, res) => {
  const db = getDb();
  db.prepare(
    "UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?"
  ).run(req.params.id, req.user.id);
  return res.json({ ok: true });
});

router.patch("/read-all", requireAuth, (req, res) => {
  const db = getDb();
  db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(req.user.id);
  return res.json({ ok: true });
});

module.exports = router;
