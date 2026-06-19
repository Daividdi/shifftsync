import React, { useEffect, useMemo, useState } from "react";
import { Users2, ChevronDown, ChevronUp, AlertTriangle, ShieldCheck } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";
import PersonalIndicatorsPage from "./PersonalIndicatorsPage";

const fmt = (v, d = 0) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const gshort = (g) => (g || "").replace("BR-ATD-", "").replace("BR-", "");

function Trend({ dir, T }) {
  const c = dir === "up" ? T.green : dir === "down" ? T.red : T.t8;
  return <span style={{ color: c, fontSize: 11 }}>{dir === "up" ? "▲" : dir === "down" ? "▼" : "■"}</span>;
}

function MiniBar({ pct, color, T }) {
  return (
    <div style={{ width: 64, height: 7, borderRadius: 5, background: T.t1 + "12", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, pct))}%`, borderRadius: 5, background: color }} />
    </div>
  );
}

function KpiCard({ icon, label, value, valueColor, foot, T }) {
  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: T.t9, textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}>{icon}{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1, color: valueColor || T.t1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 12, color: T.t8, marginTop: 8 }}>{foot}</div>
    </div>
  );
}

const COLS = [
  { k: "name", label: "Colaborador", num: false },
  { k: "grp", label: "Equipe", num: false },
  { k: "lvl", label: "Nível", num: false },
  { k: "pct", label: "Atingimento", num: true },
  { k: "rank", label: "Posição", num: true },
  { k: "score", label: "Qualidade", num: true },
  { k: "lowRatePct", label: "Notas baixas", num: true },
];

export default function ManagementOverviewPage() {
  const { theme: T } = useTheme();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [grp, setGrp] = useState("ALL");
  const [sort, setSort] = useState({ k: "pct", dir: -1 });
  const [exp, setExp] = useState(null);
  const [onlyWarn, setOnlyWarn] = useState(false);
  const [detailName, setDetailName] = useState(null);

  useEffect(() => {
    api.get("/indicators/overview")
      .then(r => setData(r.data))
      .catch(e => setErr(e.response?.data?.error || "Falha ao carregar a visão de gestão"));
  }, []);

  const groups = useMemo(() => {
    if (!data?.people) return [];
    return [...new Set(data.people.map(p => p.grp))].sort();
  }, [data]);

  const rows = useMemo(() => {
    if (!data?.people) return [];
    let ps = data.people;
    if (grp !== "ALL") ps = ps.filter(p => p.grp === grp);
    if (onlyWarn) ps = ps.filter(p => p.pct < 100 || p.lowRatePct >= 10);
    const { k, dir } = sort;
    return [...ps].sort((a, b) => {
      let x = a[k], y = b[k];
      if (x == null) x = typeof y === "string" ? "" : -1;
      if (y == null) y = typeof x === "string" ? "" : -1;
      if (typeof x === "string") return dir * x.localeCompare(y);
      return dir * (x - y);
    });
  }, [data, grp, sort, onlyWarn]);

  const summary = useMemo(() => {
    const ps = (data?.people || []).filter(p => grp === "ALL" || p.grp === grp);
    const n = ps.length;
    const avg = (f) => { const v = ps.map(f).filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    return {
      n,
      mAtt: avg(p => p.pct),
      mQ: avg(p => p.score),
      acima: ps.filter(p => p.pct >= 100).length,
      comBaixa: ps.filter(p => p.lowTotal > 0).length,
      atencao: ps.filter(p => p.pct < 100 || p.lowRatePct >= 10).length,
      groups: grp === "ALL" ? new Set(ps.map(p => p.grp)).size : 1,
    };
  }, [data, grp]);

  const chip = (
    <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", background: T.accent + "1f", color: T.accent, flexShrink: 0 }}>
      <Users2 size={18} />
    </span>
  );

  if (detailName) {
    return <PersonalIndicatorsPage name={detailName} onBack={() => setDetailName(null)} />;
  }

  if (err) {
    return (
      <div style={{ padding: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: T.t1, margin: 0, display: "flex", alignItems: "center", gap: 11 }}>{chip}Visão de Gestão</h1>
        <div style={{ marginTop: 24, padding: 22, borderRadius: 14, background: T.red + "12", border: `1px solid ${T.red}33`, color: T.t2, fontSize: 14 }}>
          <b style={{ color: T.red }}>Sem acesso.</b> {err}
        </div>
      </div>
    );
  }
  if (!data) return <div style={{ padding: 28, color: T.t8 }}>Carregando…</div>;

  const setSortKey = (k) => setSort(s => s.k === k ? { k, dir: -s.dir } : { k, dir: (k === "name" || k === "grp" || k === "lvl") ? 1 : -1 });
  const isGestor = data.scope === "gestor";

  return (
    <div style={{ padding: 28 }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: T.t1, margin: 0, display: "flex", alignItems: "center", gap: 11 }}>{chip}Visão de Gestão</h1>
          <p style={{ color: T.t8, fontSize: 13, margin: "5px 0 0" }}>
            {isGestor
              ? "Indicadores de todos os colaboradores"
              : "Indicadores da sua equipe"} · {data.monthLabel}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: "9px 14px" }}>
          {isGestor ? <ShieldCheck size={18} color={T.accent} /> : <Users2 size={18} color={T.violet} />}
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.t1 }}>{isGestor ? "Gestor" : "Líder"}</div>
            <div style={{ fontSize: 11, color: T.t8 }}>{data.scopeLabel}</div>
          </div>
        </div>
      </div>

      {/* filtros */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: "11px 15px", marginBottom: 18 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.t9, textTransform: "uppercase", letterSpacing: ".08em" }}>Equipe</span>
        <select value={grp} onChange={e => { setGrp(e.target.value); setExp(null); }}
          style={{ background: T.bgDeep, color: T.t1, border: `1px solid ${T.border}`, borderRadius: 9, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>
          {(isGestor || groups.length > 1) && <option value="ALL">Todas as equipes</option>}
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: T.t2, cursor: "pointer", marginLeft: 4 }}>
          <input type="checkbox" checked={onlyWarn} onChange={e => setOnlyWarn(e.target.checked)} />
          Só quem precisa de atenção
        </label>
      </div>

      {/* resumo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 16, marginBottom: 20 }}>
        <KpiCard T={T} icon="👥" label="Colaboradores" value={summary.n} foot={grp === "ALL" ? `${summary.groups} equipes` : "equipe " + gshort(grp)} />
        <KpiCard T={T} icon="🎯" label="Atingimento médio" valueColor={summary.mAtt >= 100 ? T.green : T.amber} value={fmt(summary.mAtt) + "%"} foot={`${summary.acima} de ${summary.n} acima da meta`} />
        <KpiCard T={T} icon="⭐" label="Qualidade média" valueColor={summary.mQ >= 8 ? T.green : T.amber} value={fmt(summary.mQ, 2)} foot={`${summary.comBaixa} com notas baixas`} />
        <KpiCard T={T} icon="⚠️" label="Precisam de atenção" valueColor={summary.atencao > 0 ? T.red : T.green} value={summary.atencao} foot="abaixo da meta ou notas baixas <6" />
      </div>

      {/* tabela */}
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {COLS.map(c => (
                  <th key={c.k} onClick={() => setSortKey(c.k)}
                    style={{ padding: "12px 14px", textAlign: c.num ? "right" : "left", color: T.t9, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", cursor: "pointer", whiteSpace: "nowrap", borderBottom: `1px solid ${T.border}`, background: T.bgDeep, userSelect: "none" }}>
                    {c.label}{sort.k === c.k ? (sort.dir < 0 ? " ▾" : " ▴") : ""}
                  </th>
                ))}
                <th style={{ borderBottom: `1px solid ${T.border}`, background: T.bgDeep, width: 34 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map(p => {
                const warn = p.pct < 100 || p.lowRatePct >= 10;
                const open = exp === p.name;
                return (
                  <React.Fragment key={p.name}>
                    <tr onClick={() => setExp(open ? null : p.name)}
                      style={{ cursor: "pointer", background: warn ? T.red + "0c" : "transparent", borderBottom: `1px solid ${T.borderRow || T.border}` }}>
                      <td style={{ padding: "11px 14px", fontWeight: 700, color: T.t1, whiteSpace: "nowrap" }}>{p.name}</td>
                      <td style={{ padding: "11px 14px" }}><span style={{ fontSize: 11, fontWeight: 700, color: T.t7 || T.t8, background: T.bgDeep, border: `1px solid ${T.border}`, padding: "2px 8px", borderRadius: 6 }}>{gshort(p.grp)}</span></td>
                      <td style={{ padding: "11px 14px", color: T.t8 }}>{p.lvl}</td>
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end", width: "100%" }}>
                          <b style={{ color: p.pct >= 100 ? T.green : p.pct >= 80 ? T.amber : T.red, fontVariantNumeric: "tabular-nums" }}>{p.pct}%</b>
                          <Trend dir={p.prodTrend} T={T} /><MiniBar pct={(p.pct / 150) * 100} color={p.pct >= 100 ? T.green : T.accent} T={T} />
                        </div>
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", color: T.t2, fontVariantNumeric: "tabular-nums" }}>{p.rank ? `${p.rank}º/${p.groupSize}` : "—"}</td>
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end", width: "100%" }}>
                          <b style={{ color: p.score >= 8 ? T.green : T.amber, fontVariantNumeric: "tabular-nums" }}>{p.score != null ? fmt(p.score, 2) : "—"}</b>
                          <Trend dir={p.qTrend} T={T} /><MiniBar pct={p.score != null ? (p.score / 10) * 100 : 0} color={T.amber} T={T} />
                        </div>
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", color: p.lowRatePct >= 10 ? T.red : p.lowRatePct > 0 ? T.amber : T.t8, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {fmt(p.lowRatePct, 1)}% <span style={{ color: T.t9, fontWeight: 400 }}>({p.lowTotal})</span>
                      </td>
                      <td style={{ padding: "11px 8px", textAlign: "center", color: T.t8 }}>{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</td>
                    </tr>
                    {open && (
                      <tr style={{ background: T.bgDeep }}>
                        <td colSpan={8} style={{ padding: 0 }}>
                          <div style={{ padding: "16px 18px", display: "flex", gap: 30, flexWrap: "wrap", alignItems: "center" }}>
                            {[
                              { v: p.pct + "%", l: "atingimento" + (p.deltaPct != null ? ` (${p.deltaPct >= 0 ? "+" : ""}${p.deltaPct} p.p.)` : ""), c: p.pct >= 100 ? T.green : T.amber },
                              { v: p.rank ? `${p.rank}º/${p.groupSize}` : "—", l: "posição na equipe" },
                              { v: p.score != null ? fmt(p.score, 2) : "—", l: `qualidade · ${p.qty} aval.`, c: T.amber },
                              { v: p.lowTotal, l: `notas baixas <6 (${fmt(p.lowRatePct, 1)}%)`, c: p.lowRatePct >= 10 ? T.red : T.t1 },
                              { v: fmt(p.cases), l: "casos no mês" },
                            ].map((x, i) => (
                              <div key={i}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: x.c || T.t1, fontVariantNumeric: "tabular-nums" }}>{x.v}</div>
                                <div style={{ fontSize: 11, color: T.t9, marginTop: 2 }}>{x.l}</div>
                              </div>
                            ))}
                            {warn && (
                              <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.red, fontSize: 12.5, fontWeight: 600 }}>
                                <AlertTriangle size={15} /> {p.pct < 100 ? "abaixo da meta" : ""}{p.pct < 100 && p.lowRatePct >= 10 ? " · " : ""}{p.lowRatePct >= 10 ? "notas baixas elevadas" : ""}
                              </div>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); setDetailName(p.name); }}
                              style={{ marginLeft: "auto", background: T.accentGradient || T.accent, color: "#06222e", fontWeight: 800, fontSize: 13, padding: "9px 16px", borderRadius: 10, border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>
                              Abrir painel completo →
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={8} style={{ padding: 30, textAlign: "center", color: T.t8 }}>Nenhum colaborador no filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: T.t9, marginTop: 14, lineHeight: 1.6 }}>
        Clique numa linha para ver o detalhe · clique nos cabeçalhos para ordenar · linhas destacadas = abaixo da meta ou com notas baixas (&lt;6). Dados de {data.monthLabel}.
      </p>
    </div>
  );
}
