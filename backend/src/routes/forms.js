const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const CAN_CREATE   = ["leader", "hr", "ti", "gerencia"];
const MANAGER_ROLES = ["leader", "hr", "ti", "gerencia"];
function canCreate(role)  { return CAN_CREATE.includes(role); }
function isAdmin(role)    { return ["hr", "ti", "gerencia"].includes(role); }
function isManager(role)  { return MANAGER_ROLES.includes(role); }

function notifyAll(db, authorId, type, refId, title, body) {
  const users  = db.prepare("SELECT id FROM users WHERE active=1 AND id != ?").all(authorId);
  const insert = db.prepare("INSERT INTO notifications (id, user_id, type, ref_id, title, body) VALUES (?,?,?,?,?,?)");
  try {
    db.transaction(() => { for (const u of users) insert.run(uuidv4(), u.id, type, refId, title, body); })();
  } catch {}
}

function enrichForm(db, form, userId) {
  const questionCount = db.prepare("SELECT COUNT(*) as c FROM form_questions WHERE form_id=?").get(form.id).c;
  const responseCount = db.prepare("SELECT COUNT(*) as c FROM form_responses WHERE form_id=?").get(form.id).c;
  const userResponse  = userId ? db.prepare("SELECT id FROM form_responses WHERE form_id=? AND user_id=?").get(form.id, userId) : null;
  const creator       = db.prepare("SELECT id, full_name, dept FROM users WHERE id=?").get(form.created_by);
  return {
    id:                       form.id,
    title:                    form.title,
    description:              form.description,
    isActive:                 form.is_active !== 0,
    allowAnonymous:           form.allow_anonymous !== 0,
    showResultsToRespondents: form.show_results_to_respondents !== 0,
    createdAt:                form.created_at,
    closedAt:                 form.closed_at || null,
    createdBy:                creator ? { id: creator.id, fullName: creator.full_name, dept: creator.dept } : null,
    questionCount,
    responseCount,
    hasResponded:             !!userResponse,
  };
}

// GET /api/forms
router.get("/", requireAuth, (req, res) => {
  const db    = getDb();
  const forms = db.prepare("SELECT * FROM forms ORDER BY created_at DESC").all();
  return res.json(forms.map(f => enrichForm(db, f, req.user.id)));
});

// GET /api/forms/:id/results  — aggregate analytics
router.get("/:id/results", requireAuth, (req, res) => {
  const db   = getDb();
  const form = db.prepare("SELECT * FROM forms WHERE id=?").get(req.params.id);
  if (!form) return res.status(404).json({ error: "Formulário não encontrado" });

  const isOwner    = form.created_by === req.user.id;
  const userIsAdmin = isAdmin(req.user.role);
  const hasResponded = !!db.prepare("SELECT id FROM form_responses WHERE form_id=? AND user_id=?").get(form.id, req.user.id);
  const allowedAsRespondent = form.show_results_to_respondents !== 0 && hasResponded;

  if (!isOwner && !userIsAdmin && !allowedAsRespondent) {
    return res.status(403).json({ error: "Sem permissão" });
  }

  const managerView = isOwner || userIsAdmin;
  const questions   = db.prepare("SELECT * FROM form_questions WHERE form_id=? ORDER BY display_order ASC").all(form.id);
  const totalResponses = db.prepare("SELECT COUNT(*) as c FROM form_responses WHERE form_id=?").get(form.id).c;

  const analytics = questions.map(q => {
    const answers = db.prepare(`
      SELECT a.answer_value, u.full_name as responder_name
      FROM form_response_answers a
      JOIN form_responses r ON r.id = a.response_id
      LEFT JOIN users u ON u.id = r.user_id
      WHERE a.question_id = ?
    `).all(q.id);

    const qData = { id: q.id, text: q.question_text, type: q.question_type, required: q.is_required !== 0, answeredCount: answers.length };

    if (q.question_type === "multiple_choice" || q.question_type === "checkbox") {
      const opts   = q.options ? JSON.parse(q.options) : [];
      const counts = Object.fromEntries(opts.map(o => [o, 0]));
      for (const a of answers) {
        try {
          const vals = q.question_type === "checkbox" ? JSON.parse(a.answer_value) : [a.answer_value];
          for (const v of (Array.isArray(vals) ? vals : [vals])) if (counts[v] !== undefined) counts[v]++;
        } catch {}
      }
      qData.options = opts;
      qData.counts  = counts;
    } else if (q.question_type === "scale") {
      const nums = answers.map(a => parseInt(a.answer_value)).filter(n => !isNaN(n));
      const avg  = nums.length > 0 ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
      const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const n of nums) if (dist[n] !== undefined) dist[n]++;
      qData.average = Math.round(avg * 10) / 10;
      qData.distribution = dist;
    } else {
      // Text answers — only show names if manager view and not anonymous
      qData.answers = answers.map(a => ({
        value:         a.answer_value,
        responderName: (managerView && !form.allow_anonymous) ? a.responder_name : null,
      }));
    }
    return qData;
  });

  return res.json({ form: enrichForm(db, form, req.user.id), totalResponses, analytics });
});

