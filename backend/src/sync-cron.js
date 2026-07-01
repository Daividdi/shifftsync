const cron = require("node-cron");
const { ldapListUsers } = require("./config/ldap");
const { getDb } = require("./db/init");
const { v4: uuidv4 } = require("uuid");

// Regras de cargo por departamento
const DEPT_TITLE_RULES = [
  { match: "doctors",            title: "Design Doctor"      },
  { match: "technicians",        title: "Designer"           },
  { match: "treatment planning", title: "Team Leader Design" },
];

// Roles protegidos — nunca serão desativados pelo sync
const PROTECTED_ROLES = ["ti", "hr", "gerencia"];

function resolveTitle(dept, ldapTitle) {
  if (!dept) return ldapTitle || null;
  const deptLower = dept.toLowerCase();
  for (const rule of DEPT_TITLE_RULES) {
    if (deptLower.includes(rule.match.toLowerCase())) return rule.title;
  }
  return ldapTitle || null;
}

async function syncLdapUsers() {
  console.log("[LDAP Sync] Iniciando sincronizacao...");
  try {
    const ldapUsers = await ldapListUsers();
    const db = getDb();

    const upsert = db.prepare(`
      INSERT INTO users (id, username, full_name, email, dept, title, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(username) DO UPDATE SET
        full_name      = excluded.full_name,
        email          = excluded.email,
        dept           = excluded.dept,
        title          = excluded.title,
        active         = 1,
        deactivated_at = NULL,
        synced_at      = datetime('now')
    `);

    const ldapUsernames = ldapUsers
      .filter(u => u.username)
      .map(u => u.username.toLowerCase());

    const transaction = db.transaction((users) => {
      for (const u of users) {
        if (!u.username) continue;
        const title = resolveTitle(u.dept, u.title);
        upsert.run(uuidv4(), u.username.toLowerCase(), u.fullName || u.username, u.email, u.dept, title);
      }

      // Desativa quem nao esta mais na OU — exceto roles protegidos
      const allActive = db.prepare(
        "SELECT id, username, role, sync_exempt FROM users WHERE active = 1"
      ).all();

      for (const row of allActive) {
        if (PROTECTED_ROLES.includes(row.role)) continue;
        if (row.sync_exempt) continue; // nunca desativa admin/TI
        if (!ldapUsernames.includes(row.username.toLowerCase())) {
          db.prepare("UPDATE users SET active=0, deactivated_at=datetime('now') WHERE id=?").run(row.id);
          console.log("[LDAP Sync] Desativado: " + row.username);
        }
      }
    });

    transaction(ldapUsers);

    const stats = db.prepare(`
      SELECT
        SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) as ativos,
        SUM(CASE WHEN active=0 THEN 1 ELSE 0 END) as inativos
      FROM users
    `).get();

    console.log(`[LDAP Sync] Concluido — ${ldapUsers.length} no LDAP | ${stats.ativos} ativos | ${stats.inativos} inativos`);
  } catch (err) {
    console.error("[LDAP Sync] Erro:", err.message);
  }
}

function cleanInactiveUserSchedules() {
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const result = db.prepare(`
      DELETE FROM schedules
      WHERE date >= ? AND user_id IN (SELECT id FROM users WHERE active = 0)
    `).run(today);
    if (result.changes > 0) {
      console.log(`[Schedule Cleanup] Removidos ${result.changes} turnos futuros de usuários desativados`);
    }
  } catch (e) {
    console.error("[Schedule Cleanup] Erro:", e.message);
  }
}

syncLdapUsers();
cleanInactiveUserSchedules();
cron.schedule("0 3 * * *", async () => {
  await syncLdapUsers();
  cleanInactiveUserSchedules();
});
module.exports = { syncLdapUsers };

