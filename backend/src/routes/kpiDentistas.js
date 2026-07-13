const express = require("express");
const Database = require("better-sqlite3");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");
const { nameMatch } = require("../utils/nameMatch");

const router = express.Router();
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MN = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const MANAGER_ROLES = new Set(["gerencia", "hr", "ti"]);
// Estes indicadores já existem automatizados no BI — nunca são digitados
// manualmente, o valor vem sempre da fonte oficial (qc_designer/quality_designer).
const AUTO_SOURCED = new Set(["qc-basic", "feedback-score"]);

const BI_PATH = process.env.BI_DB_PATH || "/bi-data/bi.db";
let _bi = null;
function bi() {
  if (_bi) return _bi;
  try { _bi = new Database(BI_PATH, { readonly: true, fileMustExist: true }); }
  catch { _bi = new Database(BI_PATH, { fileMustExist: true }); }
  return _bi;
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}
function periodLabel(period) {
  const [y, m] = period.split("-");
  return `${MN[+m - 1]}/${y}`;
}
function pctOf(def, value) {
  if (value == null || def.target_value == null) return null;
  const raw = def.higher_better ? (value / def.target_value) * 100 : (def.target_value / value) * 100;
  return Math.max(0, Math.min(140, raw));
}
function computeComposite(items) {
  const scorable = items.filter(i => !i.qualitative && i.targetValue != null);
  const totalWeight = scorable.reduce((s, i) => s + i.weight, 0);
  if (!totalWeight) return null;
  const sum = scorable.reduce((s, i) => s + i.weight * Math.min(100, i.pct ?? 0) / 100, 0);
  return Math.round((sum / totalWeight) * 100);
}

// Middleware: gerencia/hr/ti (gestão) OU quem tem a flag is_dentista=1
// (líderes que também respondem pelo KPI Dentistas do seu grupo).
function requireManagerOrDentista(req, res, next) {
  const db = getDb();
  if (MANAGER_ROLES.has(req.user.role)) { req.isManager = true; req.isDentista = false; return next(); }
  const u = db.prepare("SELECT is_dentista FROM users WHERE id=?").get(req.user.id);
  if (u && u.is_dentista) { req.isManager = false; req.isDentista = true; return next(); }
  return res.status(403).json({ error: "Sem permissão" });
}
function requireManager(req, res, next) {
  if (!MANAGER_ROLES.has(req.user.role)) return res.status(403).json({ error: "Sem permissão" });
  next();
}

// Resolve, uma vez por request, o designer_name do bi.db correspondente ao
// dentista (por nome — mesmo casamento fuzzy usado em toda a Indicadores
// Pessoais). Cache leve por período de vida do processo.
const _biNameCache = new Map();
function resolveBiName(fullName) {
  if (_biNameCache.has(fullName)) return _biNameCache.get(fullName);
  let d;
  try { d = bi(); } catch (e) { return null; }
  // Candidatos das MESMAS tabelas usadas pelos indicadores auto — líderes
  // costumam não ter produção própria (fora de "productivity"), mas aparecem
  // normalmente em quality_designer/qc_designer.
  const all = new Set([
    ...d.prepare("SELECT DISTINCT designer_name name FROM quality_designer").all().map(r => r.name),
    ...d.prepare("SELECT DISTINCT designer_name name FROM qc_designer").all().map(r => r.name),
  ]);
  const found = [...all].find(n => nameMatch(fullName, n)) || null;
  _biNameCache.set(fullName, found);
  return found;
}

function autoValue(defId, biName, period) {
  if (!biName) return null;
  let d;
  try { d = bi(); } catch (e) { return null; }
  if (defId === "feedback-score") {
    const row = d.prepare("SELECT avg_score FROM quality_designer WHERE designer_name=? AND period_type='month' AND snapshot_date LIKE ?").get(biName, period + "-%");
    return row && row.avg_score != null ? Math.round(row.avg_score * 100) / 100 : null;
  }
  if (defId === "qc-basic") {
    try {
      const row = d.prepare("SELECT SUM(inspections) insp, SUM(passed) passed FROM qc_designer WHERE designer_name=? AND snapshot_date LIKE ?").get(biName, period + "-%");
      return row && row.insp ? Math.round((row.passed / row.insp) * 1000) / 10 : null;
    } catch (e) { return null; }
  }
  return null;
}

