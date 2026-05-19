// Inline re-sync using batidas route logic
const { getDb } = require("./src/db/init");
const faceum    = require("./src/services/faceum");

const db = getDb();

function normalizeName(n) {
  return (n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function sigWords(name) {
  return normalizeName(name).split(/\s+/).filter(w => w.length > 2);
}
function nameSubsetMatch(nameA, nameB) {
  const wA = sigWords(nameA), wB = sigWords(nameB);
  if (wA.length < 2 || wB.length < 2) return false;
  const [shorter, longer] = wA.length <= wB.length ? [wA, wB] : [wB, wA];
  return shorter.every(w => longer.includes(w));
}

async function run() {
  const from = new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
  const to   = new Date().toISOString().slice(0,10);
  console.log("Range:", from, "->", to);

  const allUsers = db.prepare("SELECT id, full_name FROM users WHERE active=1").all();
  const [clocks, colaboradores] = await Promise.all([
    faceum.getClocks(new Date(from + "T00:00:00-03:00").getTime(), new Date(to + "T23:59:59-03:00").getTime()),
    faceum.getColaboradores(),
  ]);
  console.log("Clocks from Faceum:", clocks.length, "| Colaboradores:", colaboradores.length);

  // Build match maps (exact + subset)
  const faceumByName = new Map(colaboradores.map(c => [normalizeName(c.nome || c.name || ""), c]));
  const userByFaceumCpf  = new Map();
  const userByFaceumName = new Map();

  for (const u of allUsers) {
    let col = faceumByName.get(normalizeName(u.full_name));
    if (!col) {
      for (const c of colaboradores) {
        if (nameSubsetMatch(u.full_name, c.nome || c.name || "")) { col = c; break; }
      }
    }
    if (col) {
      userByFaceumCpf.set(col.cpf, u);
      userByFaceumName.set(normalizeName(col.nome || col.name || ""), u);
    }
  }
  console.log("Users matched to Faceum:", userByFaceumCpf.size);

  const upsert = db.prepare(`
    INSERT INTO ponto_batidas
      (user_id, colaborador_cpf, colaborador_name, event_code, event_name,
       date, recorded_at, time_millis, approval_status, iud, raw_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id, time_millis) DO UPDATE SET
      event_code=excluded.event_code, event_name=excluded.event_name,
      approval_status=excluded.approval_status, synced_at=datetime('now')
  `);

  let matched = 0, unmatched = 0;
  db.transaction(rows => {
    for (const c of rows) {
      const cpf  = (c.colaboradorCpf || c.colaborador?.cpf || "").replace(/\D/g, "");
      const name = normalizeName(c.colaborador?.name || c.colaboradorName || "");
      const user = userByFaceumCpf.get(cpf) || userByFaceumName.get(name) || null;
      if (!user) { unmatched++; continue; }
      matched++;
      const cname   = c.colaborador?.name || c.colaboradorName || user.full_name;
      const dateStr = (c.dateTime || c.zonedDateTime || "").slice(0, 10);
      const timeMs  = c.timeInMillis != null ? c.timeInMillis : (c.dateTime ? new Date(c.dateTime).getTime() : null);
      upsert.run(user.id, cpf, cname, c.eventCode || null, c.event?.name || null,
        dateStr, c.dateTime || c.zonedDateTime, timeMs, c.approvalStatus ?? 0, c.iud || null, JSON.stringify(c));
    }
  })(clocks);

  const empCount = db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM ponto_batidas b JOIN users u ON u.id=b.user_id WHERE u.role='employee'").get();
  console.log("Done — matched:", matched, "unmatched:", unmatched);
  console.log("Distinct employees with records:", empCount.c);
}

run().catch(e => console.error("Error:", e.message));