// ── Sync automático de Feriados ───────────────────────────────────────
async function syncHolidays(year) {
  const https = require("https");
  const db = getDb();
  function fetchJson(url) {
    return new Promise((resolve, reject) => {
      https.get(url, { headers:{ "User-Agent":"ShiftSync/1.0" } }, res => {
        let data = ""; res.on("data", d => data += d);
        res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
      }).on("error", reject);
    });
  }
  const BASE = "https://raw.githubusercontent.com/joaopbini/feriados-brasil/master/dados/feriados";
  db.prepare("DELETE FROM holidays WHERE year=? AND source='github'").run(year);
  const ins = db.prepare("INSERT OR IGNORE INTO holidays (id,date,name,type,description,uf,ibge,source,year) VALUES (?,?,?,?,?,?,?,'github',?)");
  const insertMany = db.transaction((items) => {
    for (const h of items) {
      const date = h.data ? (h.data.includes("/") ? h.data.split("/").reverse().join("-") : h.data) : h.date;
      if (date) ins.run(require("uuid").v4(), date, h.nome||h.name, h.tipo||h.type, h.descricao||null, h.uf||null, h.codigo_ibge||null, year);
    }
  });
  let total = 0;
  try { const d = await fetchJson(`${BASE}/nacional/json/${year}.json`); const items = Array.isArray(d)?d:(d.feriados||[]); insertMany(items); total+=items.length; } catch(e) { console.error("[Holidays] nacional:", e.message); }
  try { const d = await fetchJson(`${BASE}/estadual/json/${year}.json`); const items = (Array.isArray(d)?d:(d.feriados||[])).filter(h=>(h.uf||"").toUpperCase()==="MG"); insertMany(items); total+=items.length; } catch(e) { console.error("[Holidays] estadual:", e.message); }
  try { const d = await fetchJson(`${BASE}/municipal/json/${year}.json`); const items = (Array.isArray(d)?d:(d.feriados||[])).filter(h=>String(h.codigo_ibge||h.ibge||"")==="3143906"); insertMany(items); total+=items.length; } catch(e) { console.error("[Holidays] municipal:", e.message); }
  console.log(`✅ [Holidays] Sync ${year} — ${total} feriados`);
  return total;
}

cron.schedule("0 3 1 1 *", async () => {
  const year = new Date().getFullYear();
  console.log(`[Holidays] Sync automático ${year}...`);
  await syncHolidays(year);
});

setTimeout(async () => {
  const db = getDb();
  const year = new Date().getFullYear();
  const count = db.prepare("SELECT COUNT(*) as c FROM holidays WHERE year=? AND source='github'").get(year);
  if (count.c === 0) { console.log(`[Holidays] Sem feriados para ${year}, sincronizando...`); await syncHolidays(year); }
  else { console.log(`[Holidays] ${count.c} feriados já cadastrados para ${year}`); }
}, 5000);

// ── Sync automático de Batidas Faceum (a cada 6h) ─────────────────────────
async function syncFaceumBatidas(overrideFrom, overrideTo) {
  console.log("[Faceum Sync] Iniciando sync de batidas...");
  try {
    const faceum = require("./services/faceum");
    const { v4: uuidv4 } = require("uuid");
    const db = getDb();

    // Default: hoje + ontem; ou range customizado passado pelo caller
    const dateFrom = overrideFrom || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const dateTo   = overrideTo   || new Date().toISOString().slice(0, 10);
    const beginMs   = new Date(dateFrom + "T00:00:00-03:00").getTime();
    const endMs     = new Date(dateTo   + "T23:59:59-03:00").getTime();

    const allUsers = db.prepare("SELECT id, full_name, cpf FROM users WHERE active=1").all();

    const [clocks, colaboradores] = await Promise.all([
      faceum.getClocks(beginMs, endMs),
      faceum.getColaboradores(),
    ]);

    function normName(n) { return (n||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim(); }
    // CPF→user from existing batidas (most reliable — handles name mismatches)
    const existingCpf = db.prepare(
      "SELECT DISTINCT colaborador_cpf, user_id FROM ponto_batidas " +
      "WHERE user_id IS NOT NULL AND colaborador_cpf IS NOT NULL AND colaborador_cpf != '' AND colaborador_cpf != '0'"
    ).all();
    const cpfToUser = new Map(existingCpf.flatMap(r => {
      const batidaCpf = r.colaborador_cpf.replace(/\D/g, "");
      const u = allUsers.find(x => x.id === r.user_id);
      // Drop stale links that contradict the user's CPF on file (homonym cleanup)
      const uCpf = (u?.cpf || "").replace(/\D/g, "");
      if (!u || (uCpf && uCpf !== batidaCpf)) return [];
      return [[batidaCpf, u]];
    }));
    // Direct CPF match from users table (handles name mismatches)
    const userByCpfField = new Map(allUsers.filter(u => u.cpf).map(u => [(u.cpf||"").replace(/\D/g,""), u]));
    // Name-based fallback for new users not yet in batidas
    const faceumByName = new Map(colaboradores.map(c => [normName(c.name||c.nome||""), c]));
    const faceumCpfToName = new Map(colaboradores.map(c => [(c.cpf||"").replace(/\D/g,""), c.name||c.nome||""]));
    const userByNormName = new Map(allUsers.map(u => [normName(u.full_name), u]));
    const userByFaceumCpf  = new Map();
    const userByFaceumName = new Map();
    for (const u of allUsers) {
      // CPF on file is authoritative — userByCpfField already links these users;
      // name matching here would risk binding a homonym from another location.
      if ((u.cpf || "").replace(/\D/g, "")) continue;
      const col = faceumByName.get(normName(u.full_name));
      if (col) { userByFaceumCpf.set((col.cpf||"").replace(/\D/g,""), u); userByFaceumName.set(normName(col.name||col.nome||""), u); }
    }

    const upsert = db.prepare(`
      INSERT INTO ponto_batidas
        (user_id, colaborador_cpf, colaborador_name, event_code, event_name,
         date, recorded_at, time_millis, approval_status, iud, raw_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id, time_millis) DO UPDATE SET
        event_code=excluded.event_code, event_name=excluded.event_name,
        approval_status=excluded.approval_status, synced_at=datetime('now')
      WHERE deleted_at IS NULL
    `);

    let matched = 0, unmatched = 0;
    db.transaction(rows => {
      for (const c of rows) {
        const cpf  = (c.colaboradorCpf || "").replace(/\D/g, "");
        const cleanCpf = cpf.replace(/\D/g,""); const user = cpfToUser.get(cleanCpf) || userByCpfField.get(cleanCpf) || userByFaceumCpf.get(cleanCpf) || userByFaceumName.get(normName(c.colaboradorName||"")) || null;
        if (!user) { unmatched++; continue; }
        matched++;
        const dateStr = (c.dateTime || c.zonedDateTime || "").slice(0, 10);
        const timeMs  = c.timeInMillis != null ? c.timeInMillis : (c.dateTime ? new Date(c.dateTime).getTime() : null);
        upsert.run(user.id, cpf, user.full_name, null, null,
          dateStr, c.dateTime || c.zonedDateTime, timeMs, 0, null, JSON.stringify(c));
      }
    })(clocks);

    console.log(`[Faceum Sync] Concluído — ${clocks.length} batidas | ${matched} vinculadas | ${unmatched} sem usuário | ${dateFrom} → ${dateTo}`);
  } catch (err) {
    console.error("[Faceum Sync] Erro:", err.message);
  }
}

// No startup: backfill last 30 days so historical filters work
setTimeout(async () => {
  const today     = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30*86400000).toISOString().slice(0, 10);
  console.log('[Faceum Sync] Startup: backfill ' + thirtyAgo + ' → ' + today);
  await syncFaceumBatidas(thirtyAgo, today);
}, 8000);

