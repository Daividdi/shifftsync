import React, { useState, useEffect, useRef } from "react";
import {
  ClipboardList, Plus, ChevronLeft, CheckCircle2, Users,
  Trash2, Lock, Unlock, BarChart2, Send, AlertTriangle,
  Loader2, X, ChevronDown, ArrowUp, ArrowDown, MoreHorizontal,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../hooks/useAuth";
import api from "../api/client";

const Q_TYPE_CFG = {
  short_text:      { label: "Texto curto",         icon: "T",  color: "#3B82F6" },
  long_text:       { label: "Parágrafo",            icon: "¶",  color: "#8B5CF6" },
  multiple_choice: { label: "Múltipla escolha",     icon: "◉",  color: "#F59E0B" },
  checkbox:        { label: "Caixas de seleção",    icon: "☑",  color: "#10B981" },
  scale:           { label: "Escala (1 a 5)",       icon: "★",  color: "#EC4899" },
};
const Q_TYPES = Object.entries(Q_TYPE_CFG).map(([id, cfg]) => ({ id, ...cfg }));

function ago(ts) {
  if (!ts) return "";
  const s = Math.round((Date.now() - new Date(ts)) / 1000);
  if (s < 60)    return "agora";
  if (s < 3600)  return `${Math.floor(s / 60)}m atrás`;
  if (s < 86400) return `${Math.floor(s / 3600)}h atrás`;
  return `${Math.floor(s / 86400)}d atrás`;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Toggle({ checked, onChange }) {
  return (
    <div onClick={onChange} style={{
      width: 34, height: 18, borderRadius: 9, cursor: "pointer",
      background: checked ? "#6366F1" : "rgba(0,0,0,0.15)",
      border: `1px solid ${checked ? "#6366F1" : "rgba(0,0,0,0.12)"}`,
      position: "relative", flexShrink: 0, transition: "background 0.15s",
    }}>
      <div style={{
        width: 14, height: 14, borderRadius: "50%", background: "#fff",
        position: "absolute", top: 1, left: checked ? 17 : 1,
        transition: "left 0.15s cubic-bezier(.4,0,.2,1)", boxShadow: "0 1px 3px #0002",
      }} />
    </div>
  );
}

function Bar({ label, count, pct, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ opacity: 0.55, fontVariantNumeric: "tabular-nums" }}>{count} ({pct}%)</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "rgba(0,0,0,0.07)", overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 4, background: color,
          transition: "width 0.7s cubic-bezier(0.34,1.2,0.64,1)",
        }} />
      </div>
    </div>
  );
}

// ─── QuestionInput (fill view) ────────────────────────────────────────────────