// GET /api/forms/:id/full-report — complete data with full user details (managers only)
router.get("/:id/full-report", requireAuth, (req, res) => {
  const db   = getDb();
  const form = db.prepare("SELECT * FROM forms WHERE id=?").get(req.params.id);
  if (!form) return res.status(404).json({ error: "Formulário não encontrado" });

  const isOwner = form.created_by === req.user.id;
  if (!isOwner && !isAdmin(req.user.role) && !isManager(req.user.role)) {
    return res.status(403).json({ error: "Sem permissão" });
  }

  const questions = db.prepare("SELECT * FROM form_questions WHERE form_id=? ORDER BY display_order ASC").all(form.id);

  // All responses with full user data
  const responses = db.prepare(`
    SELECT r.id, r.submitted_at,
           u.id as user_id, u.full_name, u.dept, u.role as user_role, u.email
    FROM form_responses r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.form_id = ?
    ORDER BY r.submitted_at ASC
  `).all(form.id);

  const result = responses.map(r => {
    const answers = db.prepare(`
      SELECT question_id, answer_value FROM form_response_answers WHERE response_id = ?
    `).all(r.id);

    const answersMap = {};
    for (const a of answers) {
      try {
        answersMap[a.question_id] = JSON.parse(a.answer_value);
      } catch {
        answersMap[a.question_id] = a.answer_value;
      }
    }

    return {
      responseId:  r.id,
      submittedAt: r.submitted_at,
      user: r.user_id ? {
        id:       r.user_id,
        fullName: r.full_name,
        dept:     r.dept,
        role:     r.user_role,
        email:    r.email,
      } : null,
      answers: answersMap,
    };
  });

  // Aggregate analytics (full version with who-chose-what)
  const analytics = questions.map(q => {
    const qData = {
      id: q.id, text: q.question_text, type: q.question_type, required: q.is_required !== 0,
      answeredCount: result.filter(r => r.answers[q.id] !== undefined).length,
    };

    if (q.question_type === "multiple_choice" || q.question_type === "checkbox") {
      const opts   = q.options ? JSON.parse(q.options) : [];
      const counts = Object.fromEntries(opts.map(o => [o, 0]));
      const voters = Object.fromEntries(opts.map(o => [o, []])); // who chose each option

      for (const resp of result) {
        const val = resp.answers[q.id];
        if (!val) continue;
        const vals = Array.isArray(val) ? val : [val];
        for (const v of vals) {
          if (counts[v] !== undefined) {
            counts[v]++;
            voters[v].push(resp.user ? resp.user.fullName : "Anônimo");
          }
        }
      }
      qData.options = opts;
      qData.counts  = counts;
      qData.voters  = voters;
    } else if (q.question_type === "scale") {
      const entries = result
        .filter(r => r.answers[q.id] !== undefined)
        .map(r => ({ value: parseInt(r.answers[q.id]), user: r.user }))
        .filter(e => !isNaN(e.value));
      const nums = entries.map(e => e.value);
      const avg  = nums.length > 0 ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
      const dist = { 1: [], 2: [], 3: [], 4: [], 5: [] };
      for (const e of entries) if (dist[e.value]) dist[e.value].push(e.user ? e.user.fullName : "Anônimo");
      qData.average      = Math.round(avg * 10) / 10;
      qData.distribution = Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, { count: v.length, voters: v }]));
    } else {
      qData.answers = result
        .filter(r => r.answers[q.id])
        .map(r => ({ value: r.answers[q.id], user: r.user, submittedAt: r.submittedAt }));
    }
    return qData;
  });

  return res.json({
    form:      enrichForm(db, form, req.user.id),
    questions: questions.map(q => ({ id: q.id, text: q.question_text, type: q.question_type })),
    responses: result,
    analytics,
    totalResponses: result.length,
  });
});

