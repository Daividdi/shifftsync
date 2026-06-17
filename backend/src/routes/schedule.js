const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/schedule?year=YYYY&month=M
router.get("/", requireAuth, (req, res) => {
  const { year, month } = req.query;
  const db = getDb();
  const { role, id: userId } = req.user;

  const conditions = [];
  const params = [];

  // ── Role-based scope ──────────────────────────────────────────────────
  if (role === "employee") {
    const memberGroup = db.prepare(
      "SELECT group_id FROM group_members WHERE user_id = ? LIMIT 1"
    ).get(userId);
    if (!memberGroup) return res.json({});
    conditions.push("s.group_id = ?");
    params.push(memberGroup.group_id);
  } else if (role === "leader") {
    const led   = db.prepare("SELECT id FROM groups WHERE leader_id = ?").all(userId);
    const coLed = db.prepare("SELECT group_id as id FROM group_co_leaders WHERE user_id = ?").all(userId);
    const groupIds = [...new Set([...led.map(g => g.id), ...coLed.map(g => g.id)])];
    if (groupIds.length === 0) return res.json({});
    conditions.push(`s.group_id IN (${groupIds.map(() => "?").join(",")})`);
    params.push(...groupIds);
  }
  // hr / ti / gerencia — sem filtro adicional

  if (year && month !== undefined) {
    const pad = String(Number(month) + 1).padStart(2, "0");
    conditions.push("s.date LIKE ?");
    params.push(`${year}-${pad}-%`);
  }

  let query = `
    SELECT s.*, u.full_name, u.username, u.dept,
           g.name as group_name, g.color as group_color
    FROM schedules s
    JOIN users u ON u.id = s.user_id
    JOIN groups g ON g.id = s.group_id
  `;

  if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY s.date, g.name, u.full_name";

  const rows = db.prepare(query).all(...params);

  const result = {};
  for (const row of rows) {
    const dateKey = new Date(row.date + "T12:00:00").toDateString();
    if (!result[dateKey]) result[dateKey] = {};
    if (!result[dateKey][row.group_id]) {
      result[dateKey][row.group_id] = { working: [], off: [] };
    }
    result[dateKey][row.group_id][row.status].push(row.user_id);
  }

  // ── Overlay approved swap_requests ─────────────────────────────────────
  // For each approved swap: on the original date the coverer works in place of the requester;
  // on the cover_comp_date the requester works in place of the coverer.
  if (year && month !== undefined) {
    const pad = String(Number(month) + 1).padStart(2, "0");
    const monthStart = `${year}-${pad}-01`;
    const monthEnd   = `${year}-${pad}-31`;
    try {
      const swaps = db.prepare(`
        SELECT sw.requester_id, sw.coverer_id, sw.date, sw.group_id, sw.cover_comp_date,
               (SELECT group_id FROM group_members WHERE user_id = sw.coverer_id LIMIT 1) as coverer_group_id
        FROM swap_requests sw
        WHERE sw.status = 'approved'
          AND (sw.date BETWEEN ? AND ? OR sw.cover_comp_date BETWEEN ? AND ?)
      `).all(monthStart, monthEnd, monthStart, monthEnd);

      const removeFromList = (groupBucket, uid) => {
        if (!groupBucket) return;
        groupBucket.working = groupBucket.working.filter(x => x !== uid);
        groupBucket.off     = groupBucket.off.filter(x => x !== uid);
      };
      const ensureBucket = (dateKey, groupId) => {
        if (!result[dateKey]) result[dateKey] = {};
        if (!result[dateKey][groupId]) result[dateKey][groupId] = { working: [], off: [] };
        return result[dateKey][groupId];
      };

      for (const sw of swaps) {
        const reqGroup = sw.group_id;
        const covGroup = sw.coverer_group_id || sw.group_id;
        // Original swap date: requester is off, coverer is working
        if (sw.date >= monthStart && sw.date <= monthEnd) {
          const dateKey = new Date(sw.date + "T12:00:00").toDateString();
          const reqBucket = ensureBucket(dateKey, reqGroup);
          const covBucket = ensureBucket(dateKey, covGroup);
          removeFromList(reqBucket, sw.requester_id);
          removeFromList(covBucket, sw.coverer_id);
          if (!reqBucket.off.includes(sw.requester_id))     reqBucket.off.push(sw.requester_id);
          if (!covBucket.working.includes(sw.coverer_id))   covBucket.working.push(sw.coverer_id);
        }
        // Comp date: roles reversed — requester works (compensating), coverer is off
        if (sw.cover_comp_date && sw.cover_comp_date >= monthStart && sw.cover_comp_date <= monthEnd) {
          const dateKey = new Date(sw.cover_comp_date + "T12:00:00").toDateString();
          const reqBucket = ensureBucket(dateKey, reqGroup);
          const covBucket = ensureBucket(dateKey, covGroup);
          removeFromList(reqBucket, sw.requester_id);
          removeFromList(covBucket, sw.coverer_id);
          if (!reqBucket.working.includes(sw.requester_id)) reqBucket.working.push(sw.requester_id);
          if (!covBucket.off.includes(sw.coverer_id))       covBucket.off.push(sw.coverer_id);
        }
      }
    } catch (_) {}
  }

  // Overlay vacation data for the month — scoped to same groups as schedule
  if (year && month !== undefined) {
    const pad = String(Number(month) + 1).padStart(2, "0");
    const monthStart = `${year}-${pad}-01`;
    const monthEnd   = `${year}-${pad}-31`;

    let vacGroupFilter = "";
    const vacParams = [monthEnd, monthStart];
    if (role === "employee") {
      const memberGroup = db.prepare(
        "SELECT group_id FROM group_members WHERE user_id = ? LIMIT 1"
      ).get(userId);
      if (memberGroup) { vacGroupFilter = "AND gm.group_id = ?"; vacParams.push(memberGroup.group_id); }
    } else if (role === "leader") {
      const led   = db.prepare("SELECT id FROM groups WHERE leader_id = ?").all(userId);
      const coLed = db.prepare("SELECT group_id as id FROM group_co_leaders WHERE user_id = ?").all(userId);
      const lgids = [...new Set([...led.map(g => g.id), ...coLed.map(g => g.id)])];
      if (lgids.length) {
        vacGroupFilter = `AND gm.group_id IN (${lgids.map(() => "?").join(",")})`;
        vacParams.push(...lgids);
      }
    }

    try {
      const onVacation = db.prepare(`
        SELECT v.user_id, v.start_date, v.end_date, u.full_name, u.dept,
               g.name as group_name, g.color as group_color, g.id as group_id
        FROM vacation_records v
        JOIN users u ON u.id = v.user_id
        LEFT JOIN group_members gm ON gm.user_id = v.user_id
        LEFT JOIN groups g ON g.id = gm.group_id
        WHERE v.status IN ('approved','scheduled','completed')
          AND v.start_date <= ? AND v.end_date >= ?
          ${vacGroupFilter}
      `).all(...vacParams);

      if (!result.__vacations) result.__vacations = {};
      for (const vac of onVacation) {
        const start = new Date(Math.max(new Date(vac.start_date+"T12:00:00"), new Date(monthStart+"T12:00:00")));
        const end   = new Date(Math.min(new Date(vac.end_date+"T12:00:00"),   new Date(monthEnd+"T12:00:00")));
        for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
          const key = d.toDateString();
          if (!result.__vacations[key]) result.__vacations[key] = [];
          result.__vacations[key].push({
            userId: vac.user_id, fullName: vac.full_name, dept: vac.dept,
            groupId: vac.group_id, groupName: vac.group_name, groupColor: vac.group_color,
            vacStart: vac.start_date, vacEnd: vac.end_date,
          });
        }
      }
    } catch (_) {}
  }

  return res.json(result);
});

