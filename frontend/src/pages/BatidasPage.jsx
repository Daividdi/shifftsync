import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";
import {
  RefreshCw, Clock, LogIn, LogOut, Coffee, RotateCcw,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Loader,
  Filter, X, Plus, Trash2, Pencil, Check,
} from "lucide-react";

const LABEL_META = {
  entrada:        { icon: LogIn,     color: "#22c55e", short: "Entrada"  },
  saida:          { icon: LogOut,    color: "#ef4444", short: "Saída"    },
  saida_almoco:   { icon: Coffee,    color: "#f59e0b", short: "Almoço"   },
  retorno_almoco: { icon: RotateCcw, color: "#3b82f6", short: "Retorno"  },
};
function getPunchMeta(label) {
  if (LABEL_META[label]) return LABEL_META[label];
  if (label?.startsWith("saida_"))   return { icon: LogOut,    color: "#f97316", short: "Saída"   };
  if (label?.startsWith("retorno_")) return { icon: RotateCcw, color: "#8b5cf6", short: "Retorno" };
  return { icon: Clock, color: "#94a3b8", short: "Batida" };
}

const STATUS_CONFIG = {
  sem_registro: { color: "#94a3b8", label: "Sem registro" },
  trabalhando:  { color: "#22c55e", label: "Trabalhando"  },
  intervalo:    { color: "#f59e0b", label: "Em intervalo" },
  completo:     { color: "#64748b", label: "Completo"     },
};