// GET /api/forms/:id
router.get("/:id", requireAuth, (req, res) => {
  const db   = getDb();
  const form = db.prepare("SELECT * FROM forms WHERE id=?").get(req.params.id);
  if (!form) return res.status(404).json({ error: "Formulário não encontrado" });

  const questions = db.prepare("SELECT * FROM form_questions WHERE form_id=? ORDER BY display_order ASC").all(form.id);
  const enriched  = enrichForm(db, form, req.user.id);
  enriched.questions = questions.map(q => ({
    id: q.id, text: q.question_text, type: q.question_type,
    required: q.is_required !== 0, order: q.display_order,
    options: q.options ? JSON.parse(q.options) : null,
  }));
  return res.json(enriched);
});

// POST /api/forms
router.post("/", requireAuth, (req, res) => {
  if (!canCreate(req.user.role)) return res.status(403).json({ error: "Sem permissão para criar formulários" });

  const { title, description, questions, allowAnonymous, showResultsToRespondents } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Título obrigatório" });
  if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ error: "Pelo menos uma pergunta é necessária" });

  const db     = getDb();
  const formId = uuidv4();

  db.transaction(() => {
    db.prepare("INSERT INTO forms (id, title, description, created_by, allow_anonymous, show_results_to_respondents) VALUES (?,?,?,?,?,?)")
      .run(formId, title.trim(), description?.trim() || null, req.user.id, allowAnonymous ? 1 : 0, showResultsToRespondents ? 1 : 0);

    questions.forEach((q, i) => {
      const needsOptions = q.type === "multiple_choice" || q.type === "checkbox";
      db.prepare("INSERT INTO form_questions (id, form_id, question_text, question_type, is_required, display_order, options) VALUES (?,?,?,?,?,?,?)")
        .run(
          uuidv4(), formId, q.text?.trim() || "Pergunta", q.type || "short_text",
          q.required !== false ? 1 : 0, i,
          needsOptions && Array.isArray(q.options) ? JSON.stringify(q.options.filter(Boolean)) : null
        );
    });
  })();

  const authorName = db.prepare("SELECT full_name FROM users WHERE id=?").get(req.user.id)?.full_name || "Alguém";
  notifyAll(db, req.user.id, "form_new", formId, "Novo formulário disponível", `${authorName}: "${title.trim().slice(0, 60)}"`);

  return res.status(201).json(enrichForm(db, db.prepare("SELECT * FROM forms WHERE id=?").get(formId), req.user.id));
});