function QuestionInput({ q, value, onChange, T, error }) {
  const cfg = Q_TYPE_CFG[q.type] || Q_TYPE_CFG.short_text;
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${error ? "#EF4444" : T.border}`,
      borderRadius: 14, padding: "18px 20px", marginBottom: 14,
      boxShadow: error ? "0 0 0 3px #EF444418" : "0 1px 3px #0000000a",
      transition: "border-color 0.15s, box-shadow 0.15s",
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: cfg.color + "18", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, color: cfg.color, fontWeight: 700,
        }}>{cfg.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.t1, lineHeight: 1.4 }}>
            {q.text}
            {q.required && <span style={{ color: "#EF4444", marginLeft: 4 }}>*</span>}
          </div>
          {error && <div style={{ fontSize: 11.5, color: "#EF4444", marginTop: 3 }}>{error}</div>}
        </div>
      </div>

      {q.type === "short_text" && (
        <input value={value || ""} onChange={e => onChange(e.target.value)} placeholder="Sua resposta..." style={{
          width: "100%", padding: "10px 12px", borderRadius: 8, boxSizing: "border-box",
          background: T.bgApp, border: `1px solid ${T.border}`,
          color: T.t1, fontSize: 13, fontFamily: "'Sora', sans-serif", outline: "none",
        }} />
      )}

      {q.type === "long_text" && (
        <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder="Sua resposta..." rows={4} style={{
          width: "100%", padding: "10px 12px", borderRadius: 8, boxSizing: "border-box",
          background: T.bgApp, border: `1px solid ${T.border}`,
          color: T.t1, fontSize: 13, fontFamily: "'Sora', sans-serif", outline: "none", resize: "vertical",
        }} />
      )}

      {q.type === "multiple_choice" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(q.options || []).map((opt, i) => (
            <label key={i} onClick={() => onChange(opt)} style={{
              display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              padding: "9px 12px", borderRadius: 9,
              background: value === opt ? cfg.color + "12" : "transparent",
              border: `1px solid ${value === opt ? cfg.color + "55" : T.border}`,
              transition: "background 0.12s, border-color 0.12s",
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${value === opt ? cfg.color : T.t7}`,
                background: value === opt ? cfg.color : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.12s",
              }}>
                {value === opt && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
              </div>
              <span style={{ fontSize: 13, color: T.t2 }}>{opt}</span>
            </label>
          ))}
        </div>
      )}

      {q.type === "checkbox" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(q.options || []).map((opt, i) => {
            const checked = Array.isArray(value) && value.includes(opt);
            return (
              <label key={i} onClick={() => {
                const arr = Array.isArray(value) ? [...value] : [];
                onChange(checked ? arr.filter(v => v !== opt) : [...arr, opt]);
              }} style={{
                display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                padding: "9px 12px", borderRadius: 9,
                background: checked ? cfg.color + "12" : "transparent",
                border: `1px solid ${checked ? cfg.color + "55" : T.border}`,
                transition: "background 0.12s, border-color 0.12s",
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  border: `2px solid ${checked ? cfg.color : T.t7}`,
                  background: checked ? cfg.color : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.12s",
                }}>
                  {checked && <X size={10} color="#fff" strokeWidth={3} />}
                </div>
                <span style={{ fontSize: 13, color: T.t2 }}>{opt}</span>
              </label>
            );
          })}
        </div>
      )}

      {q.type === "scale" && (
        <div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => onChange(n)} style={{
                width: 48, height: 48, borderRadius: 11, flexShrink: 0,
                border: `2px solid ${value === n ? cfg.color : T.border}`,
                background: value === n ? cfg.color : T.bgApp,
                color: value === n ? "#fff" : T.t3,
                fontSize: 17, fontWeight: 800, cursor: "pointer",
                transition: "all 0.15s cubic-bezier(0.34,1.56,0.64,1)",
                transform: value === n ? "scale(1.12)" : "scale(1)",
                fontFamily: "'Sora', sans-serif",
              }}>{n}</button>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.t8, marginTop: 8 }}>
            <span>Discordo totalmente</span>
            <span>Concordo totalmente</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── QuestionResult (results view) ───────────────────────────────────────────

