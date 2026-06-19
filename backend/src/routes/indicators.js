const express = require("express");
const router = express.Router();
const Database = require("better-sqlite3");
const { requireAuth } = require("../middleware/auth");
const { getDb } = require("../db/init");

// Read-only handle to the BI database (mounted from the shiftsync-bi volume).
const BI_PATH = process.env.BI_DB_PATH || "/bi-data/bi.db";
let _bi = null;
function bi() {
  if (_bi) return _bi;
  // Prefer read-only; fall back to a normal handle if the WAL -shm can't be
  // opened read-only. Either way this route only issues SELECTs.
  try { _bi = new Database(BI_PATH, { readonly: true, fileMustExist: true }); }
  catch { _bi = new Database(BI_PATH, { fileMustExist: true }); }
  return _bi;
}

const round = (v, d = 0) => (v == null ? null : Number(v.toFixed(d)));

// GET /api/indicators/me — personal indicators for the logged-in user only.
router.get("/me", requireAuth, (req, res) => {
  const user = getDb().prepare("SELECT full_name FROM users WHERE id=?").get(req.user.id);
  if (!user || !user.full_name) return res.status(404).json({ error: "Usuário não encontrado" });
  const name = user.full_name;

  let d;
  try { d = bi(); } catch (e) { return res.status(503).json({ error: "Base do BI indisponível" }); }

  try {
    // Identity + the month we report on (latest month the person has productivity data)
    const idn = d.prepare(
      "SELECT group_no, job_level, MAX(snapshot_date) AS last FROM productivity WHERE designer_name=?"
    ).get(name);
    if (!idn || !idn.last) return res.json({ hasData: false, name });

    const group = idn.group_no;
    const month = idn.last.slice(0, 7);                       // YYYY-MM
    const prevMonth = (() => {
      const [y, m] = month.split("-").map(Number);
      const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
      return `${py}-${String(pm).padStart(2, "0")}`;
    })();

    // ── Productivity (attainment / volume) ───────────────────────────────────
    const monthAgg = (mo) => d.prepare(`
      SELECT COUNT(*) days, SUM(completed) comp, AVG(quota) quotaDay, AVG(progress)*100 pct,
             SUM(new_case_count) nc, SUM(mod_count) mod, SUM(refinement_count) ref
      FROM productivity WHERE designer_name=? AND snapshot_date LIKE ? AND quota>0
    `).get(name, mo + "-%");
    const cur = monthAgg(month), prev = monthAgg(prevMonth);

    const dailyProd = d.prepare(`
      SELECT substr(snapshot_date,9,2) day, ROUND(progress*100) pct
      FROM productivity WHERE designer_name=? AND snapshot_date LIKE ? AND quota>0 ORDER BY snapshot_date
    `).all(name, month + "-%").map(r => [r.day, r.pct]);

    // Group comparatives + rank (this month, by avg attainment)
    const comp = d.prepare(`
      WITH r AS (
        SELECT designer_name, AVG(progress)*100 ap FROM productivity
        WHERE group_no=? AND snapshot_date LIKE ? AND quota>0 GROUP BY designer_name
      )
      SELECT AVG(ap) avg, MAX(ap) best, COUNT(*) total,
             (SELECT COUNT(*) FROM r WHERE ap > (SELECT ap FROM r WHERE designer_name=?))+1 rank
      FROM r
    `).get(group, month + "-%", name);

    // ── Quality ──────────────────────────────────────────────────────────────
    const qMonth = (idx) => d.prepare(`
      SELECT avg_score score, score_qty qty, prop_low_score low
      FROM quality_designer WHERE designer_name=? AND period_type='month'
      ORDER BY snapshot_date DESC LIMIT 1 OFFSET ?
    `).get(name, idx);
    const qCur = qMonth(0), qPrev = qMonth(1);

    const weeklyQual = d.prepare(`
      SELECT snapshot_date date, ROUND(avg_score,2) score, score_qty qty
      FROM quality_designer WHERE designer_name=? AND period_type='week'
      ORDER BY snapshot_date DESC LIMIT 12
    `).all(name).reverse().map(r => [r.date, r.score]);

    // "Sem nota baixa" — streak de semanas mais recentes com zero notas baixas.
    // A qualidade é agregada por semana (não por caso), então a métrica é em semanas.
    const lowWeeks = d.prepare(
      "SELECT COALESCE(qty_low_score,0) low FROM quality_designer WHERE designer_name=? AND period_type='week' ORDER BY snapshot_date DESC"
    ).all(name).map(r => r.low);
    let streakNoLow = 0;
    for (const lw of lowWeeks) { if (lw === 0) streakNoLow++; else break; }
    const lastLowWeeksAgo = lowWeeks.findIndex(lw => lw > 0); // -1 = nunca
    const cleanWeeks = lowWeeks.filter(lw => lw === 0).length;

    const qComp = d.prepare(`
      SELECT AVG(avg_score) avg, MAX(avg_score) best
      FROM quality_designer WHERE group_no=? AND period_type='month'
    `).get(group);

    // Trend helper: compare the average of the first vs last third of a series
    const trend = (arr) => {
      const v = arr.map(x => x[1]).filter(x => x != null);
      if (v.length < 3) return "flat";
      const k = Math.max(1, Math.floor(v.length / 3));
      const head = v.slice(0, k).reduce((a, b) => a + b, 0) / k;
      const tail = v.slice(-k).reduce((a, b) => a + b, 0) / k;
      const diff = tail - head;
      return Math.abs(diff) < (Math.abs(head) * 0.02 + 0.05) ? "flat" : diff > 0 ? "up" : "down";
    };

    res.json({
      hasData: true,
      name, group, level: idn.job_level, month,
      attainment: {
        pct: round(cur.pct), completed: round(cur.comp, 1), days: cur.days, quotaDay: round(cur.quotaDay, 1),
        deltaPct: prev?.pct != null ? round(cur.pct - prev.pct) : null,
        trend: trend(dailyProd),
        groupAvg: round(comp.avg), groupBest: round(comp.best), rank: comp.rank, groupSize: comp.total,
      },
      quality: qCur ? {
        score: round(qCur.score, 2), qty: qCur.qty, lowPct: round(qCur.low * 100),
        delta: qPrev?.score != null ? round(qCur.score - qPrev.score, 2) : null,
        trend: trend(weeklyQual),
        groupAvg: round(qComp?.avg, 2), groupBest: round(qComp?.best, 2),
        streakNoLow, cleanWeeks, totalWeeks: lowWeeks.length,
        lastLowWeeksAgo: lastLowWeeksAgo < 0 ? null : lastLowWeeksAgo,
      } : null,
      cases: { new: cur.nc || 0, mod: cur.mod || 0, ref: cur.ref || 0 },
      dailyProd, weeklyQual,
    });
  } catch (e) {
    console.error("[indicators]", e.message);
    res.status(500).json({ error: "Falha ao calcular indicadores" });
  }
});

module.exports = router;
