const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

const ADMIN_ROLES = ["hr", "ti", "gerencia"];

function isAdmin(role)  { return ADMIN_ROLES.includes(role); }
function isLeader(role) { return role === "leader" || isAdmin(role); }

function getPairGroup(db, group) {
  if (!group) return null;
  const partnerTeam = group.team === "A" ? "B" : group.team === "B" ? "A" : null;
  if (!partnerTeam) return null;
  const prefix = group.name.replace(/\s*-?\s*turma\s*[ab]\s*$/i, "").trim();
  const allGroups = db.prepare("SELECT * FROM groups").all();
  return allGroups.find((g) => {
    const gPrefix = g.name.replace(/\s*-?\s*turma\s*[ab]\s*$/i, "").trim();
    return g.team === partnerTeam && gPrefix.toLowerCase() === prefix.toLowerCase() && g.id !== group.id;
  }) || null;
}

// Returns ALL groups where userId is primary leader OR co-leader
function getMyGroups(db, userId) {
  return db.prepare(`
    SELECT g.* FROM groups g WHERE g.leader_id = ?
    UNION
    SELECT g.* FROM groups g
    JOIN group_co_leaders gcl ON gcl.group_id = g.id
    WHERE gcl.user_id = ?
  `).all(userId, userId);
}

// Returns deduplicated group ids: all myGroups + their pair groups
function getAllManagedGroupIds(db, myGroups) {
  const seen = new Set();
  for (const g of myGroups) {
    seen.add(g.id);
    const pair = getPairGroup(db, g);
    if (pair) seen.add(pair.id);
  }
  return [...seen];
}

// True if userId is primary leader or co-leader of any group
function isAnyLeader(db, userId) {
  return !!(
    db.prepare("SELECT 1 FROM groups WHERE leader_id = ?").get(userId) ||
    db.prepare("SELECT 1 FROM group_co_leaders WHERE user_id = ?").get(userId)
  );
}

// GET /api/swaps
router.get("/", requireAuth, (req, res) => {
  const db = getDb();
  let rows;

  if (isAdmin(req.user.role)) {
    rows = db.prepare("SELECT * FROM swap_requests ORDER BY created_at DESC").all();
  } else if (req.user.role === "leader") {
    const myGroups = getMyGroups(db, req.user.id);
    if (myGroups.length === 0) return res.json([]);
    const allGroupIds = getAllManagedGroupIds(db, myGroups);
    const placeholders = allGroupIds.map(() => "?").join(",");
    rows = db.prepare(`
      SELECT sr.* FROM swap_requests sr
      WHERE sr.group_id IN (${placeholders}) OR sr.requester_id = ? OR sr.coverer_id = ?
      ORDER BY sr.created_at DESC
    `).all(...allGroupIds, req.user.id, req.user.id);
    const seen = new Set();
    rows = rows.filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
  } else {
    return res.status(403).json({ error: "Sem permissão" });
  }

  return res.json(rows.map(formatSwap));
});