// Every 30min: sync today + yesterday
cron.schedule("*/30 * * * *", () => syncFaceumBatidas());

module.exports.syncFaceumBatidas = syncFaceumBatidas;

// ── Notificações de Férias ────────────────────────────────────────────
// Checks [1, 7, 14, 30] day windows so reminders reach leaders in time
async function sendVacationReminders() {
  console.log("[Vacation Reminders] Verificando férias próximas...");
  try {
    const db = getDb();
    const windows = [1, 7, 14, 30];

    const managers = db.prepare(
      "SELECT id FROM users WHERE role IN ('hr', 'ti', 'gerencia') AND active = 1"
    ).all();
    const managerIds = managers.map(m => m.id);

    const insertNotif = db.prepare(`
      INSERT INTO notifications (id, user_id, type, ref_id, title, body)
      SELECT ?, ?, 'vacation_reminder', ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM notifications WHERE user_id = ? AND ref_id = ?
      )
    `);

    for (const days of windows) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + days);
      const targetStr = targetDate.toISOString().slice(0, 10);

      const vacations = db.prepare(`
        SELECT vr.id, vr.start_date, vr.end_date, vr.user_id AS employee_id,
               u.full_name AS employee_name
        FROM vacation_records vr
        JOIN users u ON u.id = vr.user_id
        WHERE vr.start_date = ?
          AND vr.status NOT IN ('cancelada', 'rejeitada', 'cancelled', 'rejected', 'canceled')
      `).all(targetStr);

      if (vacations.length === 0) continue;

      const suffix = `_${days}d`;

      for (const vac of vacations) {
        const recipientIds = new Set(managerIds);

        const groups = db.prepare(`
          SELECT g.leader_id, gm.group_id
          FROM group_members gm
          JOIN groups g ON g.id = gm.group_id
          WHERE gm.user_id = ?
        `).all(vac.employee_id);

        for (const grp of groups) {
          if (grp.leader_id) recipientIds.add(grp.leader_id);
          const coLeaders = db.prepare(
            "SELECT user_id FROM group_co_leaders WHERE group_id = ?"
          ).all(grp.group_id);
          for (const cl of coLeaders) recipientIds.add(cl.user_id);
        }

        recipientIds.delete(vac.employee_id);

        const refId = `vac_reminder_${vac.id}${suffix}`;
        const label = days === 1 ? "amanhã" : `em ${days} dias`;
        const title = `Férias ${label}: ${vac.employee_name}`;
        const body  = `${vac.employee_name} entra de férias ${label} (${vac.start_date} → ${vac.end_date}).`;

        for (const uid of recipientIds) {
          insertNotif.run(uuidv4(), uid, refId, title, body, uid, refId);
        }

        console.log(`[Vacation Reminders] ${days}d — ${vac.employee_name} → ${recipientIds.size} destinatários`);
      }
    }
  } catch (err) {
    console.error("[Vacation Reminders] Erro:", err.message);
  }
}