function QuestionResult({ qa, T }) {
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
            {qa.answeredCount} resposta{qa.answeredCount !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {(qa.type === "multiple_choice" || qa.type === "checkbox") && (
        <div>
          {(qa.options || []).map(opt => {
            const count = qa.counts?.[opt] || 0;
            const total = Object.values(qa.counts || {}).reduce((s, c) => s + c, 0);
            const pct   = total > 0 ? Math.round(count / total * 100) : 0;
            return <Bar key={opt} label={opt} count={count} pct={pct} color={cfg.color} />;
          })}
        </div>
      )}

      {qa.type === "scale" && (
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: cfg.color, marginBottom: 14, fontVariantNumeric: "tabular-nums" }}>
            {qa.average} <span style={{ fontSize: 14, color: T.t7, fontWeight: 400 }}>/ 5</span>
          </div>
          {[5, 4, 3, 2, 1].map(n => {
            const count = qa.distribution?.[n] || 0;
            const total = Object.values(qa.distribution || {}).reduce((s, c) => s + c, 0);
            const pct   = total > 0 ? Math.round(count / total * 100) : 0;
            return <Bar key={n} label={`${n} ${"★".repeat(n)}${"☆".repeat(5 - n)}`} count={count} pct={pct} color={cfg.color} />;
          })}
        </div>
      )}

      {(qa.type === "short_text" || qa.type === "long_text") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(qa.answers || []).length === 0
            ? <div style={{ fontSize: 13, color: T.t7, padding: "16px 0", textAlign: "center" }}>Sem respostas ainda</div>
            : (qa.answers || []).map((a, i) => (
              <div key={i} style={{
                background: T.bgApp, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px",
              }}>
                {a.responderName && <div style={{ fontSize: 11, color: T.t7, marginBottom: 4, fontWeight: 600 }}>{a.responderName}</div>}
                <div style={{ fontSize: 13, color: T.t2, lineHeight: 1.55 }}>{a.value}</div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ─── FormCard ─────────────────────────────────────────────────────────────────

function FormCard({ form, canManage, onFill, onResults, onDelete, onToggleActive, T }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    if (menuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const statusColor = form.isActive ? "#22C55E" : "#9CA3AF";

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16,
      padding: "18px 20px", position: "relative", overflow: "hidden",
      boxShadow: "0 1px 3px #0000000a", transition: "border-color 0.15s, box-shadow 0.15s",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#6366F155"; e.currentTarget.style.boxShadow = "0 4px 18px #6366F110"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = "0 1px 3px #0000000a"; }}
    >
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${statusColor}, ${statusColor}66)`,
        borderRadius: "16px 16px 0 0",
      }} />

      {/* Title row */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11, flexShrink: 0,
          background: "#6366F118", border: "1px solid #6366F128",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <ClipboardList size={18} color="#6366F1" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.t1, marginBottom: 3 }}>{form.title}</div>
          {form.description && (
            <div style={{
              fontSize: 12.5, color: T.t6, lineHeight: 1.5,
              overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            }}>{form.description}</div>
          )}
        </div>
        {canManage && (
          <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
            <button onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }} style={{
              width: 30, height: 30, borderRadius: 7, background: "transparent",
              border: `1px solid ${T.border}`, color: T.t6, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}><MoreHorizontal size={14} /></button>
            {menuOpen && (
              <div style={{
                position: "absolute", right: 0, top: 36, zIndex: 100,
                background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10,
                padding: "4px", minWidth: 168, boxShadow: "0 8px 28px #00000018",
              }}>
                <button onClick={() => { onToggleActive(); setMenuOpen(false); }} style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "8px 12px", borderRadius: 7, border: "none", background: "transparent",
                  color: T.t2, cursor: "pointer", fontSize: 12.5, fontFamily: "'Sora', sans-serif",
                }}>
                  {form.isActive ? <><Lock size={13} /> Encerrar formulário</> : <><Unlock size={13} /> Reabrir formulário</>}
                </button>
                <button onClick={() => { onDelete(); setMenuOpen(false); }} style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "8px 12px", borderRadius: 7, border: "none", background: "transparent",
                  color: "#EF4444", cursor: "pointer", fontSize: 12.5, fontFamily: "'Sora', sans-serif",
                }}>
                  <Trash2 size={13} /> Excluir formulário
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Meta badges */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <span style={{ fontSize: 11.5, color: T.t7 }}>{form.questionCount} pergunta{form.questionCount !== 1 ? "s" : ""}</span>
        <span style={{ color: T.t9, fontSize: 10 }}>·</span>
        <span style={{ fontSize: 11.5, color: T.t7, display: "flex", alignItems: "center", gap: 3 }}>
          <Users size={11} /> {form.responseCount}
        </span>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
          background: statusColor + "18", color: statusColor,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: statusColor, display: "inline-block" }} />
          {form.isActive ? "Aberto" : "Encerrado"}
        </span>
        {form.hasResponded && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
            background: "#22C55E18", color: "#22C55E",
          }}>
            <CheckCircle2 size={11} /> Respondido
          </span>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 11.5, color: T.t8 }}>
          {form.createdBy?.fullName} · {ago(form.createdAt)}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(canManage || (form.showResultsToRespondents && form.hasResponded)) && (
            <button onClick={onResults} style={{
              display: "flex", alignItems: "center", gap: 5, padding: "7px 12px",
              borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgApp,
              color: T.t3, fontSize: 12, fontWeight: 600, cursor: "pointer",
              fontFamily: "'Sora', sans-serif",
            }}>
              <BarChart2 size={13} /> {canManage ? "Resultados" : "Ver resultados"}
            </button>
          )}
          <button
            onClick={onFill}
            disabled={!form.isActive || form.hasResponded}
            style={{
              display: "flex", alignItems: "center", gap: 5, padding: "7px 14px",
              borderRadius: 8, border: "none", fontFamily: "'Sora', sans-serif",
              background: form.hasResponded ? "#22C55E18" : !form.isActive ? T.bgDeep : "#6366F1",
              color:      form.hasResponded ? "#22C55E"   : !form.isActive ? T.t7     : "#fff",
              fontSize: 12, fontWeight: 700,
              cursor: (form.isActive && !form.hasResponded) ? "pointer" : "not-allowed",
              opacity: (!form.isActive && !form.hasResponded) ? 0.55 : 1,
            }}
          >
            {form.hasResponded
              ? <><CheckCircle2 size={13} /> Respondido</>
              : !form.isActive
              ? <><Lock size={13} /> Encerrado</>
              : <><Send size={13} /> Responder</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── QuestionBuilderItem ──────────────────────────────────────────────────────

function QuestionBuilderItem({ q, index, total, onChange, onDelete, onMoveUp, onMoveDown, T }) {
  const [typeOpen, setTypeOpen] = useState(false);
  const typeRef = useRef(null);
  const cfg = Q_TYPE_CFG[q.type] || Q_TYPE_CFG.short_text;
  const needsOptions = q.type === "multiple_choice" || q.type === "checkbox";
  const options = q.options || ["", ""];

  useEffect(() => {
    const handler = e => { if (typeRef.current && !typeRef.current.contains(e.target)) setTypeOpen(false); };
    if (typeOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [typeOpen]);

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14,
      padding: "16px 18px", marginBottom: 12, borderLeft: `3px solid ${cfg.color}`,
    }}>
      {/* Row: number + text + controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          background: cfg.color + "18", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, color: cfg.color, fontWeight: 700,
        }}>{index + 1}</div>
        <input
          value={q.text}
          onChange={e => onChange({ ...q, text: e.target.value })}
          placeholder={`Pergunta ${index + 1}`}
          style={{
            flex: 1, padding: "8px 10px", borderRadius: 8, boxSizing: "border-box",
            background: T.bgApp, border: `1px solid ${T.border}`,
            color: T.t1, fontSize: 13.5, fontFamily: "'Sora', sans-serif",
            outline: "none", fontWeight: 500,
          }}
        />
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button onClick={onMoveUp} disabled={index === 0} title="Mover para cima" style={{
            width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`, background: T.bgApp,
            color: T.t6, cursor: index === 0 ? "not-allowed" : "pointer", opacity: index === 0 ? 0.35 : 1,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}><ArrowUp size={12} /></button>
          <button onClick={onMoveDown} disabled={index === total - 1} title="Mover para baixo" style={{
            width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`, background: T.bgApp,
            color: T.t6, cursor: index === total - 1 ? "not-allowed" : "pointer", opacity: index === total - 1 ? 0.35 : 1,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}><ArrowDown size={12} /></button>
          <button onClick={onDelete} title="Remover pergunta" style={{
            width: 28, height: 28, borderRadius: 6, border: "1px solid #EF444430",
            background: "#EF444410", color: "#EF4444", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}><Trash2 size={12} /></button>
        </div>
      </div>

      {/* Row: type selector + required toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: needsOptions ? 14 : 0 }}>
        <div ref={typeRef} style={{ position: "relative" }}>
          <button onClick={() => setTypeOpen(v => !v)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
            borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgApp,
            color: T.t2, cursor: "pointer", fontSize: 12, fontFamily: "'Sora', sans-serif",
          }}>
            <span style={{ color: cfg.color, fontWeight: 800 }}>{cfg.icon}</span>
            {cfg.label}
            <ChevronDown size={11} color={T.t7} />
          </button>
          {typeOpen && (
            <div style={{
              position: "absolute", top: 36, left: 0, zIndex: 50,
              background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10,
              padding: "4px", minWidth: 190, boxShadow: "0 8px 28px #00000018",
            }}>
              {Q_TYPES.map(qt => (
                <button key={qt.id} onClick={() => {
                  const needsOpts = qt.id === "multiple_choice" || qt.id === "checkbox";
                  onChange({ ...q, type: qt.id, options: needsOpts ? (q.options || ["Opção 1", "Opção 2"]) : undefined });
                  setTypeOpen(false);
                }} style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "8px 10px", borderRadius: 7, border: "none",
                  background: q.type === qt.id ? qt.color + "15" : "transparent",
                  color: q.type === qt.id ? qt.color : T.t2,
                  cursor: "pointer", fontSize: 12.5, fontFamily: "'Sora', sans-serif",
                  fontWeight: q.type === qt.id ? 700 : 400,
                }}>
                  <span style={{ color: qt.color, fontWeight: 800, width: 16 }}>{qt.icon}</span>
                  {qt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginLeft: "auto" }}>
          <span style={{ fontSize: 11.5, color: T.t6 }}>Obrigatório</span>
          <Toggle checked={q.required} onChange={() => onChange({ ...q, required: !q.required })} />
        </label>
      </div>

      {/* Options for MC / checkbox */}
      {needsOptions && (
        <div>
          {options.map((opt, oi) => (
            <div key={oi} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <div style={{ width: 16, textAlign: "center", fontSize: 13, color: T.t7, flexShrink: 0 }}>
                {q.type === "multiple_choice" ? "◉" : "☑"}
              </div>
              <input
                value={opt}
                onChange={e => {
                  const newOpts = [...options]; newOpts[oi] = e.target.value;
                  onChange({ ...q, options: newOpts });
                }}
                placeholder={`Opção ${oi + 1}`}
                style={{
                  flex: 1, padding: "6px 10px", borderRadius: 7, boxSizing: "border-box",
                  background: T.bgApp, border: `1px solid ${T.border}`,
                  color: T.t1, fontSize: 12.5, fontFamily: "'Sora', sans-serif", outline: "none",
                }}
              />
              {options.length > 2 && (
                <button onClick={() => onChange({ ...q, options: options.filter((_, i) => i !== oi) })} style={{
                  width: 24, height: 24, borderRadius: 6, border: "1px solid #EF444430",
                  background: "#EF444410", color: "#EF4444", cursor: "pointer", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}><X size={10} /></button>
              )}
            </div>
          ))}
          <button onClick={() => onChange({ ...q, options: [...options, ""] })} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", marginTop: 4,
            borderRadius: 7, border: `1px dashed ${T.border}`, background: "transparent",
            color: T.t6, cursor: "pointer", fontSize: 12, fontFamily: "'Sora', sans-serif",
          }}>
            <Plus size={11} /> Adicionar opção
          </button>
        </div>
      )}
    </div>
  );
}

// ─── VIEWS ────────────────────────────────────────────────────────────────────

function ListView({ forms, loading, canCreate, canManage, onFill, onResults, onDelete, onToggleActive, onBuild, T }) {
  const [tab, setTab] = useState("all");
  const myForms   = forms.filter(f => canManage(f));
  const tabForms  = tab === "all" ? forms : myForms;

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <Loader2 size={24} color="#6366F1" style={{ animation: "spin 0.7s linear infinite" }} />
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
        {[
          { id: "all",  label: "Todos",        count: forms.length },
          ...(myForms.length > 0 ? [{ id: "mine", label: "Meus formulários", count: myForms.length }] : []),
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer",
            background: tab === t.id ? "#6366F1" : "transparent",
            color: tab === t.id ? "#fff" : T.t5,
            fontSize: 12.5, fontWeight: tab === t.id ? 700 : 400, fontFamily: "'Sora', sans-serif",
          }}>
            {t.label} <span style={{ opacity: 0.65 }}>({t.count})</span>
          </button>
        ))}
        {canCreate && (
          <button onClick={onBuild} style={{
            marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
            padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer",
            background: "#6366F1", color: "#fff", fontSize: 12.5, fontWeight: 700,
            fontFamily: "'Sora', sans-serif",
          }}>
            <Plus size={14} /> Criar formulário
          </button>
        )}
      </div>

      {tabForms.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <ClipboardList size={40} color={T.t9} />
          <div style={{ fontSize: 15, fontWeight: 700, color: T.t4 }}>
            {tab === "mine" ? "Você ainda não criou formulários" : "Nenhum formulário disponível"}
          </div>
          <div style={{ fontSize: 13, color: T.t7 }}>
            {canCreate ? "Crie um formulário para começar a coletar respostas." : "Aguarde novos formulários serem publicados."}
          </div>
          {canCreate && (
            <button onClick={onBuild} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "10px 22px", marginTop: 8,
              borderRadius: 10, border: "none", background: "#6366F1", color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Sora', sans-serif",
            }}>
              <Plus size={15} /> Criar formulário
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
          {tabForms.map(f => (
            <FormCard
              key={f.id}
              form={f}
              canManage={canManage(f)}
              onFill={() => onFill(f)}
              onResults={() => onResults(f)}
              onDelete={() => onDelete(f)}
              onToggleActive={() => onToggleActive(f)}
              T={T}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FillView({ formId, onBack, T }) {
  const [form,        setForm]        = useState(null);
  const [answers,     setAnswers]     = useState({});
  const [errors,      setErrors]      = useState({});
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    api.get(`/forms/${formId}`).then(r => { setForm(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, [formId]);

  function validate() {
    const errs = {};
    for (const q of form?.questions || []) {
      if (!q.required) continue;
      const val = answers[q.id];
      if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
        errs[q.id] = "Esta pergunta é obrigatória";
      }
    }
    return errs;
  }

  async function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSubmitting(true); setSubmitError(null);
    try {
      await api.post(`/forms/${formId}/respond`, { answers });
      setSubmitted(true);
    } catch (e) {
      setSubmitError(e.response?.data?.error || "Erro ao enviar resposta");
    } finally { setSubmitting(false); }
  }

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <Loader2 size={24} color="#6366F1" style={{ animation: "spin 0.7s linear infinite" }} />
    </div>
  );

  if (submitted) return (
    <div style={{ maxWidth: 580, margin: "0 auto", textAlign: "center", padding: "60px 20px" }}>
      <div style={{
        width: 72, height: 72, borderRadius: "50%", background: "#22C55E18",
        display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px",
      }}>
        <CheckCircle2 size={36} color="#22C55E" />
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: T.t1, marginBottom: 8 }}>Resposta enviada!</div>
      <div style={{ fontSize: 14, color: T.t6, marginBottom: 28, lineHeight: 1.6 }}>
        Obrigado por responder <strong>{form?.title}</strong>.<br />Sua resposta foi registrada com sucesso.
      </div>
      <button onClick={onBack} style={{
        padding: "10px 28px", borderRadius: 10, border: "none",
        background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 700,
        cursor: "pointer", fontFamily: "'Sora', sans-serif",
      }}>
        Voltar aos formulários
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      {/* Gradient header card */}
      <div style={{
        background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
        borderRadius: 16, padding: "24px 28px", marginBottom: 20,
        color: "#fff", position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: -30, right: -30, width: 130, height: 130,
          borderRadius: "50%", background: "rgba(255,255,255,0.06)",
        }} />
        <ClipboardList size={28} color="rgba(255,255,255,0.85)" style={{ marginBottom: 10 }} />
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 6px" }}>{form?.title}</h2>
        {form?.description && (
          <p style={{ fontSize: 13.5, opacity: 0.85, margin: 0, lineHeight: 1.55 }}>{form.description}</p>
        )}
        <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 10 }}>
          {form?.questions?.length} pergunta{form?.questions?.length !== 1 ? "s" : ""}
          {form?.questions?.some(q => q.required) ? " · campos com * são obrigatórios" : ""}
        </div>
      </div>

      {/* Validation summary */}
      {Object.keys(errors).length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 14,
          background: "#EF444415", border: "1px solid #EF444435", borderRadius: 10,
          fontSize: 13, color: "#EF4444",
        }}>
          <AlertTriangle size={14} /> Responda todas as perguntas obrigatórias antes de enviar.
        </div>
      )}

      {/* Questions */}
      {(form?.questions || []).map(q => (
        <QuestionInput
          key={q.id}
          q={q}
          value={answers[q.id]}
          onChange={val => {
            setAnswers(a => ({ ...a, [q.id]: val }));
            if (errors[q.id]) setErrors(e => { const n = { ...e }; delete n[q.id]; return n; });
          }}
          T={T}
          error={errors[q.id]}
        />
      ))}

      {/* Submit row */}
      {submitError && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 14,
          background: "#EF444415", border: "1px solid #EF444435", borderRadius: 10,
          fontSize: 13, color: "#EF4444",
        }}>
          <AlertTriangle size={14} /> {submitError}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingBottom: 32 }}>
        <button onClick={onBack} style={{
          padding: "10px 20px", borderRadius: 10, border: `1px solid ${T.border}`,
          background: T.bgApp, color: T.t3, fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: "'Sora', sans-serif",
        }}>Cancelar</button>
        <button onClick={handleSubmit} disabled={submitting} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "10px 24px",
          borderRadius: 10, border: "none", background: "#6366F1", color: "#fff",
          fontSize: 13, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
          fontFamily: "'Sora', sans-serif", opacity: submitting ? 0.7 : 1,
        }}>
          {submitting
            ? <><Loader2 size={14} style={{ animation: "spin 0.7s linear infinite" }} /> Enviando...</>
            : <><Send size={14} /> Enviar resposta</>}
        </button>
      </div>
    </div>
  );
}

function ResultsView({ formId, onBack, T }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/forms/${formId}/results`).then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, [formId]);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <Loader2 size={24} color="#6366F1" style={{ animation: "spin 0.7s linear infinite" }} />
    </div>
  );

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <div style={{
        background: "linear-gradient(135deg, #1D4ED8 0%, #6366F1 100%)",
        borderRadius: 16, padding: "20px 24px", marginBottom: 20,
        color: "#fff", display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{ flex: 1 }}>
          <BarChart2 size={26} color="rgba(255,255,255,0.85)" style={{ marginBottom: 6 }} />
          <div style={{ fontSize: 18, fontWeight: 800 }}>{data?.form?.title}</div>
          <div style={{ fontSize: 12.5, opacity: 0.7, marginTop: 2 }}>Resultados e análise de respostas</div>
        </div>
        <div style={{ textAlign: "center", padding: "12px 18px", background: "rgba(255,255,255,0.12)", borderRadius: 12 }}>
          <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {data?.totalResponses}
          </div>
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 3 }}>
            resposta{data?.totalResponses !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {data?.totalResponses === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <Users size={36} color={T.t9} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: T.t4 }}>Sem respostas ainda</div>
          <div style={{ fontSize: 13, color: T.t7, marginTop: 4 }}>Compartilhe o formulário para coletar dados.</div>
        </div>
      ) : (
        (data?.analytics || []).map((qa, i) => <QuestionResult key={i} qa={qa} T={T} />)
      )}
    </div>
  );
}