// POST /api/swaps — líder cria pedido
router.post("/", requireAuth, (req, res) => {
  if (!isLeader(req.user.role)) {
    return res.status(403).json({ error: "Sem permissão" });
  }

  const { requesterId, covererId, date, groupId, coverCompDate, reason } = req.body;
  if (!covererId || !date) {
    return res.status(400).json({ error: "covererId e date são obrigatórios" });
  }

  const db = getDb();

  let leaderGroup; // kept for resolvedGroupId fallback
  let allGroupIds;

  if (isAdmin(req.user.role)) {
    if (groupId) {
      leaderGroup = db.prepare("SELECT * FROM groups WHERE id = ?").get(groupId);
    } else if (requesterId) {
      const gm = db.prepare("SELECT group_id FROM group_members WHERE user_id = ? LIMIT 1").get(requesterId);
      leaderGroup = gm ? db.prepare("SELECT * FROM groups WHERE id = ?").get(gm.group_id) : null;
    }
    if (!leaderGroup) return res.status(400).json({ error: "Grupo não encontrado" });
    const pairGroup = getPairGroup(db, leaderGroup);
    allGroupIds = [leaderGroup.id, pairGroup?.id].filter(Boolean);
  } else {
    const myGroups = getMyGroups(db, req.user.id);
    if (myGroups.length === 0) return res.status(403).json({ error: "Você não é líder de nenhum grupo" });
    leaderGroup = myGroups[0];
    allGroupIds = getAllManagedGroupIds(db, myGroups);
  }

  const allMemberIds = allGroupIds.flatMap((gid) =>
    db.prepare("SELECT user_id FROM group_members WHERE group_id = ?").all(gid).map((r) => r.user_id)
  );

  const actualRequesterId = requesterId || req.user.id;

  // Cross-group swaps allowed when both parties are leaders/co-leaders of any group
  const crossLeaderSwap =
    !isAdmin(req.user.role) &&
    isAnyLeader(db, actualRequesterId) &&
    isAnyLeader(db, covererId);

  if (!isAdmin(req.user.role) && !crossLeaderSwap) {
    if (!allMemberIds.includes(actualRequesterId)) {
      return res.status(403).json({ error: "Solicitante não pertence ao seu grupo ou grupo par" });
    }
    if (!allMemberIds.includes(covererId)) {
      return res.status(403).json({ error: "Colaborador 2 não pertence ao seu grupo ou grupo par" });
    }
  }

  const scheduled = db.prepare(`
    SELECT * FROM schedules WHERE user_id = ? AND date = ? AND status = 'working'
  `).get(actualRequesterId, date);

  if (!scheduled) {
    return res.status(400).json({ error: "Colaborador 1 não está escalado para trabalhar nessa data" });
  }

  const resolvedGroupId = groupId || scheduled.group_id || leaderGroup.id;
  const id = uuidv4();
  db.prepare(`
    INSERT INTO swap_requests
      (id, requester_id, coverer_id, date, group_id, cover_comp_date, reason, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, actualRequesterId, covererId, date, resolvedGroupId, coverCompDate || null, reason || null, req.user.id);

  return res.status(201).json(formatSwap(db.prepare("SELECT * FROM swap_requests WHERE id = ?").get(id)));
});

// PATCH /api/swaps/:id — HR e TI aprovam/rejeitam
router.patch("/:id", requireAuth, requireRole("hr"), (req, res) => {
  const { action } = req.body;
  if (!["approved", "rejected"].includes(action)) {
    return res.status(400).json({ error: "Ação inválida" });
  }

  const db = getDb();
  const swap = db.prepare("SELECT * FROM swap_requests WHERE id = ?").get(req.params.id);
  if (!swap) return res.status(404).json({ error: "Pedido não encontrado" });
  if (swap.status !== "pending") return res.status(400).json({ error: "Pedido já foi processado" });

  db.prepare(`
    UPDATE swap_requests SET status=?, reviewed_by=?, reviewed_at=datetime('now') WHERE id=?
  `).run(action, req.user.id, swap.id);

  if (action === "approved") {
    const covGm = db.prepare("SELECT group_id FROM group_members WHERE user_id = ? LIMIT 1").get(swap.coverer_id);
    const covGroupId = covGm?.group_id || swap.group_id;

    const tx = db.transaction(() => {
      db.prepare(`UPDATE schedules SET status='off' WHERE user_id=? AND date=? AND group_id=?`)
        .run(swap.requester_id, swap.date, swap.group_id);

      const coverSched = db.prepare(`SELECT * FROM schedules WHERE user_id=? AND date=? AND group_id=?`)
        .get(swap.coverer_id, swap.date, covGroupId);

      if (coverSched) {
        db.prepare(`UPDATE schedules SET status='working' WHERE user_id=? AND date=? AND group_id=?`)
          .run(swap.coverer_id, swap.date, covGroupId);
      } else {
        db.prepare(`INSERT INTO schedules (id, group_id, date, user_id, status) VALUES (?,?,?,?,'working')`)
          .run(uuidv4(), covGroupId, swap.date, swap.coverer_id);
      }

      if (swap.cover_comp_date) {
        db.prepare(`UPDATE schedules SET status='off' WHERE user_id=? AND date=? AND group_id=?`)
          .run(swap.coverer_id, swap.cover_comp_date, covGroupId);

        const compSched = db.prepare(`SELECT * FROM schedules WHERE user_id=? AND date=? AND group_id=?`)
          .get(swap.requester_id, swap.cover_comp_date, swap.group_id);

        if (compSched) {
          db.prepare(`UPDATE schedules SET status='working' WHERE user_id=? AND date=? AND group_id=?`)
            .run(swap.requester_id, swap.cover_comp_date, swap.group_id);
        } else {
          db.prepare(`INSERT INTO schedules (id, group_id, date, user_id, status) VALUES (?,?,?,?,'working')`)
            .run(uuidv4(), swap.group_id, swap.cover_comp_date, swap.requester_id);
        }
      }
    });
    tx();
  }

  return res.json(formatSwap(db.prepare("SELECT * FROM swap_requests WHERE id = ?").get(swap.id)));
});

function formatSwap(s) {
  return {
    id: s.id, requesterId: s.requester_id, covererId: s.coverer_id,
    date: s.date, groupId: s.group_id, coverCompDate: s.cover_comp_date,
    reason: s.reason, status: s.status, createdBy: s.created_by,
    reviewedBy: s.reviewed_by, reviewedAt: s.reviewed_at, createdAt: s.created_at,
  };
}

module.exports = router;
