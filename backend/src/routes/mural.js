const express  = require("express");
const multer   = require("multer");
const path     = require("path");
const fs       = require("fs");
const { v4: uuidv4 } = require("uuid");
const { getDb }       = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const UPLOAD_DIR = "/app/data/uploads/mural";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Apenas imagens JPEG, PNG, WebP ou GIF"));
  },
});

const CAN_POST = ["leader", "hr", "ti", "gerencia"];
function canPost(role) { return CAN_POST.includes(role); }
function isAdmin(role) { return ["hr", "ti", "gerencia"].includes(role); }

function notifyAll(db, authorId, type, refId, title, body) {
  const users  = db.prepare("SELECT id FROM users WHERE active=1 AND id != ?").all(authorId);
  const insert = db.prepare(
    "INSERT INTO notifications (id, user_id, type, ref_id, title, body) VALUES (?,?,?,?,?,?)"
  );
  try {
    db.transaction(() => {
      for (const u of users) insert.run(uuidv4(), u.id, type, refId, title, body);
    })();
  } catch {}
}

function enrichPost(db, post, userId) {
  const reactionCount = db.prepare("SELECT COUNT(*) as c FROM mural_reactions WHERE post_id=?").get(post.id).c;
  const userReacted   = !!db.prepare("SELECT 1 FROM mural_reactions WHERE post_id=? AND user_id=?").get(post.id, userId);
  const viewCount     = db.prepare("SELECT COUNT(*) as c FROM mural_views WHERE post_id=?").get(post.id).c;
  const author        = db.prepare("SELECT id, full_name, dept, role FROM users WHERE id=?").get(post.author_id);

  let pollOptions = null;
  let pollVotes   = null;
  let userVote    = null;
  if (post.poll_question && post.poll_options) {
    try {
      pollOptions = JSON.parse(post.poll_options);
      pollVotes   = pollOptions.map((_, i) =>
        db.prepare("SELECT COUNT(*) as c FROM mural_poll_votes WHERE post_id=? AND option_index=?").get(post.id, i).c
      );
      const voteRow = db.prepare("SELECT option_index FROM mural_poll_votes WHERE post_id=? AND user_id=?").get(post.id, userId);
      userVote = voteRow ? voteRow.option_index : null;
    } catch {}
  }

  return {
    id:           post.id,
    content:      post.content,
    mediaUrl:     post.media_url,
    mediaType:    post.media_type,
    pollQuestion: post.poll_question,
    pollOptions,
    pollVotes,
    userVote,
    reactionCount,
    userReacted,
    viewCount,
    createdAt:    post.created_at,
    editedAt:     post.edited_at || null,
    author: author ? {
      id: author.id,
      fullName: author.full_name,
      dept: author.dept,
      role: author.role,
    } : null,
  };
}

// GET /api/mural
router.get("/", requireAuth, (req, res) => {
  const db    = getDb();
  const posts = db.prepare("SELECT * FROM mural_posts ORDER BY created_at DESC").all();

  const insertView = db.prepare("INSERT OR IGNORE INTO mural_views (id, post_id, user_id) VALUES (?,?,?)");
  const recordViews = db.transaction(() => {
    for (const p of posts) insertView.run(uuidv4(), p.id, req.user.id);
  });
  try { recordViews(); } catch {}

  return res.json(posts.map(p => enrichPost(db, p, req.user.id)));
});

// POST /api/mural — create post
router.post("/", requireAuth, upload.single("image"), (req, res) => {
  if (!canPost(req.user.role)) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: "Sem permissão para publicar" });
  }

  const { content, videoUrl, pollQuestion, pollOptions } = req.body;
  if (!content?.trim()) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Conteúdo obrigatório" });
  }

  let mediaUrl  = null;
  let finalType = null;
  if (req.file) {
    mediaUrl  = `/api/mural/media/${req.file.filename}`;
    finalType = "image";
  } else if (videoUrl?.trim()) {
    mediaUrl  = videoUrl.trim();
    finalType = "video";
  }

  let pollQ   = null;
  let pollOpt = null;
  if (pollQuestion?.trim()) {
    let opts;
    try { opts = JSON.parse(pollOptions); } catch { opts = []; }
    if (Array.isArray(opts) && opts.length >= 2) {
      pollQ   = pollQuestion.trim();
      pollOpt = JSON.stringify(opts.map(o => String(o).trim()).filter(Boolean));
    }
  }

  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO mural_posts (id, author_id, content, media_url, media_type, poll_question, poll_options)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, content.trim(), mediaUrl, finalType, pollQ, pollOpt);

  const authorName = db.prepare("SELECT full_name FROM users WHERE id=?").get(req.user.id)?.full_name || "Alguém";
  const snippet    = content.trim().slice(0, 80) + (content.trim().length > 80 ? "..." : "");
  notifyAll(db, req.user.id, "mural_post", id, "Nova publicação no Mural", `${authorName}: "${snippet}"`);

  const post = db.prepare("SELECT * FROM mural_posts WHERE id=?").get(id);
  return res.status(201).json(enrichPost(db, post, req.user.id));
});

