import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Smile, Save, Check, PencilLine, Download, Lock, CheckCircle2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";

const fmt = (v, d = 0) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}
function periodOptions() {
  const d = new Date();
  const out = [];
  for (let i = 0; i < 8; i++) {
    const p = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(p.toISOString().slice(0, 7));
  }
  return out;
}
function periodLabel(p) {
  const [y, m] = p.split("-");
  return new Date(+y, +m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
function statusColor(status, T) {
  if (status === "atingido" || status === "registrado") return T.green;
  if (status === "abaixo") return T.red;
  return T.amber;
}

function Ring({ pct, T, size = 128, stroke = 11 }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const col = pct == null ? T.t6 : pct >= 100 ? T.green : pct >= 70 ? T.amber : T.red;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.t1 + "14"} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)}
        style={{ transition: "stroke-dashoffset .7s cubic-bezier(.22,1,.36,1)", filter: `drop-shadow(0 0 6px ${col}55)` }} />
    </svg>
  );
}

function Radar({ items, T }) {
  // Sempre os mesmos eixos (todo indicador não-qualitativo), mesmo sem valor
  // ainda — senão o formato do radar muda a cada preenchimento, o que confunde
  // mais do que ajuda. Pendente vira um ponto perto do centro, cor âmbar.
  const dims = items.filter(i => !i.qualitative);
  const W = 380, H = 300, cx = 190, cy = 148, R = 108;
  if (!dims.length) return <div style={{ textAlign: "center", color: T.t6, fontSize: 12, padding: "60px 0" }}>Sem indicadores numéricos configurados</div>;
  const n = dims.length;
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, frac) => [cx + Math.cos(angle(i)) * R * frac, cy + Math.sin(angle(i)) * R * frac];
  const fracs = dims.map(k => k.pct != null ? Math.max(0.06, Math.min(1.3, k.pct / 100)) : 0.04);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      {[0.25, 0.5, 0.75, 1].map(f => (
        <polygon key={f} points={dims.map((_, i) => pt(i, f).join(",")).join(" ")} fill="none" stroke={T.chartGrid || T.border} strokeWidth="1" />
      ))}
      {dims.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={T.border} strokeWidth="1" />; })}
      <polygon points={dims.map((_, i) => pt(i, 1).join(",")).join(" ")} fill="none" stroke={T.accent} strokeOpacity="0.4" strokeWidth="1.4" strokeDasharray="4 4" />
      <polygon points={dims.map((_, i) => pt(i, fracs[i]).join(",")).join(" ")} fill={T.purple} fillOpacity="0.16" stroke={T.purple} strokeWidth="2.2" strokeLinejoin="round" />
      {dims.map((k, i) => { const [x, y] = pt(i, fracs[i]); return <circle key={i} cx={x} cy={y} r="4" fill={statusColor(k.status, T)} stroke={T.bgCard} strokeWidth="1.5" />; })}
      {dims.map((k, i) => {
        const [lx, ly] = pt(i, 1.26);
        const anchor = Math.abs(Math.cos(angle(i))) < 0.25 ? "middle" : (Math.cos(angle(i)) > 0 ? "start" : "end");
        const parts = k.name.split(" ");
        const short = parts.length > 1 ? parts[0] + " " + parts[1] : parts[0];
        return <text key={i} x={lx} y={ly} textAnchor={anchor} fontSize="10.5" fontWeight="700" fill={T.t6} dominantBaseline="middle">{short}</text>;
      })}
    </svg>
  );
}