function BuilderView({ onBack, onSave, T }) {
  const [title,          setTitle]          = useState("");
  const [description,    setDescription]    = useState("");
  const [allowAnonymous,           setAllowAnonymous]           = useState(false);
  const [showResultsToRespondents, setShowResultsToRespondents] = useState(false);
  const [questions,      setQuestions]      = useState([
    { id: "q0", text: "", type: "short_text", required: true, options: undefined },
  ]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  function addQuestion() {
    setQuestions(qs => [...qs, { id: `q${Date.now()}`, text: "", type: "short_text", required: true, options: undefined }]);
  }

  function moveUp(i) {
    if (i === 0) return;
    setQuestions(qs => { const n = [...qs]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; });
  }

  function moveDown(i) {
    setQuestions(qs => { if (i === qs.length - 1) return qs; const n = [...qs]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n; });
  }

  async function handleSave() {
    if (!title.trim())       { setError("Adicione um título ao formulário"); return; }
    if (questions.length === 0) { setError("Adicione pelo menos uma pergunta"); return; }
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].text.trim()) { setError(`Pergunta ${i + 1} está sem texto`); return; }
      const needsOpts = questions[i].type === "multiple_choice" || questions[i].type === "checkbox";
      if (needsOpts && (questions[i].options || []).filter(o => o.trim()).length < 2) {
        setError(`Pergunta ${i + 1} precisa de pelo menos 2 opções`); return;
      }
    }
    setSaving(true); setError(null);
    try {
      await onSave({
        title, description, allowAnonymous, showResultsToRespondents,
        questions: questions.map(q => ({
          text: q.text, type: q.type, required: q.required,
          options: q.options ? q.options.filter(o => o.trim()) : undefined,
        })),
      });
    } catch (e) {
      setError(e.response?.data?.error || "Erro ao criar formulário");
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Meta card */}
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16,
        padding: "20px 22px", marginBottom: 16, borderTop: "4px solid #6366F1",
      }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Título do formulário"
          style={{
            width: "100%", padding: 0, border: "none", outline: "none", boxSizing: "border-box",
            fontSize: 22, fontWeight: 800, color: T.t1, background: "transparent",
            fontFamily: "'Sora', sans-serif", marginBottom: 10,
          }}
        />
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Descrição (opcional)"
          style={{
            width: "100%", padding: "8px 0", border: "none", borderTop: `1px solid ${T.borderSubtle}`,
            outline: "none", boxSizing: "border-box",
            fontSize: 13.5, color: T.t4, background: "transparent", fontFamily: "'Sora', sans-serif",
          }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, cursor: "pointer" }}>
          <Toggle checked={allowAnonymous} onChange={() => setAllowAnonymous(v => !v)} />
          <span style={{ fontSize: 12.5, color: T.t5 }}>Respostas anônimas</span>
          <span style={{ fontSize: 11.5, color: T.t8 }}>(nomes não aparecerão nos resultados)</span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer" }}>
          <Toggle checked={showResultsToRespondents} onChange={() => setShowResultsToRespondents(v => !v)} />
          <span style={{ fontSize: 12.5, color: T.t5 }}>Permitir que respondentes vejam os resultados</span>
          <span style={{ fontSize: 11.5, color: T.t8 }}>(gráficos agregados, sem dados de outros usuários)</span>
        </label>
      </div>

      {/* Questions */}
      {questions.map((q, i) => (
        <QuestionBuilderItem
          key={q.id}
          q={q}
          index={i}
          total={questions.length}
          onChange={newQ => setQuestions(qs => qs.map((x, xi) => xi === i ? newQ : x))}
          onDelete={() => setQuestions(qs => qs.filter((_, xi) => xi !== i))}
          onMoveUp={() => moveUp(i)}
          onMoveDown={() => moveDown(i)}
          T={T}
        />
      ))}

      {/* Add question */}
      <button
        onClick={addQuestion}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          width: "100%", padding: 14, borderRadius: 14, boxSizing: "border-box",
          border: `2px dashed ${T.border}`, background: "transparent",
          color: T.t6, cursor: "pointer", fontSize: 13, fontWeight: 600,
          fontFamily: "'Sora', sans-serif", marginBottom: 20,
          transition: "border-color 0.15s, color 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "#6366F1"; e.currentTarget.style.color = "#6366F1"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.t6; }}
      >
        <Plus size={16} /> Adicionar pergunta
      </button>

      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 14,
          background: "#EF444415", border: "1px solid #EF444435", borderRadius: 10,
          fontSize: 13, color: "#EF4444",
        }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingBottom: 32 }}>
        <button onClick={onBack} style={{
          padding: "10px 20px", borderRadius: 10, border: `1px solid ${T.border}`,
          background: T.bgApp, color: T.t3, fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: "'Sora', sans-serif",
        }}>Cancelar</button>
        <button onClick={handleSave} disabled={saving} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "10px 24px",
          borderRadius: 10, border: "none", background: "#6366F1", color: "#fff",
          fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
          fontFamily: "'Sora', sans-serif", opacity: saving ? 0.7 : 1,
        }}>
          {saving
            ? <><Loader2 size={14} style={{ animation: "spin 0.7s linear infinite" }} /> Salvando...</>
            : <><Send size={14} /> Publicar formulário</>}
        </button>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

