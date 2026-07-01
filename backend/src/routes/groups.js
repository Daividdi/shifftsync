const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/groups
router.get("/", requireAuth, (req, res) => {
  const db = getDb();
  const groups = db.prepare("SELECT * FROM groups ORDER BY name").all();
  return res.json(groups.map((g) => enrichGroup(db, g)));
});

// GET /api/groups/:id
router.get("/:id", requireAuth, (req, res) => {
  const db = getDb();
  const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(req.params.id);
  if (!group) return res.status(404).json({ error: "Grupo não encontrado" });
  return res.json(enrichGroup(db, group));
});

// POST /api/groups
router.post("/", requireAuth, requireRole("hr", "gerencia"), (req, res) => {
  const { name, color, dept, leaderId, memberIds = [], team, coLeaderIds = [] } = req.body;
  if (!name) return res.status(400).json({ error: "Nome é obrigatório" });

  const db = getDb();
  const id = uuidv4();

  db.prepare("INSERT INTO groups (id, name, color, dept, leader_id, team) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, name, color || "#00C2FF", dept, leaderId || null, team || null);

  const insertMember = db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)");
  const tx = db.transaction((members) => {
    for (const uid of members) insertMember.run(id, uid);
  });
  tx(memberIds);

  if (leaderId) {
    db.prepare("UPDATE users SET role = 'leader' WHERE id = ? AND role = 'employee'").run(leaderId);
  }

  // Save co-leaders
  const insertCoLeader = db.prepare("INSERT OR IGNORE INTO group_co_leaders (group_id, user_id) VALUES (?, ?)");
  const txCo = db.transaction((coLeaders) => {
    for (const uid of coLeaders) {
      if (uid !== leaderId) insertCoLeader.run(id, uid);
    }
  });
  txCo(coLeaderIds);

  const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(id);
  return res.status(201).json(enrichGroup(db, group));
});

// PUT /api/groups/:id
router.put("/:id", requireAuth, requireRole("hr", "gerencia"), (req, res) => {
  const { name, color, dept, leaderId, memberIds = [], team, coLeaderIds = [] } = req.body;
  const db = getDb();
  const groupId = req.params.id;

  // M5 — Atomic transaction: prevents group becoming empty mid-update if anything fails.
  const insertMember   = db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)");
  const insertCoLeader = db.prepare("INSERT OR IGNORE INTO group_co_leaders (group_id, user_id) VALUES (?, ?)");

  db.transaction(() => {
    db.prepare("UPDATE groups SET name=?, color=?, dept=?, leader_id=?, team=? WHERE id=?")
      .run(name, color, dept, leaderId || null, team || null, groupId);

    db.prepare("DELETE FROM group_members WHERE group_id = ?").run(groupId);
    for (const uid of memberIds) insertMember.run(groupId, uid);

    if (leaderId) {
      db.prepare("UPDATE users SET role = 'leader' WHERE id = ? AND role = 'employee'").run(leaderId);
    }

    db.prepare("DELETE FROM group_co_leaders WHERE group_id = ?").run(groupId);
    for (const uid of coLeaderIds) {
      if (uid !== leaderId) insertCoLeader.run(groupId, uid);
    }

    syncScheduleAfterMemberChange(db, groupId, team || null);
  })();

  const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(groupId);
  return res.json(enrichGroup(db, group));
});

// DELETE /api/groups/:id
router.delete("/:id", requireAuth, requireRole("hr", "gerencia"), (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM groups WHERE id = ?").run(req.params.id);
  return res.json({ ok: true });
});

