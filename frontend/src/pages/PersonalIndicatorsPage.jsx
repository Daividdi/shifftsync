import React, { useEffect, useState } from "react";
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

function BarChart({ data, T }) {
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
        return <g key={i}>
          <rect x={x.toFixed(1)} y={y.toFixed(1)} width={bw} height={h.toFixed(1)} rx="3" fill={col} />
          <text x={(x + bw / 2).toFixed(1)} y={(y - 4).toFixed(1)} textAnchor="middle" fontSize="9" fill={T.t2}>{pct}</text>
          <text x={(x + bw / 2).toFixed(1)} y={H - 8} textAnchor="middle" fontSize="9" fill={T.t6}>{day}</text>
        </g>;
      })}
    </svg>
  );
}

function LineChart({ data, T }) {
  const W = 560, H = 190, PX = 30, PYT = 16, PYB = 22, lo = 7, hi = 10, n = data.length;
  const cw = n > 1 ? (W - 2 * PX) / (n - 1) : 0, ch = H - PYT - PYB, Y = v => PYT + (1 - (v - lo) / (hi - lo)) * ch;
  const path = data.map(([, s], i) => `${i ? "L" : "M"}${(PX + i * cw).toFixed(1)},${Y(s).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
      {[7, 8, 9, 10].map(v => { const y = Y(v); return <g key={v}><line x1={PX} y1={y} x2={W - PX} y2={y} stroke={T.chartGrid} /><text x={PX - 6} y={y + 3} textAnchor="end" fontSize="9" fill={T.t6}>{v}</text></g>; })}
      <line x1={PX} y1={Y(9)} x2={W - PX} y2={Y(9)} stroke={T.green} strokeDasharray="5 4" strokeWidth="1.5" />
      <path d={path} fill="none" stroke={T.amber} strokeWidth="2.5" strokeLinejoin="round" />
      {data.map(([date, s], i) => <circle key={i} cx={(PX + i * cw).toFixed(1)} cy={Y(s).toFixed(1)} r="3.4" fill={T.bgCard} stroke={T.amber} strokeWidth="2" />)}
    </svg>
  );
}

function RangeBar({ label, valueLabel, valueColor, fillPct, markerPct, scale, note, noteColor, fill, T }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 8 }}>
        <span style={{ color: T.t2 }}>{label}</span><b style={{ color: valueColor }}>{valueLabel}</b>
      </div>
      <div style={{ position: "relative", height: 10, borderRadius: 99, background: T.t1 + "12" }}>
        <i style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.max(0, Math.min(100, fillPct))}%`, borderRadius: 99, background: fill }} />
        <span title="média do grupo" style={{ position: "absolute", left: `${Math.max(0, Math.min(100, markerPct))}%`, top: -4, height: 18, width: 2, background: T.t1, borderRadius: 2 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.t6, marginTop: 6 }}>
        {scale.map((s, i) => <span key={i}>{s}</span>)}
      </div>
      <div style={{ fontSize: 11.5, color: noteColor, marginTop: 6, fontWeight: 600 }}>{note}</div>
    </div>
  );
}

