import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Clock, Plus, X, CheckCircle, AlertCircle, ChevronDown, Filter, Download, Edit2, Trash2, LogIn, LogOut, Coffee, PlayCircle, PenLine, RefreshCw, TrendingUp, TrendingDown, Minus, Calendar, Fingerprint } from "lucide-react";

// ── Export utilities ─────────────────────────────────────
let _logoWhiteB64p = null;
async function getLogoWhite() {
  if (_logoWhiteB64p) return _logoWhiteB64p;
  try {
    const r = await fetch("/angeltreat-logo-white.png");
    const blob = await r.blob();
    return new Promise(res => { const fr = new FileReader(); fr.onloadend = () => { _logoWhiteB64p = fr.result; res(fr.result); }; fr.readAsDataURL(blob); });
  } catch { return null; }
}
let _logoBluB64p = null;
async function getLogoBlue() {
  if (_logoBluB64p) return _logoBluB64p;
  try {
    const r = await fetch("/angeltreat-logo.png");
    const blob = await r.blob();
    return new Promise(res => { const fr = new FileReader(); fr.onloadend = () => { _logoBluB64p = fr.result; res(fr.result); }; fr.readAsDataURL(blob); });
  } catch { return null; }
}

function downloadExcel(data, filename, sheetName) {
  if (!data || data.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(data);
  const keys = Object.keys(data[0]);
  ws["!cols"] = keys.map(k => ({ wch: Math.min(50, Math.max(k.length + 2, ...data.map(r => String(r[k] ?? "").length + 1))) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (sheetName || filename.replace(/-/g, " ").slice(0, 31)));
  XLSX.writeFile(wb, filename + ".xlsx");
}

async function downloadPDF(data, filename) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(r => headers.map(h => {
    const v = r[h]; return v === null || v === undefined ? "" : String(v);
  }));
  const isLandscape = headers.length > 6;
  const doc = new jsPDF({ orientation: isLandscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const HEADER_H = 28, FOOTER_H = 14;
  const title = reportTitleVac(filename);
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const [logoWhite, logoBlue] = await Promise.all([getLogoWhiteB64(), getLogoBlueB64()]);

  function drawHeader() {
    doc.setFillColor(0, 144, 204); doc.rect(0, 0, pageW, HEADER_H, "F");
    doc.setFillColor(0, 108, 160); doc.rect(0, HEADER_H - 4, pageW, 4, "F");
    if (logoWhite) {
      const lH = 11, lW = Math.round(lH * (1304 / 257));
      try { doc.addImage(logoWhite, "PNG", pageW - lW - 10, (HEADER_H - lH) / 2, lW, lH, undefined, "FAST"); } catch (_) {}
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(255, 255, 255);
    doc.text(title, 10, 12);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(185, 228, 248);
    doc.text("Gerado em " + dateStr + "  ·  " + rows.length + " registro" + (rows.length !== 1 ? "s" : ""), 10, HEADER_H - 6);
  }

  function drawFooter(p, total) {
    doc.setFillColor(244, 247, 251); doc.rect(0, pageH - FOOTER_H, pageW, FOOTER_H, "F");
    doc.setDrawColor(208, 216, 228); doc.setLineWidth(0.3); doc.line(0, pageH - FOOTER_H, pageW, pageH - FOOTER_H);
    if (logoBlue) {
      const fH = 6, fW = Math.round(fH * (1304 / 257));
      try { doc.addImage(logoBlue, "PNG", 10, pageH - FOOTER_H + (FOOTER_H - fH) / 2, fW, fH, undefined, "FAST"); } catch (_) {}
    }
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(140, 150, 165);
    doc.text("Página " + p + " de " + total, pageW / 2, pageH - FOOTER_H / 2 + 1, { align: "center" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(0, 144, 204);
    doc.text("ShiftSync · Workforce Manager", pageW - 10, pageH - FOOTER_H / 2 + 1, { align: "right" });
  }

  drawHeader();
  autoTable(doc, {
    head: [headers], body: rows, startY: HEADER_H + 2,
    margin: { left: 10, right: 10, bottom: FOOTER_H + 2 },
    styles: { fontSize: 8.5, font: "helvetica", cellPadding: { top: 3.5, right: 5, bottom: 3.5, left: 5 }, lineColor: [208, 216, 228], lineWidth: 0.15, textColor: [35, 45, 60], overflow: "linebreak" },
    headStyles: { fillColor: [15, 25, 50], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5, cellPadding: { top: 4.5, right: 5, bottom: 4.5, left: 5 } },
    alternateRowStyles: { fillColor: [246, 249, 253] },
    rowPageBreak: "auto",
    didDrawPage: (hd) => { if (hd.pageNumber > 1) drawHeader(); },
  });
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) { doc.setPage(p); drawFooter(p, totalPages); }
  doc.save(filename + ".pdf");
}

const TYPE_LABELS = { entrada: "Entrada", saida: "Saída", inicio_intervalo: "Início Intervalo", fim_intervalo: "Fim Intervalo" };
const TYPE_COLORS = { entrada: "#22c55e", saida: "#ef4444", inicio_intervalo: "#f59e0b", fim_intervalo: "#3b82f6" };

function fmtDT(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtMin(min) {
  if (min === null || min === undefined) return "—";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const sign = min < 0 ? "-" : min > 0 ? "+" : "";
  return `${sign}${h}h${m > 0 ? ` ${m}min` : ""}`;
}
function fmtAbs(min) {
  if (!min && min !== 0) return "—";
  const abs = Math.abs(Math.round(min));
  if (abs === 0) return "—";
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2,"0") : ""}` : `${m}min`;
}

function fmtHHMM(min) {
  if (min === null || min === undefined) return "—";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const sign = min < 0 ? "-" : "";
  return `${sign}${String(h).padStart(3, "0")}:${String(m).padStart(2, "0")}`;
}

function balanceLabel(min) {
  if (min === 0) return { text: "ZERADO", color: "#94a3b8" };
  return min > 0
    ? { text: "A COMPENSAR", color: "#22c55e" }
    : { text: "A PAGAR",     color: "#ef4444" };
}

function fmtDate(d) {
  if (!d) return "—";
  const [y, mo, day] = d.split("-");
  return `${day}/${mo}/${y}`;
}

// ── Banco de Horas Tab ───────────────────────────────────
function BancoHorasTab({ T, isAdmin, isLeader, selfUser }) {
  const now = new Date();
  const monthStart  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today       = now.toISOString().slice(0, 10);
  const yesterday   = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const selfId = selfUser?.id || "";
  const canPick = isAdmin || isLeader;

  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(selfId);
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo,   setDateTo]   = useState(yesterday);
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [vacSummary, setVacSummary] = useState(null);

  // Adjustment form state
  const [adjDate,   setAdjDate]   = useState(today);
  const [adjTipo,   setAdjTipo]   = useState("credito");
  const [adjHoras,  setAdjHoras]  = useState(0);
  const [adjMin,    setAdjMin]    = useState(0);
  const [adjMotivo, setAdjMotivo] = useState("");
  const [adjSaving, setAdjSaving] = useState(false);
  const [showForm,  setShowForm]  = useState(false);

  const [periodos, setPeriodos] = useState([]);
  const [showPeriodPanel, setShowPeriodPanel] = useState(false);
  const [newPStart, setNewPStart] = useState("");
  const [newPEnd, setNewPEnd]   = useState("");
  const [newPLabel, setNewPLabel] = useState("");
  const [periodSaving, setPeriodSaving] = useState(false);

  useEffect(() => {
    if (!canPick) return;
    const url = isAdmin
      ? "/users?active=1&limit=500"
      : "/batidas?dateFrom=2020-01-01&dateTo=2020-01-01"; // unused, we use groups instead
    if (isAdmin) {
      api.get("/users?active=1&limit=500").then(r => {
        const list = Array.isArray(r.data) ? r.data : (r.data?.rows || []);
        setUsers(list.sort((a, b) => (a.fullName || a.full_name || "").localeCompare(b.fullName || b.full_name || "")));
      }).catch(() => {});
    } else {
      // Leaders: fetch scoped team from backend (self + group members)
      api.get("/ponto/team").then(r => {
        const list = Array.isArray(r.data) ? r.data : [];
        setUsers(list.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "")));
      }).catch(() => {
        if (selfUser) setUsers([{ id: selfUser.id, fullName: selfUser.fullName }]);
      });
    }
  }, [canPick, isAdmin]);

  const load = useCallback(async () => {
    const uid = canPick ? selectedUserId : selfId;
    if (!uid) return;
    setLoading(true); setError(null);
    try {
      const [{ data: d }, vacRes] = await Promise.all([
        api.get(`/ponto/banco-horas?userId=${uid}&dateFrom=${dateFrom}&dateTo=${dateTo}`),
        api.get(`/vacations/summary/${uid}`).catch(() => ({ data: null })),
      ]);
      setData(d);
      setVacSummary(vacRes.data);
    } catch (e) {
      setError(e.response?.data?.error || "Erro ao carregar banco de horas");
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, dateFrom, dateTo]);

  // Auto-load when userId, dateFrom or dateTo change
  useEffect(() => {
    const uid = canPick ? selectedUserId : selfId;
    if (uid) load();
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddAdj = async () => {
    const uid = canPick ? selectedUserId : selfId;
    if (!uid || !adjDate || !adjTipo) return;
    const totalMin = Number(adjHoras) * 60 + Number(adjMin);
    if (totalMin <= 0) { setError("Informe pelo menos 1 minuto"); return; }
    setAdjSaving(true); setError(null);
    try {
      await api.post("/ponto/banco-horas/ajuste", {
        userId: uid, date: adjDate, tipo: adjTipo,
        minutos: totalMin, motivo: adjMotivo || null,
      });
      setAdjHoras(0); setAdjMin(0); setAdjMotivo(""); setShowForm(false);
      await load();
    } catch (e) {
      setError(e.response?.data?.error || "Erro ao salvar ajuste");
    } finally {
      setAdjSaving(false);
    }
  };

  const handleDeleteAdj = async (adjId) => {
    if (!window.confirm("Remover este ajuste?")) return;
    try {
      await api.delete(`/ponto/banco-horas/ajuste/${adjId}`);
      await load();
    } catch (e) {
      setError(e.response?.data?.error || "Erro ao remover ajuste");
    }
  };

  useEffect(() => {
    api.get("/ponto/banco-horas/periodos").then(r => {
      setPeriodos(r.data || []);
      const open = (r.data || []).find(p => !p.closed);
      if (open && !isAdmin) setDateFrom(open.startDate);   // non-admin: lock to period start
      if (open && isAdmin)  setDateFrom(open.startDate);   // admin: pre-select open period start
    }).catch(() => {});
  }, [isAdmin]);

  const handleCreatePeriodo = async () => {
    if (!newPStart || !newPEnd) return;
    setPeriodSaving(true);
    try {
      await api.post("/ponto/banco-horas/periodos", { startDate: newPStart, endDate: newPEnd, label: newPLabel || null });
      const r = await api.get("/ponto/banco-horas/periodos");
      setPeriodos(r.data || []);
      setNewPStart(""); setNewPEnd(""); setNewPLabel("");
    } catch(e) { setError(e.response?.data?.error || "Erro ao criar período"); }
    finally { setPeriodSaving(false); }
  };

  const handleFecharPeriodo = async (id) => {
    if (!window.confirm("Fechar este período? Esta ação não pode ser desfeita.")) return;
    try {
      await api.patch(`/ponto/banco-horas/periodos/${id}/fechar`);
      const r = await api.get("/ponto/banco-horas/periodos");
      setPeriodos(r.data || []);
    } catch(e) { setError(e.response?.data?.error || "Erro ao fechar período"); }
  };

  const handleDeletePeriodo = async (id) => {
    if (!window.confirm("Excluir este período?")) return;
    try {
      await api.delete(`/ponto/banco-horas/periodos/${id}`);
      const r = await api.get("/ponto/banco-horas/periodos");
      setPeriodos(r.data || []);
    } catch(e) { setError(e.response?.data?.error || "Erro ao excluir período"); }
  };

  function suggestNextPeriod() {
    const sorted = [...periodos].sort((a, b) => b.startDate.localeCompare(a.startDate));
    if (!sorted.length) return;
    const last = sorted[0];
    const nextStart = new Date(last.endDate + "T12:00:00Z");
    nextStart.setUTCDate(nextStart.getUTCDate() + 1);
    const nextEnd = new Date(nextStart);
    nextEnd.setUTCMonth(nextEnd.getUTCMonth() + 3);
    nextEnd.setUTCDate(nextEnd.getUTCDate() - 1);
    const fmt = d => d.toISOString().slice(0, 10);
    setNewPStart(fmt(nextStart));
    setNewPEnd(fmt(nextEnd));
    const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const sm = Number(fmt(nextStart).slice(5, 7)) - 1;
    const em = Number(fmt(nextEnd).slice(5, 7)) - 1;
    const yr = fmt(nextStart).slice(0, 4);
    const q = periodos.length + 1;
    setNewPLabel(`T${q}/${yr} — ${meses[sm]}–${meses[em]}`);
  }

  const inputStyle = {
    padding: "7px 10px", borderRadius: 7, border: "1px solid " + T.border,
    background: T.bgCard, color: T.t1, fontSize: 13,
  };
  const thStyle = { padding: "10px 12px", fontSize: 11, fontWeight: 700, color: T.t5, textTransform: "uppercase", textAlign: "left" };
  const tdStyle = { padding: "10px 12px", fontSize: 13, borderBottom: "1px solid " + T.border };

  return (
    <div>
      {/* Period management panel - admin only */}
      {isAdmin && (
        <div style={{ marginBottom: 20 }}>
          {(() => {
            const open = periodos.find(p => !p.closed);
            return open ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
                background: T.accent + "15", border: "1px solid " + T.accent + "44", borderRadius: 10,
                marginBottom: 10, flexWrap: "wrap" }}>
                <Calendar size={15} style={{ color: T.accent, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.accent }}>{open.label || "Período atual"}</span>
                  <span style={{ fontSize: 12, color: T.t6, marginLeft: 10 }}>
                    {fmtDate(open.startDate)} → {fmtDate(open.endDate)}
                  </span>
                </div>
                <button onClick={() => setShowPeriodPanel(v => !v)}
                  style={{ background: "none", border: "1px solid " + T.border, borderRadius: 7,
                    padding: "4px 12px", cursor: "pointer", fontSize: 12, color: T.t5,
                    fontFamily: "'Sora',sans-serif" }}>
                  {showPeriodPanel ? "Fechar" : "Gerenciar Trimestres"}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
                background: "#f59e0b12", border: "1px solid #f59e0b44", borderRadius: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: "#f59e0b" }}>Nenhum período aberto</span>
                <button onClick={() => setShowPeriodPanel(v => !v)}
                  style={{ marginLeft: "auto", background: "none", border: "1px solid " + T.border,
                    borderRadius: 7, padding: "4px 12px", cursor: "pointer", fontSize: 12, color: T.t5,
                    fontFamily: "'Sora',sans-serif" }}>
                  Gerenciar Trimestres
                </button>
              </div>
            );
          })()}

          {showPeriodPanel && (
            <div style={{ background: T.bgCard, border: "1px solid " + T.border, borderRadius: 12,
              padding: "18px 20px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.t1, marginBottom: 16 }}>
                Trimestres / Períodos de Banco de Horas
              </div>

              <div style={{ marginBottom: 16 }}>
                {periodos.map(p => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px", borderRadius: 8, marginBottom: 6,
                    background: p.closed ? T.bgDeep : T.accent + "0E",
                    border: "1px solid " + (p.closed ? T.border : T.accent + "44") }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: p.closed ? T.t8 : T.accent }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: p.closed ? T.t5 : T.t1 }}>
                        {p.label || p.startDate}
                      </span>
                      <span style={{ fontSize: 11, color: T.t7, marginLeft: 10 }}>
                        {fmtDate(p.startDate)} → {fmtDate(p.endDate)}
                      </span>
                      {p.closed && p.closedAt && (
                        <span style={{ fontSize: 10, color: T.t8, marginLeft: 8 }}>
                          fechado {p.closedAt.slice(0,10)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: p.closed ? T.t7 : T.accent,
                      background: p.closed ? T.bgDeep : T.accent + "22",
                      padding: "2px 8px", borderRadius: 5 }}>
                      {p.closed ? "FECHADO" : "ABERTO"}
                    </div>
                    {!p.closed && (
                      <button onClick={() => handleFecharPeriodo(p.id)}
                        style={{ background: "#ef444415", border: "1px solid #ef444440", borderRadius: 6,
                          padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600,
                          color: "#ef4444", fontFamily: "'Sora',sans-serif" }}>
                        Fechar Período
                      </button>
                    )}
                    {!p.closed && (
                      <button onClick={() => handleDeletePeriodo(p.id)}
                        style={{ background: "none", border: "none", cursor: "pointer",
                          color: T.t8, padding: "2px 4px", display: "flex" }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
                {periodos.length === 0 && (
                  <div style={{ color: T.t6, fontSize: 13, padding: "12px 0" }}>
                    Nenhum período cadastrado.
                  </div>
                )}
              </div>

              <div style={{ borderTop: "1px solid " + T.border, paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.t6, marginBottom: 10,
                  textTransform: "uppercase", letterSpacing: "0.06em" }}>Novo Período</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div>
                    <div style={{ fontSize: 11, color: T.t7, marginBottom: 4 }}>Início</div>
                    <input type="date" value={newPStart} onChange={e => setNewPStart(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: T.t7, marginBottom: 4 }}>Fim</div>
                    <input type="date" value={newPEnd} onChange={e => setNewPEnd(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 11, color: T.t7, marginBottom: 4 }}>Label (opcional)</div>
                    <input type="text" value={newPLabel} onChange={e => setNewPLabel(e.target.value)}
                      placeholder="Ex: T3/2026 — Jul–Out" style={{ ...inputStyle, width: "100%" }} />
                  </div>
                  <button onClick={suggestNextPeriod}
                    style={{ padding: "7px 12px", borderRadius: 7, border: "1px solid " + T.border,
                      background: T.bgDeep, color: T.t4, cursor: "pointer", fontSize: 12,
                      fontFamily: "'Sora',sans-serif" }}>
                    Auto-sugerir
                  </button>
                  <button onClick={handleCreatePeriodo} disabled={!newPStart || !newPEnd || periodSaving}
                    style={{ padding: "7px 16px", borderRadius: 7, border: "none",
                      background: T.accent, color: "#fff", cursor: (!newPStart||!newPEnd||periodSaving) ? "not-allowed" : "pointer",
                      fontSize: 13, fontWeight: 600, fontFamily: "'Sora',sans-serif",
                      opacity: (!newPStart||!newPEnd||periodSaving) ? 0.5 : 1 }}>
                    {periodSaving ? "Criando..." : "Criar Período"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
        {canPick && (
          <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} style={inputStyle}>
            <option value="">Selecionar colaborador...</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.full_name || u.fullName}</option>
            ))}
          </select>
        )}
        {isAdmin ? (
          <>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
            <span style={{ color: T.t5 }}>até</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
          </>
        ) : (
          <span style={{ fontSize: 13, color: T.t4, background: T.bgCard,
            border: "1px solid " + T.border, borderRadius: 7, padding: "7px 12px" }}>
            {periodos.find(p => !p.closed)?.label || "Trimestre atual"}
          </span>
        )}
        <button onClick={load} disabled={loading || (canPick && !selectedUserId)}
          style={{ padding: "7px 16px", borderRadius: 7, background: T.accent, color: "#fff",
            border: "none", cursor: (loading || (canPick && !selectedUserId)) ? "not-allowed" : "pointer",
            fontSize: 13, fontWeight: 600, opacity: (loading || (canPick && !selectedUserId)) ? 0.6 : 1 }}>
          {loading ? "Carregando..." : "Buscar"}
        </button>
        {isAdmin && (canPick ? selectedUserId : selfId) && !showForm && (
          <button onClick={() => setShowForm(true)}
            style={{ padding: "7px 14px", borderRadius: 7, background: T.bgCard, border: "1px solid " + T.border,
              color: T.t2, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} /> Novo Ajuste
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: "#ef444411", border: "1px solid #ef444433", borderRadius: 8,
          padding: "10px 14px", marginBottom: 16, color: "#ef4444", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Add adjustment form */}
      {isAdmin && showForm && (
        <div style={{ background: T.bgCard, border: "1px solid " + T.border, borderRadius: 12,
          padding: "18px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.t1, marginBottom: 14 }}>Novo Ajuste Manual</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 11, color: T.t5, marginBottom: 4 }}>Data</div>
              <input type="date" value={adjDate} onChange={e => setAdjDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.t5, marginBottom: 4 }}>Tipo</div>
              <select value={adjTipo} onChange={e => setAdjTipo(e.target.value)} style={inputStyle}>
                <option value="credito">Crédito (+)</option>
                <option value="debito">Débito (−)</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.t5, marginBottom: 4 }}>Horas</div>
              <input type="number" min="0" max="23" value={adjHoras} onChange={e => setAdjHoras(e.target.value)}
                style={{ ...inputStyle, width: 70 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.t5, marginBottom: 4 }}>Minutos</div>
              <input type="number" min="0" max="59" value={adjMin} onChange={e => setAdjMin(e.target.value)}
                style={{ ...inputStyle, width: 70 }} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 11, color: T.t5, marginBottom: 4 }}>Motivo</div>
              <input type="text" value={adjMotivo} onChange={e => setAdjMotivo(e.target.value)}
                placeholder="Ex: Hora extra aprovada..." style={{ ...inputStyle, width: "100%" }} />
            </div>
            <button onClick={handleAddAdj} disabled={adjSaving}
              style={{ padding: "7px 16px", borderRadius: 7, background: "#22c55e", color: "#fff",
                border: "none", cursor: adjSaving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>
              {adjSaving ? "Salvando..." : "Salvar"}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ padding: "7px 12px", borderRadius: 7, background: T.bgCard, border: "1px solid " + T.border,
                color: T.t5, cursor: "pointer", fontSize: 13 }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Balance Summary */}
      {data && (() => {
        const prev   = data.previousBalanceMin  ?? 0;
        const period = data.periodBalanceMin    ?? 0;
        const curr   = data.currentBalanceMin   ?? 0;
        const lPrev   = balanceLabel(prev);
        const lPeriod = balanceLabel(period);
        const lCurr   = balanceLabel(curr);
        const periodLabel = data.periodo
          ? `${data.periodo.label || "Período atual"} — ${fmtDate(data.dateFrom)} à ${fmtDate(data.dateTo)}`
          : `${fmtDate(data.dateFrom)} à ${fmtDate(data.dateTo)}`;
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
            {[
              { heading: "Saldo de Horas Anterior",  min: prev,   lbl: lPrev   },
              { heading: `Saldo do Período`,          sub: periodLabel, min: period, lbl: lPeriod },
              { heading: "Saldo de Horas Atual",      min: curr,   lbl: lCurr, highlight: true },
            ].map((card, i) => (
              <div key={i} style={{
                background: card.highlight
                  ? (lCurr.color === "#22c55e" ? "#22c55e14" : lCurr.color === "#ef4444" ? "#ef444414" : T.bgCard)
                  : T.bgCard,
                border: "1px solid " + (card.highlight ? lCurr.color + "44" : T.border),
                borderRadius: 12, padding: "18px 20px",
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.t5, textTransform: "uppercase",
                  letterSpacing: "0.04em", marginBottom: 2 }}>{card.heading}</div>
                {card.sub && (
                  <div style={{ fontSize: 11, color: T.t5, marginBottom: 8 }}>{card.sub}</div>
                )}
                <div style={{ fontSize: 28, fontWeight: 800, color: card.lbl.color,
                  fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", lineHeight: 1.15,
                  marginTop: card.sub ? 0 : 8 }}>
                  {fmtHHMM(card.min)}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: card.lbl.color,
                  marginTop: 4, letterSpacing: "0.06em" }}>
                  {card.lbl.text}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Vacation balance */}
      {vacSummary && (
        <div style={{ background: T.bgCard, border: "1px solid " + T.border, borderRadius: 12,
          padding: "16px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.t5, textTransform: "uppercase",
            letterSpacing: "0.06em", marginBottom: 12 }}>Saldo de Férias</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            {[
              { label: "Direito", value: vacSummary.daysEntitled ?? "—", color: T.accent },
              { label: "Usadas",  value: vacSummary.daysUsed     ?? 0,   color: "#f59e0b" },
              { label: "Saldo",   value: vacSummary.daysRemaining ?? "—",
                color: (vacSummary.daysRemaining ?? 0) > 0 ? "#22c55e" : "#ef4444" },
            ].map((k, i) => (
              <div key={i} style={{ textAlign: "center", minWidth: 64 }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: k.color,
                  fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{k.value}</div>
                <div style={{ fontSize: 10, color: T.t5, marginTop: 3, textTransform: "uppercase",
                  letterSpacing: "0.06em" }}>{k.label}</div>
              </div>
            ))}
            {vacSummary.acqStart && (
              <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 11, color: T.t5, lineHeight: 1.7 }}>
                <div>Período aq.: <strong style={{ color: T.t2 }}>{fmtDate(vacSummary.acqStart)} — {fmtDate(vacSummary.acqEnd)}</strong></div>
                {vacSummary.concEnd && (
                  <div>Prazo conc.: <strong style={{ color: T.t2 }}>{fmtDate(vacSummary.concEnd)}</strong></div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Per-day table */}
      {data && data.days && data.days.length > 0 && (
        <div style={{ background: T.bgCard, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
          {(() => {
            const totals = data.periodTotals || data.days.reduce((acc, d) => {
              acc.worked   += d.workedMin      ?? 0;
              acc.expected += d.expectedMin    ?? 0;
              acc.extras   += d.extraMin       ?? 0;
              acc.paidOT   += d.paidOTMin      ?? 0;
              acc.atraso   += d.atrasoMin      ?? 0;
              acc.sa       += d.saMin          ?? 0;
              acc.falta    += d.faltaMin       ?? 0;
              acc.abono    += d.adjustmentMin  ?? 0;
              return acc;
            }, { worked: 0, expected: 0, extras: 0, paidOT: 0, atraso: 0, sa: 0, falta: 0, abono: 0 });
            const finalSaldo = data.currentBalanceMin ?? 0;
            return (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: T.bgDeep }}>
                <th style={thStyle}>Data</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Bat.</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Trab</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Almoço</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Exec</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Extras</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Atraso</th>
                <th style={{ ...thStyle, textAlign: "center" }}>SA</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Falta</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Abono</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Saldo Acum.</th>
                {isAdmin && <th style={{ ...thStyle, textAlign: "center" }}>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {data.days.map((day, i) => {
                const adj     = day.adjustmentMin;
                const cum     = day.cumulativeMin;
                const extras  = day.extraMin  ?? 0;
                const atraso  = day.atrasoMin ?? 0;
                const sa      = day.saMin     ?? 0;
                const falta   = day.faltaMin  ?? 0;
                const abono   = (day.abonoMin ?? 0) + (adj ?? 0);
                return (
                  <React.Fragment key={day.date}>
                    <tr style={{ background: i % 2 === 0 ? "transparent" : T.bgDeep + "55" }}>
                      <td style={{ ...tdStyle, color: T.t2, fontWeight: 500 }}>{fmtDate(day.date)}</td>
                      <td style={{ ...tdStyle, textAlign: "center", color: T.t5, fontVariantNumeric: "tabular-nums" }}>
                        {day.punchCount || "—"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", fontWeight: 600, color: T.t1, fontVariantNumeric: "tabular-nums" }}>
                        {fmtAbs(day.workedMin)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", color: T.t5, fontVariantNumeric: "tabular-nums" }}>
                        {day.lunchMin != null ? fmtAbs(day.lunchMin) : "—"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", color: T.t5, fontVariantNumeric: "tabular-nums" }}>
                        {fmtAbs(day.expectedMin)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", fontVariantNumeric: "tabular-nums",
                        color: extras > 0 ? "#22c55e" : T.t8 }}>
                        {fmtAbs(extras)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", fontVariantNumeric: "tabular-nums",
                        color: atraso > 0 ? "#ef4444" : T.t8 }}>
                        {fmtAbs(atraso)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", fontVariantNumeric: "tabular-nums",
                        color: sa > 0 ? "#ef4444" : T.t8 }}>
                        {fmtAbs(sa)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", fontVariantNumeric: "tabular-nums",
                        color: falta > 0 ? "#ef4444" : T.t8 }}>
                        {fmtAbs(falta)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", fontVariantNumeric: "tabular-nums",
                        color: abono > 0 ? "#22c55e" : abono < 0 ? "#ef4444" : T.t8 }}
                        title={day.abonoMin > 0 ? `Tempo abonado: ${fmtAbs(day.abonoMin)}${adj ? ` + ajuste manual ${fmtMin(adj)}` : ''}` : (adj ? `Ajuste manual ${fmtMin(adj)}` : '')}>
                        {fmtAbs(abono)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums",
                        color: cum > 0 ? "#22c55e" : cum < 0 ? "#ef4444" : T.t5 }}>
                        {fmtMin(cum)}
                      </td>
                      {isAdmin && (
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          {day.adjustments.length > 0 && day.adjustments.map(a => (
                            <button key={a.id} onClick={() => handleDeleteAdj(a.id)}
                              title={`Remover: ${a.tipo} ${a.minutos}min — ${a.motivo || "sem motivo"}`}
                              style={{ background: "none", border: "none", cursor: "pointer",
                                color: "#ef4444", padding: "2px 4px" }}>
                              <Trash2 size={13} />
                            </button>
                          ))}
                        </td>
                      )}
                    </tr>
                    {day.adjustments.length > 0 && (
                      <tr style={{ background: "#f59e0b08" }}>
                        <td colSpan={isAdmin ? 12 : 11} style={{ padding: "4px 12px 8px 32px" }}>
                          {day.adjustments.map(a => (
                            <span key={a.id} style={{ display: "inline-block", marginRight: 12, fontSize: 11,
                              color: a.tipo === "credito" ? "#22c55e" : "#ef4444" }}>
                              {a.tipo === "credito" ? "+" : "−"}{a.minutos}min
                              {a.motivo ? ` — ${a.motivo}` : ""}
                              {a.created_by_name ? ` (${a.created_by_name})` : ""}
                            </span>
                          ))}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: T.bgDeep, borderTop: `2px solid ${T.border}` }}>
                <td colSpan={2} style={{ ...tdStyle, fontWeight: 700, fontSize: 11, color: T.t5, textTransform: "uppercase", letterSpacing: "0.06em" }}>TOTAIS</td>
                <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: T.t1, fontVariantNumeric: "tabular-nums" }}>{fmtAbs(totals.worked)}</td>
                <td style={{ ...tdStyle, textAlign: "center", color: T.t5 }}>—</td>
                <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: T.t5, fontVariantNumeric: "tabular-nums" }}>{fmtAbs(totals.expected)}</td>
                <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: totals.extras > 0 ? "#22c55e" : T.t8, fontVariantNumeric: "tabular-nums" }}>{fmtAbs(totals.extras)}</td>
                <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: totals.atraso > 0 ? "#ef4444" : T.t8, fontVariantNumeric: "tabular-nums" }}>{fmtAbs(totals.atraso)}</td>
                <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: totals.sa > 0 ? "#ef4444" : T.t8, fontVariantNumeric: "tabular-nums" }}>{fmtAbs(totals.sa)}</td>
                <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: totals.falta > 0 ? "#ef4444" : T.t8, fontVariantNumeric: "tabular-nums" }}>{fmtAbs(totals.falta)}</td>
                <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums",
                  color: totals.abono > 0 ? "#22c55e" : totals.abono < 0 ? "#ef4444" : T.t8 }}>{fmtAbs(totals.abono)}</td>
                <td style={{ ...tdStyle, textAlign: "center", fontWeight: 800, fontVariantNumeric: "tabular-nums",
                  color: finalSaldo > 0 ? "#22c55e" : finalSaldo < 0 ? "#ef4444" : T.t5 }}>{fmtMin(finalSaldo)}</td>
                {isAdmin && <td style={tdStyle} />}
              </tr>
            </tfoot>
          </table>
            );
          })()}
        </div>
      )}

      {data && data.days && data.days.length === 0 && (
        <div style={{ color: T.t5, fontSize: 14, padding: "40px 0", textAlign: "center" }}>
          Nenhum registro de batidas ou ajustes no período.
        </div>
      )}

      {!data && !loading && (
        <div style={{ color: T.t5, fontSize: 14, padding: "40px 0", textAlign: "center" }}>
          {canPick ? "Selecione um colaborador e clique em Buscar." : "Selecione o período e clique em Buscar."}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────
export default function PontoPage() {
  const { user } = useAuth();
  const { theme: T } = useTheme();
  const isAdmin  = ["hr","ti","gerencia"].includes(user?.role);
  const isLeader = ["leader","gerencia"].includes(user?.role) || isAdmin;

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30*86400000).toISOString().slice(0, 10);

  // Admins land on registros (manage records); leaders/employees land on banco (their own hours)
  const [tab, setTab] = useState(isAdmin ? "registros" : "banco");

  // Manual entry form (Registros tab)
  const [showEntry,    setShowEntry]    = useState(false);
  const [entryUsers,   setEntryUsers]   = useState([]);
  const [entryUserId,  setEntryUserId]  = useState("");
  const [entryType,    setEntryType]    = useState("entrada");
  const [entryDT,      setEntryDT]      = useState(() => {
    const n = new Date(); const p = x => String(x).padStart(2,'0');
    return n.getFullYear()+'-'+p(n.getMonth()+1)+'-'+p(n.getDate())+'T'+p(n.getHours())+':'+p(n.getMinutes());
  });
  const [entryReason,  setEntryReason]  = useState("");
  const [entrySaving,  setEntrySaving]  = useState(false);
  const [entryError,   setEntryError]   = useState(null);

  const [editingId,   setEditingId]   = useState(null);
  const [editType,    setEditType]    = useState("entrada");
  const [editDT,      setEditDT]      = useState("");
  const [editReason,  setEditReason]  = useState("");
  const [editSaving,  setEditSaving]  = useState(false);
  const [editError,   setEditError]   = useState(null);

  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo,   setDateTo]   = useState(today);
  const [typeFilter, setTypeFilter] = useState("");
  const [rows,  setRows]  = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo, page: p, limit: LIMIT });
      if (typeFilter) params.set("type", typeFilter);
      const [rec, sum] = await Promise.all([
        api.get("/ponto?" + params).then(r => r.data),
        api.get("/ponto/analytics/summary?" + new URLSearchParams({ dateFrom, dateTo })).then(r => r.data).catch(() => null),
      ]);
      setRows(rec.rows || []);
      setTotal(rec.total || 0);
      setSummary(sum);
      setPage(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, typeFilter]);

  useEffect(() => { if (tab === "registros") load(1); }, [load, tab]);

  useEffect(() => {
    if (isAdmin) {
      api.get("/users?active=1").then(r => {
        const list = Array.isArray(r.data) ? r.data : (r.data?.rows || []);
        setEntryUsers(list.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "")));
      }).catch(() => {});
    } else if (isLeader) {
      api.get("/ponto/team").then(r => {
        const list = Array.isArray(r.data) ? r.data : [];
        setEntryUsers(list.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "")));
      }).catch(() => {});
    }
  }, [isAdmin, isLeader]);

  const handleSaveEntry = async () => {
    if (!entryDT || !entryType) return;
    setEntrySaving(true); setEntryError(null);
    try {
      await api.post("/ponto", {
        userId: entryUserId || undefined,
        type: entryType,
        recordedAt: (entryDT.length === 16 ? entryDT + ':00.000' : entryDT.replace('Z','')),
        reason: entryReason || undefined,
      });
      setShowEntry(false);
      setEntryReason("");
      load(1);
    } catch (e) {
      setEntryError(e.response?.data?.error || "Erro ao salvar");
    } finally {
      setEntrySaving(false);
    }
  };

  const handleStartEdit = (r) => {
    setEditingId(r.id);
    setEditType(r.type);
    setEditDT(r.recordedAt ? r.recordedAt.slice(0, 16) : "");
    setEditReason(r.reason || "");
    setEditError(null);
  };

  const handleSaveEdit = async (r) => {
    if (!editDT) return;
    setEditSaving(true); setEditError(null);
    try {
      await api.patch(`/ponto/${r.id}`, {
        type: editType,
        recordedAt: editDT.length === 16 ? editDT + ':00.000' : editDT,
        reason: editReason || undefined,
      });
      setEditingId(null);
      load(page);
    } catch (e) {
      setEditError(e.response?.data?.error || "Erro ao salvar");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteRecord = async (r) => {
    if (!window.confirm(`Remover registro de "${r.fullName || 'usuário'}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/ponto/${r.id}`);
      load(page);
    } catch (e) {
      alert(e.response?.data?.error || "Erro ao remover");
    }
  };

  const Card = ({ label, value, color }) => (
    <div style={{ background: T.bgCard, border: "1px solid " + T.border, borderRadius: 10, padding: "16px 20px", minWidth: 130 }}>
      <div style={{ fontSize: 11, color: T.t5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || T.t1, fontVariantNumeric: "tabular-nums" }}>{value ?? "—"}</div>
    </div>
  );

  const TABS = [
    ...(isAdmin || isLeader ? [{ id: "registros", label: "Registros" }] : []),
    { id: "banco", label: "Banco de Horas" },
  ];

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: T.t1, margin: 0, display: "flex", alignItems: "center", gap: 11, textWrap: "balance" }}><span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", background: T.accent + "1f", color: T.accent, flexShrink: 0 }}><Fingerprint size={18} /></span>Controle de Ponto</h1>
        <p style={{ color: T.t5, fontSize: 13, margin: "4px 0 0", textWrap: "pretty" }}>
          {user?.role === "employee" ? "Seus registros de ponto" : "Registros e banco de horas da equipe"}
        </p>
      </div>

      {/* Tab bar */}
      {TABS.length > 1 && (
        <div style={{ display: "flex", borderBottom: "2px solid " + T.border, marginBottom: 24, gap: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: "10px 20px", border: "none", background: "none", cursor: "pointer",
                fontSize: 14, fontWeight: tab === t.id ? 700 : 400,
                color: tab === t.id ? T.accent : T.t5,
                borderBottom: tab === t.id ? "2px solid " + T.accent : "2px solid transparent",
                marginBottom: -2, transition: "color 0.15s ease-out, border-color 0.15s ease-out" }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Registros Tab */}
      {tab === "registros" && (
        <>
          {/* KPIs */}
          {summary && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
              <Card label="Total de registros" value={summary.totalPontos} color={T.accent} />
              <Card label="Lançamentos manuais" value={summary.manualPontos} />
              <Card label="Faltas no período" value={summary.totalFaltas} color={summary.totalFaltas > 0 ? "#ef4444" : T.t1} />
              {(summary.byType || []).map(bt => (
                <Card key={bt.type} label={TYPE_LABELS[bt.type] || bt.type} value={bt.c} color={TYPE_COLORS[bt.type]} />
              ))}
            </div>
          )}

          {/* Filtros */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid " + T.border, background: T.bgCard, color: T.t1, fontSize: 13 }} />
            <span style={{ color: T.t5 }}>até</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid " + T.border, background: T.bgCard, color: T.t1, fontSize: 13 }} />
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid " + T.border, background: T.bgCard, color: T.t1, fontSize: 13 }}>
              <option value="">Todos os tipos</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button onClick={() => load(1)} disabled={loading}
              style={{ padding: "7px 16px", borderRadius: 7, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              {loading ? "Buscando..." : "Buscar"}
            </button>
            {isAdmin && !showEntry && (
              <button onClick={() => setShowEntry(true)}
                style={{ padding: "7px 14px", borderRadius: 7, background: T.bgCard, border: "1px solid " + T.border,
                  color: T.t2, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <Plus size={14} /> Adicionar Registro
              </button>
            )}
          </div>

          {/* Manual entry form */}
          {isAdmin && showEntry && (
            <div style={{ background: T.bgCard, border: "1px solid " + T.border, borderRadius: 12,
              padding: "18px 20px", marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.t1, marginBottom: 14 }}>Adicionar Registro Manual</div>
              {entryError && (
                <div style={{ background: "#ef444411", border: "1px solid #ef444433", borderRadius: 7,
                  padding: "8px 12px", marginBottom: 12, color: "#ef4444", fontSize: 13 }}>{entryError}</div>
              )}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontSize: 11, color: T.t5, marginBottom: 4 }}>Colaborador</div>
                  <select value={entryUserId} onChange={e => setEntryUserId(e.target.value)}
                    style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid " + T.border, background: T.bgCard, color: T.t1, fontSize: 13 }}>
                    <option value="">Minha conta</option>
                    {entryUsers.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: T.t5, marginBottom: 4 }}>Tipo</div>
                  <select value={entryType} onChange={e => setEntryType(e.target.value)}
                    style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid " + T.border, background: T.bgCard, color: T.t1, fontSize: 13 }}>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: T.t5, marginBottom: 4 }}>Data e Hora</div>
                  <input type="datetime-local" value={entryDT} onChange={e => setEntryDT(e.target.value)}
                    style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid " + T.border, background: T.bgCard, color: T.t1, fontSize: 13 }} />
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 11, color: T.t5, marginBottom: 4 }}>Motivo</div>
                  <input type="text" value={entryReason} onChange={e => setEntryReason(e.target.value)}
                    placeholder="Ex: Esqueceu de registrar..." maxLength={200}
                    style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid " + T.border, background: T.bgCard, color: T.t1, fontSize: 13, width: "100%" }} />
                </div>
                <button onClick={handleSaveEntry} disabled={entrySaving}
                  style={{ padding: "7px 16px", borderRadius: 7, background: T.accent, color: "#fff",
                    border: "none", cursor: entrySaving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>
                  {entrySaving ? "Salvando..." : "Salvar"}
                </button>
                <button onClick={() => { setShowEntry(false); setEntryError(null); }}
                  style={{ padding: "7px 12px", borderRadius: 7, background: T.bgCard, border: "1px solid " + T.border,
                    color: T.t5, cursor: "pointer", fontSize: 13 }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Tabela */}
          <div style={{ background: T.bgCard, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", background: T.bgDeep, borderBottom: "2px solid " + T.border }}>
              {isLeader && <div style={{ flex: 2, padding: "10px 12px", fontSize: 11, fontWeight: 700, color: T.t5, textTransform: "uppercase" }}>Colaborador</div>}
              <div style={{ flex: 1.5, padding: "10px 12px", fontSize: 11, fontWeight: 700, color: T.t5, textTransform: "uppercase" }}>Tipo</div>
              <div style={{ flex: 2, padding: "10px 12px", fontSize: 11, fontWeight: 700, color: T.t5, textTransform: "uppercase" }}>Data / Hora</div>
              <div style={{ flex: 1, padding: "10px 12px", fontSize: 11, fontWeight: 700, color: T.t5, textTransform: "uppercase" }}>Origem</div>
              <div style={{ flex: 2, padding: "10px 12px", fontSize: 11, fontWeight: 700, color: T.t5, textTransform: "uppercase" }}>Justificativa</div>
              {isAdmin && <div style={{ flex: 1.5, padding: "10px 12px", fontSize: 11, fontWeight: 700, color: T.t5, textTransform: "uppercase" }}>Ações</div>}
            </div>

            {loading && (
              <div style={{ padding: 40, textAlign: "center", color: T.t5, fontSize: 14 }}>Carregando...</div>
            )}
            {!loading && rows.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: T.t5, fontSize: 14 }}>Nenhum registro encontrado.</div>
            )}
            {!loading && rows.map((r, i) => (
              <div key={r.id} style={{ borderBottom: i < rows.length-1 ? "1px solid " + T.border : "none",
                background: i % 2 === 0 ? "transparent" : T.bgDeep + "55" }}>
                {editingId === r.id ? (
                  <div style={{ padding: "12px 16px" }}>
                    {editError && (
                      <div style={{ background: "#ef444411", border: "1px solid #ef444433", borderRadius: 7,
                        padding: "6px 10px", marginBottom: 10, color: "#ef4444", fontSize: 12 }}>{editError}</div>
                    )}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div>
                        <div style={{ fontSize: 11, color: T.t5, marginBottom: 3 }}>Tipo</div>
                        <select value={editType} onChange={e => setEditType(e.target.value)}
                          style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid " + T.border, background: T.bgCard, color: T.t1, fontSize: 13 }}>
                          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: T.t5, marginBottom: 3 }}>Data e Hora</div>
                        <input type="datetime-local" value={editDT} onChange={e => setEditDT(e.target.value)}
                          style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid " + T.border, background: T.bgCard, color: T.t1, fontSize: 13 }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontSize: 11, color: T.t5, marginBottom: 3 }}>Motivo</div>
                        <input type="text" value={editReason} onChange={e => setEditReason(e.target.value)}
                          placeholder="Motivo da correção..." maxLength={200}
                          style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid " + T.border, background: T.bgCard, color: T.t1, fontSize: 13, width: "100%" }} />
                      </div>
                      <button onClick={() => handleSaveEdit(r)} disabled={editSaving}
                        style={{ padding: "6px 14px", borderRadius: 7, background: T.accent, color: "#fff",
                          border: "none", cursor: editSaving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>
                        {editSaving ? "Salvando..." : "Salvar"}
                      </button>
                      <button onClick={() => { setEditingId(null); setEditError(null); }}
                        style={{ padding: "6px 12px", borderRadius: 7, background: T.bgCard, border: "1px solid " + T.border,
                          color: T.t5, cursor: "pointer", fontSize: 13 }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex" }}>
                    {isLeader && (
                      <div style={{ flex: 2, padding: "10px 12px", fontSize: 13, color: T.t1 }}>
                        <div style={{ fontWeight: 600 }}>{r.fullName}</div>
                        <div style={{ fontSize: 11, color: T.t5 }}>{r.groupName || r.dept}</div>
                        {r.createdByName && (
                          <div style={{ fontSize: 10, color: T.t6, marginTop: 2 }}>
                            criado por {r.createdByName}
                            {r.editedByName && <span> · editado por {r.editedByName}</span>}
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ flex: 1.5, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: TYPE_COLORS[r.type] || T.t5, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: T.t1 }}>{TYPE_LABELS[r.type] || r.type}</span>
                    </div>
                    <div style={{ flex: 2, padding: "10px 12px", fontSize: 13, color: T.t2 }}>{fmtDT(r.recordedAt)}</div>
                    <div style={{ flex: 1, padding: "10px 12px", fontSize: 12, color: r.source === "manual" ? "#f59e0b" : T.t5 }}>
                      {r.source === "manual" ? "Manual" : "Sistema"}
                    </div>
                    <div style={{ flex: 2, padding: "10px 12px", fontSize: 12, color: T.t5 }}>
                      {r.justification || (r.reason ? <em style={{ color: T.t5 }}>{r.reason}</em> : "—")}
                    </div>
                    {isAdmin && (
                      <div style={{ flex: 1.5, padding: "10px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                        <button onClick={() => handleStartEdit(r)}
                          style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6,
                            background: T.bgDeep, border: "1px solid " + T.border, color: T.t2, cursor: "pointer", fontSize: 12 }}>
                          <Edit2 size={11} /> Editar
                        </button>
                        <button onClick={() => handleDeleteRecord(r)}
                          style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6,
                            background: "#ef444411", border: "1px solid #ef444433", color: "#ef4444", cursor: "pointer", fontSize: 12 }}>
                          <Trash2 size={11} /> Remover
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Paginação */}
          {total > LIMIT && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16, alignItems: "center" }}>
              <button onClick={() => load(page - 1)} disabled={page <= 1}
                style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid " + T.border, background: T.bgCard, color: T.t2, cursor: "pointer" }}>
                ‹ Anterior
              </button>
              <span style={{ color: T.t5, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>Página {page} de {Math.ceil(total / LIMIT)}</span>
              <button onClick={() => load(page + 1)} disabled={page >= Math.ceil(total / LIMIT)}
                style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid " + T.border, background: T.bgCard, color: T.t2, cursor: "pointer" }}>
                Próxima ›
              </button>
            </div>
          )}
        </>
      )}

      {/* Banco de Horas Tab */}
      {tab === "banco" && (
        <BancoHorasTab T={T} isAdmin={isAdmin} isLeader={isLeader} selfUser={user} />
      )}
    </div>
  );
}