function enrichGroup(db, g) {
  const members = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.dept, u.title, u.role
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY u.full_name
  `).all(g.id);

  const leader = g.leader_id
    ? db.prepare("SELECT id, username, full_name FROM users WHERE id = ?").get(g.leader_id)
    : null;

  const coLeaders = db.prepare(`
    SELECT u.id, u.username, u.full_name
    FROM group_co_leaders gcl
    JOIN users u ON u.id = gcl.user_id
    WHERE gcl.group_id = ?
    ORDER BY u.full_name
  `).all(g.id);

  return {
    id: g.id,
    name: g.name,
    color: g.color,
    dept: g.dept,
    team: g.team || null,  // "A" | "B" | null
    leaderId: g.leader_id,
    leader: leader ? { id: leader.id, username: leader.username, fullName: leader.full_name } : null,
    coLeaderIds: coLeaders.map((u) => u.id),
    coLeaders: coLeaders.map((u) => ({ id: u.id, username: u.username, fullName: u.full_name })),
    memberIds: members.map((m) => m.id),
    members: members.map((m) => ({
      id: m.id,
      username: m.username,
      fullName: m.full_name,
      dept: m.dept,
      title: m.title,
      role: m.role,
    })),
  };
}


// POST /api/groups/swap-teams — troca turma A/B em todos os sábados futuros
router.post("/swap-teams", requireAuth, requireRole("ti", "hr"), (req, res) => {
  const db = getDb();
  const { groupId1, groupId2, fromDate } = req.body;

  if (!groupId1 || !groupId2)
    return res.status(400).json({ error: "groupId1 e groupId2 são obrigatórios" });

  const from = fromDate || new Date().toISOString().slice(0,10);

  // Pega todos os sábados futuros a partir de fromDate
  const schedules = db.prepare(
    "SELECT DISTINCT date_key FROM schedule_entries WHERE date_key >= ? ORDER BY date_key"
  ).all(from);

  let swapped = 0;
  const swapStmt = db.prepare(
    "UPDATE schedule_entries SET group_id = CASE WHEN group_id=? THEN ? WHEN group_id=? THEN ? ELSE group_id END WHERE date_key=?"
  );

  db.transaction(() => {
    for (const { date_key } of schedules) {
      swapStmt.run(groupId1, groupId2, groupId2, groupId1, date_key);
      swapped++;
    }
  })();

  return res.json({ ok: true, datesAffected: swapped, from });
});


// Sincroniza as escalas futuras de sábado com a lista atual de membros do grupo.
// Chamada automaticamente após qualquer mudança de membros via PUT /api/groups/:id.
function syncScheduleAfterMemberChange(db, groupId, team) {
  const today = new Date().toISOString().slice(0, 10);

  // Membros atuais do grupo (após a atualização)
  const memberIds = db.prepare("SELECT user_id FROM group_members WHERE group_id=?")
    .all(groupId).map(r => r.user_id);

  // Sábados futuros que já possuem entradas na tabela schedules para este grupo
  const futureDates = db.prepare(
    "SELECT DISTINCT date FROM schedules WHERE group_id=? AND date>=? ORDER BY date"
  ).all(groupId, today).map(r => r.date);

  if (!futureDates.length) return; // Nenhuma escala gerada ainda — auto-schedule não foi rodado

  const insertOrReplace = db.prepare(
    "INSERT OR REPLACE INTO schedules (id, group_id, date, user_id, status) VALUES (?, ?, ?, ?, ?)"
  );

  // Usuários que nunca trabalham sábado entram sempre como "off"
  const noSatSet = new Set(
    db.prepare("SELECT id FROM users WHERE no_saturday=1").all().map(r => r.id)
  );

  db.transaction(() => {
    for (const dateStr of futureDates) {
      // 1. Remove membros que saíram do grupo
      if (memberIds.length > 0) {
        const ph = memberIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM schedules WHERE group_id=? AND date=? AND user_id NOT IN (${ph})`)
          .run(groupId, dateStr, ...memberIds);
      } else {
        db.prepare("DELETE FROM schedules WHERE group_id=? AND date=?").run(groupId, dateStr);
        continue; // Grupo sem membros — limpa este dia e segue para o próximo
      }

      // 2. Determina status correto para este sábado com base no time (A/B)
      const satIndex = globalSatIdx(new Date(dateStr + "T12:00:00"));
      let newMemberStatus;
      if (team === "A") {
        newMemberStatus = satIndex % 2 === 0 ? "working" : "off";
      } else if (team === "B") {
        newMemberStatus = satIndex % 2 !== 0 ? "working" : "off";
      } else {
        // Sem time definido: usa o status majoritário dos membros já existentes nesta data
        const existing = db.prepare(
          "SELECT status FROM schedules WHERE group_id=? AND date=? GROUP BY status ORDER BY COUNT(*) DESC LIMIT 1"
        ).get(groupId, dateStr);
        newMemberStatus = existing?.status || "working";
      }

      // 3. Insere membros novos que ainda não têm entrada nesta data
      for (const uid of memberIds) {
        const exists = db.prepare(
          "SELECT 1 FROM schedules WHERE group_id=? AND date=? AND user_id=?"
        ).get(groupId, dateStr, uid);
        if (!exists) {
          insertOrReplace.run(uuidv4(), groupId, dateStr, uid, noSatSet.has(uid) ? "off" : newMemberStatus);
        }
        // 4. Remove o membro de qualquer outro grupo na mesma data (evita duplicata após troca de grupo)
        db.prepare("DELETE FROM schedules WHERE user_id=? AND date=? AND group_id!=?")
          .run(uid, dateStr, groupId);
      }
    }
  })();
}

// Índice global de sábado — MESMO época/paridade do /auto em schedule.js.
// A alternância A/B é contínua entre meses; um índice reiniciado por mês
// inverte a rotação nos meses em que a paridade global não coincide, fazendo
// quem trabalhou no sábado anterior aparecer trabalhando de novo no seguinte.
const SAT_EPOCH = new Date('2023-12-30T12:00:00Z');
function globalSatIdx(sat) {
  return Math.round((sat.getTime() - SAT_EPOCH.getTime()) / (7 * 86400000));
}

module.exports = router;