// POST /api/schedule/auto
router.post("/auto", requireAuth, requireRole("hr", "leader"), (req, res) => {
  const { year, month, groupIds } = req.body;
  const db = getDb();

  let allGroups;
  if (req.user.role === "leader") {
    allGroups = db.prepare("SELECT g.* FROM groups g WHERE g.leader_id = ?").all(req.user.id);
  } else {
    if (groupIds && groupIds.length > 0) {
      allGroups = groupIds
        .map((id) => db.prepare("SELECT * FROM groups WHERE id = ?").get(id))
        .filter(Boolean);
    } else {
      allGroups = db.prepare("SELECT * FROM groups ORDER BY name").all();
    }
  }

  if (!allGroups.length) return res.status(400).json({ error: "Nenhum grupo encontrado" });

  // Sábados a partir de hoje (ou todos do mês se já passou)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const allSaturdays  = getSaturdays(Number(year), Number(month));
  const futureSats    = allSaturdays.filter((s) => s >= today);
  const targetSats    = futureSats.length > 0 ? futureSats : allSaturdays;

  // Índice global de sábados — conta desde 2024-01-06 para A/B alternarem entre meses

  const insertOrReplace = db.prepare(`
    INSERT OR REPLACE INTO schedules (id, group_id, date, user_id, status)
    VALUES (?, ?, ?, ?, ?)
  `);
  const deleteStale = db.prepare(
    "DELETE FROM schedules WHERE group_id = ? AND date = ?"
  );

  // Users who do not work Saturdays are never put on a working Saturday shift.
  const noSatSet = new Set(
    db.prepare("SELECT id FROM users WHERE no_saturday=1").all().map(r => r.id)
  );

  const tx = db.transaction(() => {
    for (const group of allGroups) {
      const members = db.prepare(
        "SELECT user_id FROM group_members WHERE group_id = ?"
      ).all(group.id).map((r) => r.user_id);

      if (!members.length) continue;

      for (const sat of targetSats) {
        const dateStr  = toDateString(sat);
        const satIndex = globalSatIdx(sat);

        // Clear all existing entries for this group+date so removed members don't linger
        deleteStale.run(group.id, dateStr);

        let working = [];
        let off     = [];

        if (group.team === "A") {
          // Turma A: trabalha nos sábados de índice PAR
          if (satIndex % 2 === 0) {
            working = members;
          } else {
            off = members;
          }
        } else if (group.team === "B") {
          // Turma B: trabalha nos sábados de índice ÍMPAR
          if (satIndex % 2 !== 0) {
            working = members;
          } else {
            off = members;
          }
        } else {
          // Grupo sem turma definida: divide ao meio
          const half  = Math.ceil(members.length / 2);
          const teamA = members.slice(0, half);
          const teamB = members.slice(half);
          working = satIndex % 2 === 0 ? teamA : teamB;
          off     = satIndex % 2 === 0 ? teamB : teamA;
        }

        // Move any "no Saturday" users out of the working set — they are always off.
        if (noSatSet.size) {
          off = off.concat(working.filter(uid => noSatSet.has(uid)));
          working = working.filter(uid => !noSatSet.has(uid));
        }

        for (const uid of working) {
          insertOrReplace.run(uuidv4(), group.id, dateStr, uid, "working");
        }
        for (const uid of off) {
          insertOrReplace.run(uuidv4(), group.id, dateStr, uid, "off");
        }
      }
    }

    // ── Re-apply approved swaps that touch any regenerated date ────────────
    const dateRange = targetSats.map(d => toDateString(d));
    if (dateRange.length) {
      const ph = dateRange.map(() => "?").join(",");
      const affected = db.prepare(`
        SELECT requester_id, coverer_id, date, group_id, cover_comp_date,
               (SELECT group_id FROM group_members WHERE user_id = swap_requests.coverer_id LIMIT 1) as coverer_group_id
        FROM swap_requests
        WHERE status='approved' AND (date IN (${ph}) OR cover_comp_date IN (${ph}))
      `).all(...dateRange, ...dateRange);

      const upd = db.prepare("UPDATE schedules SET status=? WHERE user_id=? AND date=? AND group_id=?");
      const ins = db.prepare("INSERT OR REPLACE INTO schedules (id, group_id, date, user_id, status) VALUES (?,?,?,?,?)");
      const apply = (uid, date, gid, status) => {
        const ex = db.prepare("SELECT id FROM schedules WHERE user_id=? AND date=? AND group_id=?").get(uid, date, gid);
        if (ex) upd.run(status, uid, date, gid);
        else    ins.run(uuidv4(), gid, date, uid, status);
      };
      for (const sw of affected) {
        const covG = sw.coverer_group_id || sw.group_id;
        if (dateRange.includes(sw.date)) {
          apply(sw.requester_id, sw.date, sw.group_id, "off");
          apply(sw.coverer_id,   sw.date, covG,        "working");
        }
        if (sw.cover_comp_date && dateRange.includes(sw.cover_comp_date)) {
          apply(sw.requester_id, sw.cover_comp_date, sw.group_id, "working");
          apply(sw.coverer_id,   sw.cover_comp_date, covG,        "off");
        }
      }
    }
  });

  tx();
  return res.json({ ok: true, saturdays: targetSats.length });
});

