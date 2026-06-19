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

const PTM = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function prevMonthStr(mo) {
  const [y, m] = mo.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}`;
}
// Normalize names for matching ShiftSync full_name ↔ BI designer_name
// (accents/casing/whitespace differ between the two sources).
function norm(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
const nameTokens = (s) => norm(s).split(" ").filter(Boolean);
const subset = (a, b) => a.every(t => b.includes(t));
// Same person across ShiftSync \u2194 BI: same normalized name, OR same first name
// and one token-set contained in the other (e.g. "Alvaro Calzolari de Araujo"
// \u2194 "Alvaro Calzolari"). Safe because there are no homonyms in the roster.
function nameMatch(a, b) {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  if (ta.join(" ") === tb.join(" ")) return true;
  if (ta[0] !== tb[0]) return false;
  return subset(ta, tb) || subset(tb, ta);
}
function trendOf(arr) {
  const v = arr.filter(x => x != null);
  if (v.length < 3) return "flat";
  const k = Math.max(1, Math.floor(v.length / 3));
  const h = v.slice(0, k).reduce((a, b) => a + b, 0) / k;
  const t = v.slice(-k).reduce((a, b) => a + b, 0) / k;
  const df = t - h;
  return Math.abs(df) < (Math.abs(h) * 0.02 + 0.05) ? "flat" : df > 0 ? "up" : "down";
}

// Build the full personal-indicators bundle for one designer (used by /me and
// by /person for the management drill-down). Returns the response object.
function buildPersonBundle(d, inputName) {
  let name = inputName;
  // Identity + the month we report on (latest month the person has productivity data)
  let idn = d.prepare(
    "SELECT group_no, job_level, MAX(snapshot_date) AS last FROM productivity WHERE designer_name=?"
  ).get(name);
  // Fallback: resolve the BI name when it differs slightly from full_name
  if (!idn || !idn.last) {
    const alt = d.prepare("SELECT DISTINCT designer_name n FROM productivity").all()
      .map(r => r.n).find(n => nameMatch(name, n));
    if (alt) {
      name = alt;
      idn = d.prepare("SELECT group_no, job_level, MAX(snapshot_date) AS last FROM productivity WHERE designer_name=?").get(name);
    }
  }
  if (!idn || !idn.last) return { hasData: false, name };

  {
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

    return {
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
    };
  }
}

// Can `userId` (with `role`) view the indicators of `targetName`?
// Gestor sees anyone; a leader sees the members of the team(s) they lead.
function canSeePerson(ss, userId, role, targetName) {
  if (new Set(["gerencia", "hr", "ti"]).has(role)) return true;
  const led = ss.prepare(`
    SELECT g.id FROM groups g WHERE g.leader_id = ?
    UNION
    SELECT g.id FROM groups g JOIN group_co_leaders cl ON cl.group_id = g.id WHERE cl.user_id = ?
  `).all(userId, userId);
  if (!led.length) return false;
  const ids = led.map(g => g.id);
  const ph = ids.map(() => "?").join(",");
  const members = ss.prepare(
    `SELECT DISTINCT u.full_name fn FROM group_members gm JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id IN (${ph}) AND u.full_name IS NOT NULL AND u.full_name != ''`
  ).all(...ids).map(r => r.fn);
  return members.some(m => nameMatch(m, targetName));
}

// GET /api/indicators/me — personal indicators for the logged-in user only.
router.get("/me", requireAuth, (req, res) => {
  const user = getDb().prepare("SELECT full_name FROM users WHERE id=?").get(req.user.id);
  if (!user || !user.full_name) return res.status(404).json({ error: "Usuário não encontrado" });
  let d;
  try { d = bi(); } catch (e) { return res.status(503).json({ error: "Base do BI indisponível" }); }
  try { return res.json(buildPersonBundle(d, user.full_name)); }
  catch (e) { console.error("[indicators]", e.message); return res.status(500).json({ error: "Falha ao calcular indicadores" }); }
});

// GET /api/indicators/person?name= — detailed individual panel for a manager/leader.
router.get("/person", requireAuth, (req, res) => {
  const targetName = (req.query.name || "").trim();
  if (!targetName) return res.status(400).json({ error: "Nome não informado" });
  const ss = getDb();
  const me = ss.prepare("SELECT role FROM users WHERE id=?").get(req.user.id);
  if (!me) return res.status(404).json({ error: "Usuário não encontrado" });
  if (!canSeePerson(ss, req.user.id, me.role, targetName))
    return res.status(403).json({ error: "Sem permissão para ver este colaborador" });
  let d;
  try { d = bi(); } catch (e) { return res.status(503).json({ error: "Base do BI indisponível" }); }
  try { return res.json(buildPersonBundle(d, targetName)); }
  catch (e) { console.error("[indicators/person]", e.message); return res.status(500).json({ error: "Falha ao calcular indicadores" }); }
});

// GET /api/indicators/team — lightweight list of people the logged-in user may
// open in the personal-indicators page (gestor: everyone; leader: their team).
router.get("/team", requireAuth, (req, res) => {
  const ss = getDb();
  const me = ss.prepare("SELECT role FROM users WHERE id=?").get(req.user.id);
  if (!me) return res.json({ canManage: false, people: [] });

  let d;
  try { d = bi(); } catch (e) { return res.json({ canManage: false, people: [] }); }
  const latRow = d.prepare("SELECT MAX(snapshot_date) m FROM productivity WHERE quota>0").get();
  if (!latRow || !latRow.m) return res.json({ canManage: false, people: [] });
  const latest = latRow.m.slice(0, 7);
  const desigs = d.prepare(
    "SELECT DISTINCT designer_name name, group_no grp, job_level lvl FROM productivity WHERE snapshot_date LIKE ? AND quota>0 ORDER BY group_no, designer_name"
  ).all(latest + "-%");

  if (new Set(["gerencia", "hr", "ti"]).has(me.role)) {
    return res.json({ canManage: true, scope: "gestor", people: desigs });
  }
  const led = ss.prepare(`
    SELECT g.id FROM groups g WHERE g.leader_id = ?
    UNION
    SELECT g.id FROM groups g JOIN group_co_leaders cl ON cl.group_id = g.id WHERE cl.user_id = ?
  `).all(req.user.id, req.user.id);
  if (!led.length) return res.json({ canManage: false, people: [] });
  const ids = led.map(g => g.id);
  const ph = ids.map(() => "?").join(",");
  const members = ss.prepare(
    `SELECT DISTINCT u.full_name fn FROM group_members gm JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id IN (${ph}) AND u.full_name IS NOT NULL AND u.full_name != ''`
  ).all(...ids).map(r => r.fn);
  const people = desigs.filter(x => members.some(m => nameMatch(m, x.name)));
  return res.json({ canManage: people.length > 0, scope: "lider", people });
});

// GET /api/indicators/overview — management view.
// Gestor (gerencia/hr/ti) sees everyone; a leader sees the members of the
// team(s) they lead; anyone else is denied (they only get /me).
router.get("/overview", requireAuth, (req, res) => {
  const ss = getDb();
  const me = ss.prepare("SELECT id, full_name, role FROM users WHERE id=?").get(req.user.id);
  if (!me) return res.status(404).json({ error: "Usuário não encontrado" });

  const GESTOR = new Set(["gerencia", "hr", "ti"]);
  let scope, scopeLabel, memberNames = null;

  if (GESTOR.has(me.role)) {
    scope = "gestor";
    scopeLabel = "Todas as equipes";
  } else {
    // Teams the user leads (as leader or co-leader)
    const led = ss.prepare(`
      SELECT g.id, g.name FROM groups g WHERE g.leader_id = ?
      UNION
      SELECT g.id, g.name FROM groups g
        JOIN group_co_leaders cl ON cl.group_id = g.id WHERE cl.user_id = ?
    `).all(req.user.id, req.user.id);
    if (!led.length) return res.status(403).json({ error: "Você não tem visão de gestão" });
    scope = "lider";
    scopeLabel = led.map(g => g.name).join(" · ");
    const ids = led.map(g => g.id);
    const ph = ids.map(() => "?").join(",");
    const members = ss.prepare(
      `SELECT DISTINCT u.full_name fn FROM group_members gm JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id IN (${ph}) AND u.full_name IS NOT NULL AND u.full_name != ''`
    ).all(...ids);
    memberNames = members.map(m => m.fn);
  }

  let d;
  try { d = bi(); } catch (e) { return res.status(503).json({ error: "Base do BI indisponível" }); }

  try {
    const latRow = d.prepare("SELECT MAX(snapshot_date) m FROM productivity WHERE quota>0").get();
    if (!latRow || !latRow.m) return res.json({ scope, scopeLabel, role: me.role, people: [] });
    const latest = latRow.m.slice(0, 7);
    const pm = prevMonthStr(latest);
    const monthLabel = PTM[+latest.slice(5, 7) - 1] + "/" + latest.slice(0, 4);

    let desigs = d.prepare(
      "SELECT DISTINCT designer_name name, group_no grp, job_level lvl FROM productivity WHERE snapshot_date LIKE ? AND quota>0"
    ).all(latest + "-%");
    if (memberNames) desigs = desigs.filter(x => memberNames.some(mn => nameMatch(mn, x.name)));

    const rankCache = {};
    const rankMap = (grp) => {
      if (rankCache[grp]) return rankCache[grp];
      const rows = d.prepare(
        "SELECT designer_name name, AVG(progress)*100 ap FROM productivity WHERE group_no=? AND snapshot_date LIKE ? AND quota>0 GROUP BY designer_name ORDER BY ap DESC"
      ).all(grp, latest + "-%");
      const map = {}; rows.forEach((r, i) => { map[r.name] = i + 1; });
      return (rankCache[grp] = { map, size: rows.length });
    };

    const people = desigs.map(x => {
      const a = d.prepare(
        "SELECT AVG(progress)*100 pct, SUM(new_case_count+mod_count+refinement_count) cases FROM productivity WHERE designer_name=? AND snapshot_date LIKE ? AND quota>0"
      ).get(x.name, latest + "-%");
      const ap = d.prepare(
        "SELECT AVG(progress)*100 pct FROM productivity WHERE designer_name=? AND snapshot_date LIKE ? AND quota>0"
      ).get(x.name, pm + "-%");
      const q = d.prepare(
        "SELECT avg_score score, score_qty qty FROM quality_designer WHERE designer_name=? AND period_type='month' AND snapshot_date LIKE ? ORDER BY snapshot_date DESC LIMIT 1"
      ).get(x.name, latest + "-%");
      const wk = d.prepare(
        "SELECT COALESCE(qty_low_score,0) low, COALESCE(score_qty,0) qty FROM quality_designer WHERE designer_name=? AND period_type='week' ORDER BY snapshot_date DESC LIMIT 12"
      ).all(x.name);
      const low = wk.reduce((s, r) => s + r.low, 0), lqty = wk.reduce((s, r) => s + r.qty, 0);
      const dseries = d.prepare(
        "SELECT ROUND(progress*100) p FROM productivity WHERE designer_name=? AND snapshot_date LIKE ? AND quota>0 ORDER BY snapshot_date"
      ).all(x.name, latest + "-%").map(r => r.p);
      const qseries = d.prepare(
        "SELECT avg_score s FROM quality_designer WHERE designer_name=? AND period_type='week' ORDER BY snapshot_date DESC LIMIT 12"
      ).all(x.name).reverse().map(r => r.s);
      const rm = rankMap(x.grp);
      return {
        name: x.name, grp: x.grp, lvl: x.lvl,
        pct: round(a.pct), deltaPct: ap && ap.pct != null ? round(a.pct - ap.pct) : null,
        rank: rm.map[x.name] || null, groupSize: rm.size,
        score: q ? round(q.score, 2) : null, qty: q ? q.qty : 0,
        lowRatePct: lqty ? Number((low / lqty * 100).toFixed(1)) : 0, lowTotal: low,
        cases: a.cases || 0, prodTrend: trendOf(dseries), qTrend: trendOf(qseries),
      };
    });

    res.json({ scope, scopeLabel, role: me.role, monthLabel, people });
  } catch (e) {
    console.error("[indicators/overview]", e.message);
    res.status(500).json({ error: "Falha ao calcular a visão de gestão" });
  }
});

module.exports = router;
