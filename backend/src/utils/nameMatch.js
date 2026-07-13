// Normalize names for matching ShiftSync full_name ↔ BI designer_name
// (accents/casing/whitespace differ between the two sources).
function norm(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
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
// a single letter — covers spelling drift like "Sousa"/"Souza", "Olveira"/"Oliveira".
const simTok = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && lev(a, b) <= 1);
// Same person across ShiftSync ↔ BI. Handles: exact, accents (via norm), name
// truncation (subset), and small spelling differences between the two systems.
function nameMatch(a, b) {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  if (ta.join(" ") === tb.join(" ")) return true;
  if (ta[0] === tb[0] && (subset(ta, tb) || subset(tb, ta))) return true;
  if (ta.length !== tb.length) return false;
  let diffs = 0;
  for (let i = 0; i < ta.length; i++) {
    if (ta[i] === tb[i]) continue;
    if (!simTok(ta[i], tb[i])) return false;
    diffs++;
  }
  return diffs >= 1 && diffs <= 2;
}
module.exports = { norm, nameMatch };
