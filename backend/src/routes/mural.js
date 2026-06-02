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
const VALID_EMOJIS = ["like", "love", "haha", "wow", "sad", "angry", "celebrate"];
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

function getReactionData(db, postId, userId) {
  const rows = db.prepare(`
    SELECT r.emoji, r.user_id, u.full_name
    FROM mural_reactions r
    JOIN users u ON u.id = r.user_id
    WHERE r.post_id = ?
    ORDER BY r.created_at ASC
  `).all(postId);

  const byEmoji = {};
  for (const r of rows) {
    if (!byEmoji[r.emoji]) byEmoji[r.emoji] = [];
    byEmoji[r.emoji].push({ userId: r.user_id, fullName: r.full_name });
  }

  return {
    reactionCount: rows.length,
    userReaction:  rows.find(r => r.user_id === userId)?.emoji || null,
    byEmoji,
  };
}

function enrichPost(db, post, userId) {
  const { reactionCount, userReaction, byEmoji } = getReactionData(db, post.id, userId);
  const viewCount     = db.prepare("SELECT COUNT(*) as c FROM mural_views WHERE post_id=?").get(post.id).c;
  const commentCount  = db.prepare("SELECT COUNT(*) as c FROM mural_comments WHERE post_id=?").get(post.id).c;
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
    id:              post.id,
    content:         post.content,
    mediaUrl:        post.media_url,
    mediaType:       post.media_type,
    pollQuestion:    post.poll_question,
    pollOptions,
    pollVotes,
    userVote,
    reactionCount,
    userReaction,
    byEmoji,
    commentCount,
    viewCount,
    commentsEnabled: post.comments_enabled !== 0,
    createdAt:       post.created_at,
    editedAt:        post.edited_at || null,
    author: author ? { id: author.id, fullName: author.full_name, dept: author.dept, role: author.role } : null,
  };
}

// GET /api/mural
router.get("/", requireAuth, (req, res) => {
  const db    = getDb();
  const posts = db.prepare("SELECT * FROM mural_posts ORDER BY created_at DESC").all();

  const insertView = db.prepare("INSERT OR IGNORE INTO mural_views (id, post_id, user_id) VALUES (?,?,?)");
  try {
    db.transaction(() => { for (const p of posts) insertView.run(uuidv4(), p.id, req.user.id); })();
  } catch {}

  return res.json(posts.map(p => enrichPost(db, p, req.user.id)));
});

// POST /api/mural — create post
router.post("/", requireAuth, upload.single("image"), (req, res) => {
  if (!canPost(req.user.role)) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: "Sem permissão para publicar" });
  }

  const { content, videoUrl, pollQuestion, pollOptions, commentsEnabled } = req.body;
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

  const commentsVal = commentsEnabled === "false" ? 0 : 1;

  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO mural_posts (id, author_id, content, media_url, media_type, poll_question, poll_options, comments_enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, content.trim(), mediaUrl, finalType, pollQ, pollOpt, commentsVal);

  const authorName = db.prepare("SELECT full_name FROM users WHERE id=?").get(req.user.id)?.full_name || "Alguém";
  const plainText  = content.trim().replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  const snippet    = plainText.slice(0, 120) + (plainText.length > 120 ? "..." : "");
  notifyAll(db, req.user.id, "mural_post", id, "Nova publicação no Mural", `${authorName}: "${snippet}"`);

  const post = db.prepare("SELECT * FROM mural_posts WHERE id=?").get(id);
  return res.status(201).json(enrichPost(db, post, req.user.id));
});