export default function KpiDentistasPage() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const isManager = user?.role === "gerencia" || user?.role === "hr" || user?.role === "ti";
  const readOnly = !isManager;

  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [dentistId, setDentistId] = useState(null);
  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState({});
  const [savedFlash, setSavedFlash] = useState({});
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [reportRange, setReportRange] = useState({ from: currentPeriod(), to: currentPeriod() });
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    api.get("/kpi-dentistas/roster").then(r => {
      setRoster(r.data || []);
      if (r.data?.length) setDentistId(prev => prev || r.data[0].id);
    }).catch(() => setRoster([])).finally(() => setRosterLoading(false));
  }, []);

  const load = useCallback(() => {
    if (!dentistId) { setData(null); return; }
    setLoading(true);
    api.get(`/kpi-dentistas?period=${period}&dentistId=${dentistId}`)
      .then(r => { setData(r.data); setFeedbackDraft(r.data.feedback?.comments || ""); setDrafts({}); })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period, dentistId]);
  useEffect(() => { load(); }, [load]);

  const items = data?.items || [];
  const produtividade = items.filter(i => i.category === "produtividade");
  const qualidade = items.filter(i => i.category === "qualidade");
  const ranked = useMemo(() => [...items].filter(i => !i.qualitative && i.pct != null).sort((a, b) => b.pct - a.pct), [items]);

  const draftOf = (id) => drafts[id] ?? { value: items.find(i => i.id === id)?.value, note: items.find(i => i.id === id)?.note };
  const setDraft = (id, patch) => setDrafts(d => ({ ...d, [id]: { ...draftOf(id), ...patch } }));

  async function saveEntry(item) {
    const d = draftOf(item.id);
    setSaving(s => ({ ...s, [item.id]: true }));
    try {
      await api.put("/kpi-dentistas/entry", { definitionId: item.id, dentistId, period, value: d.value === "" || d.value == null ? null : Number(d.value), note: d.note ?? null });
      setSavedFlash(f => ({ ...f, [item.id]: true }));
      setTimeout(() => setSavedFlash(f => ({ ...f, [item.id]: false })), 1600);
      load();
    } finally {
      setSaving(s => ({ ...s, [item.id]: false }));
    }
  }

  async function saveFeedback() {
    setFeedbackSaving(true);
    try { await api.put("/kpi-dentistas/feedback", { dentistId, period, comments: feedbackDraft }); load(); }
    finally { setFeedbackSaving(false); }
  }

  async function finalizePeriod() {
    if (!window.confirm(`Finalizar ${periodLabel(period)}? Isso notifica todos os dentistas de que o resultado está publicado.`)) return;
    setFinalizing(true);
    try { await api.post("/kpi-dentistas/finalize", { period }); load(); }
    finally { setFinalizing(false); }
  }

  async function downloadReport() {
    const { data: rows } = await api.get(`/kpi-dentistas/report?from=${reportRange.from}&to=${reportRange.to}&format=json`);
    setReportOpen(false);
    if (!rows.length) { window.alert("Nenhum dado no intervalo selecionado."); return; }

    const cols = Object.keys(rows[0]).filter(k => k !== "periodKey");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
    const rangeLabel = reportRange.from === reportRange.to ? periodLabel(reportRange.from) : `${periodLabel(reportRange.from)} a ${periodLabel(reportRange.to)}`;

    const drawHeader = () => {
      doc.setFillColor(124, 58, 237); doc.rect(0, 0, pageW, 16, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(255, 255, 255);
      doc.text("KPI Dentistas — Relatório de Atingimento", 10, 10);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(230, 220, 250);
      doc.text(`Período: ${rangeLabel}  ·  ${rows.length} registro${rows.length !== 1 ? "s" : ""}`, 10, 14.5);
    };
    const drawFooter = (p, total) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(140, 150, 165);
      doc.text(`Página ${p} de ${total}`, pageW / 2, pageH - 6, { align: "center" });
      doc.setFont("helvetica", "bold"); doc.setTextColor(124, 58, 237);
      doc.text("ShiftSync · KPI Dentistas", pageW - 10, pageH - 6, { align: "right" });
    };

    drawHeader();
    autoTable(doc, {
      head: [cols],
      body: rows.map(r => cols.map(c => (r[c] === "" || r[c] == null ? "—" : String(r[c])))),
      startY: 20, margin: { left: 10, right: 10, bottom: 12 },
      styles: { fontSize: 8, font: "helvetica", cellPadding: { top: 3, right: 4, bottom: 3, left: 4 }, lineColor: [222, 214, 245], lineWidth: 0.15, textColor: [35, 45, 60] },
      headStyles: { fillColor: [30, 20, 55], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 245, 253] },
      didDrawPage: (hd) => { if (hd.pageNumber > 1) drawHeader(); },
    });
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) { doc.setPage(p); drawFooter(p, totalPages); }
    doc.save(`kpi_dentistas_${reportRange.from}_a_${reportRange.to}.pdf`);
  }

  const card = { background: `linear-gradient(165deg, ${T.bgCard}, ${T.bgDeep})`, border: `1px solid ${T.border}`, borderRadius: 16, padding: "18px 20px" };
  const h3 = { fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: T.t7, marginBottom: 10, display: "flex", alignItems: "center", gap: 7 };
  const dot = (c) => ({ width: 6, height: 6, borderRadius: "50%", background: c, flexShrink: 0 });

  function KpiCard({ item }) {
    const d = draftOf(item.id);
    const dirty = drafts[item.id] != null;
    const col = statusColor(item.status, T);
    const stripe = item.category === "produtividade" ? T.accent : T.purple;
    return (
      <div style={{ ...card, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", gap: 10 }}>
        <i aria-hidden style={{ position: "absolute", top: 0, left: 0, right: "30%", height: 2.5, background: `linear-gradient(90deg, ${stripe}, transparent)` }} />
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.t1, lineHeight: 1.3 }}>{item.name}</div>
          <div style={{ flexShrink: 0, fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: T.t4, background: T.t1 + "0a", border: `1px solid ${T.border}`, borderRadius: 7, padding: "2px 7px" }}>{item.weight}%</div>
        </div>
        <div style={{ fontSize: 11.5, color: T.t6 }}>Meta: <b style={{ color: T.t4 }}>{item.targetLabel}</b></div>

        {item.auto ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: T.cyan, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>
              🔄 Automático · fonte BI
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.t1, fontFamily: "monospace" }}>{item.value != null ? `${fmt(item.value, item.unit === "%" ? 1 : 2)}${item.unit}` : "—"}</div>
            <div style={{ height: 6, borderRadius: 3, background: T.t1 + "0f", overflow: "hidden" }}>
              <i style={{ display: "block", height: "100%", width: `${item.pct != null ? Math.min(100, item.pct) : 0}%`, background: col, borderRadius: 3, transition: "width .4s ease" }} />
            </div>
          </>
        ) : readOnly ? (
          item.qualitative ? (
            <div style={{ fontSize: 12, color: item.note ? T.t2 : T.t7, fontStyle: item.note ? "normal" : "italic", background: T.bgDeep, borderRadius: 8, padding: "8px 10px" }}>
              {item.note || "Sem nota registrada"}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 20, fontWeight: 800, color: T.t1, fontFamily: "monospace" }}>{item.value != null ? `${fmt(item.value, item.unit === "%" ? 2 : 1)}${item.unit}` : "—"}</div>
              <div style={{ height: 6, borderRadius: 3, background: T.t1 + "0f", overflow: "hidden" }}>
                <i style={{ display: "block", height: "100%", width: `${item.pct != null ? Math.min(100, item.pct) : 0}%`, background: col, borderRadius: 3, transition: "width .4s ease" }} />
              </div>
            </>
          )
        ) : item.qualitative ? (
          <textarea
            value={d.note || ""} onChange={e => setDraft(item.id, { note: e.target.value })}
            placeholder="Adicionar nota do período…" rows={2}
            style={{ width: "100%", resize: "vertical", background: T.bgDeep, border: `1.5px solid ${T.purple}4a`, borderRadius: 8, padding: "7px 10px", fontSize: 12, color: T.t2, fontFamily: "inherit" }}
          />
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10.5, color: T.purple, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700, display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <PencilLine size={11} /> Valor
              </span>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  type="number" step="any" value={d.value ?? ""} onChange={e => setDraft(item.id, { value: e.target.value })}
                  placeholder={item.targetValue == null ? "aguardando meta" : "—"}
                  disabled={item.targetValue == null}
                  style={{ width: "100%", background: T.bgDeep, border: `1.5px solid ${T.purple}4a`, borderRadius: 8, padding: "6px 30px 6px 10px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: T.t1, opacity: item.targetValue == null ? .5 : 1 }}
                />
                {item.unit && <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: T.t6, pointerEvents: "none" }}>{item.unit}</span>}
              </div>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: T.t1 + "0f", overflow: "hidden" }}>
              <i style={{ display: "block", height: "100%", width: `${item.pct != null ? Math.min(100, item.pct) : 0}%`, background: col, borderRadius: 3, transition: "width .4s ease" }} />
            </div>
          </>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, color: col, background: col + "20" }}>
            {{ atingido: "Meta atingida", abaixo: "Abaixo da meta", registrado: "Registrado", pendente: "Pendente", meta_a_definir: "Meta a definir", sem_dados_bi: "Sem dados no BI" }[item.status]}
          </span>
          {!readOnly && !item.auto && (
            <button onClick={() => saveEntry(item)} disabled={!dirty || saving[item.id]}
              style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 7, border: "none", cursor: dirty ? "pointer" : "default",
                background: savedFlash[item.id] ? T.green + "22" : dirty ? T.purple : T.t1 + "0a", color: savedFlash[item.id] ? T.green : dirty ? "#fff" : T.t7 }}>
              {savedFlash[item.id] ? <><Check size={12} /> Salvo</> : saving[item.id] ? "Salvando…" : "Salvar"}
            </button>
          )}
        </div>
        {item.enteredBy && <div style={{ fontSize: 10, color: T.t7 }}>Último lançamento: {item.enteredBy} · {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString("pt-BR") : ""}</div>}
      </div>
    );
  }

  return (
    <div style={{ padding: 28, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: T.t1, margin: 0, display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", background: T.purple + "1f", color: T.purple, flexShrink: 0 }}><Smile size={18} /></span>
            KPI · Dentistas
          </h1>
          <p style={{ color: T.t8, fontSize: 13, margin: "5px 0 0" }}>
            {readOnly ? "Seu acompanhamento de resultados em tempo real" : "Scorecard mensal ponderado — produtividade e qualidade"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {isManager && roster.length > 1 && (
            <select value={dentistId || ""} onChange={e => setDentistId(e.target.value)} style={{ background: T.bgDeep, color: T.t1, border: `1px solid ${T.border}`, borderRadius: 9, padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {roster.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <select value={period} onChange={e => setPeriod(e.target.value)} style={{ background: T.bgDeep, color: T.t1, border: `1px solid ${T.border}`, borderRadius: 9, padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {periodOptions().map(p => <option key={p} value={p}>{periodLabel(p)}</option>)}
          </select>
          {isManager && (
            <div style={{ position: "relative" }}>
              <button onClick={() => setReportOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 6, background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 9, padding: "8px 13px", fontSize: 12.5, fontWeight: 700, color: T.t3, cursor: "pointer" }}>
                <Download size={13} /> Relatório
              </button>
              {reportOpen && (
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, width: 250, boxShadow: "0 10px 28px rgba(0,0,0,.28)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.t6, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".05em" }}>Exportar atingimento por dentista</div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <select value={reportRange.from} onChange={e => setReportRange(r => ({ ...r, from: e.target.value }))} style={{ flex: 1, background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 7, padding: "6px 8px", color: T.t1, fontSize: 12 }}>
                      {periodOptions().slice().reverse().map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <span style={{ color: T.t6, fontSize: 12, alignSelf: "center" }}>a</span>
                    <select value={reportRange.to} onChange={e => setReportRange(r => ({ ...r, to: e.target.value }))} style={{ flex: 1, background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 7, padding: "6px 8px", color: T.t1, fontSize: 12 }}>
                      {periodOptions().slice().reverse().map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <button onClick={downloadReport} style={{ width: "100%", background: T.accent, color: "#04222b", border: "none", borderRadius: 8, padding: "8px 0", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Baixar PDF</button>
                </div>
              )}
            </div>
          )}
          {isManager && (
            data?.finalized ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: T.green, background: T.green + "18", borderRadius: 9, padding: "8px 13px" }}>
                <CheckCircle2 size={14} /> Finalizado
              </span>
            ) : (
              <button onClick={finalizePeriod} disabled={finalizing} style={{ display: "flex", alignItems: "center", gap: 6, background: T.green, color: "#06140c", border: "none", borderRadius: 9, padding: "8px 15px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                <Save size={13} /> {finalizing ? "Finalizando…" : "Finalizar período"}
              </button>
            )
          )}
        </div>
      </div>

      {readOnly && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.t6, background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 14px", marginBottom: 16 }}>
          <Lock size={13} /> Visualização — os valores são lançados pelos gestores. {data?.finalized ? `Resultado publicado em ${new Date(data.finalized.at).toLocaleDateString("pt-BR")}.` : "Período ainda em preenchimento."}
        </div>
      )}

      {(rosterLoading || loading) && <div style={{ textAlign: "center", padding: "70px 0", color: T.t4 }}>Carregando…</div>}

      {!rosterLoading && !loading && data && (
        <>
          <div style={{ ...card, display: "flex", alignItems: "center", gap: 26, marginBottom: 16, flexWrap: "wrap" }}>
            <Ring pct={data.compositeScore} T={T} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 34, fontWeight: 800, color: T.t1, fontVariantNumeric: "tabular-nums" }}>{data.compositeScore != null ? `${data.compositeScore}%` : "—"}</span>
              <span style={{ fontSize: 12, color: T.t6 }}>Score geral · {data.dentistName}</span>
            </div>
            <div style={{ width: 1, alignSelf: "stretch", background: T.border }} />
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
              <div><div style={{ fontSize: 11, color: T.t6 }}>Produtividade</div><b style={{ fontSize: 16, color: T.accent }}>25%</b></div>
              <div><div style={{ fontSize: 11, color: T.t6 }}>Qualidade</div><b style={{ fontSize: 16, color: T.purple }}>75%</b></div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 14, marginBottom: 14 }}>
            <div style={card}>
              <div style={h3}><span style={dot(T.purple)} />Perfil dos indicadores</div>
              <Radar items={items} T={T} />
            </div>
            <div style={card}>
              <div style={h3}><span style={dot(T.accent)} />Ranking do período</div>
              {ranked.map((r, i) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 2px", borderBottom: i < ranked.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <span style={{ flex: 1, fontSize: 12.5, color: T.t2 }}>{r.name}</span>
                  <div style={{ width: 54, height: 5, borderRadius: 3, background: T.t1 + "10", overflow: "hidden", flexShrink: 0 }}>
                    <i style={{ display: "block", height: "100%", width: `${Math.min(100, r.pct)}%`, background: statusColor(r.status, T) }} />
                  </div>
                  <b style={{ fontFamily: "monospace", fontSize: 12.5, color: statusColor(r.status, T), width: 40, textAlign: "right" }}>{Math.round(r.pct)}%</b>
                </div>
              ))}
              {!ranked.length && <div style={{ fontSize: 12, color: T.t6 }}>Sem lançamentos ainda.</div>}
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 800, color: T.t1, margin: "20px 2px 12px" }}>Produtividade</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
            {produtividade.map(item => <KpiCard key={item.id} item={item} />)}
          </div>

          <div style={{ fontSize: 13, fontWeight: 800, color: T.t1, margin: "20px 2px 12px" }}>Qualidade</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
            {qualidade.map(item => <KpiCard key={item.id} item={item} />)}
          </div>

          <div style={{ ...card, marginTop: 18 }}>
            <div style={h3}><span style={dot(T.green)} />Comentários do período</div>
            {readOnly ? (
              <div style={{ fontSize: 13, color: feedbackDraft ? T.t2 : T.t7, fontStyle: feedbackDraft ? "normal" : "italic", lineHeight: 1.55 }}>
                {feedbackDraft || "Sem comentários registrados ainda."}
              </div>
            ) : (
              <>
                <textarea
                  value={feedbackDraft} onChange={e => setFeedbackDraft(e.target.value)}
                  placeholder="Resultados alcançados, contexto de desvios, plano para o próximo fechamento…"
                  rows={4}
                  style={{ width: "100%", resize: "vertical", background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 13, color: T.t2, fontFamily: "inherit", lineHeight: 1.55 }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                  <button onClick={saveFeedback} disabled={feedbackSaving}
                    style={{ display: "flex", alignItems: "center", gap: 6, background: T.green, color: "#06140c", border: "none", borderRadius: 9, padding: "8px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                    <Save size={13} /> {feedbackSaving ? "Salvando…" : "Salvar comentários"}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {!rosterLoading && !roster.length && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: T.t4 }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🦷</div>
          Nenhum dentista cadastrado ainda (role "dentista" em Usuários).
        </div>
      )}
    </div>
  );
}
