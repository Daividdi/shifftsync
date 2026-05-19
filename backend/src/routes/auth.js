const express = require("express");
const jwt     = require("jsonwebtoken");
const bcrypt  = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const { ldapAuthenticate } = require("../config/ldap");
const { getDb } = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username e password são obrigatórios" });

  const db = getDb();
  const existing = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

  // Local auth bypass for users with a password hash (test users)
  if (existing && existing.password) {
    const ok = bcrypt.compareSync(password, existing.password);
    if (!ok) return res.status(401).json({ error: "Credenciais inválidas" });
    if (!existing.active) return res.status(403).json({ error: "Conta desativada" });
    const token = jwt.sign(
      { id: existing.id, username: existing.username, role: existing.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );
    return res.json({ token, user: fmt(existing) });
  }

  // LDAP auth for regular users
  try {
    const ldapAttrs = await ldapAuthenticate(username, password);
    let user = existing;
    if (!user) {
      const id = uuidv4();
      db.prepare("INSERT INTO users (id,username,full_name,email,dept,title,synced_at) VALUES (?,?,?,?,?,?,datetime('now'))").run(id, username, ldapAttrs.fullName || username, ldapAttrs.email, ldapAttrs.dept, ldapAttrs.title);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    } else {
      db.prepare("UPDATE users SET full_name=?,email=?,dept=?,title=?,synced_at=datetime('now'),active=1 WHERE id=?").run(ldapAttrs.fullName || user.full_name, ldapAttrs.email, ldapAttrs.dept, ldapAttrs.title, user.id);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    }
    if (!user.active) return res.status(403).json({ error: "Conta desativada" });
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );
    return res.json({ token, user: fmt(user) });
  } catch (err) {
    console.error("[Auth]", err.message);
    return res.status(401).json({ error: err.message });
  }
});

router.get("/me", requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!user || !user.active) return res.status(401).json({ error: "Inativo" });
  return res.json(fmt(user));
});

router.post("/logout", (req, res) => res.json({ ok: true }));

function fmt(u) {
  return { id: u.id, username: u.username, fullName: u.full_name, email: u.email, dept: u.dept, title: u.title, role: u.role };
}

module.exports = router;
