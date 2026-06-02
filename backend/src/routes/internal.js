const express = require("express");
const { getDb } = require("../db/init");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();
const SECRET = process.env.BI_NOTIFY_SECRET;

router.post("/bi-updated", (req, res) => {
  if (!SECRET || req.headers["x-internal-secret"] !== SECRET)
    return res.status(401).json({ error: "Unauthorized" });

  const { title, body } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });

  const db = getDb();
  const users = db.prepare("SELECT id FROM users WHERE active = 1").all();
  const stmt  = db.prepare(
    "INSERT INTO notifications (id, user_id, type, title, body) VALUES (?,?,?,?,?)"
  );

  db.transaction(() => {
    for (const u of users) stmt.run(uuidv4(), u.id, "bi_update", title, body || null);
  })();

  return res.json({ ok: true, sent: users.length });
});

module.exports = router;