// PATCH /api/forms/:id
router.patch("/:id", requireAuth, (req, res) => {
  const db   = getDb();
  const form = db.prepare("SELECT * FROM forms WHERE id=?").get(req.params.id);
  if (!form) return res.status(404).json({ error: "Formulário não encontrado" });

  const isOwner = form.created_by === req.user.id;
  if (!isOwner && !isAdmin(req.user.role)) return res.status(403).json({ error: "Sem permissão" });

  const { isActive, title, description, showResultsToRespondents } = req.body;

  if (isActive !== undefined) {
    db.prepare("UPDATE forms SET is_active=?, closed_at=? WHERE id=?")
      .run(isActive ? 1 : 0, isActive ? null : new Date().toISOString().replace("T", " ").slice(0, 19), form.id);
  }
  if (title?.trim()) db.prepare("UPDATE forms SET title=? WHERE id=?").run(title.trim(), form.id);
  if (description !== undefined) db.prepare("UPDATE forms SET description=? WHERE id=?").run(description?.trim() || null, form.id);
  if (showResultsToRespondents !== undefined) {
    db.prepare("UPDATE forms SET show_results_to_respondents=? WHERE id=?").run(showResultsToRespondents ? 1 : 0, form.id);
  }

  return res.json(enrichForm(db, db.prepare("SELECT * FROM forms WHERE id=?").get(form.id), req.user.id));
});

// DELETE /api/forms/:id
router.delete("/:id", requireAuth, (req, res) => {
  const db   = getDb();
  const form = db.prepare("SELECT * FROM forms WHERE id=?").get(req.params.id);
  if (!form) return res.status(404).json({ error: "Formulário não encontrado" });

  const isOwner = form.created_by === req.user.id;
  if (!isOwner && !isAdmin(req.user.role)) return res.status(403).json({ error: "Sem permissão" });

  db.transaction(() => {
    db.prepare("DELETE FROM form_response_answers WHERE response_id IN (SELECT id FROM form_responses WHERE form_id=?)").run(form.id);
    db.prepare("DELETE FROM form_responses WHERE form_id=?").run(form.id);
    db.prepare("DELETE FROM form_questions WHERE form_id=?").run(form.id);
    db.prepare("DELETE FROM forms WHERE id=?").run(form.id);
  })();
  return res.json({ ok: true });
});

// POST /api/forms/:id/respond
router.post("/:id/respond", requireAuth, (req, res) => {
  const db   = getDb();
  const form = db.prepare("SELECT * FROM forms WHERE id=?").get(req.params.id);
  if (!form)                return res.status(404).json({ error: "Formulário não encontrado" });
  if (form.is_active === 0) return res.status(400).json({ error: "Este formulário está encerrado" });

  const existing = db.prepare("SELECT id FROM form_responses WHERE form_id=? AND user_id=?").get(form.id, req.user.id);
  if (existing) return res.status(400).json({ error: "Você já respondeu este formulário" });

  const { answers } = req.body;
  if (!answers || typeof answers !== "object") return res.status(400).json({ error: "Respostas inválidas" });

  const questions = db.prepare("SELECT * FROM form_questions WHERE form_id=?").all(form.id);
  for (const q of questions) {
    if (q.is_required) {
      const val     = answers[q.id];
      const isEmpty = val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0);
      if (isEmpty) return res.status(400).json({ error: `Responda a pergunta obrigatória: "${q.question_text}"` });
    }
  }

  const responseId = uuidv4();
  db.transaction(() => {
    db.prepare("INSERT INTO form_responses (id, form_id, user_id) VALUES (?,?,?)")
      .run(responseId, form.id, req.user.id);
    for (const [questionId, value] of Object.entries(answers)) {
      if (value === undefined || value === null || value === "") continue;
      const answerVal = Array.isArray(value) ? JSON.stringify(value) : String(value);
      db.prepare("INSERT INTO form_response_answers (id, response_id, question_id, answer_value) VALUES (?,?,?,?)")
        .run(uuidv4(), responseId, questionId, answerVal);
    }
  })();

  return res.json({ ok: true });
});

module.exports = router;
