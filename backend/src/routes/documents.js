const express  = require("express");
const multer   = require("multer");
const path     = require("path");
const fs       = require("fs");
const { v4: uuidv4 } = require("uuid");
const { getDb }       = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

const UPLOAD_DIR = "/app/data/uploads/documents";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => cb(null, `${uuidv4()}.pdf`),
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Apenas arquivos PDF são permitidos"));
  },
});

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

function formatDoc(d, viewCount = 0) {
  return {
    id:           d.id,
    title:        d.title,
    category:     d.category,
    originalName: d.original_name,
    fileSize:     d.file_size,
    uploadedBy:   d.uploaded_by,
    createdAt:    d.created_at,
    viewCount,
  };
}

// GET /api/documents
router.get("/", requireAuth, (req, res) => {
  const db   = getDb();
  const docs = db.prepare("SELECT * FROM documents ORDER BY category, title").all();
  return res.json(docs.map(d => {
    const vc = db.prepare("SELECT COUNT(*) as c FROM document_views WHERE doc_id=?").get(d.id);
    return formatDoc(d, vc ? vc.c : 0);
  }));
});

// POST /api/documents — leaders/hr/gerencia only
router.post("/", requireAuth, requireRole("leader"), upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Arquivo PDF obrigatório" });

  const { title, category } = req.body;
  if (!title?.trim()) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Título obrigatório" });
  }

  const db  = getDb();
  const id  = uuidv4();
  const cat = category?.trim() || "Geral";
  db.prepare(`
    INSERT INTO documents (id, title, category, filename, original_name, file_size, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, title.trim(), cat, req.file.filename, req.file.originalname, req.file.size, req.user.id);

  notifyAll(db, req.user.id, "document_new", id,
    "Novo documento disponível",
    `"${title.trim()}" foi adicionado na categoria ${cat}`
  );

  const doc = db.prepare("SELECT * FROM documents WHERE id=?").get(id);
  return res.status(201).json(formatDoc(doc, 0));
});

// PUT /api/documents/:id — leaders/hr/gerencia only, edit title/category and optionally replace file
router.put("/:id", requireAuth, requireRole("leader"), upload.single("file"), (req, res) => {
  const db  = getDb();
  const doc = db.prepare("SELECT * FROM documents WHERE id=?").get(req.params.id);
  if (!doc) return res.status(404).json({ error: "Documento não encontrado" });

  const { title, category } = req.body;
  if (title !== undefined && !title?.trim()) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Título obrigatório" });
  }

  if (req.file) {
    const oldFile = path.join(UPLOAD_DIR, doc.filename);
    if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);

    db.prepare(`
      UPDATE documents SET
        title        = ?,
        category     = ?,
        filename     = ?,
        original_name = ?,
        file_size    = ?
      WHERE id = ?
    `).run(
      (title?.trim() || doc.title),
      (category?.trim() || doc.category),
      req.file.filename,
      req.file.originalname,
      req.file.size,
      doc.id
    );
  } else {
    db.prepare(`
      UPDATE documents SET title = ?, category = ? WHERE id = ?
    `).run(
      (title?.trim() || doc.title),
      (category?.trim() || doc.category),
      doc.id
    );
  }

  const updated = db.prepare("SELECT * FROM documents WHERE id=?").get(doc.id);
  const vc = db.prepare("SELECT COUNT(*) as c FROM document_views WHERE doc_id=?").get(doc.id);
  return res.json(formatDoc(updated, vc ? vc.c : 0));
});

// GET /api/documents/:id/view — serve PDF inline and record view
router.get("/:id/view", requireAuth, (req, res) => {
  const db  = getDb();
  const doc = db.prepare("SELECT * FROM documents WHERE id=?").get(req.params.id);
  if (!doc) return res.status(404).json({ error: "Documento não encontrado" });

  const file = path.join(UPLOAD_DIR, doc.filename);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Arquivo não encontrado" });

  try {
    db.prepare("INSERT OR IGNORE INTO document_views (id, doc_id, user_id) VALUES (?,?,?)")
      .run(uuidv4(), doc.id, req.user.id);
  } catch {}

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.original_name)}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(file).pipe(res);
});

// DELETE /api/documents/:id — leaders/hr/gerencia only
router.delete("/:id", requireAuth, requireRole("leader"), (req, res) => {
  const db  = getDb();
  const doc = db.prepare("SELECT * FROM documents WHERE id=?").get(req.params.id);
  if (!doc) return res.status(404).json({ error: "Documento não encontrado" });

  const file = path.join(UPLOAD_DIR, doc.filename);
  if (fs.existsSync(file)) fs.unlinkSync(file);

  db.prepare("DELETE FROM documents WHERE id=?").run(doc.id);
  return res.json({ ok: true });
});

module.exports = router;
