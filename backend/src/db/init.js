const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../data/shiftsync.db");

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema();
    runMigrations();
  }
  return db;
}

function runMigrations() {
  // Abono requests
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS abono_requests (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), group_id TEXT REFERENCES groups(id), punch_date TEXT NOT NULL, punch_time TEXT NOT NULL, punch_type TEXT NOT NULL, reason TEXT NOT NULL, justification TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT, review_note TEXT, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT);CREATE INDEX IF NOT EXISTS idx_abono_user   ON abono_requests(user_id);CREATE INDEX IF NOT EXISTS idx_abono_date   ON abono_requests(punch_date);CREATE INDEX IF NOT EXISTS idx_abono_status ON abono_requests(status)`);
  } catch (_) {}

  // Ponto records
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS ponto_records (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), type TEXT NOT NULL, recorded_at TEXT NOT NULL, date TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'integration', reason TEXT, justification TEXT, justified_by TEXT REFERENCES users(id), justified_at TEXT, created_by TEXT REFERENCES users(id), notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT);CREATE INDEX IF NOT EXISTS idx_ponto_user ON ponto_records(user_id);CREATE INDEX IF NOT EXISTS idx_ponto_date ON ponto_records(date);CREATE INDEX IF NOT EXISTS idx_ponto_type ON ponto_records(type)`);
  } catch (_) {}

  // Ponto records table
  try {
    db.exec();
  } catch (_) {}

  // Ponto faltas
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS ponto_faltas (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), group_id TEXT REFERENCES groups(id), falta_date TEXT NOT NULL, expected_type TEXT NOT NULL, reason TEXT, notes TEXT, status TEXT NOT NULL DEFAULT 'pending', reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT, review_note TEXT, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT);CREATE INDEX IF NOT EXISTS idx_faltas_user ON ponto_faltas(user_id);CREATE INDEX IF NOT EXISTS idx_faltas_date ON ponto_faltas(falta_date);CREATE INDEX IF NOT EXISTS idx_faltas_status ON ponto_faltas(status)`);
  } catch (_) {}

  // Vacations
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS vacation_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      group_id TEXT REFERENCES groups(id),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days INTEGER NOT NULL,
      acq_start TEXT,
      acq_end TEXT,
      days_entitled INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'scheduled',
      notes TEXT,
      approved_by TEXT REFERENCES users(id),
      approved_at TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vac_user   ON vacation_records(user_id);
    CREATE INDEX IF NOT EXISTS idx_vac_start  ON vacation_records(start_date);
    CREATE INDEX IF NOT EXISTS idx_vac_status ON vacation_records(status)`);
  } catch (_) {}
  try { db.prepare("ALTER TABLE users ADD COLUMN hire_date TEXT").run(); } catch (_) {}
  // Add birth_date column to users (safe — ignored if already exists)
  try { db.prepare("ALTER TABLE users ADD COLUMN birth_date TEXT").run(); } catch (_) {}
  // Add team column to groups (safe)
  try { db.prepare("ALTER TABLE groups ADD COLUMN team TEXT").run(); } catch (_) {}
  try { db.prepare("ALTER TABLE users ADD COLUMN sync_exempt INTEGER DEFAULT 0").run(); } catch (_) {}
  try { db.prepare("ALTER TABLE users ADD COLUMN deactivated_at TEXT").run(); } catch (_) {}
  try { db.prepare("ALTER TABLE users ADD COLUMN acq_override_start TEXT").run(); } catch (_) {}
  try { db.prepare("ALTER TABLE users ADD COLUMN acq_override_end TEXT").run(); } catch (_) {}
  try { db.prepare("ALTER TABLE users ADD COLUMN conc_override_end TEXT").run(); } catch (_) {}
  // Users who do not work on Saturdays: no Saturday shift, no Saturday punch obligation (no Falta).
  try { db.prepare("ALTER TABLE users ADD COLUMN no_saturday INTEGER DEFAULT 0").run(); } catch (_) {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS banco_horas_ajustes (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id),
      date        TEXT NOT NULL,
      tipo        TEXT NOT NULL,
      minutos     INTEGER NOT NULL,
      motivo      TEXT,
      created_by  TEXT REFERENCES users(id),
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_bh_user ON banco_horas_ajustes(user_id);
    CREATE INDEX IF NOT EXISTS idx_bh_date ON banco_horas_ajustes(date)`);
  } catch (_) {}

  // Notificações (férias e avisos)
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS notifications (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        TEXT NOT NULL DEFAULT 'vacation_reminder',
      ref_id      TEXT,
      title       TEXT NOT NULL,
      body        TEXT NOT NULL,
      read        INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notif_user_read ON notifications(user_id, read)`);
  } catch (_) {}
}

function initSchema() {
  db.exec(`
    -- Usuários sincronizados do LDAP
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      username    TEXT UNIQUE NOT NULL,
      full_name   TEXT NOT NULL,
      email       TEXT,
      dept        TEXT,
      title       TEXT,
      role        TEXT NOT NULL DEFAULT 'employee',  -- hr | leader | employee
      active      INTEGER NOT NULL DEFAULT 1,
      synced_at   TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Grupos / Times
    CREATE TABLE IF NOT EXISTS groups (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      color       TEXT NOT NULL DEFAULT '#00C2FF',
      dept        TEXT,
      leader_id   TEXT REFERENCES users(id),
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Membros dos grupos
    CREATE TABLE IF NOT EXISTS group_members (
      group_id  TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, user_id)
    );

    -- Co-líderes dos grupos (líderes de outra turma com acesso ao grupo)
    CREATE TABLE IF NOT EXISTS group_co_leaders (
      group_id  TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, user_id)
    );

    -- Escalas (por grupo + data)
    CREATE TABLE IF NOT EXISTS schedules (
      id          TEXT PRIMARY KEY,
      group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      date        TEXT NOT NULL,   -- ISO date YYYY-MM-DD
      user_id     TEXT NOT NULL REFERENCES users(id),
      status      TEXT NOT NULL DEFAULT 'working',  -- working | off
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(group_id, date, user_id)
    );

    -- Pedidos de troca
    CREATE TABLE IF NOT EXISTS swap_requests (
      id           TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL REFERENCES users(id),
      coverer_id   TEXT NOT NULL REFERENCES users(id),
      date         TEXT NOT NULL,
      group_id     TEXT REFERENCES groups(id),
      reason       TEXT,
      status       TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
      reviewed_by  TEXT REFERENCES users(id),
      reviewed_at  TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Configurações gerais
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    -- Índices
    CREATE INDEX IF NOT EXISTS idx_schedules_date      ON schedules(date);
    CREATE INDEX IF NOT EXISTS idx_schedules_user      ON schedules(user_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_group     ON schedules(group_id);
    CREATE INDEX IF NOT EXISTS idx_swap_status         ON swap_requests(status);
    CREATE INDEX IF NOT EXISTS idx_co_leaders_user     ON group_co_leaders(user_id);

    -- Mural de Avisos
    CREATE TABLE IF NOT EXISTS mural_posts (
      id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL, media_url TEXT, media_type TEXT,
      poll_question TEXT, poll_options TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime(now))
    );
    CREATE TABLE IF NOT EXISTS mural_reactions (
      id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES mural_posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime(now)),
      UNIQUE(post_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS mural_poll_votes (
      id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES mural_posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id), option_index INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime(now)),
      UNIQUE(post_id, user_id)
    );

    -- Documentos
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL DEFAULT Geral,
      filename TEXT NOT NULL, original_name TEXT NOT NULL, file_size INTEGER,
      uploaded_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime(now))
    );
  `);
}

module.exports = { getDb };
