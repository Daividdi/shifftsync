import React, { useState, useEffect } from "react";
import {
  ClipboardList, ChevronLeft, BarChart2, Users, Download,
  FileSpreadsheet, ChevronDown, ChevronUp, Calendar, Lock,
  Loader2, AlertTriangle, CheckCircle2, Unlock,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";
import * as XLSX from "xlsx";

const Q_TYPE_CFG = {
  short_text:      { label: "Texto curto",       icon: "T",  color: "#3B82F6" },
  long_text:       { label: "Parágrafo",          icon: "¶",  color: "#8B5CF6" },
  multiple_choice: { label: "Múltipla escolha",   icon: "◉",  color: "#F59E0B" },
  checkbox:        { label: "Caixas de seleção",  icon: "☑",  color: "#10B981" },
  scale:           { label: "Escala (1 a 5)",     icon: "★",  color: "#EC4899" },
};

const ROLE_LABELS = { ti: "TI", hr: "RH", leader: "Líder", employee: "Funcionário", gerencia: "Gerência" };

function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function ago(ts) {
  if (!ts) return "";
  const s = Math.round((Date.now() - new Date(ts)) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)}m atrás`;
  if (s < 86400) return `${Math.floor(s / 3600)}h atrás`;
  return `${Math.floor(s / 86400)}d atrás`;
}

function Bar({ label, count, pct, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ opacity: 0.55, fontVariantNumeric: "tabular-nums" }}>{count} ({pct}%)</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "rgba(0,0,0,0.07)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: color, transition: "width 0.7s cubic-bezier(0.34,1.2,0.64,1)" }} />
      </div>
    </div>
  );
}

// Collapsible list of voter names under a choice option
function VoterList({ voters, T }) {
  const [open, setOpen] = useState(false);
  if (!voters || voters.length === 0) return null;
  return (
    <div style={{ marginTop: 4, marginBottom: 6 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: "flex", alignItems: "center", gap: 5, padding: "2px 8px",
        borderRadius: 20, border: `1px solid ${T.border}`, background: "transparent",
        color: T.t7, cursor: "pointer", fontSize: 11, fontFamily: "'Sora', sans-serif",
      }}>
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        {voters.length} respondente{voters.length !== 1 ? "s" : ""}
      </button>
      {open && (
        <div style={{
          marginTop: 6, padding: "8px 12px", borderRadius: 8,
          background: T.bgDeep, border: `1px solid ${T.border}`,
          display: "flex", flexWrap: "wrap", gap: 6,
        }}>
          {voters.map((v, i) => (
            <span key={i} style={{
              fontSize: 11.5, padding: "2px 8px", borderRadius: 20,
              background: T.bgCard, border: `1px solid ${T.border}`, color: T.t3,
            }}>{v}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── XLSX Export ──────────────────────────────────────────────────────────────

function exportXLSX(reportData) {
  const { form, questions, responses } = reportData;
  const wb = XLSX.utils.book_new();

  // Sheet 1 — Resumo
  const summaryRows = [
    ["Formulário", form.title],
    ["Descrição", form.description || "—"],
    ["Criado por", form.createdBy?.fullName || "—"],
    ["Criado em", fmt(form.createdAt)],
    ["Status", form.isActive ? "Aberto" : "Encerrado"],
    ["Anônimo", form.allowAnonymous ? "Sim" : "Não"],
    ["Total de respostas", responses.length],
  ];
  const wsSum = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSum["!cols"] = [{ wch: 22 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsSum, "Resumo");

  // Sheet 2 — Respostas individuais (one row per respondent)
  const headers = ["Nome Completo", "Departamento", "Cargo", "E-mail", "Data da Resposta"];
  questions.forEach(q => headers.push(q.text));

  const rows = responses.map(r => {
    const row = [
      r.user?.fullName  || (form.allowAnonymous ? "Anônimo" : "—"),
      r.user?.dept      || "—",
      ROLE_LABELS[r.user?.role] || r.user?.role || "—",
      r.user?.email     || "—",
      fmt(r.submittedAt),
    ];
    questions.forEach(q => {
      const val = r.answers[q.id];
      if (val === undefined || val === null) { row.push(""); return; }
      if (Array.isArray(val)) { row.push(val.join(", ")); return; }
      row.push(String(val));
    });
    return row;
  });

  const wsResp = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const colWidths = headers.map((h, i) => ({ wch: i < 5 ? 22 : Math.max(20, h.length + 4) }));
  wsResp["!cols"] = colWidths;
  XLSX.utils.book_append_sheet(wb, wsResp, "Respostas");

  // Sheet 3 — Análise por pergunta (choice + scale)
  const analysisRows = [["Pergunta", "Tipo", "Opção / Valor", "Contagem", "Percentual (%)"]];
  reportData.analytics.forEach(qa => {
    if (qa.type === "multiple_choice" || qa.type === "checkbox") {
      const total = Object.values(qa.counts || {}).reduce((s, c) => s + c, 0);
      (qa.options || []).forEach(opt => {
        const count = qa.counts?.[opt] || 0;
        const pct   = total > 0 ? Math.round(count / total * 100) : 0;
        analysisRows.push([qa.text, Q_TYPE_CFG[qa.type]?.label || qa.type, opt, count, pct]);
      });
    } else if (qa.type === "scale") {
      analysisRows.push([qa.text, "Escala", "Média", qa.average, ""]);
      [5, 4, 3, 2, 1].forEach(n => {
        const d     = qa.distribution?.[n];
        const count = d?.count || 0;
        const total = Object.values(qa.distribution || {}).reduce((s, v) => s + (v?.count || 0), 0);
        const pct   = total > 0 ? Math.round(count / total * 100) : 0;
        analysisRows.push(["", "", `${n} estrela${n !== 1 ? "s" : ""}`, count, pct]);
      });
    }
    analysisRows.push([]);
  });

  if (analysisRows.length > 1) {
    const wsAn = XLSX.utils.aoa_to_sheet(analysisRows);
    wsAn["!cols"] = [{ wch: 40 }, { wch: 18 }, { wch: 24 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsAn, "Análise");
  }

  const filename = `formulario-${form.title.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-")}-respostas.xlsx`;
  XLSX.writeFile(wb, filename);
}

// ─── QuestionReport ────────────────────────────────────────────────────────────

function QuestionReport({ qa, T }) {
  const cfg = Q_TYPE_CFG[qa.type] || Q_TYPE_CFG.short_text;

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14,
      padding: "18px 20px", marginBottom: 14, boxShadow: "0 1px 3px #0000000a",
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: cfg.color + "18", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, color: cfg.color, fontWeight: 700,
        }}>{cfg.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: T.t1 }}>{qa.text}</div>
          <div style={{ fontSize: 11.5, color: T.t7, marginTop: 1 }}>
            {cfg.label} · {qa.answeredCount} resposta{qa.answeredCount !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {(qa.type === "multiple_choice" || qa.type === "checkbox") && (
        <div>
          {(qa.options || []).map(opt => {
            const count  = qa.counts?.[opt] || 0;
            const total  = Object.values(qa.counts || {}).reduce((s, c) => s + c, 0);
            const pct    = total > 0 ? Math.round(count / total * 100) : 0;
            const voters = qa.voters?.[opt] || [];
            return (
              <div key={opt}>
                <Bar label={opt} count={count} pct={pct} color={cfg.color} />
                <VoterList voters={voters} T={T} />
              </div>
            );
          })}
        </div>
      )}

      {qa.type === "scale" && (
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: cfg.color, marginBottom: 14, fontVariantNumeric: "tabular-nums" }}>
            {qa.average} <span style={{ fontSize: 14, color: T.t7, fontWeight: 400 }}>/ 5</span>
          </div>
          {[5, 4, 3, 2, 1].map(n => {
            const d      = qa.distribution?.[n];
            const count  = d?.count || 0;
            const voters = d?.voters || [];
            const total  = Object.values(qa.distribution || {}).reduce((s, v) => s + (v?.count || 0), 0);
            const pct    = total > 0 ? Math.round(count / total * 100) : 0;
            return (
              <div key={n}>
                <Bar label={`${n} ${"★".repeat(n)}${"☆".repeat(5 - n)}`} count={count} pct={pct} color={cfg.color} />
                <VoterList voters={voters} T={T} />
              </div>
            );
          })}
        </div>
      )}

      {(qa.type === "short_text" || qa.type === "long_text") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(qa.answers || []).length === 0
            ? <div style={{ fontSize: 13, color: T.t7, padding: "16px 0", textAlign: "center" }}>Sem respostas</div>
            : (qa.answers || []).map((a, i) => (
              <div key={i} style={{
                background: T.bgApp, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px",
              }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: a.value ? 6 : 0 }}>
                  {a.user && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.t2 }}>{a.user.fullName}</div>
                  )}
                  {a.user?.dept && <div style={{ fontSize: 11, color: T.t7 }}>{a.user.dept}</div>}
                  {a.user?.role && (
                    <div style={{
                      fontSize: 10, padding: "1px 7px", borderRadius: 20,
                      background: T.bgDeep, border: `1px solid ${T.border}`, color: T.t6,
                    }}>{ROLE_LABELS[a.user.role] || a.user.role}</div>
                  )}
                  <div style={{ marginLeft: "auto", fontSize: 11, color: T.t8 }}>{fmt(a.submittedAt)}</div>
                </div>
                <div style={{ fontSize: 13, color: T.t3, lineHeight: 1.55 }}>{a.value}</div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ─── ResponsesTable (por respondente) ─────────────────────────────────────────

