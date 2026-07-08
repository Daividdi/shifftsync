import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../hooks/useAuth";
import api from "../api/client";
import {
  Scale, ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  Loader, RefreshCw, Users, Clock, AlertTriangle, LogIn, LogOut,
} from "lucide-react";

function fmtBalance(min) {
  if (min == null || min === 0) return "0h";
  const sign = min > 0 ? "+" : "-";
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  return sign + h + "h" + (m > 0 ? String(m).padStart(2, "0") : "");
}
function fmtHours(min) {
  if (!min && min !== 0) return "—";
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  return h + "h" + (m > 0 ? String(m).padStart(2, "0") : "");
}
function fmtAbs(min) {
  if (!min && min !== 0) return "—";
  const abs = Math.abs(Math.round(min));
  if (abs === 0) return "—";
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2,"0") : ""}` : `${m}min`;
}
function fmtDate(d) {
  if (!d) return "—";
  const [y, mo, day] = d.split("-");
  return `${day}/${mo}/${y}`;
}
function fmtTime(iso) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function balanceColor(min) {
  if (min > 30)  return "#22c55e";
  if (min < -30) return "#ef4444";
  return "#f59e0b";
}

// Mirror of backend computeDayDev — no tolerance, every minute counts (matches PDF).
// recordedAt strings are timezone-free local time; toMin applies UTC-3 offset for browser env.
// schedStart: scheduled start in minutes (default 480 = 08:00).
const PAID_OT_DAILY_CAP = 120;
const TOL_ENTRY_EXIT = 5;

function computeDayDevFromBatidas(batidas, expected, isSat, schedStart) {
  if (!batidas?.length) return { balance: 0, worked: 0, lunchMin: null, atrasoMin: 0, saMin: 0, extraMin: 0, paidOTMin: 0 };
  const SS = schedStart !== undefined ? schedStart : 480;
  const toMin = iso => { const d = new Date(iso); return ((d.getUTCHours()-3+24)%24)*60+d.getUTCMinutes(); };
  const sorted = [...batidas].sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
  const N = sorted.length;
  let worked = 0, totalBreaks = 0;
  for (let i = 0; i+1<N; i+=2) {
    const from=toMin(sorted[i].recordedAt), to=toMin(sorted[i+1].recordedAt);
    const dur=to>=from?to-from:to+1440-from; if(dur>0) worked+=dur;
  }
  for (let i = 1; i+1<N; i+=2) {
    const from=toMin(sorted[i].recordedAt), to=toMin(sorted[i+1].recordedAt);
    const dur=to>=from?to-from:to+1440-from; if(dur>0) totalBreaks+=dur;
  }
  if (N===0||N%2===1) return {balance:0, worked, lunchMin:null, atrasoMin:0, saMin:0, extraMin:0, paidOTMin:0};

  if (isSat) {
    const SAT_START = 480;
    const SAT_END = SAT_START + expected;
    const P1=toMin(sorted[0].recordedAt), Plast=toMin(sorted[N-1].recordedAt);
    let atrasoMin=0, saMin=0, extraMin=0;
    const entryDev = P1 - SAT_START;
    if (Math.abs(entryDev) > TOL_ENTRY_EXIT) {
      if (entryDev > 0) atrasoMin += entryDev; else extraMin += -entryDev;
    }
    const exitDev = Plast - SAT_END;
    if (exitDev > 0) extraMin += exitDev; else if (exitDev < 0) saMin += -exitDev;
    const paidOT = Math.max(0, extraMin - PAID_OT_DAILY_CAP);
    const balance = (extraMin - paidOT) - atrasoMin - saMin;
    return {balance, worked, lunchMin:null, atrasoMin, saMin, extraMin, paidOTMin:paidOT};
  }
  const isHalfPeriod = N === 2 && expected < 480;
  if (isHalfPeriod) {
    const raw=worked-expected;
    const ex=raw>0?raw:0;
    const at=raw<0?-raw:0;
    const paidOT=Math.max(0,ex-PAID_OT_DAILY_CAP);
    return {balance:(ex-paidOT)-at, worked, lunchMin:null, atrasoMin:at, saMin:0, extraMin:ex, paidOTMin:paidOT};
  }
  const fullWeekday = expected >= 360;
  if (!fullWeekday) {
    const raw=worked-expected;
    const ex=raw>0?raw:0;
    const paidOT=Math.max(0,ex-PAID_OT_DAILY_CAP);
    return {balance:(ex-paidOT)-(raw<0?-raw:0), worked, lunchMin:null, atrasoMin:raw<0?-raw:0, saMin:0, extraMin:ex, paidOTMin:paidOT};
  }
  const hasLunch = expected >= 480 || N >= 4;
  const SCHED_END = SS + expected + (hasLunch ? 60 : 0);
  const P1=toMin(sorted[0].recordedAt), Plast=toMin(sorted[N-1].recordedAt);
  let atrasoMin=0, saMin=0, extraMin=0;
  const entryDev=P1-SS;
  if (Math.abs(entryDev) > TOL_ENTRY_EXIT) {
    if (entryDev>0) atrasoMin+=entryDev; else extraMin+=-entryDev;
  }
  let lunchMin=null;
  if(N>=4){
    lunchMin=totalBreaks;
    const bd=totalBreaks-60;
    if(bd>0) atrasoMin+=bd; else if(bd<0) extraMin+=-bd;
  }
  const exitDev=Plast-SCHED_END;
  if (Math.abs(exitDev) > TOL_ENTRY_EXIT) {
    if (exitDev>0) extraMin+=exitDev; else saMin+=-exitDev;
  }
  const paidOTMin=Math.max(0,extraMin-PAID_OT_DAILY_CAP);
  const balance = (extraMin-paidOTMin) - atrasoMin - saMin;
  return {balance, worked, lunchMin, atrasoMin, saMin, extraMin, paidOTMin};
}
// ─────────────────────────────────────────────────────────────────────────────

function BalanceBar({ min, maxAbs, T }) {
  if (!maxAbs) return null;
  const pct = Math.min(Math.abs(min) / maxAbs, 1) * 50;
  const color = balanceColor(min);
  const isPos = min >= 0;
  return (
    <div style={{ flex: 1, height: 6, background: T.bgDeep, borderRadius: 3, position: "relative", overflow: "hidden", minWidth: 60 }}>
      <div style={{
        position: "absolute",
        height: "100%",
        width: pct + "%",
        background: color + "cc",
        borderRadius: 3,
        [isPos ? "left" : "right"]: "50%",
        transition: "width 0.35s ease",
      }} />
      <div style={{ position: "absolute", left: "50%", top: 0, width: 1, height: "100%", background: T.border }} />
    </div>
  );
}

function Preset({ label, active, onClick, T }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 11px", borderRadius: 20, border: `1px solid ${active ? T.accent : T.border}`,
      background: active ? T.accent + "22" : "transparent", color: active ? T.accent : T.t5,
      cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 400,
      fontFamily: "'Sora',sans-serif", transition: "background 0.12s, color 0.12s, border-color 0.12s",
    }}>{label}</button>
  );
}

// PersonRow must receive all state via props (no hooks at call site)
function PersonRow({ u, showGroup, maxAbs, T, expanded, onToggle, canEdit, onToggleMeio }) {
  const bColor = balanceColor(u.balanceMin);
  const sortedDays = [...u.daysList].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div style={{ borderBottom: `1px solid ${T.borderSubtle}` }}>
      <div onClick={onToggle} style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 18px",
        cursor: "pointer", background: expanded ? T.accent + "08" : "transparent",
        transition: "background 0.1s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: 200, flexShrink: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: u.groupColor, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.fullName}</div>
            {showGroup && <div style={{ fontSize: 10, color: T.t8 }}>{u.groupName}</div>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 18, alignItems: "center", flex: 1, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center", minWidth: 44 }}>
            <div style={{ fontSize: 9, color: T.t8, fontWeight: 700, letterSpacing: "0.06em" }}>DIAS</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.t2, fontVariantNumeric: "tabular-nums" }}>{u.daysCount}</div>
          </div>
          <div style={{ textAlign: "center", minWidth: 56 }}>
            <div style={{ fontSize: 9, color: T.t8, fontWeight: 700, letterSpacing: "0.06em" }}>ESPERADO</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.t5, fontVariantNumeric: "tabular-nums" }}>{fmtHours(u.expectedMin)}</span>
              {canEdit && (
                <button
                  onClick={e => { e.stopPropagation(); onToggleMeio(u.userId, u.meioPeriodo); }}
                  title={u.meioPeriodo ? "Marcar como período integral (8h)" : "Marcar como meio período (4h)"}
                  style={{
                    fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 4,
                    border: `1px solid ${u.meioPeriodo ? "#A78BFA40" : T.border}`,
                    background: u.meioPeriodo ? "#A78BFA18" : T.bgDeep,
                    color: u.meioPeriodo ? "#A78BFA" : T.t8,
                    cursor: "pointer", lineHeight: 1.4, fontFamily: "'Sora',sans-serif",
                    transition: "background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s",
                  }}
                >
                  {u.meioPeriodo ? "½" : "1"}
                </button>
              )}
            </div>
          </div>
          <div style={{ textAlign: "center", minWidth: 64 }}>
            <div style={{ fontSize: 9, color: T.t8, fontWeight: 700, letterSpacing: "0.06em" }}>TRABALHADO</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.t2, fontVariantNumeric: "tabular-nums" }}>{fmtHours(u.workedMin)}</div>
          </div>
          <BalanceBar min={u.balanceMin} maxAbs={maxAbs} T={T} />
        </div>

        <div style={{
          minWidth: 68, padding: "4px 10px", borderRadius: 20,
          background: bColor + "18", border: `1px solid ${bColor}40`,
          textAlign: "center", flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: bColor, fontVariantNumeric: "tabular-nums" }}>
            {fmtBalance(u.balanceMin)}
          </span>
        </div>

        {u.incompleteDays > 0 && <AlertTriangle size={12} color="#f59e0b" style={{ flexShrink: 0 }} title={`${u.incompleteDays} dias incompletos`} />}
        {expanded ? <ChevronUp size={13} color={T.t5} /> : <ChevronDown size={13} color={T.t5} />}
      </div>

      {expanded && (
        <div style={{ background: T.bgDeep, borderTop: `1px solid ${T.border}` }}>
          {/* Column headers */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "88px 62px 72px 62px 68px 66px 58px 58px 68px",
            padding: "8px 18px 4px", gap: 4,
          }}>
            {["DATA", "ENTRADA", "ALMOÇO", "SAÍDA", "TRAB", "EXEC", "AUT", "ATRASO", "SALDO"].map(h => (
              <div key={h} style={{ fontSize: 9, color: T.t8, fontWeight: 700, letterSpacing: "0.07em" }}>{h}</div>
            ))}
          </div>
          {sortedDays.map(d => {
            const dc = balanceColor(d.balanceMin);
            const atraso = d.atrasoMin ?? 0;
            return (
              <div key={d.date} style={{
                display: "grid",
                gridTemplateColumns: "88px 62px 72px 62px 68px 66px 58px 58px 68px",
                padding: "5px 18px", gap: 4, alignItems: "center",
                background: d.isIncomplete ? "#f59e0b06" : "transparent",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: T.t3, fontVariantNumeric: "tabular-nums" }}>
                  {fmtDate(d.date)}
                  {d.isIncomplete && <AlertTriangle size={10} color="#f59e0b" />}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, color: "#22c55e", fontVariantNumeric: "tabular-nums" }}>
                  <LogIn size={9} color="#22c55e" />{fmtTime(d.entrada)}
                </div>
                <div style={{ fontSize: 12, color: T.t6, fontVariantNumeric: "tabular-nums" }}>
                  {d.lunchMin != null ? fmtHours(d.lunchMin) : "—"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, color: "#ef4444", fontVariantNumeric: "tabular-nums" }}>
                  <LogOut size={9} color="#ef4444" />{fmtTime(d.saida)}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.t2, fontVariantNumeric: "tabular-nums" }}>{fmtAbs(d.workedMin)}</div>
                <div style={{ fontSize: 12, color: T.t7, fontVariantNumeric: "tabular-nums" }}>{fmtAbs(d.expectedMin)}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: d.balanceMin !== 0 ? dc : T.t8, fontVariantNumeric: "tabular-nums" }}>{fmtAbs(d.balanceMin)}</div>
                <div style={{ fontSize: 12, color: atraso > 0 ? "#ef4444" : T.t8, fontVariantNumeric: "tabular-nums" }}>{fmtAbs(atraso)}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: dc, fontVariantNumeric: "tabular-nums" }}>{fmtBalance(d.balanceMin)}</div>
              </div>
            );
          })}
          {/* Totals footer */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "88px 62px 72px 62px 68px 66px 58px 58px 68px",
            padding: "6px 18px 10px", gap: 4,
            borderTop: `1px solid ${T.border}`, marginTop: 2,
          }}>
            <div style={{ fontSize: 10, color: T.t7, fontWeight: 700, letterSpacing: "0.06em", gridColumn: "1/5" }}>TOTAL</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.t2, fontVariantNumeric: "tabular-nums" }}>{fmtHours(u.workedMin)}</div>
            <div style={{ fontSize: 12, color: T.t7, fontVariantNumeric: "tabular-nums" }}>{fmtHours(u.expectedMin)}</div>
            <div style={{ gridColumn: "7/10", fontSize: 13, fontWeight: 800, color: balanceColor(u.correctedBalanceMin), fontVariantNumeric: "tabular-nums" }}>{fmtBalance(u.correctedBalanceMin)}</div>
          </div>
          {/* Period Summary — PDF-style per-event buckets */}
          <div style={{ borderTop: `1px solid ${T.border}`, padding: "12px 18px 14px", background: T.bgCard }}>
            <div style={{ fontSize: 9, color: T.t8, fontWeight: 700, letterSpacing: "0.07em", marginBottom: 10 }}>TOTAIS GERADOS NO PERÍODO</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 10 }}>
              {[
                { label: "EXTRAS",  value: fmtAbs(u.totalExtrasMin), color: "#22c55e" },
                { label: "HORA EXTRA 50%", value: fmtAbs(u.totalPaidOTMin), color: "#f59e0b" },
                { label: "EXTRAS A COMPENSAR", value: fmtAbs((u.totalExtrasMin || 0) - (u.totalPaidOTMin || 0)), color: "#22c55e" },
                { label: "ATRASO (A)", value: fmtAbs(u.totalAtrasoMin), color: "#ef4444" },
                { label: "SAÍDA ANT. (SA)", value: fmtAbs(u.totalSAMin), color: "#ef4444" },
                { label: "FALTA (F)", value: fmtAbs(u.totalFaltaMin), color: "#ef4444" },
                { label: "ABONO", value: fmtAbs(u.totalAbonoMin || 0), color: "#A78BFA" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: "center", padding: "7px 3px", background: T.bgDeep, borderRadius: 7 }}>
                  <div style={{ fontSize: 8, color: T.t8, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 9, color: T.t8, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 6, marginTop: 4 }}>
              SALDO = EXTRAS A COMPENSAR − ATRASO − SA − FALTA
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[
                { label: "SALDO ANTERIOR",   value: fmtBalance(u.saldoAnteriorMin), color: balanceColor(u.saldoAnteriorMin) },
                { label: "SALDO DO PERÍODO", value: fmtBalance(u.periodoSaldoMin),  color: balanceColor(u.periodoSaldoMin)  },
                { label: "SALDO ATUAL",      value: fmtBalance(u.saldoAtualMin),    color: balanceColor(u.saldoAtualMin)    },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: "center", padding: "10px 8px", background: color + "12", border: `1px solid ${color}30`, borderRadius: 8 }}>
                  <div style={{ fontSize: 9, color: T.t8, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PontoSaldoPage() {
  const { theme: T } = useTheme();

  const { user } = useAuth();
  const isAdmin = ["hr","ti","gerencia"].includes(user?.role);
  const todayStr      = new Date().toISOString().slice(0, 10);
  const yesterdayStr  = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const startOfMonth  = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 10);
  const lastMonthEnd   = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().slice(0, 10);

  const [dateFrom,       setDateFrom]       = useState(startOfMonth);
  const [dateTo,         setDateTo]         = useState(yesterdayStr);
  const [preset,         setPreset]         = useState("month");
  const [days,           setDays]           = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState(null);
  const [tab,            setTab]            = useState("groups");
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [expandedPeople, setExpandedPeople] = useState(new Set());
  const [sortBy,         setSortBy]         = useState("balance_asc");
  const [balanceFilter,  setBalanceFilter]  = useState("todos");
  const [nameFilter,     setNameFilter]     = useState("");
  const [usersMap,       setUsersMap]       = useState(new Map());
  const [bancoEquipe,    setBancoEquipe]    = useState([]);

  const PRESETS = [
    { id: "week",      label: "Esta semana",  f: () => { const d=new Date(); d.setDate(d.getDate()-d.getDay()); return [d.toISOString().slice(0,10), yesterdayStr]; } },
    { id: "last7",     label: "7 dias",       f: () => [new Date(Date.now()-7*86400000).toISOString().slice(0,10), yesterdayStr] },
    { id: "month",     label: "Este mês",     f: () => [startOfMonth, yesterdayStr] },
    { id: "last30",    label: "30 dias",      f: () => [new Date(Date.now()-29*86400000).toISOString().slice(0,10), yesterdayStr] },
    { id: "lastmonth", label: "Mês passado",  f: () => [lastMonthStart, lastMonthEnd] },
  ];

  const applyPreset = (id) => {
    const p = PRESETS.find(x => x.id === id);
    if (!p) return;
    const [f, t] = p.f();
    setDateFrom(f); setDateTo(t); setPreset(id);
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [batidasRes, usersRes, equipeRes] = await Promise.all([
        api.get(`/batidas?dateFrom=${dateFrom}&dateTo=${dateTo}`),
        api.get("/users"),
        api.get(`/ponto/banco-horas/equipe?until=${dateFrom}`).catch(() => ({ data: [] })),
      ]);
      setDays(batidasRes.data);
      setUsersMap(new Map(usersRes.data.map(u => [u.id, u])));
      setBancoEquipe(equipeRes.data || []);
    } catch (e) {
      setError(e.response?.data?.error || "Erro ao carregar dados");
    } finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  const toggleMeio = useCallback(async (userId, currentValue) => {
    try {
      await api.patch(`/users/${userId}/meio-periodo`, { meioperiodo: !currentValue });
      setUsersMap(prev => {
        const next = new Map(prev);
        const u = next.get(userId);
        if (u) next.set(userId, { ...u, meioPeriodo: !currentValue });
        return next;
      });
    } catch (e) {
      alert(e.response?.data?.error || "Erro ao atualizar meio período");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const equipeMap = useMemo(() => new Map((bancoEquipe || []).map(e => [e.userId, e])), [bancoEquipe]);

  const userStats = useMemo(() => {
    const byUser = new Map();
    function seedUser(userId, fullName, groupName, groupColor, meioPeriodo, title, eq) {
      byUser.set(userId, {
        userId, fullName,
        groupName: groupName || "Sem grupo",
        groupColor: groupColor || "#94a3b8",
        meioPeriodo: meioPeriodo ?? false,
        title: title || '',
        workedMin: 0, expectedMin: 0, correctedBalanceMin: 0, daysCount: 0, incompleteDays: 0, daysList: [],
        bancoBalanceMin: eq?.periodBalanceMin ?? null,
        previousBalanceMin: eq?.previousBalanceMin ?? null,
        periodoLabel: eq?.periodo?.label || null,
        // PDF-style per-event buckets
        totalExtrasMin: 0, totalPaidOTMin: 0, totalAtrasoMin: 0, totalSAMin: 0, totalFaltaMin: 0, totalAbonoMin: 0,
        // Backward compat
        totalFaltasMin: 0,
      });
    }
    // Seed users who have working Saturdays even if they have no batidas in range
    for (const eq of bancoEquipe) {
      if ((eq.workingSaturdayDates || []).some(d => d >= dateFrom && d <= dateTo) && !byUser.has(eq.userId)) {
        const um = usersMap.get(eq.userId);
        seedUser(eq.userId, eq.fullName, eq.groupName, eq.groupColor, um?.meioPeriodo, um?.title, eq);
      }
    }
    for (const d of days) {
      if (!d.userId || !(d.batidas||[]).length) continue;
      const eq = equipeMap.get(d.userId);
      if (!byUser.has(d.userId)) {
        seedUser(d.userId, d.fullName,
          (eq?.groupName) || d.groupName,
          (eq?.groupColor) || d.groupColor,
          usersMap.has(d.userId) ? usersMap.get(d.userId).meioPeriodo : d.meioPeriodo,
          usersMap.get(d.userId)?.title || '',
          eq);
      }
      const u = byUser.get(d.userId);
      const n = d.batidas.length;
      const dow = new Date(d.date + 'T12:00:00Z').getUTCDay();
      const expectedMin = (eq?.dailyExpByDow?.[dow] !== undefined)
        ? eq.dailyExpByDow[dow]
        : (dow === 6 ? 240 : (u.meioPeriodo ? (n <= 2 ? 240 : 480) : 480));
      const isSat = dow === 6;
      const schedStart = eq?.schedStartMin ?? 480;
      const dev = computeDayDevFromBatidas(d.batidas, expectedMin, isSat, schedStart);
      const workedMin  = dev.worked;
      const balanceMin = dev.balance;
      const lunchMin   = dev.lunchMin;
      const atrasoMin  = dev.atrasoMin ?? 0;
      const saMin      = dev.saMin     ?? 0;
      const extraMin   = dev.extraMin  ?? 0;
      const paidOTMin  = dev.paidOTMin ?? 0;
      const isPast       = d.date < todayStr;
      const isIncomplete = isPast && n > 0 && n % 2 === 1 && !(u.meioPeriodo && n === 2);
      const entrada = d.batidas[0]?.recordedAt;
      const saida   = n % 2 === 0 ? d.batidas[n - 1]?.recordedAt : null;
      u.workedMin  += workedMin;
      u.expectedMin += expectedMin;
      u.correctedBalanceMin += balanceMin;
      u.daysCount++;
      if (isIncomplete) u.incompleteDays++;
      u.totalExtrasMin += extraMin;
      u.totalPaidOTMin += paidOTMin;
      u.totalAtrasoMin += atrasoMin;
      u.totalSAMin     += saMin;
      // Backward compat (lumps net negatives like the old UI)
      if (balanceMin < 0) u.totalFaltasMin += Math.abs(balanceMin);
      u.daysList.push({ date: d.date, workedMin, expectedMin, rawBalance: balanceMin, balanceMin, lunchMin, atrasoMin, saMin, extraMin, paidOTMin, n, isIncomplete, entrada, saida });
    }
    // Add absent obligated day rows (Saturdays + weekdays) — these accumulate as "Falta" (full-day absence).
    // Server pre-filters out holidays/vacation/Sundays in workingSaturdayDates and workingWeekdayDates.
    for (const u of byUser.values()) {
      const eq = equipeMap.get(u.userId);
      const existingDates = new Set(u.daysList.map(d => d.date));
      const addFalta = (date, exp, dow) => {
        u.correctedBalanceMin -= exp;
        u.expectedMin         += exp;
        u.daysCount++;
        u.totalFaltaMin       += exp;
        u.totalFaltasMin      += exp;
        u.daysList.push({ date, workedMin: 0, expectedMin: exp, rawBalance: -exp, balanceMin: -exp, lunchMin: null, atrasoMin: 0, saMin: 0, extraMin: 0, paidOTMin: 0, faltaMin: exp, n: 0, isIncomplete: false, entrada: null, saida: null });
      };
      for (const satDate of (eq?.workingSaturdayDates || [])) {
        if (satDate >= dateFrom && satDate <= dateTo && !existingDates.has(satDate)) {
          addFalta(satDate, eq?.dailyExpByDow?.[6] ?? 240, 6);
        }
      }
      for (const wkDate of (eq?.workingWeekdayDates || [])) {
        if (wkDate >= dateFrom && wkDate <= dateTo && !existingDates.has(wkDate)) {
          const dow = new Date(wkDate + "T12:00:00Z").getUTCDay();
          const wkExp = eq?.dailyExpByDow?.[dow] ?? 480;
          addFalta(wkDate, wkExp, dow);
        }
      }
      u.daysList.sort((a, b) => a.date > b.date ? 1 : -1);
    }
    return [...byUser.values()].map(u => {
      // Saldo do período = totais client-side do range selecionado; saldo
      // anterior = acumulado do trimestre ANTES do range (backend, ?until=);
      // saldo atual = anterior + período (acumulativo do trimestre).
      const extrasACompensarMin = u.totalExtrasMin - (u.totalPaidOTMin || 0);
      const faltasACompensarMin = u.totalAtrasoMin + u.totalSAMin + u.totalFaltaMin;
      const periodoSaldoMin     = u.correctedBalanceMin;
      const saldoAnteriorMin    = u.previousBalanceMin ?? 0;
      return {
        ...u,
        balanceMin: u.correctedBalanceMin,
        extrasACompensarMin,
        faltasACompensarMin,
        periodoSaldoMin,
        saldoAnteriorMin,
        saldoAtualMin: saldoAnteriorMin + periodoSaldoMin,
      };
    });
  }, [days, todayStr, usersMap]);

  const groupStats = useMemo(() => {
    const map = new Map();
    for (const u of userStats) {
      if (!map.has(u.groupName)) {
        map.set(u.groupName, { groupName: u.groupName, groupColor: u.groupColor, members: [], totalWorkedMin: 0, totalExpectedMin: 0, totalBalanceMin: 0 });
      }
      const g = map.get(u.groupName);
      g.members.push(u);
      g.totalWorkedMin   += u.workedMin;
      g.totalExpectedMin += u.expectedMin;
      g.totalBalanceMin  += u.balanceMin;
    }
    return [...map.values()].sort((a, b) => a.groupName.localeCompare(b.groupName, "pt-BR"));
  }, [userStats]);

  const kpis = useMemo(() => {
    const inDebt   = userStats.filter(u => u.balanceMin < -30);
    const inCredit = userStats.filter(u => u.balanceMin > 30);
    return {
      inDebt, inCredit,
      debtTotal:   inDebt.reduce((s, u)   => s + u.balanceMin, 0),
      creditTotal: inCredit.reduce((s, u) => s + u.balanceMin, 0),
    };
  }, [userStats]);

  const maxAbs = useMemo(() => Math.max(...userStats.map(u => Math.abs(u.balanceMin)), 60), [userStats]);

  const filteredPeople = useMemo(() => {
    let list = [...userStats];
    if (nameFilter.trim()) list = list.filter(u => u.fullName.toLowerCase().includes(nameFilter.toLowerCase().trim()));
    if (balanceFilter === "debito")  list = list.filter(u => u.balanceMin < -30);
    if (balanceFilter === "credito") list = list.filter(u => u.balanceMin > 30);
    if (balanceFilter === "ok")      list = list.filter(u => Math.abs(u.balanceMin) <= 30);
    if (sortBy === "balance_asc")  return list.sort((a, b) => a.balanceMin - b.balanceMin);
    if (sortBy === "balance_desc") return list.sort((a, b) => b.balanceMin - a.balanceMin);
    return list.sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
  }, [userStats, sortBy, balanceFilter, nameFilter]);

  const filteredGroups = useMemo(() => {
    const nf = nameFilter.toLowerCase().trim();
    if (balanceFilter === "todos" && !nf) return groupStats;
    return groupStats.map(g => ({
      ...g,
      members: g.members.filter(u => (!nf || u.fullName.toLowerCase().includes(nf)) &&
        balanceFilter === "debito"  ? u.balanceMin < -30  :
        balanceFilter === "credito" ? u.balanceMin > 30   :
        Math.abs(u.balanceMin) <= 30
      ),
    })).filter(g => g.members.length > 0);
  }, [groupStats, balanceFilter, nameFilter]);

  const toggleGroup  = (name) => setExpandedGroups(p => { const n = new Set(p); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const togglePerson = (id)   => setExpandedPeople(p => { const n = new Set(p); n.has(id)   ? n.delete(id)   : n.add(id);   return n; });

  const inputStyle = {
    padding: "7px 10px", borderRadius: 7, border: `1px solid ${T.border}`,
    background: T.bgCard, color: T.t2, fontSize: 13, fontFamily: "'Sora',sans-serif",
  };

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1300 }}>

      {/* Header */}
      <div style={{ marginBottom: 22, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: T.accent + "22", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Scale size={18} color={T.accent} />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: T.t1, margin: 0 }}>Saldo de Horas</h1>
              <p style={{ color: T.t5, fontSize: 13, margin: 0 }}>Banco de horas do período vigente por colaborador e grupo</p>
            </div>
          </div>
        </div>
        <button onClick={load} disabled={loading} style={{
          padding: "7px 14px", borderRadius: 8, border: "none",
          background: T.accent, color: "#fff", cursor: loading ? "not-allowed" : "pointer",
          fontSize: 13, fontWeight: 600, fontFamily: "'Sora',sans-serif",
          display: "flex", alignItems: "center", gap: 6, opacity: loading ? 0.7 : 1,
        }}>
          {loading ? <Loader size={13} /> : <RefreshCw size={13} />}
          {loading ? "Buscando..." : "Atualizar"}
        </button>
      </div>

      {/* Period selector */}
      <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PRESETS.map(p => <Preset key={p.id} label={p.label} active={preset === p.id} T={T} onClick={() => applyPreset(p.id)} />)}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: T.t7 }}>De</span>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset(""); }} style={inputStyle} />
          <span style={{ fontSize: 12, color: T.t7 }}>até</span>
          <input type="date" value={dateTo}   onChange={e => { setDateTo(e.target.value);   setPreset(""); }} style={inputStyle} />
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Em débito",      value: kpis.inDebt.length,    sub: fmtBalance(kpis.debtTotal) + " acumulado",   color: "#ef4444", icon: <TrendingDown size={16} color="#ef4444" />, filter: "debito"  },
          { label: "Em crédito",     value: kpis.inCredit.length,  sub: fmtBalance(kpis.creditTotal) + " acumulado", color: "#22c55e", icon: <TrendingUp   size={16} color="#22c55e" />, filter: "credito" },
          { label: "Colaboradores",  value: userStats.length,       sub: `${groupStats.length} grupos`,              color: T.accent,  icon: <Users size={16} color={T.accent} />,        filter: "todos"   },
          { label: "Dentro do prazo",value: userStats.length - kpis.inDebt.length - kpis.inCredit.length,
            sub: "saldo ≤ 30min", color: T.t5, icon: <Clock size={16} color={T.t5} />, filter: "ok" },
        ].map((k, i) => (
          <div key={i}
            onClick={() => setBalanceFilter(f => f === k.filter ? "todos" : k.filter)}
            style={{
              background: T.bgCard, border: `2px solid ${balanceFilter === k.filter ? k.color : T.border}`,
              borderRadius: 12, padding: "14px 20px", minWidth: 155, flex: "1 1 155px",
              cursor: "pointer", transition: "border-color 0.15s",
            }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: T.t6, fontWeight: 700, letterSpacing: "0.05em" }}>{k.label.toUpperCase()}</div>
              {k.icon}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: k.color, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
            <div style={{ fontSize: 11, color: T.t8, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs + sort */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}` }}>
          {[["groups", "Por Grupo"], ["people", "Por Colaborador"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: "7px 18px", border: "none", cursor: "pointer", fontSize: 13,
              fontFamily: "'Sora',sans-serif", transition: "background 0.12s, color 0.12s, border-color 0.12s",
              background: tab === id ? T.accent : T.bgCard,
              color: tab === id ? "#fff" : T.t4,
              fontWeight: tab === id ? 700 : 400,
            }}>{label}</button>
          ))}
        </div>

        {/* Search input — always visible */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", opacity: 0.45 }}>
            🔍
          </span>
          <input
            type="text"
            placeholder="Buscar colaborador..."
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            style={{
              paddingLeft: 30, paddingRight: nameFilter ? 28 : 10,
              paddingTop: 7, paddingBottom: 7,
              borderRadius: 8, border: `1px solid ${T.border}`,
              background: T.bgCard, color: T.t2,
              fontSize: 13, fontFamily: "'Sora',sans-serif",
              width: 200, outline: "none",
            }}
          />
          {nameFilter && (
            <button onClick={() => setNameFilter("")} style={{
              position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer",
              color: T.t7, fontSize: 14, lineHeight: 1, padding: 2,
            }}>×</button>
          )}
        </div>

        {tab === "people" && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: T.t7, fontWeight: 700, letterSpacing: "0.07em" }}>ORDENAR:</span>
            {[["balance_asc", "Maior débito"], ["balance_desc", "Maior crédito"], ["name", "Nome"]].map(([id, label]) => (
              <button key={id} onClick={() => setSortBy(id)} style={{
                padding: "4px 10px", borderRadius: 6, border: `1px solid ${sortBy === id ? T.accent : T.border}`,
                background: sortBy === id ? T.accent + "18" : "transparent",
                color: sortBy === id ? T.accent : T.t6,
                fontSize: 11, fontWeight: sortBy === id ? 700 : 400, cursor: "pointer",
                fontFamily: "'Sora',sans-serif",
              }}>{label}</button>
            ))}
          </div>
        )}

        {balanceFilter !== "todos" && (
          <button onClick={() => setBalanceFilter("todos")} style={{
            marginLeft: "auto", padding: "5px 10px", borderRadius: 6,
            border: `1px solid ${T.border}`, background: "transparent",
            color: T.t5, cursor: "pointer", fontSize: 11, fontFamily: "'Sora',sans-serif",
          }}>✕ Limpar filtro</button>
        )}
      </div>

      {error && (
        <div style={{ background: "#ef444410", border: "1px solid #ef444430", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#ef4444", fontSize: 13 }}>{error}</div>
      )}

      {loading && <div style={{ color: T.t5, fontSize: 14, padding: 48, textAlign: "center" }}>Carregando...</div>}

      {/* Por Grupo */}
      {!loading && tab === "groups" && (
        <div>
          {filteredGroups.length === 0 && (
            <div style={{ color: T.t5, textAlign: "center", padding: 48, fontSize: 14 }}>Nenhum dado para o período.</div>
          )}
          {filteredGroups.map(g => {
            const isOpen = expandedGroups.has(g.groupName);
            const gc = balanceColor(g.totalBalanceMin);
            const sortedMembers = [...g.members].sort((a, b) => a.balanceMin - b.balanceMin);
            return (
              <div key={g.groupName} style={{ marginBottom: 10, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
                {/* Group header — clickable */}
                <div onClick={() => toggleGroup(g.groupName)} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
                  cursor: "pointer", background: T.bgCard, transition: "background 0.1s",
                  userSelect: "none",
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: g.groupColor, flexShrink: 0 }} />
                  <div style={{ minWidth: 160 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.t1 }}>{g.groupName}</div>
                    <div style={{ fontSize: 11, color: T.t8, marginTop: 1 }}>
                      {g.members.length} colaborador{g.members.length !== 1 ? "es" : ""}
                      {g.members.filter(m => m.balanceMin < -30).length > 0 && (
                        <span style={{ marginLeft: 8, color: "#ef4444" }}>· {g.members.filter(m => m.balanceMin < -30).length} em débito</span>
                      )}
                    </div>
                  </div>

                  {/* Sparkline de saldos individuais */}
                  <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 3, height: 24, padding: "0 8px" }}>
                    {sortedMembers.map(m => {
                      const mc = balanceColor(m.balanceMin);
                      const h  = Math.min(Math.abs(m.balanceMin) / Math.max(maxAbs, 60), 1) * 20 + 4;
                      return (
                        <div key={m.userId} title={`${m.fullName.split(" ")[0]}: ${fmtBalance(m.balanceMin)}`}
                          style={{ flex: 1, maxWidth: 20, height: h, borderRadius: 3, background: mc + "55", transition: "height 0.3s" }} />
                      );
                    })}
                  </div>

                  {/* Worked / Expected summary */}
                  <div style={{ textAlign: "right", flexShrink: 0, marginRight: 12 }}>
                    <div style={{ fontSize: 11, color: T.t8 }}>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtHours(g.totalWorkedMin)}</span>
                      <span style={{ color: T.t10 }}> / {fmtHours(g.totalExpectedMin)} esperado</span>
                    </div>
                  </div>

                  {/* Total balance chip */}
                  <div style={{
                    padding: "5px 14px", borderRadius: 20,
                    background: gc + "18", border: `1px solid ${gc}40`, flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: gc, fontVariantNumeric: "tabular-nums" }}>
                      {fmtBalance(g.totalBalanceMin)}
                    </span>
                  </div>

                  {isOpen ? <ChevronUp size={15} color={T.t5} /> : <ChevronDown size={15} color={T.t5} />}
                </div>

                {/* Members */}
                {isOpen && (
                  <div style={{ borderTop: `1px solid ${T.border}` }}>
                    {sortedMembers.map(u => (
                      <PersonRow
                        key={u.userId}
                        u={u}
                        showGroup={false}
                        maxAbs={maxAbs}
                        T={T}
                        expanded={expandedPeople.has(u.userId)}
                        onToggle={() => togglePerson(u.userId)}
                        canEdit={isAdmin}
                        onToggleMeio={toggleMeio}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Por Colaborador */}
      {!loading && tab === "people" && (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
          {filteredPeople.length === 0 && (
            <div style={{ color: T.t5, textAlign: "center", padding: 48, fontSize: 14 }}>Nenhum dado para o período.</div>
          )}
          {filteredPeople.map(u => (
            <PersonRow
              key={u.userId}
              u={u}
              showGroup
              maxAbs={maxAbs}
              T={T}
              expanded={expandedPeople.has(u.userId)}
              onToggle={() => togglePerson(u.userId)}
              canEdit={isAdmin}
              onToggleMeio={toggleMeio}
            />
          ))}
        </div>
      )}

    </div>
  );
}
