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
function lev(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 1) return 9;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
// Two name tokens are "the same" if equal, or (both reasonably long) differ by
// a single letter \u2014 covers spelling drift like "Sousa"/"Souza", "Olveira"/"Oliveira".
const simTok = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && lev(a, b) <= 1);
// Same person across ShiftSync \u2194 BI. Handles: exact, accents (via norm), name
// truncation (subset, e.g. "Alvaro Calzolari" \u2194 "...de Araujo"), and small
// spelling differences between the two systems. Validated against the full
// roster with zero collisions; safe because there are no homonyms.
function nameMatch(a, b) {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  if (ta.join(" ") === tb.join(" ")) return true;
  if (ta[0] === tb[0] && (subset(ta, tb) || subset(tb, ta))) return true;
  // positional fuzzy: same token count, up to 2 long tokens differ by \u22641 letter
  if (ta.length !== tb.length) return false;
  let diffs = 0;
  for (let i = 0; i < ta.length; i++) {
    if (ta[i] === tb[i]) continue;
    if (!simTok(ta[i], tb[i])) return false;
    diffs++;
  }
  return diffs >= 1 && diffs <= 2;
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
// Quality-only panel for people without a design quota (e.g. QC reviewers):
// they have quality_designer records but no productivity. attainment/volume are
// null; the frontend hides those blocks and shows the quality side.
function qualityOnlyBundle(d, inputName) {
  let name = inputName;
  if (!d.prepare("SELECT 1 FROM quality_designer WHERE designer_name=? LIMIT 1").get(name)) {
    const alt = d.prepare("SELECT DISTINCT designer_name n FROM quality_designer").all().map(r => r.n).find(n => nameMatch(name, n));
    if (alt) name = alt;
  }
  const idn = d.prepare("SELECT group_no, position FROM quality_designer WHERE designer_name=? ORDER BY snapshot_date DESC LIMIT 1").get(name);
  if (!idn) return { hasData: false, name };
  const group = idn.group_no;
  const months = d.prepare("SELECT DISTINCT substr(snapshot_date,1,7) m FROM quality_designer WHERE designer_name=? AND period_type='month' ORDER BY m").all(name).map(r => r.m);
  if (!months.length) return { hasData: false, name };
  const latest = months[months.length - 1];
  const MN = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const cap = (s) => s.replace(/^./, c => c.toUpperCase());
  const dm = (ds) => ds.slice(8, 10) + "/" + ds.slice(5, 7);
  const trend = (arr) => trendOf(arr.map(x => (x && typeof x === "object" ? x.score : x)));
  const weeksLike = (like) => d.prepare("SELECT snapshot_date date, period_label label, ROUND(avg_score,2) score, COALESCE(score_qty,0) qty, COALESCE(qty_low_score,0) low, COALESCE(qty_unfit,0) unfit FROM quality_designer WHERE designer_name=? AND period_type='week' AND snapshot_date LIKE ? ORDER BY snapshot_date").all(name, like).map(r => { const m = (r.label || "").match(/\((\d{2})(\d{2})～(\d{2})(\d{2})\)/); const wk = (r.label || "").match(/w(\d+)/); return { date: r.date, week: wk ? ("S" + wk[1]) : "", range: m ? (m[2] + "/" + m[1] + "–" + m[4] + "/" + m[3]) : dm(r.date), score: r.score, qty: r.qty, low: r.low, unfit: r.unfit }; });
  const qMonthLike = (like) => d.prepare("SELECT avg_score score, score_qty qty FROM quality_designer WHERE designer_name=? AND period_type='month' AND snapshot_date LIKE ? ORDER BY snapshot_date DESC LIMIT 1").get(name, like);
  const qGroupLike = (like) => d.prepare("SELECT AVG(avg_score) avg, MAX(avg_score) best FROM quality_designer WHERE group_no=? AND period_type='month' AND snapshot_date LIKE ?").get(group, like);
  const lowAgg = (weeks) => { const total = weeks.reduce((s, w) => s + w.low, 0), totalQty = weeks.reduce((s, w) => s + w.qty, 0), totalUnfit = weeks.reduce((s, w) => s + w.unfit, 0); const wlow = weeks.filter(w => w.low > 0).length; let streak = 0; for (let i = weeks.length - 1; i >= 0; i--) { if (weeks[i].low === 0) streak++; else break; } let lastAgo = null; for (let i = weeks.length - 1, k = 0; i >= 0; i--, k++) { if (weeks[i].low > 0) { lastAgo = k; break; } } return { total, totalQty, totalUnfit, lowRatePct: totalQty ? Number((total / totalQty * 100).toFixed(1)) : 0, weeksWithLow: wlow, totalWeeks: weeks.length, streakNoLow: streak, lastLowWeeksAgo: lastAgo }; };
  const prevMo = (mo) => prevMonthStr(mo);
  const qBundle = (mo) => {
    const like = mo + "-%";
    const qc = qMonthLike(like), qp = qMonthLike(prevMo(mo) + "-%"), qg = qGroupLike(like);
    const weeks = weeksLike(like);
    return {
      periodLabel: cap(MN[+mo.slice(5, 7) - 1]) + "/" + mo.slice(0, 4), monthShort: PTM[+mo.slice(5, 7) - 1], month: mo, isLatest: mo === latest,
      attainment: null,
      quality: qc ? { score: round(qc.score, 2), qty: qc.qty, delta: qp && qp.score != null ? round(qc.score - qp.score, 2) : null, groupAvg: round(qg ? qg.avg : null, 2), groupBest: round(qg ? qg.best : null, 2), trend: trend(weeks) } : null,
      lowScore: lowAgg(weeks), cases: { new: 0, mod: 0, ref: 0 }, dailyProd: [], weeklyProd: [], weeklyLow: weeks,
    };
  };
  const recent = months.slice(-6).reverse();
  const byMonth = {}, monthsMeta = [];
  recent.forEach(mo => { byMonth[mo] = qBundle(mo); monthsMeta.push({ key: mo, label: byMonth[mo].monthShort, full: byMonth[mo].periodLabel, isLatest: mo === latest }); });
  const qualityMonthly = months.map(mo => { const q = qMonthLike(mo + "-%"); const w = weeksLike(mo + "-%"); const low = w.reduce((s, x) => s + x.low, 0), unf = w.reduce((s, x) => s + x.unfit, 0); return { date: mo + "-15", range: PTM[+mo.slice(5, 7) - 1], week: "", score: q ? round(q.score, 2) : null, qty: q ? q.qty : 0, low, unfit: unf }; }).filter(x => x.score != null);
  const weeklyLowAll = weeksLike("%");
  const qAll = d.prepare("SELECT AVG(avg_score) score, SUM(score_qty) qty FROM quality_designer WHERE designer_name=? AND period_type='month'").get(name);
  const qgAll = d.prepare("SELECT AVG(avg_score) avg, MAX(avg_score) best FROM quality_designer WHERE group_no=? AND period_type='month'").get(group);
  const monthly = {
    periodLabel: "Acumulado · " + PTM[+months[0].slice(5, 7) - 1] + "–" + PTM[+latest.slice(5, 7) - 1] + "/" + latest.slice(0, 4),
    attainment: null,
    quality: qAll && qAll.score != null ? { score: round(qAll.score, 2), qty: qAll.qty, delta: null, groupAvg: round(qgAll ? qgAll.avg : null, 2), groupBest: round(qgAll ? qgAll.best : null, 2), trend: trend(qualityMonthly) } : null,
    lowScore: lowAgg(weeklyLowAll), cases: { new: 0, mod: 0, ref: 0 }, monthsSeries: [], qualityMonthly, weeklyLowAll,
  };
  return { hasData: true, mode: "quality", name, group, level: idn.position || "QC", latest, monthsMeta, byMonth, monthly };
}

function buildPersonBundle(d, inputName) {
  let name = inputName;
  // Resolve the BI name (exact, else accent/subset match)
  if (!d.prepare("SELECT 1 FROM productivity WHERE designer_name=? LIMIT 1").get(name)) {
    const alt = d.prepare("SELECT DISTINCT designer_name n FROM productivity").all().map(r => r.n).find(n => nameMatch(name, n));
    if (alt) name = alt;
  }
  const idn = d.prepare("SELECT group_no, job_level FROM productivity WHERE designer_name=? ORDER BY snapshot_date DESC LIMIT 1").get(name);
  if (!idn) return qualityOnlyBundle(d, inputName);   // no productivity → try a quality-only panel (e.g. QC reviewers)
  const group = idn.group_no;
  const months = d.prepare("SELECT DISTINCT substr(snapshot_date,1,7) m FROM productivity WHERE designer_name=? AND quota>0 ORDER BY m").all(name).map(r => r.m);
  if (!months.length) return qualityOnlyBundle(d, inputName);
  const latest = months[months.length - 1];

  const dm = (ds) => ds.slice(8, 10) + "/" + ds.slice(5, 7);
  const MN = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const cap = (s) => s.replace(/^./, c => c.toUpperCase());
  const trend = (arr) => trendOf(arr.map(x => Array.isArray(x) ? x[1] : (x && typeof x === "object" ? x.score : x)));

  const aggLike = (like) => d.prepare("SELECT COUNT(*) days, SUM(completed) comp, AVG(progress)*100 pct, SUM(new_case_count) nc, SUM(mod_count) mod, SUM(refinement_count) ref FROM productivity WHERE designer_name=? AND snapshot_date LIKE ? AND quota>0").get(name, like);
  const rankLike = (like) => d.prepare("WITH r AS (SELECT designer_name, AVG(progress)*100 ap FROM productivity WHERE group_no=? AND snapshot_date LIKE ? AND quota>0 GROUP BY designer_name) SELECT AVG(ap) avg, MAX(ap) best, COUNT(*) total, (SELECT COUNT(*) FROM r WHERE ap>(SELECT ap FROM r WHERE designer_name=?))+1 rank FROM r").get(group, like, name);
  const dailyLike = (like) => d.prepare("SELECT substr(snapshot_date,9,2) day, ROUND(progress*100) pct FROM productivity WHERE designer_name=? AND snapshot_date LIKE ? AND quota>0 ORDER BY snapshot_date").all(name, like).map(r => [r.day, r.pct]);
  const weeklyProdLike = (like) => d.prepare("SELECT MIN(snapshot_date) ws, MAX(snapshot_date) we, ROUND(AVG(progress)*100) pct, COUNT(*) days FROM productivity WHERE designer_name=? AND snapshot_date LIKE ? AND quota>0 GROUP BY strftime('%Y-%W',snapshot_date) ORDER BY ws").all(name, like).map(r => [dm(r.ws) + "–" + dm(r.we), r.pct, r.days]);
  const weeksLike = (like) => d.prepare("SELECT snapshot_date date, period_label label, ROUND(avg_score,2) score, COALESCE(score_qty,0) qty, COALESCE(qty_low_score,0) low, COALESCE(qty_unfit,0) unfit FROM quality_designer WHERE designer_name=? AND period_type='week' AND snapshot_date LIKE ? ORDER BY snapshot_date").all(name, like).map(r => { const m = (r.label || "").match(/\((\d{2})(\d{2})～(\d{2})(\d{2})\)/); const wk = (r.label || "").match(/w(\d+)/); return { date: r.date, week: wk ? ("S" + wk[1]) : "", range: m ? (m[2] + "/" + m[1] + "–" + m[4] + "/" + m[3]) : dm(r.date), score: r.score, qty: r.qty, low: r.low, unfit: r.unfit }; });
  const qMonthLike = (like) => d.prepare("SELECT avg_score score, score_qty qty FROM quality_designer WHERE designer_name=? AND period_type='month' AND snapshot_date LIKE ? ORDER BY snapshot_date DESC LIMIT 1").get(name, like);
  const qGroupLike = (like) => d.prepare("SELECT AVG(avg_score) avg, MAX(avg_score) best FROM quality_designer WHERE group_no=? AND period_type='month' AND snapshot_date LIKE ?").get(group, like);
  const lowAgg = (weeks) => { const total = weeks.reduce((s, w) => s + w.low, 0), totalQty = weeks.reduce((s, w) => s + w.qty, 0), totalUnfit = weeks.reduce((s, w) => s + w.unfit, 0); const wlow = weeks.filter(w => w.low > 0).length; let streak = 0; for (let i = weeks.length - 1; i >= 0; i--) { if (weeks[i].low === 0) streak++; else break; } let lastAgo = null; for (let i = weeks.length - 1, k = 0; i >= 0; i--, k++) { if (weeks[i].low > 0) { lastAgo = k; break; } } return { total, totalQty, totalUnfit, lowRatePct: totalQty ? Number((total / totalQty * 100).toFixed(1)) : 0, weeksWithLow: wlow, totalWeeks: weeks.length, streakNoLow: streak, lastLowWeeksAgo: lastAgo }; };

  const monthBundle = (mo) => {
    const like = mo + "-%", pm = prevMonthStr(mo);
    const cur = aggLike(like), prev = aggLike(pm + "-%");
    const comp = rankLike(like), compPrev = rankLike(pm + "-%");
    const daily = dailyLike(like), weeklyProd = weeklyProdLike(like);
    const qc = qMonthLike(like), qp = qMonthLike(pm + "-%"), qg = qGroupLike(like);
    const weeks = weeksLike(like);
    return {
      periodLabel: cap(MN[+mo.slice(5, 7) - 1]) + "/" + mo.slice(0, 4), monthShort: PTM[+mo.slice(5, 7) - 1], month: mo, isLatest: mo === latest,
      attainment: { pct: round(cur.pct), deltaPct: prev && prev.pct != null ? round(cur.pct - prev.pct) : null, completed: round(cur.comp, 1), days: cur.days, groupAvg: round(comp.avg), groupBest: round(comp.best), rank: comp.rank, groupSize: comp.total, rankPrev: compPrev ? compPrev.rank : null, trend: trend(daily) },
      quality: qc ? { score: round(qc.score, 2), qty: qc.qty, delta: qp && qp.score != null ? round(qc.score - qp.score, 2) : null, groupAvg: round(qg ? qg.avg : null, 2), groupBest: round(qg ? qg.best : null, 2), trend: trend(weeks) } : null,
      lowScore: lowAgg(weeks), cases: { new: cur.nc || 0, mod: cur.mod || 0, ref: cur.ref || 0 },
      dailyProd: daily, weeklyProd, weeklyLow: weeks,
    };
  };

  const recent = months.slice(-6).reverse();
  const byMonth = {}, monthsMeta = [];
  recent.forEach(mo => { byMonth[mo] = monthBundle(mo); monthsMeta.push({ key: mo, label: byMonth[mo].monthShort, full: byMonth[mo].periodLabel, isLatest: mo === latest }); });

  const curAll = aggLike("%"), compAll = rankLike("%");
  const monthsSeries = months.map(mo => [PTM[+mo.slice(5, 7) - 1], round(aggLike(mo + "-%").pct)]);
  const qualityMonthly = months.map(mo => { const q = qMonthLike(mo + "-%"); const w = weeksLike(mo + "-%"); const low = w.reduce((s, x) => s + x.low, 0), unf = w.reduce((s, x) => s + x.unfit, 0); return { date: mo + "-15", range: PTM[+mo.slice(5, 7) - 1], week: "", score: q ? round(q.score, 2) : null, qty: q ? q.qty : 0, low, unfit: unf }; }).filter(x => x.score != null);
  const weeklyLowAll = weeksLike("%");
  const qAll = d.prepare("SELECT AVG(avg_score) score, SUM(score_qty) qty FROM quality_designer WHERE designer_name=? AND period_type='month'").get(name);
  const qgAll = d.prepare("SELECT AVG(avg_score) avg, MAX(avg_score) best FROM quality_designer WHERE group_no=? AND period_type='month'").get(group);
  const monthly = {
    periodLabel: "Acumulado · " + PTM[+months[0].slice(5, 7) - 1] + "–" + PTM[+latest.slice(5, 7) - 1] + "/" + latest.slice(0, 4),
    attainment: { pct: round(curAll.pct), deltaPct: null, completed: round(curAll.comp, 1), days: curAll.days, groupAvg: round(compAll.avg), groupBest: round(compAll.best), rank: compAll.rank, groupSize: compAll.total, rankPrev: null, trend: trend(monthsSeries) },
    quality: qAll && qAll.score != null ? { score: round(qAll.score, 2), qty: qAll.qty, delta: null, groupAvg: round(qgAll ? qgAll.avg : null, 2), groupBest: round(qgAll ? qgAll.best : null, 2), trend: trend(qualityMonthly) } : null,
    lowScore: lowAgg(weeklyLowAll), cases: { new: curAll.nc || 0, mod: curAll.mod || 0, ref: curAll.ref || 0 },
    monthsSeries, qualityMonthly, weeklyLowAll,
  };

  return { hasData: true, name, group, level: idn.job_level, latest, monthsMeta, byMonth, monthly };
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
