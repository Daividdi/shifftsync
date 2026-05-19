const { getDb } = require("./src/db/init");
const db = getDb();
try {
  db.exec(`CREATE TABLE IF NOT EXISTS banco_horas_ajustes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    date TEXT NOT NULL,
    tipo TEXT NOT NULL,
    minutos INTEGER NOT NULL,
    motivo TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bh_user ON banco_horas_ajustes(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bh_date ON banco_horas_ajustes(date)`);
  console.log("Table created OK");
  const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='banco_horas_ajustes'").get();
  console.log("Table exists:", t ? "YES" : "NO");
} catch(e) {
  console.log("Error:", e.message);
}