export default function PersonalIndicatorsPage() {
  const { theme: T } = useTheme();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    setState({ loading: true });
    api.get("/indicators/me")
      .then(r => setState({ loading: false, data: r.data }))
      .catch(e => setState({ loading: false, error: e.response?.data?.error || "Falha ao carregar" }));
  }, []);

  const d = state.data;
  const card = { background: `linear-gradient(180deg, ${T.bgCard}, ${T.bgDeep})`, border: `1px solid ${T.border}`, borderRadius: 18, padding: "18px 18px 16px" };
  const h3 = { fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: T.t7, marginBottom: 12, display: "flex", alignItems: "center", gap: 7 };
  const dot = (c) => ({ width: 7, height: 7, borderRadius: "50%", background: c, display: "inline-block" });

  return (
    <div style={{ padding: 24, maxWidth: 1100, width: "100%", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 800, color: T.t1 }}>Indicadores Pessoais</div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: T.accent, marginTop: 3 }}>Seus avanços · qualidade · volume</div>
        </div>
        {d?.hasData && <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 13, padding: "7px 14px 7px 7px" }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: T.accentGradient, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#06222e" }}>{initials(d.name)}</div>
          <div><b style={{ fontSize: 13.5, color: T.t1 }}>{d.name}</b><div style={{ fontSize: 11, color: T.t6 }}>{d.group} · {d.level} · {d.month}</div></div>
        </div>}
      </div>

      {state.loading && <div style={{ textAlign: "center", padding: "70px 0", color: T.t4 }}>
        <div style={{ width: 36, height: 36, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", margin: "0 auto 14px", animation: "spin .7s linear infinite" }} />Carregando seus indicadores…</div>}

      {state.error && <div style={{ textAlign: "center", padding: "60px 0", color: T.red }}>{state.error}</div>}

      {!state.loading && d && !d.hasData && <div style={{ textAlign: "center", padding: "60px 20px", color: T.t4 }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>📊</div>
        Ainda não há dados de produtividade/qualidade vinculados ao seu nome.<br />
        <span style={{ fontSize: 12, color: T.t6 }}>Assim que a planilha do BI for carregada com seus resultados, eles aparecem aqui.</span>
      </div>}

      {!state.loading && d?.hasData && (() => {
        const a = d.attainment, q = d.quality;
        const aboveAvg = a.groupAvg != null && a.pct >= a.groupAvg;
        const qBelow = q && q.groupAvg != null && q.score < q.groupAvg;
        return <>
          {/* Insight */}
          <div style={{ ...card, marginBottom: 14, borderLeft: `3px solid ${T.accent}`, display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{ fontSize: 24 }}>💡</div>
            <div style={{ fontSize: 12.5, color: T.t2, lineHeight: 1.55 }}>
              Seu <b style={{ color: T.accent }}>volume está {a.trend === "up" ? "ascendente 📈" : a.trend === "down" ? "em queda 📉" : "estável"}</b> ({fmt(a.pct)}% da meta no mês), {aboveAvg ? "acima" : "abaixo"} da média do grupo · <b>{a.rank}º de {a.groupSize}</b>.
              {q && <> Sua <b style={{ color: T.amber }}>qualidade ({fmt(q.score, 2)})</b> está {qBelow ? "abaixo da média do grupo e " : ""}{q.trend === "down" ? "em leve queda 📉" : q.trend === "up" ? "subindo 📈" : "estável"}{qBelow ? " — esse é o seu foco." : "."}</>}
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 14 }}>
            <div style={card}>
              <div style={h3}><span style={dot(T.accent)} />Atingimento (volume)</div>
              <div><span style={{ fontSize: 38, fontWeight: 800, color: T.accent }}>{fmt(a.pct)}</span><span style={{ fontSize: 15, fontWeight: 700, color: T.t6 }}>%</span></div>
              <div style={{ marginTop: 9, fontSize: 12, color: T.t2, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                {a.deltaPct != null && <TrendPill dir={a.deltaPct > 0 ? "up" : a.deltaPct < 0 ? "down" : "flat"} label={`${a.deltaPct > 0 ? "+" : ""}${fmt(a.deltaPct)}%`} T={T} />} vs mês anterior · meta 100%
              </div>
              <div style={{ fontSize: 10.5, color: T.t6, marginTop: 10 }}>{fmt(a.completed, 1)} casos · {a.days} dias</div>
            </div>
            <div style={card}>
              <div style={h3}><span style={dot(T.amber)} />Qualidade (nota)</div>
              <div><span style={{ fontSize: 38, fontWeight: 800, color: T.amber }}>{q ? fmt(q.score, 2) : "—"}</span><span style={{ fontSize: 15, fontWeight: 700, color: T.t6 }}>/10</span></div>
              <div style={{ marginTop: 9, fontSize: 12, color: T.t2, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                {q && q.delta != null && <TrendPill dir={q.delta > 0 ? "up" : q.delta < 0 ? "down" : "flat"} label={`${q.delta > 0 ? "+" : ""}${fmt(q.delta, 2)}`} T={T} />} meta 9,0
              </div>
              <div style={{ fontSize: 10.5, color: T.t6, marginTop: 10 }}>{q ? `${q.qty} avaliações · ${fmt(q.lowPct)}% baixas` : "sem avaliações"}</div>
              {q && <div style={{ marginTop: 9 }}>
                {q.streakNoLow > 0
                  ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: T.green + "22", color: T.green }}>🔥 {q.streakNoLow} {q.streakNoLow === 1 ? "semana" : "semanas"} sem nota baixa</span>
                  : <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, background: T.t1 + "12", color: T.t3 }}>última nota baixa: {q.lastLowWeeksAgo === 0 ? "esta semana" : q.lastLowWeeksAgo == null ? "—" : `${q.lastLowWeeksAgo} sem atrás`}</span>}
              </div>}
            </div>
            <div style={card}>
              <div style={h3}><span style={dot(T.green)} />Posição no grupo</div>
              <div><span style={{ fontSize: 38, fontWeight: 800, color: T.green }}>{a.rank}º</span><span style={{ fontSize: 15, fontWeight: 700, color: T.t6 }}>/{a.groupSize}</span></div>
              <div style={{ marginTop: 9, fontSize: 12, color: T.t2 }}>em produtividade · {d.group}</div>
              <div style={{ fontSize: 10.5, color: T.t6, marginTop: 10 }}>{a.rank <= Math.ceil(a.groupSize * 0.2) ? "top 20% 🔥 mantenha o ritmo" : "subindo no ranking"}</div>
            </div>
          </div>

          {/* Comparativo */}
          <div style={{ ...card, marginBottom: 14 }}>
            <div style={h3}><span style={dot(T.violet)} />Você vs o grupo {d.group} — média &amp; melhor</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26 }}>
              <RangeBar T={T} label="Atingimento (volume)" valueLabel={`você ${fmt(a.pct)}%`} valueColor={T.accent}
                fillPct={a.pct / a.groupBest * 100} markerPct={a.groupAvg / a.groupBest * 100}
                scale={["0", `média ${fmt(a.groupAvg)}%`, `melhor ${fmt(a.groupBest)}%`]} fill={`linear-gradient(90deg, ${T.accentDark}, ${T.accent})`}
                note={aboveAvg ? `▲ +${fmt(a.pct - a.groupAvg)} p.p. acima da média` : `▼ ${fmt(a.groupAvg - a.pct)} p.p. abaixo da média`} noteColor={aboveAvg ? T.green : T.red} />
              {q && <RangeBar T={T} label="Qualidade (nota)" valueLabel={`você ${fmt(q.score, 2)}`} valueColor={T.amber}
                fillPct={(q.score - 7) / 3 * 100} markerPct={(q.groupAvg - 7) / 3 * 100}
                scale={["7,0", `média ${fmt(q.groupAvg, 2)}`, `melhor ${fmt(q.groupBest, 2)}`]} fill={`linear-gradient(90deg, #b46e09, ${T.amber})`}
                note={q.score >= q.groupAvg ? `▲ ${fmt(q.score - q.groupAvg, 2)} acima da média` : `▼ ${fmt(q.groupAvg - q.score, 2)} abaixo da média — sua oportunidade`} noteColor={q.score >= q.groupAvg ? T.green : T.red} />}
            </div>
          </div>

          {/* Charts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div style={card}>
              <div style={h3}><span style={dot(T.accent)} />Atingimento diário — mês atual</div>
              <BarChart data={d.dailyProd} T={T} />
            </div>
            <div style={card}>
              <div style={h3}><span style={dot(T.amber)} />Qualidade semanal — últimas semanas</div>
              {d.weeklyQual.length ? <LineChart data={d.weeklyQual} T={T} /> : <div style={{ color: T.t6, fontSize: 12, padding: "40px 0", textAlign: "center" }}>sem avaliações de qualidade ainda</div>}
            </div>
          </div>

          {/* Volume + caminho */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div style={card}>
              <div style={h3}><span style={dot(T.violet)} />Volume por tipo — mês</div>
              {[["Casos novos", d.cases.new, T.accent], ["Modificações", d.cases.mod, T.violet], ["Refinamentos", d.cases.ref, T.green]].map(([lab, v, c]) => {
                const max = Math.max(d.cases.new, d.cases.mod, d.cases.ref, 1);
                return <div key={lab} style={{ margin: "10px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}><span style={{ color: T.t2 }}>{lab}</span><b style={{ color: T.t1 }}>{v}</b></div>
                  <div style={{ height: 7, borderRadius: 99, background: T.t1 + "12", overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${v / max * 100}%`, background: c, borderRadius: 99 }} /></div>
                </div>;
              })}
              <div style={{ fontSize: 10.5, color: T.t6, marginTop: 12 }}>Total: {d.cases.new + d.cases.mod + d.cases.ref} casos no mês</div>
            </div>
            <div style={card}>
              <div style={h3}><span style={dot(T.green)} />Seu caminho a seguir</div>
              {[
                q && q.score < 9 ? ["🎯", T.amber, "Buscar nota 9,0 (excelência)", `Você está em ${fmt(q.score, 2)}. Revise antes de finalizar — pequenas correções elevam a média rápido.`] : null,
                q && q.lowPct >= 10 ? ["⚠️", T.red, `Reduzir notas baixas: ${fmt(q.lowPct)}% → <10%`, "Identifique o tipo de caso recorrente e padronize seu checklist."] : null,
                ["🚀", T.accent, a.pct >= 100 ? "Manter volume acima da meta" : "Elevar o volume até a meta", a.pct >= 100 ? `${fmt(a.pct)}% — excelente. Sustente acima de 100% sem perder qualidade e suba no ranking.` : `${fmt(a.pct)}% — foque em chegar a 100% de forma consistente.`],
              ].filter(Boolean).map(([ic, c, t, p], i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderBottom: i < 2 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: c + "22" }}>{ic}</div>
                  <div><b style={{ fontSize: 13, color: T.t1 }}>{t}</b><p style={{ fontSize: 11.5, color: T.t2, marginTop: 3, lineHeight: 1.45 }}>{p}</p></div>
                </div>
              ))}
            </div>
          </div>

          {/* Rahoot teaser */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, background: `linear-gradient(110deg, ${T.violet}1a, ${T.bgCard})`, border: `1px dashed ${T.violet}77`, borderRadius: 18, padding: "16px 18px" }}>
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