function fmtTime(iso) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function fmtMs(ms) {
  if (!ms && ms !== 0) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m < 10 ? "0" + m : m}min` : `${m}min`;
}
function fmtMinutes(min) {
  if (min == null) return "—";
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  return (min < 0 ? "-" : "") + h + "h" + (m > 0 ? String(m).padStart(2,"0") : "");
}

// Converts "2026-01-15T08:30:00.000" → "08:30"
function isoToTimeStr(iso) {
  if (!iso) return "";
  const t = iso.includes("T") ? iso.split("T")[1] : "";
  return t.slice(0, 5);
}

// ── Edit punch inline ─────────────────────────────────────────────────────────
function EditPunchInline({ punch, date, T, onSave, onCancel }) {
  const [timeVal, setTimeVal] = useState(isoToTimeStr(punch.recordedAt));
  const [dateVal, setDateVal] = useState(date);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const save = async () => {
    if (!timeVal) return;
    setSaving(true); setErr("");
    try {
      await api.patch(`/batidas/${punch.id}`, { timeStr: timeVal, date: dateVal });
      onSave();
    } catch (e) {
      setErr(e.response?.data?.error || "Erro ao salvar");
    } finally { setSaving(false); }
  };

  const inputS = {
    padding: "3px 7px", borderRadius: 6, border: `1px solid ${T.accent}66`,
    background: T.bgDeep, color: T.t1, fontSize: 12, fontFamily: "'Sora',sans-serif",
    outline: "none",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
      <input ref={inputRef} type="date" value={dateVal} onChange={e => setDateVal(e.target.value)} style={{ ...inputS, width: 130 }} />
      <input type="time" value={timeVal} onChange={e => setTimeVal(e.target.value)} style={{ ...inputS, width: 90 }} />
      <button onClick={save} disabled={saving || !timeVal} title="Salvar" style={{
        background: T.accent, border: "none", borderRadius: 6, padding: "3px 8px",
        color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 3, fontSize: 11,
      }}>
        {saving ? <Loader size={10} style={{ animation: "spin 0.7s linear infinite" }} /> : <Check size={10} />}
        {saving ? "..." : "Salvar"}
      </button>
      <button onClick={onCancel} title="Cancelar" style={{
        background: "none", border: `1px solid ${T.border}`, borderRadius: 6, padding: "3px 7px",
        color: T.t7, cursor: "pointer", fontSize: 11, fontFamily: "'Sora',sans-serif",
      }}>Cancelar</button>
      {err && <span style={{ fontSize: 11, color: "#ef4444" }}>{err}</span>}
    </div>
  );
}

// ── Punch timeline ────────────────────────────────────────────────────────────
function PunchTimeline({ batidas, T }) {
  if (!batidas || batidas.length === 0)
    return <span style={{ color: T.t5, fontSize: 12 }}>Nenhuma batida</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0 }}>
      {batidas.map((b, i) => {
        const meta = getPunchMeta(b.label);
        const Icon = meta.icon;
        const isBreakGap = i > 0 && (i - 1) % 2 === 1;
        return (
          <React.Fragment key={i}>
            {i > 0 && <div style={{ width: 18, height: 2, flexShrink: 0, background: isBreakGap ? "#f59e0b44" : "#22c55e44", margin: "0 2px" }} />}
            <div title={b.label || ""} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              background: meta.color + "18", border: "1px solid " + meta.color + "40",
              borderRadius: 7, padding: "3px 7px", flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <Icon size={9} color={meta.color} />
                <span style={{ fontSize: 9, color: meta.color, fontWeight: 600 }}>{meta.short}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: meta.color, fontVariantNumeric: "tabular-nums" }}>{fmtTime(b.recordedAt)}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Day card ──────────────────────────────────────────────────────────────────
function UserDayCard({ day, T, showName, canEdit, canDelete, onRefresh }) {
  const [open, setOpen]         = useState(false);
  const [addingPunch, setAddingPunch] = useState(false);
  const [newTime, setNewTime]   = useState("");
  const [saving, setSaving]     = useState(false);
  const [editingId, setEditingId] = useState(null); // punch id being edited
  const st       = day.structured || {};
  const status   = STATUS_CONFIG[st.status] || STATUS_CONFIG.sem_registro;
  const punches  = day.batidas || [];
  const n        = punches.length;
  const meioPer  = Boolean(day.meioPeriodo);
  const todayStr = new Date().toISOString().slice(0, 10);
  const isPast   = day.date < todayStr;
  const isIncomplete = isPast && n > 0 && n % 2 === 1 && !(meioPer && n === 2);
  const firstIn  = punches[0]?.recordedAt;
  const lastOut  = punches[n - 1]?.recordedAt;

  async function handleAddPunch() {
    if (!newTime || saving) return;
    setSaving(true);
    try {
      await api.post("/batidas/manual", { userId: day.userId, date: day.date, timeStr: newTime });
      setAddingPunch(false);
      setNewTime("");
      onRefresh?.();
    } catch (e) {
      alert(e.response?.data?.error || "Erro ao inserir batida");
    } finally { setSaving(false); }
  }

  async function handleDeletePunch(id) {
    if (!window.confirm("Remover esta batida? O banco de horas será recalculado automaticamente.")) return;
    try {
      await api.delete(`/batidas/${id}`);
      onRefresh?.();
    } catch (e) {
      alert(e.response?.data?.error || "Erro ao remover batida");
    }
  }

  return (
    <div style={{
      background: T.bgCard,
      border: `1px solid ${isIncomplete ? "#f59e0b44" : T.border}`,
      borderRadius: 12, marginBottom: 8, overflow: "hidden",
    }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", cursor: "pointer", userSelect: "none" }}>

        {isIncomplete
          ? <AlertTriangle size={15} color="#f59e0b" style={{ flexShrink: 0 }} />
          : <CheckCircle   size={15} color={status.color} style={{ flexShrink: 0 }} />}

        {showName ? (
          <div style={{ minWidth: 170, flexShrink: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.t1, display: "flex", alignItems: "center", gap: 6 }}>
              {day.groupColor && <span style={{ width: 7, height: 7, borderRadius: 2, background: day.groupColor, flexShrink: 0, display: "inline-block" }} />}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{day.fullName}</span>
            </div>
            <div style={{ fontSize: 11, color: T.t7, marginTop: 1, display: "flex", gap: 6 }}>
              <span>{fmtDate(day.date)}</span>
              {day.dept && <span style={{ color: T.t9 }}>· {day.dept}</span>}
            </div>
          </div>
        ) : (
          <div style={{ minWidth: 80, flexShrink: 0 }}>
            <div style={{ fontSize: 13, color: T.t2, fontWeight: 600 }}>{fmtDate(day.date)}</div>
          </div>
        )}

        {/* Entrada → Saída quick view */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {firstIn && (
            <div style={{ display: "flex", alignItems: "center", gap: 3, background: "#22c55e15", borderRadius: 6, padding: "2px 7px" }}>
              <LogIn size={10} color="#22c55e" />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", fontVariantNumeric: "tabular-nums" }}>{fmtTime(firstIn)}</span>
            </div>
          )}
          {n > 1 && lastOut && (
            <>
              <span style={{ color: T.t10, fontSize: 10 }}>→</span>
              <div style={{ display: "flex", alignItems: "center", gap: 3, background: "#ef444415", borderRadius: 6, padding: "2px 7px" }}>
                <LogOut size={10} color="#ef4444" />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", fontVariantNumeric: "tabular-nums" }}>{fmtTime(lastOut)}</span>
              </div>
            </>
          )}
          <span style={{ fontSize: 10, color: T.t9, background: T.bgDeep, borderRadius: 5, padding: "2px 6px", border: `1px solid ${T.border}`, fontVariantNumeric: "tabular-nums" }}>
            {n}x
          </span>
        </div>

        <div style={{ flex: 1, overflowX: "auto" }}>
          <PunchTimeline batidas={punches} T={T} />
        </div>

        <div style={{ textAlign: "right", flexShrink: 0, minWidth: 110 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.t1, fontVariantNumeric: "tabular-nums" }}>{day.totalWorkedFmt}</div>
          {day.totalBreakFmt && day.totalBreakFmt !== "—" && (
            <div style={{ fontSize: 11, color: T.t7, fontVariantNumeric: "tabular-nums" }}>pausa: {day.totalBreakFmt}</div>
          )}
          <div style={{ fontSize: 10, fontWeight: 600, marginTop: 2, color: isIncomplete ? "#f59e0b" : status.color }}>
            {isIncomplete ? "Incompleto" : status.label}
          </div>
          {meioPer && <div style={{ fontSize: 9, color: T.t8, fontWeight: 600, marginTop: 1 }}>½ PERÍODO</div>}
        </div>

        {open ? <ChevronUp size={14} color={T.t5} /> : <ChevronDown size={14} color={T.t5} />}
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "14px 18px", background: T.bgDeep }}>
          {/* Metadata row */}
          <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              { label: "Batidas", value: n + "x" },
              { label: "Entrada", value: fmtTime(firstIn) },
              { label: "Última saída", value: n > 1 ? fmtTime(lastOut) : "—" },
              { label: "Trabalhado", value: day.totalWorkedFmt },
              { label: "Pausas", value: day.totalBreakFmt || "—" },
              day.dept && { label: "Depto", value: day.dept },
              day.groupName && { label: "Grupo", value: day.groupName },
            ].filter(Boolean).map((item, i) => (
              <div key={i} style={{ minWidth: 80 }}>
                <div style={{ fontSize: 10, color: T.t9, fontWeight: 700, letterSpacing: "0.07em", marginBottom: 2 }}>{item.label.toUpperCase()}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.t2, fontVariantNumeric: "tabular-nums" }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Individual punches list with edit/delete */}
          {punches.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: T.t8, fontWeight: 700, letterSpacing: "0.07em", marginBottom: 8 }}>BATIDAS REGISTRADAS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {punches.map((b, i) => {
                  const meta = getPunchMeta(b.label);
                  const Icon = meta.icon;
                  const isEditing = editingId === b.id;
                  const isManualOrAbono = b.eventName === "Inserção Manual" || b.eventName?.includes("Abono");
                  return (
                    <div key={b.id || i} style={{
                      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                      background: T.bgCard, border: `1px solid ${isEditing ? T.accent + "66" : T.border}`,
                      borderRadius: 8, padding: "6px 10px",
                      transition: "border-color 0.15s",
                    }}>
                      {/* Punch badge */}
                      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 100 }}>
                        <Icon size={12} color={meta.color} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: meta.color, fontVariantNumeric: "tabular-nums" }}>
                          {fmtTime(b.recordedAt)}
                        </span>
                        <span style={{ fontSize: 10, color: T.t8 }}>{meta.short}</span>
                      </div>

                      {/* Source tag */}
                      <div style={{ flex: 1 }}>
                        {b.eventName === "Inserção Manual" && <span style={{ fontSize: 9, color: T.t7, fontStyle: "italic", background: T.bgDeep, padding: "1px 5px", borderRadius: 4, border: `1px solid ${T.border}` }}>manual</span>}
                        {(b.eventName === "Entrada Abono" || b.eventName === "Saída Abono") && <span style={{ fontSize: 9, color: "#8B5CF6", fontWeight: 700, background: "#8B5CF618", padding: "1px 5px", borderRadius: 4 }}>abono</span>}
                      </div>

                      {/* Edit inline form */}
                      {isEditing && (
                        <EditPunchInline
                          punch={b}
                          date={day.date}
                          T={T}
                          onSave={() => { setEditingId(null); onRefresh?.(); }}
                          onCancel={() => setEditingId(null)}
                        />
                      )}

                      {/* Action buttons (only if not editing) */}
                      {!isEditing && b.id && (canEdit || canDelete) && (
                        <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                          {canEdit && (
                            <button
                              onClick={() => setEditingId(b.id)}
                              title="Editar horário"
                              style={{
                                background: T.accent + "18", border: `1px solid ${T.accent}33`,
                                borderRadius: 6, padding: "3px 8px", color: T.accent,
                                cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
                                fontSize: 11, fontFamily: "'Sora',sans-serif",
                              }}
                            >
                              <Pencil size={10} /> Editar
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDeletePunch(b.id)}
                              title="Remover batida"
                              style={{
                                background: "#ef444418", border: "1px solid #ef444430",
                                borderRadius: 6, padding: "3px 8px", color: "#ef4444",
                                cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
                                fontSize: 11, fontFamily: "'Sora',sans-serif",
                              }}
                            >
                              <Trash2 size={10} /> Remover
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add punch row */}
          {canEdit && (
            <div style={{ marginBottom: 10 }}>
              {!addingPunch ? (
                <button onClick={() => setAddingPunch(true)} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                  border: `1px dashed ${T.border}`, borderRadius: 8, background: "transparent",
                  color: T.t7, cursor: "pointer", fontSize: 12, fontFamily: "'Sora',sans-serif",
                }}>
                  <Plus size={12} /> Inserir batida neste dia
                </button>
              ) : (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
                    autoFocus
                    style={{ padding: "5px 8px", borderRadius: 7, border: `1px solid ${T.accent}66`, background: T.bgDeep, color: T.t1, fontSize: 13, fontFamily: "'Sora',sans-serif", outline: "none" }}
                  />
                  <button onClick={handleAddPunch} disabled={!newTime || saving} style={{
                    padding: "5px 12px", borderRadius: 7, border: "none",
                    background: T.accent, color: "#fff", cursor: "pointer", fontSize: 12,
                    fontFamily: "'Sora',sans-serif", fontWeight: 600, opacity: saving ? 0.7 : 1,
                    display: "flex", alignItems: "center", gap: 5,
                  }}>
                    {saving ? <Loader size={11} style={{ animation: "spin 0.7s linear infinite" }} /> : <Plus size={11} />}
                    {saving ? "Salvando..." : "Inserir"}
                  </button>
                  <button onClick={() => { setAddingPunch(false); setNewTime(""); }} style={{
                    padding: "5px 10px", borderRadius: 7, border: `1px solid ${T.border}`,
                    background: "transparent", color: T.t7, cursor: "pointer", fontSize: 12, fontFamily: "'Sora',sans-serif",
                  }}>Cancelar</button>
                </div>
              )}
            </div>
          )}

          {/* Intervals */}
          {day.intervals?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {day.intervals.map((iv, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5, fontSize: 13 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: iv.type === "work" ? "#22c55e" : "#f59e0b" }} />
                  <span style={{ color: T.t2, fontFamily: "monospace", fontVariantNumeric: "tabular-nums" }}>{fmtTime(iv.from)} → {fmtTime(iv.to)}</span>
                  <span style={{ fontWeight: 700, color: iv.type === "work" ? "#22c55e" : "#f59e0b", fontVariantNumeric: "tabular-nums" }}>{iv.durationFmt}</span>
                  <span style={{ color: T.t6, fontSize: 11 }}>{iv.type === "work" ? "trabalhado" : "pausa"}</span>
                </div>
              ))}
            </div>
          )}

          {isIncomplete && (
            <div style={{ padding: "8px 12px", background: "#f59e0b0e", border: "1px solid #f59e0b30", borderRadius: 8, fontSize: 12, color: "#f59e0b", marginTop: 10 }}>
              ⚠ Batida possivelmente ausente — verifique no Faceum ou insira manualmente.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Quick date preset pill ────────────────────────────────────────────────────
function Preset({ label, active, onClick, T }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 12px", borderRadius: 20, border: `1px solid ${active ? T.accent : T.border}`,
      background: active ? T.accent + "22" : "transparent", color: active ? T.accent : T.t5,
      cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 400, fontFamily: "'Sora',sans-serif",
      transition: "all 0.1s",
    }}>{label}</button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BatidasPage() {
  const { user }     = useAuth();
  const { theme: T } = useTheme();

  const isAdminRole = ["hr","ti","gerencia"].includes(user?.role);
  const isLeader    = ["leader"].includes(user?.role) || isAdminRole;

  const today   = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7*86400000).toISOString().slice(0, 10);

  const [mode,          setMode]          = useState("cached");
  const [dateFrom,      setDateFrom]      = useState(weekAgo);
  const [dateTo,        setDateTo]        = useState(today);
  const [preset,        setPreset]        = useState("week");
  const [days,          setDays]          = useState([]);
  const [nameFilter,    setNameFilter]    = useState("");
  const [deptFilter,    setDeptFilter]    = useState("");
  const [groupFilter,   setGroupFilter]   = useState("");
  const [statusFilter,  setStatusFilter]  = useState("todos");
  const [loading,       setLoading]       = useState(false);
  const [syncing,       setSyncing]       = useState(false);
  const [error,         setError]         = useState(null);
  const [syncInfo,      setSyncInfo]      = useState(null);
  const [esquecidos,    setEsquecidos]    = useState([]);
  const [esquecDism,    setEsquecDism]    = useState(false);

  const applyPreset = useCallback((p) => {
    const now = new Date();
    const fmt = d => d.toISOString().slice(0, 10);
    const startOf = (d, unit) => {
      const r = new Date(d);
      if (unit === "week") { r.setDate(d.getDate() - d.getDay()); }
      if (unit === "month") { r.setDate(1); }
      r.setHours(0,0,0,0); return r;
    };
    const map = {
      today:       [fmt(now), fmt(now)],
      yesterday:   [fmt(new Date(now - 86400000)), fmt(new Date(now - 86400000))],
      week:        [fmt(startOf(now, "week")), fmt(now)],
      last7:       [fmt(new Date(now - 7*86400000)), fmt(new Date(now - 86400000))],
      month:       [fmt(startOf(now, "month")), fmt(now)],
      last30:      [fmt(new Date(now - 29*86400000)), fmt(now)],
      lastmonth: (() => {
        const s = new Date(now.getFullYear(), now.getMonth()-1, 1);
        const e = new Date(now.getFullYear(), now.getMonth(), 0);
        return [fmt(s), fmt(e)];
      })(),
    };
    if (map[p]) { setDateFrom(map[p][0]); setDateTo(map[p][1]); setPreset(p); }
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const url = mode === "live"
        ? "/batidas/live"
        : `/batidas?dateFrom=${dateFrom}&dateTo=${dateTo}`;
      const { data } = await api.get(url);
      setDays(data.sort((a, b) => b.date?.localeCompare(a.date) || (a.fullName||"").localeCompare(b.fullName||"")));
    } catch (e) {
      if (!silent) setError(e.response?.data?.error || "Erro ao carregar batidas");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [mode, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!isLeader) return; api.get("/batidas/alerta-esquecidos").then(r => setEsquecidos(r.data||[])).catch(()=>{}); }, [isLeader]);
  useEffect(() => {
    const iv = setInterval(() => load({ silent: true }), 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [load]);

  const handleSync = async () => {
    setSyncing(true); setError(null); setSyncInfo(null);
    try {
      const { data } = await api.post("/batidas/sync", { dateFrom, dateTo });
      setSyncInfo(data);
      await load();
    } catch (e) {
      setError(e.response?.data?.error || "Erro na sincronização");
    } finally { setSyncing(false); }
  };

  const deptOptions   = useMemo(() => [...new Set(days.map(d => d.dept).filter(Boolean))].sort(), [days]);
  const groupOptions  = useMemo(() => {
    const seen = new Map();
    days.forEach(d => { if (d.groupName && !seen.has(d.groupName)) seen.set(d.groupName, d.groupColor); });
    return [...seen.entries()].sort((a,b) => a[0].localeCompare(b[0]));
  }, [days]);

  const filteredDays = useMemo(() => {
    return days.filter(d => {
      const q = nameFilter.toLowerCase().trim();
      if (q && !(d.fullName||"").toLowerCase().includes(q)) return false;
      if (deptFilter  && d.dept      !== deptFilter)  return false;
      if (groupFilter && d.groupName !== groupFilter)  return false;
      if (statusFilter !== "todos") {
        const todayStr = new Date().toISOString().slice(0, 10);
        const n = (d.batidas||[]).length;
        const isPast = d.date < todayStr;
        const isIncomplete = isPast && n > 0 && n % 2 === 1 && !(d.meioPeriodo && n === 2);
        const status = d.structured?.status;
        if (statusFilter === "incompleto"  && !isIncomplete) return false;
        if (statusFilter === "completo"    && (isIncomplete || status !== "completo")) return false;
        if (statusFilter === "trabalhando" && status !== "trabalhando") return false;
        if (statusFilter === "sem_batida"  && n > 0) return false;
      }
      return true;
    });
  }, [days, nameFilter, deptFilter, groupFilter, statusFilter]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const totalPunches    = filteredDays.reduce((s, d) => s + (d.batidas||[]).length, 0);
  const completeDays    = filteredDays.filter(d => { const n=(d.batidas||[]).length; if(!n) return false; return d.meioPeriodo ? n===2 : n%2===0; });
  const incompleteDays  = filteredDays.filter(d => {
    if (d.date >= todayStr) return false;
    const n = (d.batidas||[]).length; if(!n) return false;
    if (d.meioPeriodo && n===2) return false;
    return n % 2 === 1;
  });
  const avgWorkedMs     = completeDays.length ? completeDays.reduce((s,d)=>s+d.totalWorkedMs,0)/completeDays.length : 0;
  const activeFilters   = [nameFilter, deptFilter, groupFilter, statusFilter !== "todos" ? statusFilter : ""].filter(Boolean).length;

  const selStyle = {
    padding: "7px 10px", borderRadius: 7, border: `1px solid ${T.border}`,
    background: T.bgCard, color: T.t2, fontSize: 13, cursor: "pointer",
    fontFamily: "'Sora',sans-serif",
  };
  const inputStyle = { ...selStyle, cursor: "text" };

  const PRESETS = [
    { id: "today",     label: "Hoje"         },
    { id: "yesterday", label: "Ontem"        },
    { id: "last7",     label: "7 dias"       },
    { id: "week",      label: "Esta semana"  },
    { id: "month",     label: "Este mês"     },
    { id: "lastmonth", label: "Mês passado"  },
    { id: "last30",    label: "30 dias"      },
  ];

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1280 }}>

      {/* Header */}
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.t1, margin: 0 }}>Batidas de Ponto</h1>
          <p style={{ color: T.t5, fontSize: 13, margin: "4px 0 0" }}>
            Entradas, saídas e pausas · sync automático a cada 30min via Faceum
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isAdminRole && mode === "cached" && (
            <button onClick={handleSync} disabled={syncing} style={{
              padding: "7px 14px", borderRadius: 8, border: `1px solid ${T.border}`,
              background: syncing ? T.bgDeep : T.bgCard, color: syncing ? T.t6 : T.t2,
              cursor: syncing ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "'Sora',sans-serif",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              {syncing ? <Loader size={13} /> : "↓"} {syncing ? "Sincronizando..." : "Sincronizar Faceum"}
            </button>
          )}
          <button onClick={() => load()} disabled={loading} style={{
            padding: "7px 14px", borderRadius: 8, border: "none",
            background: T.accent, color: "#fff", cursor: loading ? "not-allowed" : "pointer",
            fontSize: 13, fontWeight: 600, fontFamily: "'Sora',sans-serif",
            display: "flex", alignItems: "center", gap: 6, opacity: loading ? 0.7 : 1,
          }}>
            {loading ? <Loader size={13} /> : <RefreshCw size={13} />} {loading ? "Buscando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {/* Alerta esquecidos */}
      {isLeader && !esquecDism && esquecidos.length > 0 && (
        <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:16,padding:"12px 16px",background:"#F59E0B12",border:"1px solid #F59E0B44",borderRadius:10 }}>
          <AlertTriangle size={16} color="#F59E0B" style={{ flexShrink:0 }} />
          <div style={{ flex:1 }}>
            <span style={{ fontSize:13,fontWeight:700,color:"#F59E0B" }}>{esquecidos.length} colaborador{esquecidos.length>1?"es":""} com batida ímpar ontem</span>
            <div style={{ fontSize:12,color:T.t5,marginTop:3 }}>{esquecidos.slice(0,6).map(e=>e.fullName.split(" ").slice(0,2).join(" ")+" ("+e.punchCount+"x)").join(" · ")}{esquecidos.length>6?" +"+(esquecidos.length-6)+" mais":""}</div>
          </div>
          <button onClick={()=>setEsquecDism(true)} style={{ background:"none",border:"none",cursor:"pointer",color:T.t6,padding:4,display:"flex" }}><X size={15}/></button>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Total de batidas",     value: totalPunches,            extra: `${filteredDays.length} dias` },
          { label: "Média trabalhada/dia",  value: fmtMs(avgWorkedMs),      extra: `${completeDays.length} dias completos` },
          { label: "Dias completos",        value: completeDays.length,     color: "#22c55e", extra: completeDays.length > 0 ? "✓ tudo certo" : "" },
          { label: "Dias incompletos",      value: incompleteDays.length,   color: incompleteDays.length > 0 ? "#f59e0b" : undefined, extra: incompleteDays.length > 0 ? "verificar" : "ok" },
        ].map((k, i) => (
          <div key={i} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 20px", minWidth: 150, flex: "1 1 150px" }}>
            <div style={{ fontSize: 11, color: T.t6, marginBottom: 4, fontWeight: 600, letterSpacing: "0.05em" }}>{k.label.toUpperCase()}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color || T.t1, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
            {k.extra && <div style={{ fontSize: 11, color: T.t8, marginTop: 2 }}>{k.extra}</div>}
          </div>
        ))}
      </div>

      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}`, width: "fit-content", marginBottom: 16 }}>
        {["cached","live"].map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: "7px 20px", border: "none", cursor: "pointer", fontSize: 13, fontFamily: "'Sora',sans-serif",
            background: mode === m ? T.accent : T.bgCard, color: mode === m ? "#fff" : T.t4,
            fontWeight: mode === m ? 700 : 400,
          }}>
            {m === "cached" ? "Histórico" : "⚡ Tempo real"}
          </button>
        ))}
      </div>

      {/* Date presets + range */}
      {mode === "cached" && (
        <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PRESETS.map(p => (
              <Preset key={p.id} label={p.label} active={preset === p.id} T={T} onClick={() => applyPreset(p.id)} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: T.t7 }}>De</span>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset(""); }} style={inputStyle} />
            <span style={{ fontSize: 12, color: T.t7 }}>até</span>
            <input type="date" value={dateTo}   onChange={e => { setDateTo(e.target.value);   setPreset(""); }} style={inputStyle} />
          </div>
        </div>
      )}

      {/* Filters row */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, padding: "12px 16px", background: T.bgDeep, borderRadius: 10, border: `1px solid ${T.border}`, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: T.t6, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", marginRight: 4 }}>
          <Filter size={13} /> FILTROS
          {activeFilters > 0 && <span style={{ background: T.accent, color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>{activeFilters}</span>}
        </div>

        {isLeader && (
          <input type="text" placeholder="🔍 Nome..." value={nameFilter} onChange={e => setNameFilter(e.target.value)}
            style={{ ...inputStyle, minWidth: 150 }} />
        )}

        {deptOptions.length > 0 && (
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={selStyle}>
            <option value="">Todos os deptos</option>
            {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}

        {groupOptions.length > 0 && (
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} style={selStyle}>
            <option value="">Todos os grupos</option>
            {groupOptions.map(([name, color]) => <option key={name} value={name}>{name}</option>)}
          </select>
        )}

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selStyle}>
          <option value="todos">Todos os status</option>
          <option value="completo">✓ Completos</option>
          <option value="incompleto">⚠ Incompletos</option>
          <option value="trabalhando">● Trabalhando</option>
        </select>

        {activeFilters > 0 && (
          <button onClick={() => { setNameFilter(""); setDeptFilter(""); setGroupFilter(""); setStatusFilter("todos"); }}
            style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.t5, cursor: "pointer", fontSize: 12, fontFamily: "'Sora',sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
            <X size={11} /> Limpar
          </button>
        )}

        <span style={{ marginLeft: "auto", fontSize: 12, color: T.t7, fontVariantNumeric: "tabular-nums" }}>
          {filteredDays.length} {filteredDays.length !== days.length ? `de ${days.length} ` : ""}registros
        </span>
      </div>

      {/* Feedback */}
      {error && (
        <div style={{ background:"#ef444410",border:"1px solid #ef444430",borderRadius:8,padding:"10px 14px",marginBottom:16,color:"#ef4444",fontSize:13 }}>{error}</div>
      )}
      {syncInfo && (
        <div style={{ background:"#22c55e10",border:"1px solid #22c55e30",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13,color:T.t2 }}>
          ✓ <strong>{syncInfo.total}</strong> batidas · <strong>{syncInfo.matched}</strong> vinculadas
          {syncInfo.unmatched > 0 && <span style={{ color:"#f59e0b" }}> · {syncInfo.unmatched} sem usuário</span>}
        </div>
      )}

      {/* List */}
      {loading && <div style={{ color:T.t5,fontSize:14,padding:48,textAlign:"center" }}>Carregando...</div>}
      {!loading && filteredDays.length === 0 && (
        <div style={{ color:T.t5,fontSize:14,padding:48,textAlign:"center" }}>
          {activeFilters > 0
            ? "Nenhum registro para os filtros selecionados."
            : mode === "cached"
              ? "Nenhuma batida no período. Sync automático a cada 30min."
              : "Nenhuma batida registrada hoje ainda."}
        </div>
      )}
      {!loading && filteredDays.map((day) => (
        <UserDayCard
          key={day.date + (day.fullName||"")}
          day={day} T={T}
          showName={isLeader}
          canEdit={isLeader}
          canDelete={isLeader}
          onRefresh={load}
        />
      ))}
    </div>
  );
}