const CAN_CREATE_ROLES = ["leader", "hr", "ti", "gerencia"];
const IS_ADMIN_ROLES   = ["hr", "ti", "gerencia"];

export default function FormsPage() {
  const { theme: T }  = useTheme();
  const { user }      = useAuth();
  const [view,            setView]           = useState("list");
  const [forms,           setForms]          = useState([]);
  const [selectedFormId,  setSelectedFormId] = useState(null);
  const [loading,         setLoading]        = useState(true);

  const canCreate = CAN_CREATE_ROLES.includes(user?.role);
  const isAdmin   = IS_ADMIN_ROLES.includes(user?.role);

  function canManage(form) {
    return isAdmin || form.createdBy?.id === user?.id;
  }

  async function loadForms() {
    setLoading(true);
    try { const r = await api.get("/forms"); setForms(r.data); } catch {}
    setLoading(false);
  }

  useEffect(() => { loadForms(); }, []);

  async function handleDelete(form) {
    if (!window.confirm(`Excluir "${form.title}"? Todas as respostas serão perdidas.`)) return;
    try { await api.delete(`/forms/${form.id}`); setForms(fs => fs.filter(f => f.id !== form.id)); } catch {}
  }

  async function handleToggleActive(form) {
    try {
      const r = await api.patch(`/forms/${form.id}`, { isActive: !form.isActive });
      setForms(fs => fs.map(f => f.id === form.id ? { ...f, isActive: r.data.isActive } : f));
    } catch {}
  }

  async function handleSaveForm(formData) {
    await api.post("/forms", formData);
    await loadForms();
    setView("list");
  }

  const VIEW_TITLES = {
    list:    "Formulários",
    fill:    "Responder formulário",
    results: "Resultados",
    build:   "Criar formulário",
  };
  const VIEW_SUBTITLES = {
    list:    "Pesquisas de clima e formulários da empresa",
    fill:    "Preencha as perguntas abaixo",
    results: "Análise das respostas coletadas",
    build:   "Configure as perguntas e publique o formulário",
  };

  return (
    <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        {view !== "list" && (
          <button onClick={() => { setView("list"); setSelectedFormId(null); if (view === "fill") loadForms(); }} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "4px 0", marginBottom: 8,
            border: "none", background: "transparent", color: T.t6,
            cursor: "pointer", fontSize: 12.5, fontFamily: "'Sora', sans-serif",
          }}>
            <ChevronLeft size={14} /> Voltar aos formulários
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: T.t1, margin: 0, display: "flex", alignItems: "center", gap: 11 }}><span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", background: T.accent + "1f", color: T.accent, flexShrink: 0 }}><ClipboardList size={18} /></span>{VIEW_TITLES[view]}</h1>
            <p style={{ color: T.t6, fontSize: 13, margin: "2px 0 0" }}>{VIEW_SUBTITLES[view]}</p>
          </div>
        </div>
      </div>

      {view === "list" && (
        <ListView
          forms={forms} loading={loading} canCreate={canCreate} canManage={canManage}
          onFill={f => { setSelectedFormId(f.id); setView("fill"); }}
          onResults={f => { setSelectedFormId(f.id); setView("results"); }}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
          onBuild={() => setView("build")}
          T={T}
        />
      )}
      {view === "fill" && selectedFormId && (
        <FillView formId={selectedFormId} onBack={() => { setView("list"); setSelectedFormId(null); loadForms(); }} T={T} />
      )}
      {view === "results" && selectedFormId && (
        <ResultsView formId={selectedFormId} onBack={() => { setView("list"); setSelectedFormId(null); }} T={T} />
      )}
      {view === "build" && (
        <BuilderView onBack={() => setView("list")} onSave={handleSaveForm} T={T} />
      )}
    </div>
  );
}
