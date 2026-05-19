const express  = require("express");
const https    = require("https");
const { v4: uuidv4 } = require("uuid");
const { getDb }      = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

const IBGE_MG       = "MG";
const IBGE_MURIAE   = "3143906";
const RAW_BASE      = "https://raw.githubusercontent.com/joaopbini/feriados-brasil/master/dados/feriados";

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers:{ "User-Agent":"ShiftSync/1.0" } }, res => {
      let data = "";
      res.on("data", d => data += d);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error("JSON inválido: "+url)); }
      });
    }).on("error", reject);
  });
}

// GET /api/holidays?year=2026
router.get("/", requireAuth, async (req, res) => {
  const db = getDb();
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const rows = db.prepare(
    "SELECT * FROM holidays WHERE year=? ORDER BY date"
  ).all(year);
  return res.json(rows);
});

// POST /api/holidays/sync?year=2026 — sincroniza do GitHub
router.post("/sync", requireAuth, requireRole("hr"), async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const db = getDb();

  try {
    const results = { nacional:0, estadual:0, municipal:0, errors:[] };

    // Remove registros automáticos do ano para re-sincronizar
    db.prepare("DELETE FROM holidays WHERE year=? AND source='github'").run(year);

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO holidays (id, date, name, type, description, uf, ibge, source, year)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'github', ?)
    `);

    const insertMany = db.transaction((items) => {
      for (const h of items) insertStmt.run(
        uuidv4(), h.date, h.nome || h.name, h.tipo || h.type,
        h.descricao || h.description || null,
        h.uf || null, h.codigo_ibge || null, year
      );
    });

    // Nacionais
    try {
      const nacional = await fetchJson(`${RAW_BASE}/nacional/json/${year}.json`);
      const items = Array.isArray(nacional) ? nacional : (nacional.feriados || []);
      // Normaliza data para YYYY-MM-DD
      const normalized = items.map(h => ({
        ...h,
        date: h.data ? (h.data.includes("/") ?
          h.data.split("/").reverse().join("-") : h.data) : h.date
      }));
      insertMany(normalized);
      results.nacional = normalized.length;
    } catch(e) { results.errors.push("nacional: "+e.message); }

    // Estaduais MG
    try {
      const estadual = await fetchJson(`${RAW_BASE}/estadual/json/${year}.json`);
      const items = Array.isArray(estadual) ? estadual : (estadual.feriados || []);
      const mgItems = items.filter(h => (h.uf||"").toUpperCase() === IBGE_MG);
      const normalized = mgItems.map(h => ({
        ...h,
        date: h.data ? (h.data.includes("/") ?
          h.data.split("/").reverse().join("-") : h.data) : h.date
      }));
      insertMany(normalized);
      results.estadual = normalized.length;
    } catch(e) { results.errors.push("estadual: "+e.message); }

    // Municipais — Muriaé
    try {
      const municipal = await fetchJson(`${RAW_BASE}/municipal/json/${year}.json`);
      const items = Array.isArray(municipal) ? municipal : (municipal.feriados || []);
      const muriae = items.filter(h =>
        String(h.codigo_ibge || h.ibge || "") === IBGE_MURIAE
      );
      const normalized = muriae.map(h => ({
        ...h,
        date: h.data ? (h.data.includes("/") ?
          h.data.split("/").reverse().join("-") : h.data) : h.date
      }));
      insertMany(normalized);
      results.municipal = normalized.length;
    } catch(e) { results.errors.push("municipal: "+e.message); }

    const total = db.prepare("SELECT COUNT(*) as c FROM holidays WHERE year=?").get(year).c;
    return res.json({ ok:true, year, ...results, total });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/holidays — adiciona feriado manual
router.post("/", requireAuth, requireRole("hr"), (req, res) => {
  const { date, name, type, description } = req.body;
  if (!date || !name || !type) return res.status(400).json({ error:"date, name e type obrigatórios" });
  const db = getDb();
  const year = parseInt(date.slice(0,4));
  const id = uuidv4();
  db.prepare(`
    INSERT INTO holidays (id, date, name, type, description, source, year, created_by)
    VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)
  `).run(id, date, name, type, description||null, year, req.user.id);
  return res.status(201).json({ id, date, name, type, year });
});

// DELETE /api/holidays/:id
router.delete("/:id", requireAuth, requireRole("hr"), (req, res) => {
  const db = getDb();
  const h = db.prepare("SELECT * FROM holidays WHERE id=?").get(req.params.id);
  if (!h) return res.status(404).json({ error:"Não encontrado" });
  if (h.source !== "manual") return res.status(400).json({ error:"Só feriados manuais podem ser excluídos" });
  db.prepare("DELETE FROM holidays WHERE id=?").run(req.params.id);
  return res.json({ ok:true });
});


// PATCH /api/holidays/:id — editar feriado
router.patch("/:id", requireAuth, requireRole("hr"), (req, res) => {
  const db = getDb();
  const h = db.prepare("SELECT * FROM holidays WHERE id=?").get(req.params.id);
  if (!h) return res.status(404).json({ error:"Não encontrado" });
  const { date, name, type, description } = req.body;
  db.prepare("UPDATE holidays SET date=?, name=?, type=?, description=? WHERE id=?")
    .run(date||h.date, name||h.name, type||h.type, description!==undefined?description:h.description, req.params.id);
  return res.json({ ok:true });
});

module.exports = router;
