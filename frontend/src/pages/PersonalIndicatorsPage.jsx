import React, { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";

const fmt = (v, d = 0) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const initials = (n) => (n || "?").split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");

function TrendPill({ dir, label, T }) {
  const up = dir === "up", down = dir === "down";
  const c = up ? T.green : down ? T.red : T.t6;
  const bg = up ? T.green + "22" : down ? T.red + "22" : T.t1 + "12";
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, color: c, background: bg }}>
    {up ? "▲" : down ? "▼" : "■"} {label}
  </span>;
}

function ChartTip({ x, y, text, W, PX, T }) {
  const tw = String(text).length * 5.6 + 16, tx = Math.max(PX - 4, Math.min(W - PX - tw + 4, x - tw / 2)), ty = Math.max(2, y);
  return (
    <g pointerEvents="none">
      <rect x={tx} y={ty} width={tw} height={19} rx="5" fill={T.tooltipBg || "#0b1322"} stroke={T.border} />
      <text x={tx + tw / 2} y={ty + 12.5} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={T.t1}>{text}</text>
    </g>
  );
}

function BarChart({ data, T, onBar, sel }) {
  const [hi, setHi] = useState(null);
  const W = 560, H = 190, PX = 30, PYT = 14, PYB = 24, max = 170, n = data.length || 1;
  const cw = (W - 2 * PX) / n, bw = Math.min(cw - 6, 24), ch = H - PYT - PYB;
  const ty = PYT + (1 - 100 / max) * ch;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
      {[0, .25, .5, .75, 1].map(f => { const y = PYT + (1 - f) * ch; return <line key={f} x1={PX} y1={y} x2={W - PX} y2={y} stroke={T.chartGrid} />; })}
      <line x1={PX} y1={ty} x2={W - PX} y2={ty} stroke={T.green} strokeDasharray="5 4" strokeWidth="1.5" />
      {data.map(([day, pct], i) => {
        const x = PX + i * cw + (cw - bw) / 2, h = Math.max((pct / max) * ch, 2), y = H - PYB - h;
        const col = pct >= 100 ? T.accent : T.t8;
        return <g key={i} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} onClick={() => onBar && onBar(i)} style={{ cursor: "pointer" }}>
          <rect x={PX + i * cw} y={PYT} width={cw} height={ch} fill="transparent" />
          <rect x={x.toFixed(1)} y={y.toFixed(1)} width={bw} height={h.toFixed(1)} rx="3" fill={col} stroke={sel === i ? T.t1 : "none"} strokeWidth={sel === i ? 1.6 : 0} opacity={hi != null && hi !== i ? 0.5 : 1} />
          <text x={(x + bw / 2).toFixed(1)} y={(y - 4).toFixed(1)} textAnchor="middle" fontSize="9" fill={T.t2}>{pct}</text>
          <text x={(x + bw / 2).toFixed(1)} y={H - 8} textAnchor="middle" fontSize="9" fill={T.t6}>{day}</text>
        </g>;
      })}
      {hi != null && data[hi] && <ChartTip W={W} PX={PX} x={PX + hi * cw + cw / 2} y={PYT + 1} text={`${data[hi][0]} · ${data[hi][1]}% da meta`} T={T} />}
    </svg>
  );
}

function LineChart({ data, T }) {
  const [hi, setHi] = useState(null);
  const W = 560, H = 190, PX = 30, PYT = 16, PYB = 22, hiV = 10, n = data.length;
  const _vals = data.map(d => d[1]).filter(v => v != null);
  const lo = Math.min(7, Math.floor(_vals.length ? Math.min(..._vals) : 7));
  const _ticks = []; for (let v = hiV; v >= Math.ceil(lo); v--) _ticks.push(v);
  const cw = n > 1 ? (W - 2 * PX) / (n - 1) : 0, ch = H - PYT - PYB, Y = v => PYT + (1 - (Math.max(lo, Math.min(hiV, v)) - lo) / (hiV - lo)) * ch;
  const path = data.map(([, s], i) => `${i ? "L" : "M"}${(PX + i * cw).toFixed(1)},${Y(s).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
      {_ticks.map(v => { const y = Y(v); return <g key={v}><line x1={PX} y1={y} x2={W - PX} y2={y} stroke={T.chartGrid} /><text x={PX - 6} y={y + 3} textAnchor="end" fontSize="9" fill={T.t6}>{v}</text></g>; })}
      <line x1={PX} y1={Y(8)} x2={W - PX} y2={Y(8)} stroke={T.green} strokeDasharray="5 4" strokeWidth="1.5" />
      <path d={path} fill="none" stroke={T.amber} strokeWidth="2.5" strokeLinejoin="round" />
      {hi != null && data[hi] && <line x1={PX + hi * cw} y1={PYT} x2={PX + hi * cw} y2={H - PYB} stroke={T.amber} strokeOpacity="0.35" strokeWidth="1" />}
      {data.map(([date, s], i) => (
        <g key={i} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} style={{ cursor: "pointer" }}>
          <rect x={(PX + i * cw - (cw || 14) / 2).toFixed(1)} y={PYT} width={cw || 14} height={ch} fill="transparent" />
          <circle cx={(PX + i * cw).toFixed(1)} cy={Y(s).toFixed(1)} r={hi === i ? 5 : 3.4} fill={T.bgCard} stroke={T.amber} strokeWidth="2" />
        </g>
      ))}
      {hi != null && data[hi] && <ChartTip W={W} PX={PX} x={PX + hi * cw} y={Math.max(2, Y(data[hi][1]) - 22)} text={`${data[hi][0]} · nota ${fmt(data[hi][1], 2)}`} T={T} />}
    </svg>
  );
}

function RangeBar({ label, valueLabel, valueColor, fillPct, markerPct, scale, note, noteColor, fill, markerLabel = "média", T }) {
  const fp = Math.max(0, Math.min(100, fillPct));
  const mp = Math.max(0, Math.min(100, markerPct));
  const met = fillPct >= markerPct;             // bateu/passou a referência?
  const mc = met ? T.green : T.red;             // marcador colorido por status
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 8 }}>
        <span style={{ color: T.t2 }}>{label}</span><b style={{ color: valueColor }}>{valueLabel}</b>
      </div>
      <div style={{ position: "relative", height: 12, borderRadius: 99, background: T.t1 + "12", marginTop: 18 }}>
        <i style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${fp}%`, borderRadius: 99, background: fill }} />
        {/* marcador da referência (empresa/média) */}
        <div style={{ position: "absolute", left: `${mp}%`, top: -17, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none", zIndex: 2 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: mc, lineHeight: 1, marginBottom: 2, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: ".04em" }}>{markerLabel}</span>
          <span style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: `5px solid ${mc}` }} />
        </div>
        <span style={{ position: "absolute", left: `${mp}%`, top: -3, height: 18, width: 2.5, background: mc, transform: "translateX(-50%)", borderRadius: 2, boxShadow: `0 0 0 1.5px ${T.bgCard}` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.t6, marginTop: 8 }}>
        {scale.map((s, i) => <span key={i}>{s}</span>)}
      </div>
      <div style={{ fontSize: 11.5, color: noteColor, marginTop: 6, fontWeight: 600 }}>{note}</div>
    </div>
  );
}

