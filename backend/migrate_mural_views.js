const { getDb } = require('./src/db/init');
const db = getDb();
db.exec(`
  CREATE TABLE IF NOT EXISTS mural_views (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES mural_posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(post_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_mural_views_post ON mural_views(post_id);
`);
console.log('mural_views table OK');