function buildItems(db, dentistId, dentistName, period) {
  const defs = db.prepare("SELECT * FROM kpi_dentistas_definitions WHERE active=1 ORDER BY sort_order").all();
  const entries = db.prepare("SELECT * FROM kpi_dentistas_entries WHERE dentist_id=? AND period=?").all(dentistId, period);
  const entryByDef = Object.fromEntries(entries.map(e => [e.definition_id, e]));
  const enteredByIds = [...new Set(entries.map(e => e.entered_by).filter(Boolean))];
  const users = enteredByIds.length
    ? Object.fromEntries(db.prepare(`SELECT id, full_name FROM users WHERE id IN (${enteredByIds.map(() => "?").join(",")})`).all(...enteredByIds).map(u => [u.id, u.full_name]))
    : {};
  const biName = resolveBiName(dentistName);

  return defs.map(def => {
    const auto = AUTO_SOURCED.has(def.id);
    const e = entryByDef[def.id];
    const value = auto ? autoValue(def.id, biName, period) : (e ? e.value : null);
    const pct = pctOf(def, value);
    let status;
    if (auto && !biName) status = "sem_dados_bi";
    else if (def.qualitative) status = e ? "registrado" : "pendente";
    else if (def.target_value == null) status = "meta_a_definir";
    else if (value == null) status = "pendente";
    else status = pct >= 100 ? "atingido" : "abaixo";
    return {
      id: def.id, name: def.name, category: def.category, weight: def.weight,
      targetValue: def.target_value, targetLabel: def.target_label, unit: def.unit,
      higherBetter: !!def.higher_better, qualitative: !!def.qualitative, auto,
      value, note: e ? e.note : null, pct: pct != null ? Math.round(pct * 10) / 10 : null, status,
      enteredBy: auto ? null : (e && e.entered_by ? (users[e.entered_by] || null) : null),
      updatedAt: auto ? null : (e ? e.updated_at : null),
    };
  });
}

// GET /api/kpi-dentistas/roster — líderes marcados com a flag is_dentista.
// Um dentista (não-gestor) só enxerga a si mesmo na lista.
router.get("/roster", requireAuth, requireManagerOrDentista, (req, res) => {
  const db = getDb();
  if (!req.isManager) {
    const me = db.prepare("SELECT id, full_name FROM users WHERE id=?").get(req.user.id);
    return res.json(me ? [{ id: me.id, name: me.full_name }] : []);
  }
  const rows = db.prepare("SELECT id, full_name FROM users WHERE is_dentista=1 AND active=1 ORDER BY full_name").all();
  res.json(rows.map(r => ({ id: r.id, name: r.full_name })));
});

// GET /api/kpi-dentistas?period=2026-07&dentistId=... — scorecard de um
// dentista no período. Não-gestor só enxerga o próprio id.
router.get("/", requireAuth, requireManagerOrDentista, (req, res) => {
  const db = getDb();
  const period = PERIOD_RE.test(req.query.period || "") ? req.query.period : currentPeriod();
  let dentistId = req.query.dentistId;
  if (!req.isManager) dentistId = req.user.id;
  if (!dentistId) return res.status(400).json({ error: "dentistId é obrigatório" });

  const dentist = db.prepare("SELECT id, full_name FROM users WHERE id=? AND is_dentista=1").get(dentistId);
  if (!dentist) return res.status(404).json({ error: "Dentista não encontrado" });

  const items = buildItems(db, dentistId, dentist.full_name, period);
  const feedback = db.prepare("SELECT * FROM kpi_dentistas_feedback WHERE dentist_id=? AND period=?").get(dentistId, period) || null;
  const finalized = db.prepare("SELECT * FROM kpi_dentistas_periods WHERE period=?").get(period) || null;

  res.json({
    period, dentistId, dentistName: dentist.full_name,
    compositeScore: computeComposite(items), items,
    feedback: feedback ? { comments: feedback.comments, updatedAt: feedback.updated_at } : null,
    finalized: finalized ? { at: finalized.finalized_at } : null,
  });
});