// ── Notificações de Pendências (férias + trocas aguardando aprovação) ─
async function sendPendingNotifications() {
  console.log("[Pending Notifs] Verificando pendências...");
  try {
    const db = getDb();

    const managers = db.prepare(
      "SELECT id FROM users WHERE role IN ('hr', 'ti', 'gerencia') AND active = 1"
    ).all();
    const managerIds = managers.map(m => m.id);

    const insertNotif = db.prepare(`
      INSERT INTO notifications (id, user_id, type, ref_id, title, body)
      SELECT ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM notifications WHERE user_id = ? AND ref_id = ?
      )
    `);

    // Férias pendentes de aprovação
    const pendingVacs = db.prepare(`
      SELECT vr.id, vr.start_date, vr.end_date, vr.user_id AS employee_id,
             u.full_name AS employee_name
      FROM vacation_records vr
      JOIN users u ON u.id = vr.user_id
      WHERE vr.status = 'scheduled'
    `).all();

    for (const vac of pendingVacs) {
      const recipientIds = new Set(managerIds);

      const groups = db.prepare(`
        SELECT g.leader_id, gm.group_id
        FROM group_members gm
        JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = ?
      `).all(vac.employee_id);

      for (const grp of groups) {
        if (grp.leader_id) recipientIds.add(grp.leader_id);
        const coLeaders = db.prepare(
          "SELECT user_id FROM group_co_leaders WHERE group_id = ?"
        ).all(grp.group_id);
        for (const cl of coLeaders) recipientIds.add(cl.user_id);
      }

      recipientIds.delete(vac.employee_id);

      const refId = `vac_pending_${vac.id}`;
      const title = `Férias aguardando aprovação: ${vac.employee_name}`;
      const body  = `${vac.employee_name} tem férias agendadas (${vac.start_date} → ${vac.end_date}) aguardando aprovação.`;

      for (const uid of recipientIds) {
        insertNotif.run(uuidv4(), uid, 'vacation_pending', refId, title, body, uid, refId);
      }
    }

    // Trocas de turno pendentes de aprovação
    const pendingSwaps = db.prepare(`
      SELECT sr.id, sr.requester_id, sr.coverer_id, sr.date,
             u1.full_name AS requester_name, u2.full_name AS coverer_name
      FROM swap_requests sr
      JOIN users u1 ON u1.id = sr.requester_id
      JOIN users u2 ON u2.id = sr.coverer_id
      WHERE sr.status = 'pending'
    `).all();

    for (const swap of pendingSwaps) {
      const recipientIds = new Set(managerIds);

      for (const userId of [swap.requester_id, swap.coverer_id]) {
        const groups = db.prepare(`
          SELECT g.leader_id, gm.group_id
          FROM group_members gm
          JOIN groups g ON g.id = gm.group_id
          WHERE gm.user_id = ?
        `).all(userId);

        for (const grp of groups) {
          if (grp.leader_id) recipientIds.add(grp.leader_id);
          const coLeaders = db.prepare(
            "SELECT user_id FROM group_co_leaders WHERE group_id = ?"
          ).all(grp.group_id);
          for (const cl of coLeaders) recipientIds.add(cl.user_id);
        }
      }

      recipientIds.delete(swap.requester_id);
      recipientIds.delete(swap.coverer_id);

      const refId = `swap_pending_${swap.id}`;
      const title = `Troca de turno pendente: ${swap.requester_name}`;
      const body  = `${swap.requester_name} solicitou troca com ${swap.coverer_name} no dia ${swap.date}.`;

      for (const uid of recipientIds) {
        insertNotif.run(uuidv4(), uid, 'swap_pending', refId, title, body, uid, refId);
      }
    }

    console.log(`[Pending Notifs] Concluído — ${pendingVacs.length} férias pendentes | ${pendingSwaps.length} trocas pendentes`);
  } catch (err) {
    console.error("[Pending Notifs] Erro:", err.message);
  }
}

// Backfill na inicialização para popular notificações imediatamente
setTimeout(async () => {
  console.log("[Notifs] Backfill de notificações na inicialização...");
  await sendVacationReminders();
  await sendPendingNotifications();
}, 12000);

// Cron diário às 07:00
cron.schedule("0 7 * * *", async () => {
  await sendVacationReminders();
  await sendPendingNotifications();
});

module.exports.sendVacationReminders = sendVacationReminders;
module.exports.sendPendingNotifications = sendPendingNotifications;
