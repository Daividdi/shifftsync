// Kit visual compartilhado (port do workforce-my): anéis de meta, sparklines,
// números animados, tooltips de cálculo e a faixa de frescor dos dados.
import React, { useState, useEffect, useRef } from "react";
import api from "../api/client";

// Número animado — interpola entre valores (tabular, sem layout shift)
export function Num({ value, decimals = 0, style }) {
  const [v, setV] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = typeof prev.current === "number" ? prev.current : null;
    prev.current = value;
    if (typeof value !== "number" || from == null || from === value) { setV(value); return; }
    const t0 = performance.now(), dur = 420;
    let raf;
    const step = (ts) => {
      const k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      setV(from + (value - from) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const shown = typeof v === "number"
    ? Number(v).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : (value == null ? "—" : value);
  return <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>{shown}</span>;
}

// Anel de progresso vs meta — preenche via keyframe CSS (wfRingFill), sempre
// anima por elemento; `delay` permite cascata entre anéis irmãos.
export function Ring({ pct, valueLabel, unit, color, T, size = 104, stroke = 10, delay = 0 }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const target = pct == null ? 0 : Math.max(0, Math.min(pct, 100));
  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.t1 + "14"} strokeWidth={stroke} />
      <circle key={`ring-${target}`} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - target / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{
          "--wfc": String(c),
          animation: "wfRingFill 1.1s cubic-bezier(0.22, 1, 0.36, 1) both",
          animationDelay: `${delay}ms`,
          filter: `drop-shadow(0 0 5px ${color}44)`,
        }} />
      <text x="50%" y={unit ? "46%" : "50%"} textAnchor="middle" dominantBaseline="central"
        fontSize={size * 0.20} fontWeight="800" fill={T.t1} style={{ fontVariantNumeric: "tabular-nums" }}>{valueLabel}</text>
      {unit && <text x="50%" y="64%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.10} fontWeight="600" fill={T.t6}>{unit}</text>}
    </svg>
  );
}

// Sparkline compacta para os cards de KPI
export function Spark({ data, color, W = 116, H = 30 }) {
  const pts0 = (data || []).filter(d => d && d[1] != null);
  if (pts0.length < 2) return null;
  const vals = pts0.map(d => d[1]);
  const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
  const pts = pts0.map((d, i) => [2 + (i / (pts0.length - 1)) * (W - 8), H - 4 - ((d[1] - min) / span) * (H - 9)]);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const lastP = pts[pts.length - 1];
  return (
    <svg width={W} height={H} style={{ display: "block", opacity: 0.95 }}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx={lastP[0]} cy={lastP[1]} r="2.6" fill={color} />
    </svg>
  );
}

// "Como isso é calculado?" — tooltip de metodologia
export function InfoTip({ text, T }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", marginLeft: "auto", flexShrink: 0 }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <span aria-label="info" style={{
        width: 15, height: 15, borderRadius: "50%", border: `1.2px solid ${T.t8}`, color: T.t6,
        fontSize: 9, display: "inline-flex", alignItems: "center", justifyContent: "center",
        cursor: "help", fontWeight: 800, fontStyle: "normal", lineHeight: 1,
      }}>i</span>
      {open && <span style={{
        position: "absolute", right: -4, top: "calc(100% + 7px)", zIndex: 60, width: 250,
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10,
        boxShadow: "0 10px 28px rgba(0,0,0,.28)", padding: "10px 12px",
        fontSize: 11, lineHeight: 1.55, color: T.t2, fontWeight: 500,
        textTransform: "none", letterSpacing: 0, whiteSpace: "normal", textAlign: "left",
        animation: "fadeUp .14s ease-out both",
      }}>{text}</span>}
    </span>
  );
}

// Faixa de frescor — "números confiáveis, atualizados em..."
export function DataStrip({ T }) {
  const [st, setSt] = useState([]);
  useEffect(() => { api.get("/indicators/data-status").then(r => setSt(r.data || [])).catch(() => {}); }, []);
  if (!st.length) return null;
  const age = (last) => {
    if (!last) return null;
    const d = last.length === 7 ? last + "-28" : last;
    return Math.floor((Date.now() - new Date(d + "T12:00:00Z").getTime()) / 86400000);
  };
  const col = (s) => {
    const a = age(s.last);
    if (a == null) return T.red;
    const lim = s.cadence === "daily" ? 3 : s.cadence === "weekly" ? 12 : 40;
    return a <= lim ? T.green : a <= lim * 2 ? T.amber : T.red;
  };
  const fmtD = (last) => !last ? "—" : (last.length === 7 ? last : last.slice(8, 10) + "/" + last.slice(5, 7));
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: "5px 16px", alignItems: "center",
      padding: "8px 14px", background: T.bgDeep, border: `1px solid ${T.borderSubtle || T.border}`,
      borderRadius: 10, marginBottom: 14, fontSize: 11,
    }}>
      <span style={{ fontWeight: 800, color: T.t5, textTransform: "uppercase", letterSpacing: ".08em", fontSize: 10 }}>Dados até</span>
      {st.map(s => (
        <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: T.t6, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ width: 6.5, height: 6.5, borderRadius: "50%", background: col(s), boxShadow: `0 0 5px ${col(s)}88` }} />
          <b style={{ color: T.t4, fontWeight: 700 }}>{s.label}</b> {fmtD(s.last)}
          {s.auto && <span style={{ fontSize: 9, fontWeight: 700, color: T.accent, border: `1px solid ${T.accent}55`, borderRadius: 5, padding: "0.5px 5px" }}>auto</span>}
        </span>
      ))}
    </div>
  );
}