// PATCH /api/mural/:id — edit post content and/or toggle comments
router.patch("/:id", requireAuth, (req, res) => {
  const db   = getDb();
  const post = db.prepare("SELECT * FROM mural_posts WHERE id=?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "Post não encontrado" });

  const isOwner = post.author_id === req.user.id;
  if (!isOwner && !isAdmin(req.user.role)) return res.status(403).json({ error: "Sem permissão" });

  const { content, commentsEnabled } = req.body;

  if (!content?.trim() && commentsEnabled === undefined) {
    return res.status(400).json({ error: "Nada para atualizar" });
  }

  if (content?.trim()) {
    db.prepare("UPDATE mural_posts SET content=?, edited_at=datetime('now') WHERE id=?")
      .run(content.trim(), post.id);
  }

  if (commentsEnabled !== undefined) {
    db.prepare("UPDATE mural_posts SET comments_enabled=? WHERE id=?")
      .run(commentsEnabled ? 1 : 0, post.id);
  }

  const updated = db.prepare("SELECT * FROM mural_posts WHERE id=?").get(post.id);
  return res.json(enrichPost(db, updated, req.user.id));
});

// GET /api/mural/media/:filename
router.get("/media/:filename", (req, res) => {
  const safe = path.basename(req.params.filename);
  const file = path.join(UPLOAD_DIR, safe);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Arquivo não encontrado" });
  res.sendFile(file);
});

// POST /api/mural/:id/react — add/change/remove emoji reaction
router.post("/:id/react", requireAuth, (req, res) => {
  const emoji = req.body.emoji || "like";
  if (!VALID_EMOJIS.includes(emoji)) return res.status(400).json({ error: "Emoji inválido" });

  const db   = getDb();
  const post = db.prepare("SELECT id FROM mural_posts WHERE id=?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "Post não encontrado" });

  const existing = db.prepare("SELECT id, emoji FROM mural_reactions WHERE post_id=? AND user_id=?").get(post.id, req.user.id);

  if (existing) {
    if (existing.emoji === emoji) {
      db.prepare("DELETE FROM mural_reactions WHERE id=?").run(existing.id);
    } else {
      db.prepare("UPDATE mural_reactions SET emoji=? WHERE id=?").run(emoji, existing.id);
    }
  } else {
    db.prepare("INSERT INTO mural_reactions (id, post_id, user_id, emoji) VALUES (?,?,?,?)")
      .run(uuidv4(), post.id, req.user.id, emoji);
  }

  return res.json(getReactionData(db, post.id, req.user.id));
});

// GET /api/mural/:id/comments
router.get("/:id/comments", requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT c.id, c.content, c.created_at, c.edited_at, c.author_id,
           u.full_name, u.dept, u.role
    FROM mural_comments c
    JOIN users u ON u.id = c.author_id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.id);

  return res.json(rows.map(r => ({
    id:        r.id,
    content:   r.content,
    createdAt: r.created_at,
    editedAt:  r.edited_at || null,
    author:    { id: r.author_id, fullName: r.full_name, dept: r.dept, role: r.role },
  })));
});

// POST /api/mural/:id/comments
router.post("/:id/comments", requireAuth, (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: "Comentário obrigatório" });

  const db   = getDb();
  const post = db.prepare("SELECT id, author_id, comments_enabled FROM mural_posts WHERE id=?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "Post não encontrado" });
  if (post.comments_enabled === 0) return res.status(403).json({ error: "Comentários desativados neste post" });

  const id = uuidv4();
  db.prepare("INSERT INTO mural_comments (id, post_id, author_id, content) VALUES (?,?,?,?)")
    .run(id, post.id, req.user.id, content.trim());

  if (post.author_id !== req.user.id) {
    const commenterName = db.prepare("SELECT full_name FROM users WHERE id=?").get(req.user.id)?.full_name || "Alguém";
    try {
      db.prepare("INSERT INTO notifications (id, user_id, type, ref_id, title, body) VALUES (?,?,?,?,?,?)")
        .run(uuidv4(), post.author_id, "mural_comment", post.id, "Novo comentário no seu post", `${commenterName} comentou: "${content.trim().slice(0, 60)}"`);
    } catch {}
  }

  const row = db.prepare(`
    SELECT c.id, c.content, c.created_at, c.edited_at, c.author_id,
           u.full_name, u.dept, u.role
    FROM mural_comments c JOIN users u ON u.id = c.author_id
    WHERE c.id = ?
  `).get(id);

  return res.status(201).json({
    id:        row.id,
    content:   row.content,
    createdAt: row.created_at,
    editedAt:  null,
    author:    { id: row.author_id, fullName: row.full_name, dept: row.dept, role: row.role },
  });
});

// DELETE /api/mural/:id/comments/:commentId
router.delete("/:id/comments/:commentId", requireAuth, (req, res) => {
  const db      = getDb();
  const comment = db.prepare("SELECT * FROM mural_comments WHERE id=? AND post_id=?").get(req.params.commentId, req.params.id);
  if (!comment) return res.status(404).json({ error: "Comentário não encontrado" });

  const isOwner = comment.author_id === req.user.id;
  if (!isOwner && !isAdmin(req.user.role)) return res.status(403).json({ error: "Sem permissão" });

  db.prepare("DELETE FROM mural_comments WHERE id=?").run(comment.id);
  return res.json({ ok: true });
});

// POST /api/mural/:id/vote
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

  db.prepare("INSERT INTO mural_poll_votes (id, post_id, user_id, option_index) VALUES (?,?,?,?)")
    .run(uuidv4(), post.id, req.user.id, optionIndex);

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
