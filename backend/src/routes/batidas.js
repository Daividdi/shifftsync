const express  = require("express");
const { getDb } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");
const faceum   = require("../services/faceum");

const router = express.Router();

function isAdmin(role)  { return ["hr","ti","gerencia"].includes(role); }
function isLeader(role) { return role === "leader" || isAdmin(role); }

function getLeaderGroupIds(db, userId) {
  const primary = db.prepare("SELECT id FROM groups WHERE leader_id=?").all(userId);
  const co      = db.prepare("SELECT group_id as id FROM group_co_leaders WHERE user_id=?").all(userId);
  return [...new Set([...primary.map(g => g.id), ...co.map(g => g.id)])];
}

function normalizeName(n) {
  return (n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Words with more than 2 chars (excludes "de", "da", "do", "dos", "das")
function sigWords(name) {
  return normalizeName(name).split(/\s+/).filter(w => w.length > 2);
}

// True if all words in the shorter name appear in the longer name
// Levenshtein (curto-circuita quando a diferença de tamanho já é >1)
function levDist(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 1) return 9;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

function nameSubsetMatch(nameA, nameB) {
  const wA = sigWords(nameA);
  const wB = sigWords(nameB);
  if (wA.length < 2 || wB.length < 2) return false;
  const [shorter, longer] = wA.length <= wB.length ? [wA, wB] : [wB, wA];
  // Cada palavra do nome menor deve casar no maior — exata, ou com diferença de
  // 1 letra (no máx. 1 palavra "aproximada"). Cobre erros de digitação do ponto,
  // ex.: "Gonçalves" → "Gongalves". Conservador, p/ não vincular pessoa errada.
  let fuzzy = 0;
  for (const w of shorter) {
    if (longer.includes(w)) continue;
    const near = longer.some(lw => lw.length >= 4 && w.length >= 4 && levDist(lw, w) <= 1);
    if (near) { if (++fuzzy > 1) return false; continue; }
    return false;
  }
  return true;
}

function getScopedUsers(db, req) {
  const { role, id: userId } = req.user;
  if (isAdmin(role)) {
    return db.prepare("SELECT id, full_name, meio_periodo FROM users WHERE active=1").all();
  }
  if (isLeader(role)) {
    const groupIds = getLeaderGroupIds(db, userId);
    const me = db.prepare("SELECT id, full_name, meio_periodo FROM users WHERE id=?").get(userId);
    if (!groupIds.length) return me ? [me] : [];
    const ph = groupIds.map(() => "?").join(",");
    const members = db.prepare(
      `SELECT DISTINCT u.id, u.full_name, u.meio_periodo FROM users u
       JOIN group_members gm ON gm.user_id=u.id
       WHERE gm.group_id IN (${ph}) AND u.active=1`
    ).all(...groupIds);
    // Also include group leaders and co-leaders (not stored in group_members)
    for (const gid of groupIds) {
      const g = db.prepare("SELECT leader_id FROM groups WHERE id=?").get(gid);
      if (g?.leader_id && !members.find(m => m.id === g.leader_id)) {
        const lu = db.prepare("SELECT id, full_name, meio_periodo FROM users WHERE id=? AND active=1").get(g.leader_id);
        if (lu) members.push(lu);
      }
      db.prepare("SELECT user_id FROM group_co_leaders WHERE group_id=?").all(gid).forEach(cl => {
        if (!members.find(m => m.id === cl.user_id)) {
          const cu = db.prepare("SELECT id, full_name, meio_periodo FROM users WHERE id=? AND active=1").get(cl.user_id);
          if (cu) members.push(cu);
        }
      });
    }
    // Include the leader themselves if not already in the list
    if (me && !members.find(m => m.id === userId)) members.push(me);
    return members;
  }
  const me = db.prepare("SELECT id, full_name, meio_periodo FROM users WHERE id=?").get(userId);
  return me ? [me] : [];
}

async function buildFaceumMatch(scopedUsers) {
  const colaboradores = await faceum.getColaboradores();
  const faceumByName  = new Map(colaboradores.map(c => [normalizeName(c.nome || c.name || ""), c]));
  const userByFaceumCpf  = new Map();
  const userByFaceumName = new Map();

  for (const u of scopedUsers) {
    // 1. Exact normalized name match
    let col = faceumByName.get(normalizeName(u.full_name));

    // 2. Subset word match fallback: all significant words of the shorter name
    //    must appear in the longer name (handles "de/da/do" connectors and extra middle names)
    if (!col) {
      for (const c of colaboradores) {
        if (nameSubsetMatch(u.full_name, c.nome || c.name || "")) {
          col = c;
          break;
        }
      }
    }

    if (col) {
      userByFaceumCpf.set(col.cpf, u);
      userByFaceumName.set(normalizeName(col.nome || col.name || ""), u);
    }
  }
  return { userByFaceumCpf, userByFaceumName };
}

function resolveUser(c, userByFaceumCpf, userByFaceumName) {
  const cpf  = (c.colaboradorCpf || c.colaborador?.cpf || "").replace(/\D/g, "");
  const name = normalizeName(c.colaborador?.name || c.colaboradorName || "");
  return userByFaceumCpf.get(cpf) || userByFaceumName.get(name) || null;
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return "0min";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// Alternating logic: index 0,2,4... = working periods; index 1,3,5... = break periods.
// Works for any number of punches.
function computeIntervals(batidas, meioPeriodo) {
  const sorted = [...batidas].sort((a, b) => (a.timeMillis || 0) - (b.timeMillis || 0));
  const n = sorted.length;

  if (n === 0) {
    return {
      structured: { entrada: null, saida: null, breaks: [], status: "sem_registro" },
      batidas: [], intervals: [],
      totalWorkedMs: 0, totalBreakMs: 0,
      totalWorkedFmt: "0min", totalBreakFmt: "0min",
    };
  }

  // Label each punch based on alternating position
  const labeled = sorted.map((b, i) => {
    let label;
    if (i === 0) {
      label = "entrada";
    } else if (i % 2 === 1) {
      // Odd index = leaving (break/lunch start)
      label = i === 1 ? "saida_almoco" : `saida_intervalo_${Math.ceil(i / 2)}`;
    } else {
      // Even index (> 0) = returning from break
      label = i === 2 ? "retorno_almoco" : `retorno_intervalo_${i / 2}`;
    }
    // Override last punch label if total is even (means person has left for the day)
    if (i === n - 1 && n % 2 === 0) label = "saida";
    return { ...b, label };
  });

  // Build intervals between consecutive punches
  const intervals = [];
  let totalWorkedMs = 0, totalBreakMs = 0;
  const SCHED_START_MIN = 8 * 60; // 08:00 — no credit before this (CLT / company policy)

  for (let i = 0; i < n - 1; i++) {
    const curr = labeled[i], next = labeled[i + 1];
    const rawMs = (next.timeMillis || 0) - (curr.timeMillis || 0);
    if (rawMs <= 0) continue;
    // Even index gap = work period; odd index gap = break period
    const type = i % 2 === 0 ? "work" : "break";
    // Display always shows actual punch-to-punch duration
    intervals.push({
      from: curr.recordedAt, to: next.recordedAt,
      durationMs: rawMs, durationFmt: fmtDuration(rawMs), type,
    });
    // For totalWorkedMs: pre-schedule cap on first work interval (don't credit before 08:00)
    let creditedMs = rawMs;
    if (i === 0 && type === "work") {
      const startD = new Date(curr.timeMillis || 0);
      const startMin = startD.getUTCHours() * 60 + startD.getUTCMinutes();
      if (startMin < SCHED_START_MIN) {
        const capMs = (SCHED_START_MIN - startMin) * 60000;
        creditedMs = Math.max(0, rawMs - capMs);
      }
    }
    if (type === "work") totalWorkedMs += creditedMs; else totalBreakMs += rawMs;
  }

  // Odd-punch heuristic: last punch >=15h display → treat as end-of-day,
  // assume 1h lunch break in the orphaned gap and credit remaining time as work
  if (n >= 3 && n % 2 === 1) {
    const last = sorted[n - 1];
    const prev = sorted[n - 2];
    const lastLocalHour = ((new Date(last.timeMillis || 0).getUTCHours() - 3) + 24) % 24;
    if (lastLocalHour >= 15) {
      const gapMs = (last.timeMillis || 0) - (prev.timeMillis || 0);
      const extraMs = Math.max(0, gapMs - 60 * 60000);
      totalWorkedMs += extraMs;
      totalBreakMs  = Math.max(0, totalBreakMs + (gapMs - extraMs) - 60 * 60000);
    }
  }

  // Brazilian law (CLT): work > 6h with only 2 punches (no recorded lunch) → deduct 1h
  if (n === 2 && totalWorkedMs > 6 * 3600000) totalWorkedMs -= 3600000;

  // Determine current status
  // Odd total punches = currently working (last punch was a return or entry)
  // Even total punches = currently out (on break) or done for the day
  let status;
  if (n % 2 === 1) {
    const last = sorted[n - 1];
    const lastLocalHour = ((new Date(last.timeMillis || 0).getUTCHours() - 3) + 24) % 24;
    // If last punch looks like end-of-day, mark as complete rather than "trabalhando"
    status = lastLocalHour >= 15 ? "completo" : "trabalhando";
  } else if (meioPeriodo && n === 2) {
    // Half-day worker: 2 punches = complete (entrada + saida), no lunch break
    status = "completo";
  } else {
    // Use last punch time to guess if done or on break
    const lastHour = new Date(sorted[n - 1].recordedAt).getHours();
    status = lastHour >= 15 ? "completo" : "intervalo";
  }

  // Build structured breaks array: [{saida, retorno}]
  const breaks = [];
  for (let i = 1; i < n; i += 2) {
    breaks.push({
      saida:   labeled[i]     || null,
      retorno: labeled[i + 1] || null, // null if still on break
    });
  }

  return {
    structured: {
      entrada: labeled[0],
      saida:   n % 2 === 0 ? labeled[n - 1] : null,
      breaks,
      status,
    },
    batidas: labeled,
    intervals,
    totalWorkedMs, totalBreakMs,
    totalWorkedFmt: fmtDuration(totalWorkedMs),
    totalBreakFmt:  fmtDuration(totalBreakMs),
  };
}

// POST /api/batidas/sync
router.post("/sync", requireAuth, requireRole("hr","ti","gerencia"), async (req, res) => {
  const db = getDb();
  const { dateFrom, dateTo } = req.body;
  if (!dateFrom || !dateTo)
    return res.status(400).json({ error: "dateFrom e dateTo são obrigatórios (YYYY-MM-DD)" });

  const beginMs = new Date(dateFrom + "T00:00:00-03:00").getTime();
  const endMs   = new Date(dateTo   + "T23:59:59-03:00").getTime();
  const allUsers = db.prepare("SELECT id, full_name FROM users WHERE active=1").all();

  let clocks, match;
  try {
    [clocks, match] = await Promise.all([
      faceum.getClocks(beginMs, endMs),
      buildFaceumMatch(allUsers),
    ]);
  } catch (err) {
    return res.status(502).json({ error: "Erro Faceum: " + err.message });
  }

  const { userByFaceumCpf, userByFaceumName } = match;
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
  db.transaction((rows) => {
    for (const c of rows) {
      const user = resolveUser(c, userByFaceumCpf, userByFaceumName);
      if (!user) { unmatched++; continue; }
      matched++;
      const cpf     = (c.colaboradorCpf || c.colaborador?.cpf || "").replace(/\D/g, "");
      const name    = c.colaborador?.name || c.colaboradorName || user.full_name;
      const dateStr = (c.dateTime || c.zonedDateTime || "").slice(0, 10);
      const timeMs  = c.timeInMillis != null ? c.timeInMillis : (c.dateTime ? new Date(c.dateTime).getTime() : null);
      upsert.run(user.id, cpf, name, c.eventCode || null, c.event?.name || null,
        dateStr, c.dateTime || c.zonedDateTime, timeMs, c.approvalStatus ?? 0, c.iud || null, JSON.stringify(c));
    }
  })(clocks);

  return res.json({ ok: true, total: clocks.length, matched, unmatched, dateFrom, dateTo });
});

// GET /api/batidas
router.get("/", requireAuth, async (req, res) => {
  const db = getDb();
  const { dateFrom, dateTo, userId: filterUserId } = req.query;
  const today   = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7*86400000).toISOString().slice(0, 10);
  const from = dateFrom || weekAgo;
  const to   = dateTo   || today;

  const scopedUsers = getScopedUsers(db, req);
  if (!scopedUsers.length) return res.json([]);

  let targetUsers = scopedUsers;
  if (filterUserId) {
    targetUsers = scopedUsers.filter(u => u.id === filterUserId);
    if (!targetUsers.length) return res.status(403).json({ error: "Sem permissão para esse usuário" });
  }

  const userIds = targetUsers.map(u => u.id);
  const ph      = userIds.map(() => "?").join(",");

  const rows = db.prepare(`
    SELECT CAST(b.id AS TEXT) as id, b.user_id,
           COALESCE(u.full_name, b.colaborador_name) as full_name,
           u.dept, u.meio_periodo, g.name as group_name, g.color as group_color,
           b.event_code, b.event_name, b.date, b.recorded_at, b.time_millis, b.approval_status
    FROM ponto_batidas b
    LEFT JOIN users u ON u.id = b.user_id
    LEFT JOIN (SELECT user_id, group_id FROM group_members GROUP BY user_id) gm ON gm.user_id = b.user_id
    LEFT JOIN groups g ON g.id = gm.group_id
    WHERE b.date BETWEEN ? AND ? AND b.user_id IN (${ph}) AND b.deleted_at IS NULL
    UNION ALL
    SELECT 'r:' || p.id as id, p.user_id,
           u.full_name, u.dept, u.meio_periodo, g.name as group_name, g.color as group_color,
           p.type as event_code,
           CASE
             WHEN p.source='abono' AND p.type='entrada' THEN 'Entrada Abono'
             WHEN p.source='abono' AND p.type='saida'   THEN 'Saída Abono'
             WHEN p.type='entrada' THEN 'Entrada Manual'
             WHEN p.type='saida' THEN 'Saída Manual'
             WHEN p.type='inicio_intervalo' THEN 'Início Intervalo'
             WHEN p.type='fim_intervalo' THEN 'Fim Intervalo'
             ELSE 'Manual'
           END as event_name,
           p.date, p.recorded_at,
           CAST((julianday(REPLACE(p.recorded_at,'Z','')) - 2440587.5) * 86400000.0 AS INTEGER) as time_millis,
           2 as approval_status
    FROM ponto_records p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN (SELECT user_id, group_id FROM group_members GROUP BY user_id) gm ON gm.user_id = p.user_id
    LEFT JOIN groups g ON g.id = gm.group_id
    WHERE p.source IN ('manual', 'abono') AND p.date BETWEEN ? AND ? AND p.user_id IN (${ph})
    ORDER BY date DESC, time_millis ASC
  `).all(from, to, ...userIds, from, to, ...userIds);

  const grouped = {};
  for (const row of rows) {
    const key = `${row.user_id}__${row.date}`;
    if (!grouped[key]) {
      grouped[key] = {
        userId: row.user_id, fullName: row.full_name || row.colaborador_name,
        dept: row.dept, groupName: row.group_name, groupColor: row.group_color,
        date: row.date, batidas: [], meioPeriodo: Boolean(row.meio_periodo),
      };
    }
    grouped[key].batidas.push({
      id: row.id, eventCode: row.event_code, eventName: row.event_name,
      recordedAt: row.recorded_at, timeMillis: row.time_millis, approvalStatus: row.approval_status,
    });
  }

  const result = Object.values(grouped).map(day => ({ ...day, ...computeIntervals(day.batidas, day.meioPeriodo) }));
  return res.json(result);
});

// GET /api/batidas/live
router.get("/live", requireAuth, async (req, res) => {
  const db = getDb();
  const today   = new Date().toISOString().slice(0, 10);
  const beginMs = new Date(today + "T00:00:00-03:00").getTime();
  const endMs   = new Date(today + "T23:59:59-03:00").getTime();

  const scopedUsers = getScopedUsers(db, req);
  if (!scopedUsers.length) return res.json([]);

  let clocks, match;
  try {
    [clocks, match] = await Promise.all([
      faceum.getClocks(beginMs, endMs),
      buildFaceumMatch(scopedUsers),
    ]);
  } catch (err) {
    return res.status(502).json({ error: "Erro Faceum: " + err.message });
  }

  const { userByFaceumCpf, userByFaceumName } = match;
  const grouped = {};
  for (const c of clocks) {
    const user = resolveUser(c, userByFaceumCpf, userByFaceumName);
    if (!user) continue;
    const key = `${user.id}__${today}`;
    if (!grouped[key]) {
      grouped[key] = { userId: user.id, fullName: user.full_name, date: today, batidas: [] };
    }
    const timeMs = c.timeInMillis != null ? c.timeInMillis : (c.dateTime ? new Date(c.dateTime).getTime() : null);
    grouped[key].batidas.push({
      eventCode: c.eventCode, eventName: c.event?.name || c.eventName,
      recordedAt: c.dateTime || c.zonedDateTime, timeMillis: timeMs,
    });
  }

  return res.json(Object.values(grouped).map(day => ({ ...day, ...computeIntervals(day.batidas, day.meioPeriodo) })));
});

// GET /api/batidas/events
router.get("/events", requireAuth, requireRole("hr"), async (req, res) => {
  try { return res.json(await faceum.getEvents()); }
  catch (err) { return res.status(502).json({ error: err.message }); }
});


// GET /api/batidas/alerta-esquecidos -- employees who finished yesterday with odd punch count
router.get('/alerta-esquecidos', requireAuth, (req, res) => {
  const db = getDb();
  const { role, id: userId } = req.user;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  let scopedIds = null;
  if (role === 'employee') {
    scopedIds = [userId];
  } else if (isLeader(role) && !isAdmin(role)) {
    const groupIds = getLeaderGroupIds(db, userId);
    const memberSet = new Set([userId]);
    for (const gid of groupIds) {
      db.prepare('SELECT user_id FROM group_members WHERE group_id=?').all(gid)
        .forEach(m => memberSet.add(m.user_id));
    }
    scopedIds = [...memberSet];
  }

  const ph = scopedIds ? scopedIds.map(() => '?').join(',') : null;
  const scopeFilter = scopedIds ? 'AND b.user_id IN (' + ph + ')' : '';
  const params = scopedIds ? [yesterday, ...scopedIds] : [yesterday];

  const rows = db.prepare(
    'SELECT b.user_id, u.full_name, u.meio_periodo, COUNT(*) as punch_count, MAX(b.time_millis) as last_punch_ms ' +
    'FROM ponto_batidas b JOIN users u ON u.id = b.user_id ' +
    'WHERE b.date = ? AND b.deleted_at IS NULL ' + scopeFilter + ' ' +
    'GROUP BY b.user_id HAVING punch_count % 2 = 1 ORDER BY u.full_name'
  ).all(...params);

  const filtered = rows.filter(r => {
    if (r.meio_periodo) return r.punch_count >= 3;
    return true;
  });

  return res.json(filtered.map(r => ({ userId: r.user_id, fullName: r.full_name, punchCount: r.punch_count })));
});


// POST /api/batidas/manual — insert a manual punch for a user
router.post("/manual", requireAuth, requireRole("hr", "ti", "gerencia", "leader"), (req, res) => {
  const db = getDb();
  const { userId, date, timeStr } = req.body;
  if (!userId || !date || !timeStr) return res.status(400).json({ error: "userId, date e timeStr são obrigatórios" });

  const role = req.user.role;
  if (!isAdmin(role)) {
    const groupIds = getLeaderGroupIds(db, req.user.id);
    if (groupIds.length) {
      const ph = groupIds.map(() => "?").join(",");
      const isMember = db.prepare(`SELECT 1 FROM group_members WHERE group_id IN (${ph}) AND user_id=?`).get(...groupIds, userId);
      if (!isMember && userId !== req.user.id) return res.status(403).json({ error: "Sem permissão para este usuário" });
    } else if (userId !== req.user.id) {
      return res.status(403).json({ error: "Sem permissão para este usuário" });
    }
  }

  const user = db.prepare("SELECT full_name, colaborador_cpf FROM users WHERE id=?").get(userId);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

  const [hh, mm] = (timeStr || "").split(":").map(Number);
  if (isNaN(hh) || isNaN(mm)) return res.status(400).json({ error: "Formato de hora inválido (HH:MM)" });
  const hhStr = String(hh).padStart(2, "0");
  const mmStr = String(mm).padStart(2, "0");
  const recordedAt = `${date}T${hhStr}:${mmStr}:00.000`;
  const timeMs = new Date(`${date}T${hhStr}:${mmStr}:00-03:00`).getTime();

  try {
    db.prepare(
      `INSERT INTO ponto_batidas (user_id, colaborador_cpf, colaborador_name, event_name, date, recorded_at, time_millis, approval_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 2)`
    ).run(userId, user.colaborador_cpf || null, user.full_name, "Inserção Manual", date, recordedAt, timeMs);
  } catch (e) {
    if (e.message?.includes("UNIQUE")) return res.status(409).json({ error: "Já existe uma batida neste horário exato" });
    throw e;
  }

  return res.json({ ok: true });
});


// PATCH /api/batidas/:id — edit a punch time
router.patch("/:id", requireAuth, (req, res) => {
  const db   = getDb();
  const role = req.user.role;
  const rawId = req.params.id;
  if (!isLeader(role)) return res.status(403).json({ error: "Sem permissao" });

  if (rawId.startsWith("r:")) {
    const rid = rawId.slice(2);
    const row = db.prepare("SELECT * FROM ponto_records WHERE id=? AND source='manual'").get(rid);
    if (!row) return res.status(404).json({ error: "Registro nao encontrado" });
    if (!isAdmin(role)) {
      const ids = getScopedMemberIds(db, req.user.id);
      if (!ids.includes(row.user_id)) return res.status(403).json({ error: "Sem permissao para este usuario" });
    }
    const { timeStr, date } = req.body;
    if (!timeStr || !date) return res.status(400).json({ error: "timeStr e date sao obrigatorios" });
    const parts = timeStr.split(":").map(Number);
    const hh = parts[0], mm = parts[1];
    if (isNaN(hh) || isNaN(mm)) return res.status(400).json({ error: "Formato invalido (HH:MM)" });
    const hhS = String(hh).padStart(2,"0"), mmS = String(mm).padStart(2,"0");
    const recordedAt = date + "T" + hhS + ":" + mmS + ":00.000";
    db.prepare("UPDATE ponto_records SET recorded_at=?, date=?, updated_at=datetime('now') WHERE id=?")
      .run(recordedAt, date, rid);
    return res.json({ ok: true });
  }

  const id = Number(rawId);
  if (!id) return res.status(400).json({ error: "ID invalido" });
  const row = db.prepare("SELECT * FROM ponto_batidas WHERE id=? AND deleted_at IS NULL").get(id);
  if (!row) return res.status(404).json({ error: "Batida nao encontrada" });
  if (!isAdmin(role)) {
    const ids = getScopedMemberIds(db, req.user.id);
    if (!ids.includes(row.user_id)) return res.status(403).json({ error: "Sem permissao para este usuario" });
  }
  const { timeStr, date } = req.body;
  if (!timeStr || !date) return res.status(400).json({ error: "timeStr e date sao obrigatorios" });
  const parts = timeStr.split(":").map(Number);
  const hh = parts[0], mm = parts[1];
  if (isNaN(hh) || isNaN(mm)) return res.status(400).json({ error: "Formato invalido (HH:MM)" });
  const hhS = String(hh).padStart(2,"0"), mmS = String(mm).padStart(2,"0");
  const recordedAt = date + "T" + hhS + ":" + mmS + ":00.000";
  const timeMs = new Date(date + "T" + hhS + ":" + mmS + ":00-03:00").getTime();
  const conflict = db.prepare("SELECT id FROM ponto_batidas WHERE user_id=? AND time_millis=? AND id!=? AND deleted_at IS NULL").get(row.user_id, timeMs, id);
  if (conflict) return res.status(409).json({ error: "Ja existe uma batida neste horario" });
  db.prepare("UPDATE ponto_batidas SET recorded_at=?, time_millis=?, date=?, synced_at=datetime('now') WHERE id=?")
    .run(recordedAt, timeMs, date, id);
  return res.json({ ok: true });
});

// DELETE /api/batidas/:id — edit/delete (leaders for their group, admins for all)
router.delete("/:id", requireAuth, (req, res) => {
  const role = req.user.role;
  if (!isLeader(role)) return res.status(403).json({ error: "Sem permissao" });
  const db = getDb();
  const rawId = req.params.id;
  if (rawId.startsWith("r:")) {
    const rid = rawId.slice(2);
    const row = db.prepare("SELECT * FROM ponto_records WHERE id=? AND source='manual'").get(rid);
    if (!row) return res.status(404).json({ error: "Registro nao encontrado" });
    if (!isAdmin(role)) {
      const ids = getScopedMemberIds(db, req.user.id);
      if (!ids.includes(row.user_id)) return res.status(403).json({ error: "Sem permissao para este usuario" });
    }
    db.prepare("DELETE FROM ponto_records WHERE id=?").run(rid);
  } else {
    const id = Number(rawId);
    if (!id) return res.status(400).json({ error: "ID inválido" });
    const row = db.prepare("SELECT * FROM ponto_batidas WHERE id=? AND deleted_at IS NULL").get(id);
    if (!row) return res.status(404).json({ error: "Batida nao encontrada" });
    if (!isAdmin(role)) {
      const ids = getScopedMemberIds(db, req.user.id);
      if (!ids.includes(row.user_id)) return res.status(403).json({ error: "Sem permissao para este usuario" });
    }
    db.prepare("UPDATE ponto_batidas SET deleted_at=datetime('now') WHERE id=?").run(id);
  }
  return res.json({ ok: true });
});

module.exports = router;