export default function PersonalIndicatorsPage() {
  const { theme: T } = useTheme();
  const [team, setTeam] = useState(null);          // { canManage, people:[{name,grp,lvl}] }
  const [viewName, setViewName] = useState(null);  // null => meus indicadores
  const [gran, setGran] = useState("month");         // day | week | month | acc
  const [selMonth, setSelMonth] = useState(null);  // YYYY-MM (null => latest)
  const [state, setState] = useState({ loading: true });
  const [mode, setMode] = useState("individual");  // individual | team
  const [selPt, setSelPt] = useState(null);        // dia/semana selecionado (índice)
  const [ov, setOv] = useState(null);              // overview (roster + métricas)
  const [trend, setTrend] = useState(null);        // team-trend (evolução)
  const [teamGroup, setTeamGroup] = useState("ALL");
  const [teamGran, setTeamGran] = useState("month"); // month | week
  const [teamSort, setTeamSort] = useState({ k: "pct", dir: -1 });
  const [teamMonths, setTeamMonths] = useState(1);   // 1 | 3 | 6 | 12 (período de avaliação)

  useEffect(() => {
    api.get("/indicators/team")
      .then(r => setTeam(r.data))
      .catch(() => setTeam({ canManage: false, people: [] }));
  }, []);

  useEffect(() => {
    if (mode === "team") api.get(`/indicators/overview?months=${teamMonths}`).then(r => setOv(r.data)).catch(() => setOv({ people: [] }));
  }, [mode, teamMonths]);

  useEffect(() => {
    if (mode !== "team") return;
    const g = teamGroup && teamGroup !== "ALL" ? `&group=${encodeURIComponent(teamGroup)}` : "";
    api.get(`/indicators/team-trend?months=${teamMonths}${g}`).then(r => setTrend(r.data)).catch(() => setTrend(null));
  }, [mode, teamGroup, teamMonths]);

  const openPerson = (name) => { setViewName(name); setMode("individual"); };

  useEffect(() => {
    setState({ loading: true });
    const path = viewName ? `/indicators/person?name=${encodeURIComponent(viewName)}` : "/indicators/me";
    api.get(path)
      .then(r => setState({ loading: false, data: r.data }))
      .catch(e => setState({ loading: false, error: e.response?.data?.error || "Falha ao carregar" }));
  }, [viewName]);

  const peopleByTeam = (team?.people || []).reduce((acc, p) => { (acc[p.grp] = acc[p.grp] || []).push(p); return acc; }, {});

  const d = state.data;
  const card = { background: `linear-gradient(180deg, ${T.bgCard}, ${T.bgDeep})`, border: `1px solid ${T.border}`, borderRadius: 18, padding: "18px 18px 16px" };
  const h3 = { fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: T.t7, marginBottom: 12, display: "flex", alignItems: "center", gap: 7 };
  const dot = (c) => ({ width: 7, height: 7, borderRadius: "50%", background: c, display: "inline-block" });
  const last = (a) => (a && a.length ? a[a.length - 1] : undefined);
  const grpShort = (g) => (g || "").replace("BR-ATD-", "").replace("BR-", "");

  function renderTeam() {
    if (!ov) return <div style={{ textAlign: "center", padding: "70px 0", color: T.t4 }}>Carregando dados do time…</div>;
    const people = ov.people || [];
    const groups = [...new Set(people.map(p => p.grp))].sort();
    const rows = teamGroup === "ALL" ? people : people.filter(p => p.grp === teamGroup);
    const sorted = [...rows].sort((a, b) => { const k = teamSort.k; let x = a[k], y = b[k]; if (x == null) x = typeof y === "string" ? "" : -1; if (y == null) y = typeof x === "string" ? "" : -1; return typeof x === "string" ? teamSort.dir * x.localeCompare(y) : teamSort.dir * (x - y); });
    const avg = (f) => { const v = rows.map(f).filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    const n = rows.length, mAtt = avg(p => p.pct), mQ = avg(p => p.score), acima = rows.filter(p => p.pct >= 100).length, aten = rows.filter(p => p.pct < 80 || p.lowRatePct >= 15).length;
    const prodSeries = (teamGran === "month" ? trend?.monthly?.prod : trend?.weekly?.prod) || [];
    const qualSeries = (teamGran === "month" ? trend?.monthly?.qual : trend?.weekly?.qual) || [];
    const sortKey = (k) => setTeamSort(s => s.k === k ? { k, dir: -s.dir } : { k, dir: (k === "name" || k === "grp") ? 1 : -1 });
    const tP = last(trend?.monthly?.prod)?.[1], cP = last(trend?.monthly?.companyProd)?.[1];
    const tQ = last(trend?.monthly?.qual)?.[1], cQ = last(trend?.monthly?.companyQual)?.[1];
    const withDelta = rows.filter(p => p.deltaPct != null);
    const gains = [...withDelta].sort((a, b) => b.deltaPct - a.deltaPct).slice(0, 3);
    const drops = [...withDelta].sort((a, b) => a.deltaPct - b.deltaPct).slice(0, 3);
    const buckets = [["<60%", 0, 60], ["60–80%", 60, 80], ["80–100%", 80, 100], ["100–120%", 100, 120], ["≥120%", 120, 1e9]].map(([lab, lo, hi]) => ({ lab, n: rows.filter(p => p.pct >= lo && p.pct < hi).length }));
    const maxBucket = Math.max(...buckets.map(b => b.n), 1);
    const exportCsv = () => {
      const head = ["Colaborador", "Equipe", "Atingimento%", "Delta p.p.", "Posicao", "GrupoTam", "Qualidade", "Avaliacoes", "NotasBaixas%", "NotasBaixas", "Casos"];
      const lines = sorted.map(p => [p.name, p.grp, p.pct, p.deltaPct == null ? "" : p.deltaPct, p.rank || "", p.groupSize || "", p.score == null ? "" : String(p.score).replace(".", ","), p.qty || "", String(p.lowRatePct).replace(".", ","), p.lowTotal, p.cases].join(";"));
      const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = `ranking_${teamGroup === "ALL" ? "todos" : grpShort(teamGroup)}_${trend?.monthLabel || ""}.csv`; link.click(); URL.revokeObjectURL(url);
    };
    return <>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", ...card, padding: "12px 16px", marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: T.t7, textTransform: "uppercase" }}>Time</span>
        <select value={teamGroup} onChange={e => setTeamGroup(e.target.value)} style={{ background: T.bgDeep, color: T.t1, border: `1px solid ${T.border}`, borderRadius: 9, padding: "7px 11px", fontSize: 13, fontWeight: 600 }}>
          {(ov.scope === "gestor" || groups.length > 1) && <option value="ALL">Todos os times</option>}
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <span style={{ width: 1, height: 22, background: T.border }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: T.t7, textTransform: "uppercase" }}>Avaliar</span>
        {[[1, "Mês"], [3, "Trimestre"], [6, "Semestre"], [12, "Ano"]].map(([k, lab]) => (
          <button key={k} onClick={() => setTeamMonths(k)} style={{ background: teamMonths === k ? T.green : "transparent", color: teamMonths === k ? "#06140c" : T.t6, border: `1px solid ${teamMonths === k ? "transparent" : T.border}`, borderRadius: 9, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{lab}</button>
        ))}
        <span style={{ width: 1, height: 22, background: T.border }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: T.t7, textTransform: "uppercase" }}>Evolução</span>
        {[["month", "Mensal"], ["week", "Semanal"]].map(([k, lab]) => (
          <button key={k} onClick={() => setTeamGran(k)} style={{ background: teamGran === k ? T.accent : "transparent", color: teamGran === k ? "#06222e" : T.t6, border: `1px solid ${teamGran === k ? "transparent" : T.border}`, borderRadius: 9, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{lab}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 14 }}>
        {[["👥 Colaboradores", n, T.t1, teamGroup === "ALL" ? `${groups.length} times` : grpShort(teamGroup)],
          ["🎯 Atingimento médio", fmt(mAtt) + "%", mAtt >= 100 ? T.green : T.amber, `${acima} de ${n} acima da meta`],
          ["⭐ Qualidade média", fmt(mQ, 2), mQ >= 8 ? T.green : T.amber, "média de nota do time"],
          ["⚠️ Precisam de atenção", aten, aten > 0 ? T.red : T.green, "abaixo da meta ou baixas <6"]].map(([l, v, c, f], i) => (
          <div key={i} style={card}><div style={h3}>{l}</div><div style={{ fontSize: 30, fontWeight: 800, color: c, fontVariantNumeric: "tabular-nums" }}>{v}</div><div style={{ fontSize: 11, color: T.t6, marginTop: 7 }}>{f}</div></div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div style={card}>
          <div style={h3}><span style={dot(T.green)} />Destaques vs período anterior</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: T.green, fontWeight: 700, marginBottom: 7 }}>▲ Maiores avanços</div>
              {gains.length ? gains.map((p, i) => <div key={i} onClick={() => openPerson(p.name)} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, padding: "5px 0", cursor: "pointer", color: T.t2 }}><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span><b style={{ color: T.green, whiteSpace: "nowrap" }}>+{p.deltaPct} p.p.</b></div>) : <div style={{ fontSize: 12, color: T.t6 }}>—</div>}
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.red, fontWeight: 700, marginBottom: 7 }}>▼ Maiores quedas</div>
              {drops.length ? drops.map((p, i) => <div key={i} onClick={() => openPerson(p.name)} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, padding: "5px 0", cursor: "pointer", color: T.t2 }}><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span><b style={{ color: p.deltaPct < 0 ? T.red : T.t6, whiteSpace: "nowrap" }}>{p.deltaPct > 0 ? "+" : ""}{p.deltaPct} p.p.</b></div>) : <div style={{ fontSize: 12, color: T.t6 }}>—</div>}
            </div>
          </div>
        </div>
        <div style={card}>
          <div style={h3}><span style={dot(T.purple)} />Distribuição do atingimento</div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 110, marginTop: 6 }}>
            {buckets.map((b, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: T.t1 }}>{b.n}</div>
                <div style={{ width: "100%", maxWidth: 42, height: Math.round(b.n / maxBucket * 72) + 4, borderRadius: "5px 5px 0 0", background: i < 2 ? T.red : i === 2 ? T.amber : T.green }} />
                <div style={{ fontSize: 10, color: T.t6, whiteSpace: "nowrap" }}>{b.lab}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: T.t9, marginTop: 8 }}>Quantos colaboradores em cada faixa de atingimento.</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div style={card}><div style={h3}><span style={dot(T.accent)} />Evolução — atingimento ({teamGran === "month" ? "mês" : "semana"})</div>{prodSeries.length ? <BarChart data={prodSeries} T={T} /> : <div style={{ color: T.t6, fontSize: 12, padding: "40px 0", textAlign: "center" }}>sem dados</div>}</div>
        <div style={card}><div style={h3}><span style={dot(T.amber)} />Evolução — qualidade ({teamGran === "month" ? "mês" : "semana"})</div>{qualSeries.length ? <LineChart data={qualSeries} T={T} /> : <div style={{ color: T.t6, fontSize: 12, padding: "40px 0", textAlign: "center" }}>sem dados</div>}</div>
      </div>

      {(tP != null && cP != null) || (tQ != null && cQ != null) ? <div style={{ ...card, marginBottom: 14 }}>
        <div style={h3}><span style={dot(T.purple)} />Time vs empresa — {trend?.monthLabel}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26 }}>
          {tP != null && cP != null && <RangeBar T={T} markerLabel="empresa" label="Atingimento (volume)" valueLabel={`time ${fmt(tP)}%`} valueColor={T.accent} fillPct={tP / Math.max(tP, cP, 1) * 100} markerPct={cP / Math.max(tP, cP, 1) * 100} scale={["0", `empresa ${fmt(cP)}%`, `${fmt(Math.max(tP, cP))}%`]} fill={`linear-gradient(90deg, ${T.accentDark}, ${T.accent})`} note={tP >= cP ? `▲ +${fmt(tP - cP)} p.p. vs empresa` : `▼ ${fmt(cP - tP)} p.p. vs empresa`} noteColor={tP >= cP ? T.green : T.red} />}
          {tQ != null && cQ != null && <RangeBar T={T} markerLabel="empresa" label="Qualidade (nota)" valueLabel={`time ${fmt(tQ, 2)}`} valueColor={T.amber} fillPct={(tQ - 6) / 4 * 100} markerPct={(cQ - 6) / 4 * 100} scale={["6,0", `empresa ${fmt(cQ, 2)}`, "10"]} fill={`linear-gradient(90deg, #b46e09, ${T.amber})`} note={tQ >= cQ ? `▲ ${fmt(tQ - cQ, 2)} vs empresa` : `▼ ${fmt(cQ - tQ, 2)} vs empresa`} noteColor={tQ >= cQ ? T.green : T.red} />}
        </div>
      </div> : null}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px" }}>
          <div style={{ ...h3, margin: 0 }}><span style={dot(T.green)} />Ranking da equipe — clique para abrir o painel individual</div>
          <button onClick={exportCsv} style={{ background: T.bgDeep, border: `1px solid ${T.border}`, color: T.t2, borderRadius: 9, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>⬇ Exportar CSV</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>
              {[["name", "Colaborador"], ["grp", "Equipe"], ["pct", "Atingimento"], ["rank", "Posição"], ["score", "Qualidade"], ["lowRatePct", "Notas baixas"]].map(([k, lab]) => (
                <th key={k} onClick={() => sortKey(k)} style={{ padding: "11px 14px", textAlign: (k === "name" || k === "grp") ? "left" : "right", color: T.t9, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", cursor: "pointer", whiteSpace: "nowrap", borderBottom: `1px solid ${T.border}`, background: T.bgDeep, userSelect: "none" }}>{lab}{teamSort.k === k ? (teamSort.dir < 0 ? " ▾" : " ▴") : ""}</th>
              ))}
            </tr></thead>
            <tbody>
              {sorted.map(p => { const warn = p.pct < 80 || p.lowRatePct >= 15; return (
                <tr key={p.name} onClick={() => openPerson(p.name)} style={{ cursor: "pointer", background: warn ? T.red + "0c" : "transparent", borderBottom: `1px solid ${T.borderRow || T.border}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: T.t1, whiteSpace: "nowrap" }}>{p.name}</td>
                  <td style={{ padding: "10px 14px" }}><span style={{ fontSize: 11, fontWeight: 700, color: T.t7 || T.t8, background: T.bgDeep, border: `1px solid ${T.border}`, padding: "2px 8px", borderRadius: 6 }}>{grpShort(p.grp)}</span></td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>{p.pct == null ? <span style={{ color: T.t9 }} title="Sem meta de produtividade (revisor QC)">—</span> : <b style={{ color: p.pct >= 100 ? T.green : p.pct >= 80 ? T.amber : T.red, fontVariantNumeric: "tabular-nums" }}>{p.pct}%</b>}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: T.t2, fontVariantNumeric: "tabular-nums" }}>{p.rank ? `${p.rank}º/${p.groupSize}` : "—"}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}><b style={{ color: p.score >= 8 ? T.green : T.amber, fontVariantNumeric: "tabular-nums" }}>{p.score != null ? fmt(p.score, 2) : "—"}</b></td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: p.lowRatePct >= 15 ? T.red : p.lowRatePct > 0 ? T.amber : T.t8, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(p.lowRatePct, 1)}% <span style={{ color: T.t9, fontWeight: 400 }}>({p.lowTotal})</span></td>
                </tr>
              ); })}
              {!sorted.length && <tr><td colSpan={6} style={{ padding: 30, textAlign: "center", color: T.t6 }}>Sem colaboradores no time.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>;
  }

  return (
    <div style={{ padding: 28 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: T.t1, margin: 0, display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", background: T.accent + "1f", color: T.accent, flexShrink: 0 }}><Gauge size={18} /></span>
            {mode === "team" ? "Visão do Time" : viewName ? "Indicadores do Colaborador" : "Indicadores Pessoais"}
          </h1>
          <p style={{ color: T.t8, fontSize: 13, margin: "5px 0 0" }}>{mode === "team" ? "Ranking, evolução e comparativos da equipe" : viewName ? "Painel detalhado de produtividade, qualidade e volume" : "Seus avanços, qualidade e volume — acompanhe e supere suas metas"}</p>
          {team?.canManage && (
            <div style={{ marginTop: 13, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <div style={{ display: "inline-flex", background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 9, padding: 3, gap: 2 }}>
                {[["individual", "Individual"], ["team", "Visão do Time"]].map(([k, lab]) => (
                  <button key={k} onClick={() => setMode(k)} style={{ background: mode === k ? T.accent : "transparent", color: mode === k ? "#06222e" : T.t6, border: "none", borderRadius: 7, padding: "6px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{lab}</button>
                ))}
              </div>
              {mode === "individual" && <span style={{ fontSize: 12, color: T.t7, fontWeight: 600 }}>Ver indicadores de:</span>}
              {mode === "individual" &&
              <select value={viewName || ""} onChange={(e) => setViewName(e.target.value || null)}
                style={{ background: T.bgDeep, color: T.t1, border: `1px solid ${T.border}`, borderRadius: 9, padding: "8px 12px", fontSize: 13, fontWeight: 600, minWidth: 240, cursor: "pointer" }}>
                <option value="">— Meus indicadores —</option>
                {Object.keys(peopleByTeam).sort().map(g => (
                  <optgroup key={g} label={g.replace("BR-ATD-", "").replace("BR-", "")}>
                    {peopleByTeam[g].map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                  </optgroup>
                ))}
              </select>}
              {mode === "individual" && viewName && (
                <button onClick={() => setViewName(null)} style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.t6, borderRadius: 9, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                  limpar
                </button>
              )}
            </div>
          )}
        </div>
        {mode === "individual" && d?.hasData && <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 13, padding: "7px 14px 7px 7px" }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: T.accentGradient, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#06222e" }}>{initials(d.name)}</div>
          <div><b style={{ fontSize: 13.5, color: T.t1 }}>{d.name}</b><div style={{ fontSize: 11, color: T.t6 }}>{d.group} · {d.level}</div></div>
        </div>}
      </div>

      {mode === "team" && renderTeam()}

      {mode === "individual" && state.loading && <div style={{ textAlign: "center", padding: "70px 0", color: T.t4 }}>
        <div style={{ width: 36, height: 36, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", margin: "0 auto 14px", animation: "spin .7s linear infinite" }} />Carregando seus indicadores…</div>}

      {mode === "individual" && state.error && <div style={{ textAlign: "center", padding: "60px 0", color: T.red }}>{state.error}</div>}

      {mode === "individual" && !state.loading && d && !d.hasData && <div style={{ textAlign: "center", padding: "60px 20px", color: T.t4 }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>📊</div>
        {team?.canManage && !viewName
          ? <>Selecione um colaborador no seletor acima para ver os indicadores detalhados dele.</>
          : <>Ainda não há dados de produtividade/qualidade vinculados {viewName ? "a este colaborador" : "ao seu nome"}.<br />
            <span style={{ fontSize: 12, color: T.t6 }}>Assim que a planilha do BI for carregada com os resultados, eles aparecem aqui.</span></>}
      </div>}

      {mode === "individual" && !state.loading && d?.hasData && (() => {
        const isAcc = gran === "acc";
        const isL3 = gran === "last3";
        const month = (selMonth && d.byMonth[selMonth]) ? selMonth : d.latest;
        const S = isL3 ? (d.last3 || d.monthly) : isAcc ? d.monthly : d.byMonth[month];
        const a = S.attainment, q = S.quality, L = S.lowScore;
        const granSeries = gran === "day" ? (S.dailyProd || []) : gran === "week" ? (S.weeklyProd || []) : null;
        let granDef = (granSeries && granSeries.length) ? granSeries.length - 1 : 0;
        if (granSeries) for (let _i = granSeries.length - 1; _i >= 0; _i--) { if (granSeries[_i][1] > 0) { granDef = _i; break; } }
        const granIdx = (granSeries && granSeries.length && a) ? (selPt != null && selPt < granSeries.length ? selPt : granDef) : null;
        const granPt = granIdx != null ? granSeries[granIdx] : null;
        const headPct = granPt ? granPt[1] : (a ? a.pct : null);
        const granCases = granPt ? (gran === "day" ? granPt[2] : granPt[3]) : null;
        const granDays = granPt ? (gran === "day" ? 1 : granPt[2]) : null;
        const granQ = (gran === "week" && granPt && S.weeklyLow) ? (S.weeklyLow.find(w => w.range === granPt[0]) || null) : null;
        const qualityOnly = !a;   // QC reviewers (sem meta de produtividade)
        const aggView = isAcc || isL3;
        const monthName = isAcc ? "acumulado" : isL3 ? "últimos 3 meses" : (S.periodLabel || "").split("/")[0];
        const aboveAvg = a && a.groupAvg != null && a.pct >= a.groupAvg;
        const qBelow = q && q.groupAvg != null && q.score < q.groupAvg;
        const pill = (on) => ({ background: on ? T.accent : "transparent", color: on ? "#06222e" : T.t6, border: `1px solid ${on ? "transparent" : T.border}`, borderRadius: 9, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" });

        // Productivity chart series per granularity
        let prodData, prodTitle;
        if (gran === "day") { prodData = S.dailyProd || []; prodTitle = `Atingimento diário — ${monthName}`; }
        else if (gran === "week") { prodData = (S.weeklyProd || []).map(w => [String(w[0]).split("–")[0], w[1]]); prodTitle = `Atingimento semanal — ${monthName}`; }
        else { prodData = (isL3 ? S.monthsSeries : d.monthly.monthsSeries) || []; prodTitle = isAcc ? "Atingimento por mês — acumulado" : isL3 ? "Atingimento por mês — últimos 3" : "Atingimento por mês"; }

        // Quality chart series
        const useMonthlyQ = gran === "month" || aggView;
        const qSource = useMonthlyQ ? ((isL3 ? S.qualityMonthly : d.monthly.qualityMonthly) || []) : (S.weeklyLow || []);
        const qData = qSource.map(w => [w.date || w.range, w.score]);
        const qTitle = useMonthlyQ ? "Qualidade mensal — por mês" : "Qualidade semanal — últimas semanas";

        return <>
          {/* Filtro de período */}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: T.t7, textTransform: "uppercase" }}>Período</span>
              {(qualityOnly ? [["week", "Semana"], ["month", "Mês"], ["last3", "3 meses"], ["acc", "Acumulado"]] : [["day", "Dia"], ["week", "Semana"], ["month", "Mês"], ["last3", "3 meses"], ["acc", "Acumulado"]]).map(([k, lab]) => (
                <button key={k} onClick={() => { setGran(k); setSelPt(null); }} style={pill(gran === k || (qualityOnly && gran === "day" && k === "week"))}>{lab}</button>
              ))}
            </div>
            {!aggView && d.monthsMeta?.length > 1 && (
              <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: T.t7, textTransform: "uppercase" }}>Mês</span>
                {d.monthsMeta.map(mm => (
                  <button key={mm.key} onClick={() => { setSelMonth(mm.key); setSelPt(null); }} style={pill(month === mm.key)} title={mm.full}>{mm.label}</button>
                ))}
              </div>
            )}
          </div>

          {/* Insight */}
          <div style={{ ...card, marginBottom: 14, borderLeft: `3px solid ${T.accent}`, display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{ fontSize: 24 }}>💡</div>
            <div style={{ fontSize: 12.5, color: T.t2, lineHeight: 1.55 }}>
              {qualityOnly
                ? <>Acompanhe sua <b style={{ color: T.amber }}>qualidade</b> — você não tem meta de produtividade (volume), então o painel foca na nota.{q && <> Sua nota é <b style={{ color: T.amber }}>{fmt(q.score, 2)}</b>, {qBelow ? "abaixo" : "acima/na"} da média do grupo, {q.trend === "down" ? "em leve queda 📉" : q.trend === "up" ? "subindo 📈" : "estável"}.</>}</>
                : <>Seu <b style={{ color: T.accent }}>volume está {a.trend === "up" ? "ascendente 📈" : a.trend === "down" ? "em queda 📉" : "estável"}</b> ({fmt(a.pct)}% da meta no mês), {aboveAvg ? "acima" : "abaixo"} da média do grupo · <b>{a.rank}º de {a.groupSize}</b>.
                  {q && <> Sua <b style={{ color: T.amber }}>qualidade ({fmt(q.score, 2)})</b> está {qBelow ? "abaixo da média do grupo e " : ""}{q.trend === "down" ? "em leve queda 📉" : q.trend === "up" ? "subindo 📈" : "estável"}{qBelow ? " — esse é o seu foco." : "."}</>}</>}
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: qualityOnly ? "minmax(280px,440px)" : "repeat(3,1fr)", gap: 14, marginBottom: 14 }}>
            {!qualityOnly && <div style={card}>
              <div style={h3}><span style={dot(T.accent)} />Atingimento (volume)</div>
              <div><span style={{ fontSize: 38, fontWeight: 800, color: T.accent }}>{fmt(headPct)}</span><span style={{ fontSize: 15, fontWeight: 700, color: T.t6 }}>%</span></div>
              <div style={{ marginTop: 9, fontSize: 12, color: T.t2, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                {granPt ? <span style={{ color: T.t4, fontWeight: 600 }}>{granPt[0]} · {gran === "day" ? "dia" : "semana"}</span> : <>{a.deltaPct != null && <TrendPill dir={a.deltaPct > 0 ? "up" : a.deltaPct < 0 ? "down" : "flat"} label={`${a.deltaPct > 0 ? "+" : ""}${fmt(a.deltaPct)}%`} T={T} />} vs mês anterior · meta 100%</>}
              </div>
              <div style={{ fontSize: 10.5, color: T.t6, marginTop: 10 }}>{granPt ? <>{fmt(granCases, 1)} casos · {granDays} {gran === "day" ? "dia" : "dias"}</> : <>{fmt(a.completed, 1)} casos · {a.days} dias</>}</div>
            </div>}
            <div style={card}>
              <div style={h3}><span style={dot(T.amber)} />Qualidade (nota)</div>
              <div><span style={{ fontSize: 38, fontWeight: 800, color: T.amber }}>{granQ ? fmt(granQ.score, 2) : (q ? fmt(q.score, 2) : "—")}</span><span style={{ fontSize: 15, fontWeight: 700, color: T.t6 }}>/10</span></div>
              <div style={{ marginTop: 9, fontSize: 12, color: T.t2, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                {granQ ? <span style={{ color: T.t4, fontWeight: 600 }}>{granPt[0]} · semana</span> : <>{q && q.delta != null && <TrendPill dir={q.delta > 0 ? "up" : q.delta < 0 ? "down" : "flat"} label={`${q.delta > 0 ? "+" : ""}${fmt(q.delta, 2)}`} T={T} />} meta 8,0{granPt ? " · mês" : ""}</>}
              </div>
              <div style={{ fontSize: 10.5, color: T.t6, marginTop: 10 }}>{granQ ? `${granQ.qty} avaliações · ${(granQ.qty ? (granQ.low / granQ.qty * 100).toFixed(1) : "0")}% baixas <6 (${granQ.low})` : (q ? `${q.qty} avaliações · ${fmt(L.lowRatePct, 1)}% baixas <6 (${L.total})` : "sem avaliações")}{granPt && !granQ ? " (mês)" : ""}</div>
              {q && !granQ && <div style={{ marginTop: 9 }}>
                {L.streakNoLow > 0
                  ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: T.green + "22", color: T.green }}>🔥 {L.streakNoLow} {L.streakNoLow === 1 ? "semana" : "semanas"} sem nota baixa</span>
                  : <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, background: T.t1 + "12", color: T.t3 }}>última nota baixa: {L.lastLowWeeksAgo === 0 ? "período atual" : L.lastLowWeeksAgo == null ? "nunca" : `${L.lastLowWeeksAgo} sem atrás`}</span>}
              </div>}
            </div>
            {!qualityOnly && <div style={card}>
              <div style={h3}><span style={dot(T.green)} />Posição no grupo</div>
              <div><span style={{ fontSize: 38, fontWeight: 800, color: T.green }}>{a.rank}º</span><span style={{ fontSize: 15, fontWeight: 700, color: T.t6 }}>/{a.groupSize}</span></div>
              <div style={{ marginTop: 9, fontSize: 12, color: T.t2 }}>em produtividade · {d.group}{granPt ? " · mês" : ""}</div>
              <div style={{ fontSize: 10.5, color: T.t6, marginTop: 10 }}>{a.rank <= Math.ceil(a.groupSize * 0.2) ? "top 20% 🔥 mantenha o ritmo" : "subindo no ranking"}</div>
            </div>}
          </div>

          {/* Comparativo */}
          <div style={{ ...card, marginBottom: 14 }}>
            <div style={h3}><span style={dot(T.purple)} />Você vs o grupo {d.group} — média &amp; melhor</div>
            <div style={{ display: "grid", gridTemplateColumns: qualityOnly ? "minmax(280px,520px)" : "1fr 1fr", gap: 26 }}>
              {!qualityOnly && <RangeBar T={T} label="Atingimento (volume)" valueLabel={`você ${fmt(a.pct)}%`} valueColor={T.accent}
                fillPct={a.pct / a.groupBest * 100} markerPct={a.groupAvg / a.groupBest * 100}
                scale={["0", `média ${fmt(a.groupAvg)}%`, `melhor ${fmt(a.groupBest)}%`]} fill={`linear-gradient(90deg, ${T.accentDark}, ${T.accent})`}
                note={aboveAvg ? `▲ +${fmt(a.pct - a.groupAvg)} p.p. acima da média` : `▼ ${fmt(a.groupAvg - a.pct)} p.p. abaixo da média`} noteColor={aboveAvg ? T.green : T.red} />}
              {q && <RangeBar T={T} label="Qualidade (nota)" valueLabel={`você ${fmt(q.score, 2)}`} valueColor={T.amber}
                fillPct={(q.score - 6) / 4 * 100} markerPct={(q.groupAvg - 6) / 4 * 100}
                scale={["6,0", `média ${fmt(q.groupAvg, 2)}`, `melhor ${fmt(q.groupBest, 2)}`]} fill={`linear-gradient(90deg, #b46e09, ${T.amber})`}
                note={q.score >= q.groupAvg ? `▲ ${fmt(q.score - q.groupAvg, 2)} acima da média` : `▼ ${fmt(q.groupAvg - q.score, 2)} abaixo da média — sua oportunidade`} noteColor={q.score >= q.groupAvg ? T.green : T.red} />}
            </div>
          </div>

          {/* Notas baixas (<6) — card dedicado */}
          {q && <div style={{ ...card, marginBottom: 14, borderLeft: `3px solid ${T.red}` }}>
            <div style={h3}><span style={dot(T.red)} />Notas baixas (&lt; 6)</div>
            <div style={{ display: "flex", gap: 26, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ paddingRight: 22, borderRight: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 40, fontWeight: 800, color: L.total > 0 ? T.red : T.green, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{L.total}</div>
                <div style={{ fontSize: 11, color: T.t6, marginTop: 5 }}>notas baixas</div>
              </div>
              {[[`${fmt(L.lowRatePct, 1)}%`, "taxa de baixas", L.lowRatePct >= 15 ? T.red : L.lowRatePct > 0 ? T.amber : T.green],
                [L.totalQty, "avaliações", null],
                [`${L.weeksWithLow}/${L.totalWeeks}`, "semanas com baixa", null],
                [L.streakNoLow, "semanas sem baixa", T.purple],
                [L.lastLowWeeksAgo == null ? "nunca" : L.lastLowWeeksAgo === 0 ? "período atual" : `${L.lastLowWeeksAgo} sem`, "última baixa", null],
                [L.totalUnfit, "unfit / reprovadas", L.totalUnfit > 0 ? T.amber : null]].map(([v, l, c], i) => (
                <div key={i}><div style={{ fontSize: 20, fontWeight: 800, color: c || T.t1, fontVariantNumeric: "tabular-nums" }}>{v}</div><div style={{ fontSize: 10.5, color: T.t6, marginTop: 3 }}>{l}</div></div>
              ))}
            </div>
            {qSource.length > 0 && <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginTop: 16 }}>
              {qSource.map((w, i) => { const maxLow = Math.max(...qSource.map(x => x.low), 1); const hh = w.low > 0 ? Math.round(w.low / maxLow * 40) + 6 : 4; const top = (w.range || "").indexOf("–") >= 0 ? w.range.split("–")[0] : w.range;
                return <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }} title={`${w.week ? w.week + " · " : ""}${w.range}: ${w.low} baixa(s) · nota ${w.score}`}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: w.low > 0 ? T.red : T.t9, fontVariantNumeric: "tabular-nums" }}>{w.low}</div>
                  <div style={{ width: "100%", maxWidth: 26, height: hh, borderRadius: "4px 4px 0 0", background: w.low > 0 ? T.red : T.t1 + "22" }} />
                  <div style={{ fontSize: 9, color: T.t9, whiteSpace: "nowrap" }}>{top}</div>
                </div>;
              })}
            </div>}
            <div style={{ fontSize: 11, color: T.t9, marginTop: 12 }}>Cada coluna é {gran === "month" || aggView ? "um mês" : "uma semana"}; vermelho = notas abaixo de 6. Meta: manter abaixo de 15%.</div>
          </div>}

          {/* Charts */}
          <div style={{ display: "grid", gridTemplateColumns: qualityOnly ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14 }}>
            {!qualityOnly && <div style={card}>
              <div style={h3}><span style={dot(T.accent)} />{prodTitle}</div>
              {prodData.length ? <BarChart data={prodData} T={T} onBar={(gran === "day" || gran === "week") ? (i) => setSelPt(i) : undefined} sel={(gran === "day" || gran === "week") ? granIdx : null} /> : <div style={{ color: T.t6, fontSize: 12, padding: "40px 0", textAlign: "center" }}>sem dados no período</div>}
            </div>}
            <div style={card}>
              <div style={h3}><span style={dot(T.amber)} />{qTitle}</div>
              {qData.length ? <LineChart data={qData} T={T} /> : <div style={{ color: T.t6, fontSize: 12, padding: "40px 0", textAlign: "center" }}>sem avaliações de qualidade ainda</div>}
            </div>
          </div>

          {/* Volume + caminho */}
          <div style={{ display: "grid", gridTemplateColumns: qualityOnly ? "minmax(280px,560px)" : "1fr 1fr", gap: 14, marginBottom: 14 }}>
            {!qualityOnly && <div style={card}>
              <div style={h3}><span style={dot(T.purple)} />Volume por tipo — {monthName}</div>
              {[["Casos novos", S.cases.new, T.accent], ["Modificações", S.cases.mod, T.purple], ["Refinamentos", S.cases.ref, T.green]].map(([lab, v, c]) => {
                const max = Math.max(S.cases.new, S.cases.mod, S.cases.ref, 1);
                return <div key={lab} style={{ margin: "10px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}><span style={{ color: T.t2 }}>{lab}</span><b style={{ color: T.t1 }}>{v}</b></div>
                  <div style={{ height: 7, borderRadius: 99, background: T.t1 + "12", overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${v / max * 100}%`, background: c, borderRadius: 99 }} /></div>
                </div>;
              })}
              <div style={{ fontSize: 10.5, color: T.t6, marginTop: 12 }}>Total: {S.cases.new + S.cases.mod + S.cases.ref} casos · {monthName}</div>
            </div>}
            <div style={card}>
              <div style={h3}><span style={dot(T.green)} />Seu caminho a seguir</div>
              {[
                q && q.score < 8 ? ["🎯", T.amber, "Atingir a meta de qualidade (8,0)", `Você está em ${fmt(q.score, 2)}. Revise antes de finalizar — pequenas correções elevam a média rápido.`]
                  : q ? ["✅", T.green, "Meta de qualidade atingida (8,0)", `Você está em ${fmt(q.score, 2)} — acima da meta. Mantenha o padrão de revisão.`] : null,
                q && L.lowRatePct >= 15 ? ["⚠️", T.red, `Reduzir notas baixas (<6): ${fmt(L.lowRatePct)}% → meta <15%`, `${L.total} de ${L.totalQty} avaliações abaixo de 6. Identifique o caso recorrente e padronize o checklist.`] : null,
                a ? ["🚀", T.accent, a.pct >= 100 ? "Manter volume acima da meta" : "Elevar o volume até a meta", a.pct >= 100 ? `${fmt(a.pct)}% — excelente. Sustente acima de 100% sem perder qualidade e suba no ranking.` : `${fmt(a.pct)}% — foque em chegar a 100% de forma consistente.`] : null,
                qualityOnly && q ? ["🛡️", T.purple, "Mantenha a consistência na revisão", "Sem meta de volume — seu foco é a qualidade. Mantenha o padrão e zere as notas baixas."] : null,
              ].filter(Boolean).map(([ic, c, t, p], i, arr) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: c + "22" }}>{ic}</div>
                  <div><b style={{ fontSize: 13, color: T.t1 }}>{t}</b><p style={{ fontSize: 11.5, color: T.t2, marginTop: 3, lineHeight: 1.45 }}>{p}</p></div>
                </div>
              ))}
            </div>
          </div>

          {/* Rahoot teaser */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, background: `linear-gradient(110deg, ${T.purple}1a, ${T.bgCard})`, border: `1px dashed ${T.purple}77`, borderRadius: 18, padding: "16px 18px" }}>
            <div style={{ fontSize: 24 }}>🏆</div>
            <div style={{ flex: 1 }}><b style={{ fontSize: 14, color: T.t1 }}>Ranking &amp; performance do Rahoot</b>
              <div style={{ fontSize: 11.5, color: T.t2, marginTop: 3 }}>Em breve: seus pontos, acertos e posição nos quizzes aparecerão aqui.</div></div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: T.t1 + "12", color: T.t2 }}>Em breve</span>
          </div>
        </>;
      })()}
    </div>
  );
}
