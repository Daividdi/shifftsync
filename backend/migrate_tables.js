const { getDb } = require('./src/db/init');
const db = getDb();
db.exec(`
  CREATE TABLE IF NOT EXISTS mural_posts (
    id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES users(id),
    content TEXT NOT NULL, media_url TEXT, media_type TEXT,
    poll_question TEXT, poll_options TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS mural_reactions (
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES mural_posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(post_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS mural_poll_votes (
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES mural_posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id), option_index INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(post_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Geral',
    filename TEXT NOT NULL, original_name TEXT NOT NULL, file_size INTEGER,
    uploaded_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
console.log('Tables created OK');