// PUT /api/kpi-dentistas/entry — upsert do valor/nota de um indicador
// (indicadores auto-sourced do BI não aceitam edição manual).
router.put("/entry", requireAuth, requireManager, (req, res) => {
  const db = getDb();
  const { definitionId, dentistId, period, value, note } = req.body || {};
  if (!definitionId || !dentistId || !PERIOD_RE.test(period || "")) return res.status(400).json({ error: "definitionId, dentistId e period (AAAA-MM) são obrigatórios" });
  if (AUTO_SOURCED.has(definitionId)) return res.status(400).json({ error: "Este indicador é automático (fonte: BI) — não aceita lançamento manual." });
  const def = db.prepare("SELECT id FROM kpi_dentistas_definitions WHERE id=? AND active=1").get(definitionId);
  if (!def) return res.status(404).json({ error: "Indicador não encontrado" });
  const dentist = db.prepare("SELECT id FROM users WHERE id=? AND is_dentista=1").get(dentistId);
  if (!dentist) return res.status(404).json({ error: "Dentista não encontrado" });

  const existing = db.prepare("SELECT id FROM kpi_dentistas_entries WHERE definition_id=? AND dentist_id=? AND period=?").get(definitionId, dentistId, period);
  if (existing) {
    db.prepare("UPDATE kpi_dentistas_entries SET value=?, note=?, entered_by=?, updated_at=datetime('now') WHERE id=?")
      .run(value ?? null, note ?? null, req.user.id, existing.id);
  } else {
    db.prepare("INSERT INTO kpi_dentistas_entries (id, definition_id, dentist_id, period, value, note, entered_by) VALUES (?,?,?,?,?,?,?)")
      .run(uuidv4(), definitionId, dentistId, period, value ?? null, note ?? null, req.user.id);
  }
  res.json({ ok: true });
});

// PUT /api/kpi-dentistas/feedback
router.put("/feedback", requireAuth, requireManager, (req, res) => {
  const db = getDb();
  const { dentistId, period, comments } = req.body || {};
  if (!dentistId || !PERIOD_RE.test(period || "")) return res.status(400).json({ error: "dentistId e period (AAAA-MM) são obrigatórios" });
  db.prepare(`
    INSERT INTO kpi_dentistas_feedback (dentist_id, period, comments, updated_by, updated_at) VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(dentist_id, period) DO UPDATE SET comments=excluded.comments, updated_by=excluded.updated_by, updated_at=datetime('now')
  `).run(dentistId, period, comments || "", req.user.id);
  res.json({ ok: true });
});

// PUT /api/kpi-dentistas/definitions/:id
router.put("/definitions/:id", requireAuth, requireRole("hr"), (req, res) => {
  const db = getDb();
  const { targetValue, targetLabel, weight } = req.body || {};
  const def = db.prepare("SELECT id FROM kpi_dentistas_definitions WHERE id=?").get(req.params.id);
  if (!def) return res.status(404).json({ error: "Indicador não encontrado" });
  db.prepare("UPDATE kpi_dentistas_definitions SET target_value=COALESCE(?,target_value), target_label=COALESCE(?,target_label), weight=COALESCE(?,weight) WHERE id=?")
    .run(targetValue ?? null, targetLabel ?? null, weight ?? null, req.params.id);
  res.json({ ok: true });
});

// POST /api/kpi-dentistas/finalize
router.post("/finalize", requireAuth, requireManager, (req, res) => {
  const db = getDb();
  const { period } = req.body || {};
  if (!PERIOD_RE.test(period || "")) return res.status(400).json({ error: "period (AAAA-MM) é obrigatório" });

  const already = db.prepare("SELECT 1 FROM kpi_dentistas_periods WHERE period=?").get(period);
  if (already) return res.json({ ok: true, alreadyFinalized: true });

  db.prepare("INSERT INTO kpi_dentistas_periods (period, finalized_by) VALUES (?,?)").run(period, req.user.id);

  const label = periodLabel(period);
  const dentistas = db.prepare("SELECT id FROM users WHERE is_dentista=1 AND active=1").all();
  const stmt = db.prepare("INSERT INTO notifications (id, user_id, type, title, body) VALUES (?,?,?,?,?)");
  db.transaction(() => {
    for (const u of dentistas) {
      stmt.run(uuidv4(), u.id, "kpi_dentistas_finalized", "📋 Resultado do KPI disponível",
        `O resultado de ${label} já está publicado. Confira seu acompanhamento no KPI Dentistas.`);
    }
  })();

  res.json({ ok: true, notified: dentistas.length });
});