// PUT /api/schedule/entry
router.put("/entry", requireAuth, requireRole("hr", "leader"), (req, res) => {
  const { groupId, date, userId, status } = req.body;

  if (!["working", "off"].includes(status)) {
    return res.status(400).json({ error: "Status inválido" });
  }

  const db = getDb();

  if (req.user.role === "leader") {
    const group = db.prepare("SELECT * FROM groups WHERE id = ? AND leader_id = ?").get(groupId, req.user.id);
    if (!group) return res.status(403).json({ error: "Sem permissão para este grupo" });
  }

  const existing = db.prepare(
    "SELECT id FROM schedules WHERE group_id=? AND date=? AND user_id=?"
  ).get(groupId, date, userId);

  if (existing) {
    db.prepare("UPDATE schedules SET status=? WHERE id=?").run(status, existing.id);
  } else {
    db.prepare(
      "INSERT INTO schedules (id, group_id, date, user_id, status) VALUES (?,?,?,?,?)"
    ).run(uuidv4(), groupId, date, userId, status);
  }

  return res.json({ ok: true });
});

// DELETE /api/schedule
router.delete("/", requireAuth, requireRole("hr"), (req, res) => {
  const { year, month, groupId } = req.body;
  const db = getDb();
  const pad = String(Number(month) + 1).padStart(2, "0");

  if (groupId) {
    db.prepare("DELETE FROM schedules WHERE date LIKE ? AND group_id = ?")
      .run(`${year}-${pad}-%`, groupId);
  } else {
    db.prepare("DELETE FROM schedules WHERE date LIKE ?")
      .run(`${year}-${pad}-%`);
  }
  return res.json({ ok: true });
});

function getSaturdays(year, month) {
  const sats = [];
  const d = new Date(year, month, 1);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  while (d.getMonth() === month) {
    sats.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return sats;
}

// Global Saturday index from fixed epoch so A/B alternates continuously across months
// 2024-01-06 was a Saturday (index 0 = Turma A works)
const SAT_EPOCH = new Date('2023-12-30T12:00:00Z');
function globalSatIdx(sat) {
  return Math.round((sat.getTime() - SAT_EPOCH.getTime()) / (7 * 86400000));
}

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

module.exports = router;