// PATCH /api/mural/:id — edit post content (author or admin only)
router.patch("/:id", requireAuth, (req, res) => {
  const db   = getDb();
  const post = db.prepare("SELECT * FROM mural_posts WHERE id=?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "Post não encontrado" });

  const isOwner = post.author_id === req.user.id;
  if (!isOwner && !isAdmin(req.user.role)) return res.status(403).json({ error: "Sem permissão" });

  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: "Conteúdo obrigatório" });

  db.prepare("UPDATE mural_posts SET content=?, edited_at=datetime('now') WHERE id=?")
    .run(content.trim(), post.id);

  const updated = db.prepare("SELECT * FROM mural_posts WHERE id=?").get(post.id);
  return res.json(enrichPost(db, updated, req.user.id));
});

// GET /api/mural/media/:filename — public
router.get("/media/:filename", (req, res) => {
  const safe = path.basename(req.params.filename);
  const file = path.join(UPLOAD_DIR, safe);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Arquivo não encontrado" });
  res.sendFile(file);
});

// POST /api/mural/:id/react — toggle like
router.post("/:id/react", requireAuth, (req, res) => {
  const db   = getDb();
  const post = db.prepare("SELECT id FROM mural_posts WHERE id=?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "Post não encontrado" });

  const existing = db.prepare("SELECT id FROM mural_reactions WHERE post_id=? AND user_id=?").get(post.id, req.user.id);
  if (existing) {
    db.prepare("DELETE FROM mural_reactions WHERE id=?").run(existing.id);
  } else {
    db.prepare("INSERT INTO mural_reactions (id, post_id, user_id) VALUES (?,?,?)").run(uuidv4(), post.id, req.user.id);
  }

  const count = db.prepare("SELECT COUNT(*) as c FROM mural_reactions WHERE post_id=?").get(post.id).c;
  return res.json({ reacted: !existing, count });
});

// POST /api/mural/:id/vote — vote in poll
router.post("/:id/vote", requireAuth, (req, res) => {
  const { optionIndex } = req.body;
  if (optionIndex === undefined || optionIndex === null) return res.status(400).json({ error: "optionIndex obrigatório" });

  const db   = getDb();
  const post = db.prepare("SELECT * FROM mural_posts WHERE id=?").get(req.params.id);
  if (!post || !post.poll_options) return res.status(404).json({ error: "Enquete não encontrada" });

  const opts = JSON.parse(post.poll_options);
  if (optionIndex < 0 || optionIndex >= opts.length) return res.status(400).json({ error: "Opção inválida" });

  const existing = db.prepare("SELECT id FROM mural_poll_votes WHERE post_id=? AND user_id=?").get(post.id, req.user.id);
  if (existing) return res.status(400).json({ error: "Você já votou nesta enquete" });

  db.prepare("INSERT INTO mural_poll_votes (id, post_id, user_id, option_index) VALUES (?,?,?,?)").run(uuidv4(), post.id, req.user.id, optionIndex);

  const votes = opts.map((_, i) =>
    db.prepare("SELECT COUNT(*) as c FROM mural_poll_votes WHERE post_id=? AND option_index=?").get(post.id, i).c
  );
  return res.json({ voted: true, optionIndex, votes });
});

// DELETE /api/mural/:id
router.delete("/:id", requireAuth, (req, res) => {
  const db   = getDb();
  const post = db.prepare("SELECT * FROM mural_posts WHERE id=?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "Post não encontrado" });

  const isOwner = post.author_id === req.user.id;
  if (!isOwner && !isAdmin(req.user.role)) return res.status(403).json({ error: "Sem permissão" });

  if (post.media_type === "image" && post.media_url) {
    const file = path.join(UPLOAD_DIR, path.basename(post.media_url));
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  db.prepare("DELETE FROM mural_posts WHERE id=?").run(post.id);
  return res.json({ ok: true });
});

module.exports = router;