function ResponsesTable({ questions, responses, T }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date"); // 'date' | 'name' | 'dept'
  const [sortAsc, setSortAsc] = useState(false);

  function toggleSort(field) {
    if (sortBy === field) setSortAsc(v => !v);
    else { setSortBy(field); setSortAsc(true); }
  }

  const filtered = responses
    .filter(r => !search || (r.user?.fullName || "").toLowerCase().includes(search.toLowerCase()) || (r.user?.dept || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let av, bv;
      if (sortBy === "date")  { av = a.submittedAt; bv = b.submittedAt; }
      else if (sortBy === "name") { av = a.user?.fullName || ""; bv = b.user?.fullName || ""; }
      else                    { av = a.user?.dept || ""; bv = b.user?.dept || ""; }
      return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });

  function SortBtn({ field, label }) {
    const active = sortBy === field;
    return (
      <button onClick={() => toggleSort(field)} style={{
        background: "none", border: "none", cursor: "pointer",
        color: active ? T.accent : T.t5, fontSize: 12, fontWeight: active ? 700 : 400,
        fontFamily: "'Sora', sans-serif", display: "flex", alignItems: "center", gap: 4,
        padding: "4px 0",
      }}>
        {label} {active ? (sortAsc ? "↑" : "↓") : ""}
      </button>
    );
  }

  function cellVal(r, q) {
    const val = r.answers[q.id];
    if (val === undefined || val === null) return "—";
    if (Array.isArray(val)) return val.join(", ");
    return String(val);
  }

  if (responses.length === 0) return (
    <div style={{ textAlign: "center", padding: "40px 0", color: T.t7 }}>
      <Users size={32} color={T.t9} style={{ marginBottom: 10 }} />
      <div style={{ fontSize: 14, color: T.t4 }}>Nenhuma resposta registrada</div>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou departamento..."
          style={{
            padding: "8px 12px", borderRadius: 8, width: "100%", boxSizing: "border-box",
            background: T.bgApp, border: `1px solid ${T.border}`,
            color: T.t1, fontSize: 13, fontFamily: "'Sora', sans-serif", outline: "none",
          }}
        />
      </div>

      <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${T.border}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: T.bgDeep, borderBottom: `1px solid ${T.border}` }}>
              <th style={{ padding: "10px 14px", textAlign: "left", whiteSpace: "nowrap" }}>
                <SortBtn field="name" label="Nome" />
              </th>
              <th style={{ padding: "10px 14px", textAlign: "left", whiteSpace: "nowrap" }}>
                <SortBtn field="dept" label="Depto" />
              </th>
              <th style={{ padding: "10px 14px", textAlign: "left", whiteSpace: "nowrap", color: T.t5, fontWeight: 600 }}>Cargo</th>
              <th style={{ padding: "10px 14px", textAlign: "left", whiteSpace: "nowrap" }}>
                <SortBtn field="date" label="Data" />
              </th>
              {questions.map(q => (
                <th key={q.id} style={{
                  padding: "10px 14px", textAlign: "left", minWidth: 160, maxWidth: 240,
                  color: T.t5, fontWeight: 600, fontSize: 11.5,
                }}>
                  {q.text.length > 40 ? q.text.slice(0, 37) + "…" : q.text}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.responseId} style={{
                borderBottom: `1px solid ${T.borderSubtle}`,
                background: i % 2 === 0 ? "transparent" : T.bgApp,
              }}>
                <td style={{ padding: "10px 14px", fontWeight: 600, color: T.t1, whiteSpace: "nowrap" }}>
                  {r.user?.fullName || <span style={{ color: T.t7 }}>Anônimo</span>}
                </td>
                <td style={{ padding: "10px 14px", color: T.t6, whiteSpace: "nowrap" }}>{r.user?.dept || "—"}</td>
                <td style={{ padding: "10px 14px", color: T.t6, whiteSpace: "nowrap" }}>
                  {ROLE_LABELS[r.user?.role] || r.user?.role || "—"}
                </td>
                <td style={{ padding: "10px 14px", color: T.t7, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(r.submittedAt)}
                </td>
                {questions.map(q => (
                  <td key={q.id} style={{
                    padding: "10px 14px", color: T.t3, maxWidth: 240,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }} title={cellVal(r, q)}>
                    {cellVal(r, q)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: T.t8, marginTop: 8 }}>
        {filtered.length} de {responses.length} respondentes
      </div>
    </div>
  );
}

// ─── DetailView ────────────────────────────────────────────────────────────────

function DetailView({ formId, onBack, T }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [subTab,  setSubTab]  = useState("questions"); // 'questions' | 'respondents'
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");

  useEffect(() => {
    api.get(`/forms/${formId}/full-report`).then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, [formId]);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <Loader2 size={24} color="#6366F1" style={{ animation: "spin 0.7s linear infinite" }} />
    </div>
  );

  if (!data) return (
    <div style={{ textAlign: "center", padding: 60, color: T.t7 }}>
      <AlertTriangle size={32} style={{ marginBottom: 12 }} />
      <div>Erro ao carregar relatório</div>
    </div>
  );

  const filteredResponses = data.responses.filter(r => {
    const dt = new Date(r.submittedAt);
    if (dateFrom && dt < new Date(dateFrom)) return false;
    if (dateTo   && dt > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  const filteredData = { ...data, responses: filteredResponses };

  // Re-compute analytics for filtered responses
  const analyticsFiltered = data.analytics.map(qa => {
    const newQa = { ...qa };
    if (qa.type === "short_text" || qa.type === "long_text") {
      const respIds = new Set(filteredResponses.map(r => r.responseId));
      newQa.answers = (qa.answers || []).filter(a => {
        // Match by user + submittedAt since we don't have responseId here
        return filteredResponses.some(r => r.user?.fullName === a.user?.fullName || !a.user);
      });
    }
    return newQa;
  });

  return (
    <div>
      {/* Detail header */}
      <div style={{
        background: "linear-gradient(135deg, #1D4ED8 0%, #6366F1 100%)",
        borderRadius: 16, padding: "20px 24px", marginBottom: 20,
        color: "#fff", display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <BarChart2 size={20} color="rgba(255,255,255,0.85)" />
            <div style={{ fontSize: 17, fontWeight: 800 }}>{data.form.title}</div>
          </div>
          {data.form.description && (
            <div style={{ fontSize: 12.5, opacity: 0.7, marginBottom: 6 }}>{data.form.description}</div>
          )}
          <div style={{ fontSize: 11.5, opacity: 0.65, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span>Criado por {data.form.createdBy?.fullName}</span>
            <span>{data.form.questionCount} perguntas</span>
            <span>{data.form.isActive ? "🟢 Aberto" : "⚫ Encerrado"}</span>
            {data.form.allowAnonymous && <span>🔒 Anônimo</span>}
          </div>
        </div>
        <div style={{ textAlign: "center", padding: "12px 18px", background: "rgba(255,255,255,0.12)", borderRadius: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {filteredResponses.length}
          </div>
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 3 }}>
            {dateFrom || dateTo ? "filtradas" : "resposta" + (data.totalResponses !== 1 ? "s" : "")}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        {/* Sub-tabs */}
        <div style={{ display: "flex", gap: 4, background: T.bgDeep, borderRadius: 10, padding: 4 }}>
          {[
            { id: "questions",   label: "Por pergunta" },
            { id: "respondents", label: "Por respondente" },
          ].map(t => (
            <button key={t.id} onClick={() => setSubTab(t.id)} style={{
              padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer",
              background: subTab === t.id ? T.bgCard : "transparent",
              color: subTab === t.id ? T.t1 : T.t6,
              fontSize: 12.5, fontWeight: subTab === t.id ? 700 : 400,
              fontFamily: "'Sora', sans-serif",
              boxShadow: subTab === t.id ? "0 1px 4px #00000018" : "none",
              transition: "background 0.15s",
            }}>{t.label}</button>
          ))}
        </div>

        {/* Date filters */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 4 }}>
          <Calendar size={13} color={T.t7} />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{
            padding: "5px 8px", borderRadius: 7, border: `1px solid ${T.border}`,
            background: T.bgApp, color: T.t2, fontSize: 12, fontFamily: "'Sora', sans-serif", outline: "none",
          }} />
          <span style={{ color: T.t7, fontSize: 12 }}>até</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{
            padding: "5px 8px", borderRadius: 7, border: `1px solid ${T.border}`,
            background: T.bgApp, color: T.t2, fontSize: 12, fontFamily: "'Sora', sans-serif", outline: "none",
          }} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }} style={{
              padding: "4px 8px", borderRadius: 6, border: `1px solid ${T.border}`,
              background: T.bgApp, color: T.t6, cursor: "pointer", fontSize: 11,
              fontFamily: "'Sora', sans-serif",
            }}>✕ limpar</button>
          )}
        </div>

        {/* Export */}
        <button onClick={() => exportXLSX({ ...filteredData, analytics: analyticsFiltered, questions: data.questions })} style={{
          marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
          borderRadius: 8, border: "none", background: "#059669", color: "#fff",
          fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "'Sora', sans-serif",
        }}>
          <FileSpreadsheet size={14} /> Exportar XLSX
        </button>
      </div>

      {/* Content */}
      {subTab === "questions" && (
        data.analytics.map((qa, i) => <QuestionReport key={i} qa={qa} T={T} />)
      )}
      {subTab === "respondents" && (
        <ResponsesTable questions={data.questions} responses={filteredResponses} T={T} />
      )}
    </div>
  );
}

// ─── FormListCard ──────────────────────────────────────────────────────────────

function FormListCard({ form, onOpen, T }) {
  const statusColor = form.isActive ? "#22C55E" : "#9CA3AF";
  return (
    <div
      onClick={() => onOpen(form.id)}
      style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: "16px 18px", cursor: "pointer", position: "relative", overflow: "hidden",
        boxShadow: "0 1px 3px #0000000a", transition: "border-color 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#6366F155"; e.currentTarget.style.boxShadow = "0 4px 18px #6366F110"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = "0 1px 3px #0000000a"; }}
    >
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${statusColor}, ${statusColor}66)`,
        borderRadius: "14px 14px 0 0",
      }} />

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: "#6366F118", border: "1px solid #6366F128",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <ClipboardList size={17} color="#6366F1" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.t1, marginBottom: 3 }}>{form.title}</div>
          {form.description && (
            <div style={{
              fontSize: 12, color: T.t6,
              overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            }}>{form.description}</div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11.5, color: T.t7 }}>{form.questionCount} pergunta{form.questionCount !== 1 ? "s" : ""}</span>
        <span style={{
          fontSize: 13, fontWeight: 800, color: "#6366F1", fontVariantNumeric: "tabular-nums",
        }}>{form.responseCount} <span style={{ fontSize: 11, fontWeight: 400, color: T.t7 }}>resposta{form.responseCount !== 1 ? "s" : ""}</span></span>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
          background: statusColor + "18", color: statusColor,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: statusColor, display: "inline-block" }} />
          {form.isActive ? "Aberto" : "Encerrado"}
        </span>
        <span style={{ fontSize: 11, color: T.t8, marginLeft: "auto" }}>
          {form.createdBy?.fullName} · {ago(form.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ─── Main Export ───────────────────────────────────────────────────────────────

export default function FormsReport() {
  const { theme: T } = useTheme();
  const [forms,         setForms]        = useState([]);
  const [loading,       setLoading]      = useState(true);
  const [selectedFormId, setSelectedFormId] = useState(null);

  useEffect(() => {
    api.get("/forms").then(r => { setForms(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <Loader2 size={24} color="#6366F1" style={{ animation: "spin 0.7s linear infinite" }} />
    </div>
  );

  if (selectedFormId) return (
    <div>
      <button onClick={() => setSelectedFormId(null)} style={{
        display: "flex", alignItems: "center", gap: 6, padding: "4px 0", marginBottom: 16,
        border: "none", background: "transparent", color: T.t6,
        cursor: "pointer", fontSize: 12.5, fontFamily: "'Sora', sans-serif",
      }}>
        <ChevronLeft size={14} /> Voltar à lista
      </button>
      <DetailView formId={selectedFormId} onBack={() => setSelectedFormId(null)} T={T} />
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <ClipboardList size={18} color="#6366F1" />
          <div style={{ fontSize: 15, fontWeight: 800, color: T.t1 }}>Relatórios de Formulários</div>
        </div>
        <div style={{ fontSize: 12.5, color: T.t6 }}>
          Selecione um formulário para ver análises completas, exportar dados e visualizar respostas individuais.
        </div>
      </div>

      {forms.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px" }}>
          <ClipboardList size={36} color={T.t9} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 14, color: T.t4 }}>Nenhum formulário encontrado</div>
          <div style={{ fontSize: 12.5, color: T.t7, marginTop: 4 }}>Crie formulários na seção Comunicação › Formulários.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {forms.map(f => (
            <FormListCard key={f.id} form={f} onOpen={setSelectedFormId} T={T} />
          ))}
        </div>
      )}
    </div>
  );
}