// GET /api/kpi-dentistas/report?from=&to=&format=csv|json
router.get("/report", requireAuth, requireManager, (req, res) => {
  const db = getDb();
  const from = PERIOD_RE.test(req.query.from || "") ? req.query.from : currentPeriod();
  const to = PERIOD_RE.test(req.query.to || "") ? req.query.to : from;

  const periods = [];
  let [y, m] = from.split("-").map(Number);
  const [ey, em] = to.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    periods.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }

  const dentistas = db.prepare("SELECT id, full_name FROM users WHERE is_dentista=1 AND active=1 ORDER BY full_name").all();
  const defs = db.prepare("SELECT * FROM kpi_dentistas_definitions WHERE active=1 ORDER BY sort_order").all();

  const rows = [];
  for (const period of periods) {
    for (const dentist of dentistas) {
      const items = buildItems(db, dentist.id, dentist.full_name, period);
      const score = computeComposite(items);
      const row = { dentista: dentist.full_name, periodo: periodLabel(period), periodKey: period, scoreGeral: score };
      for (const def of defs) {
        const it = items.find(i => i.id === def.id);
        row[def.name] = it && it.value != null ? it.value : "";
      }
      rows.push(row);
    }
  }

  if ((req.query.format || "csv") === "json") return res.json(rows);

  const headCols = ["Dentista", "Período", "Score Geral (%)", ...defs.map(d => d.name)];
  const lines = [headCols.join(";")];
  for (const r of rows) {
    const line = [r.dentista, r.periodo, r.scoreGeral ?? "", ...defs.map(d => {
      const v = r[d.name];
      return v === "" || v == null ? "" : String(v).replace(".", ",");
    })];
    lines.push(line.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";"));
  }
  const csv = "﻿" + lines.join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="kpi_dentistas_${from}_a_${to}.csv"`);
  res.send(csv);
});

// POST /api/kpi-dentistas/internal/reminders — cron diário (secret-gated)
router.post("/internal/reminders", (req, res) => {
  const SECRET = process.env.BI_NOTIFY_SECRET;
  if (!SECRET || req.headers["x-internal-secret"] !== SECRET) return res.status(401).json({ error: "Unauthorized" });

  const db = getDb();
  const today = new Date();
  const candidates = [];
  for (const back of [0, 1]) {
    const d = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const daysUntilEnd = Math.round((monthEnd - today) / 86400000);
    candidates.push({ period, label: periodLabel(period), daysUntilEnd });
  }

  const managers = db.prepare("SELECT id FROM users WHERE role IN ('gerencia','hr','ti') AND active=1").all();
  let sent = 0;

  db.transaction(() => {
    for (const c of candidates) {
      if (c.daysUntilEnd > 5) continue;
      const done = db.prepare("SELECT 1 FROM kpi_dentistas_periods WHERE period=?").get(c.period);
      if (done) continue;

      const overdue = c.daysUntilEnd < 0;
      const title = overdue ? "⚠️ KPI Dentistas atrasado" : "⏳ KPI Dentistas — prazo se aproxima";
      const body = overdue
        ? `O preenchimento de ${c.label} venceu há ${-c.daysUntilEnd} dia(s) e ainda não foi finalizado.`
        : `Faltam ${c.daysUntilEnd} dia(s) para o fim de ${c.label} — finalize o preenchimento do KPI Dentistas.`;

      for (const u of managers) {
        const already = db.prepare(`
          SELECT 1 FROM notifications
          WHERE user_id=? AND type='kpi_dentistas_reminder' AND body=? AND date(created_at)=date('now')
        `).get(u.id, body);
        if (already) continue;
        db.prepare("INSERT INTO notifications (id, user_id, type, title, body) VALUES (?,?,?,?,?)")
          .run(uuidv4(), u.id, "kpi_dentistas_reminder", title, body);
        sent++;
      }
    }
  })();

  res.json({ ok: true, sent, candidates });
});

module.exports = router;
