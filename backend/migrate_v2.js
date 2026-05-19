const { getDb } = require('./src/db/init');
const db = getDb();
db.exec(`
  CREATE TABLE IF NOT EXISTS document_views (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(doc_id, user_id)
  );
`);
try { db.exec("ALTER TABLE mural_posts ADD COLUMN edited_at TEXT"); console.log("added edited_at"); } catch(e) { console.log("edited_at already exists"); }
console.log('Migration OK');
