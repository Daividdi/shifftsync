import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Umbrella, Plus, X, CheckCircle, XCircle, Clock, Calendar, Upload, Trash2, Edit2, ChevronDown, AlertTriangle, Sun, TrendingUp, Users, ChevronRight, Layers, Download, Search } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import { Card, Avatar, Btn } from "../components/UI";
import api from "../api/client";

// ── Export utilities ─────────────────────────────────────
let _vLogoW = null, _vLogoB = null;
async function vGetLogoW() {
  if (_vLogoW) return _vLogoW;
  try { const r = await fetch("/angeltreat-logo-white.png"); const blob = await r.blob(); return new Promise(res => { const fr = new FileReader(); fr.onloadend = () => { _vLogoW = fr.result; res(fr.result); }; fr.readAsDataURL(blob); }); } catch { return null; }
}
async function vGetLogoB() {
  if (_vLogoB) return _vLogoB;
  try { const r = await fetch("/angeltreat-logo.png"); const blob = await r.blob(); return new Promise(res => { const fr = new FileReader(); fr.onloadend = () => { _vLogoB = fr.result; res(fr.result); }; fr.readAsDataURL(blob); }); } catch { return null; }
}
function vDownloadExcel(data, filename, sheetName) {
  if (!data || data.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(data);
  const keys = Object.keys(data[0]);
  ws["!cols"] = keys.map(k => ({ wch: Math.min(50, Math.max(k.length + 2, ...data.map(r => String(r[k] ?? "").length + 1))) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (sheetName || filename.replace(/-/g, " ").slice(0, 31)));
  XLSX.writeFile(wb, filename + ".xlsx");
}
async function vDownloadPDF(data, filename) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(r => headers.map(h => { const v = r[h]; return v === null || v === undefined ? "" : String(v); }));
  const isLandscape = headers.length > 6;
  const doc = new jsPDF({ orientation: isLandscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
  const HEADER_H = 28, FOOTER_H = 14;
  const TITLES = { "ferias-equipe": "Férias da Equipe", "ferias-historico": "Férias — Histórico" };
  const lower = ["de","do","da","e","em","a","o","por","com"];
  const title = TITLES[filename] || filename.replace(/-/g," ").split(" ").map((w,i)=>(i===0||!lower.includes(w))?w.charAt(0).toUpperCase()+w.slice(1):w).join(" ");
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const [logoW, logoB] = await Promise.all([vGetLogoW(), vGetLogoB()]);
  function drawHeader() {
    doc.setFillColor(0, 144, 204); doc.rect(0, 0, pageW, HEADER_H, "F");
    doc.setFillColor(0, 108, 160); doc.rect(0, HEADER_H - 4, pageW, 4, "F");
    if (logoW) { const lH=11,lW=Math.round(lH*(1304/257)); try { doc.addImage(logoW,"PNG",pageW-lW-10,(HEADER_H-lH)/2,lW,lH,undefined,"FAST"); } catch(_){} }
    doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(255,255,255); doc.text(title,10,12);
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(185,228,248);
    doc.text("Gerado em "+dateStr+"  ·  "+rows.length+" registro"+(rows.length!==1?"s":""),10,HEADER_H-6);
  }
  function drawFooter(p,total) {
    doc.setFillColor(244,247,251); doc.rect(0,pageH-FOOTER_H,pageW,FOOTER_H,"F");
    doc.setDrawColor(208,216,228); doc.setLineWidth(0.3); doc.line(0,pageH-FOOTER_H,pageW,pageH-FOOTER_H);
    if (logoB) { const fH=6,fW=Math.round(fH*(1304/257)); try { doc.addImage(logoB,"PNG",10,pageH-FOOTER_H+(FOOTER_H-fH)/2,fW,fH,undefined,"FAST"); } catch(_){} }
    doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(140,150,165);
    doc.text("Página "+p+" de "+total,pageW/2,pageH-FOOTER_H/2+1,{align:"center"});
    doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(0,144,204);
    doc.text("ShiftSync · Workforce Manager",pageW-10,pageH-FOOTER_H/2+1,{align:"right"});
  }
  drawHeader();
  autoTable(doc, {
    head:[headers], body:rows, startY:HEADER_H+2, margin:{left:10,right:10,bottom:FOOTER_H+2},
    styles:{fontSize:8.5,font:"helvetica",cellPadding:{top:3.5,right:5,bottom:3.5,left:5},lineColor:[208,216,228],lineWidth:0.15,textColor:[35,45,60],overflow:"linebreak"},
    headStyles:{fillColor:[15,25,50],textColor:[255,255,255],fontStyle:"bold",fontSize:8.5,cellPadding:{top:4.5,right:5,bottom:4.5,left:5}},
    alternateRowStyles:{fillColor:[246,249,253]}, rowPageBreak:"auto",
    didDrawPage:(hd)=>{ if(hd.pageNumber>1) drawHeader(); },
  });
  const totalPages = doc.internal.getNumberOfPages();
  for (let p=1; p<=totalPages; p++) { doc.setPage(p); drawFooter(p,totalPages); }
  doc.save(filename+".pdf");
}
function VacExportMenu({ data, filename, T }) {
  const [open, setOpen] = React.useState(false);
  const hasData = data && data.length > 0;
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => hasData && setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", border: `1px solid ${T.border}`, borderRadius: 9, background: T.bgCard, color: hasData ? T.t2 : T.t9, fontSize: 13, fontWeight: 600, cursor: hasData ? "pointer" : "default", fontFamily: "'Sora',sans-serif", opacity: hasData ? 1 : 0.5 }}>
        <Download size={14} /> Exportar
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
          <div style={{ position: "absolute", right: 0, top: "110%", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: 6, zIndex: 100, minWidth: 165, boxShadow: "0 8px 24px #00000033" }}>
            {[
              { label: "Excel (.xlsx)", icon: "📊", action: () => { vDownloadExcel(data, filename); setOpen(false); } },
              { label: "PDF",           icon: "📄", action: () => { vDownloadPDF(data, filename).catch(() => {}); setOpen(false); } },
              { label: "JSON",          icon: "{ }", action: () => { const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename + ".json"; a.click(); URL.revokeObjectURL(url); setOpen(false); } },
            ].map((item, i) => (
              <button key={i} onClick={item.action}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: "none", border: "none", borderRadius: 7, color: T.t3, fontSize: 12, cursor: "pointer", textAlign: "left", fontFamily: "'Sora',sans-serif" }}
                onMouseEnter={e => e.currentTarget.style.background = T.bgDeep}
                onMouseLeave={e => e.currentTarget.style.background = "none"}>
                <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>{item.icon}</span>{item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function isAdmin(role)  { return ["hr","ti","gerencia"].includes(role); }
function isLeader(role) { return role === "leader" || isAdmin(role); }

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
function calcDays(start, end) {
  if (!start || !end) return 0;
  return Math.max(1, Math.round((new Date(end + "T12:00:00") - new Date(start + "T12:00:00")) / 86400000) + 1);
}
function daysUntil(d) {
  if (!d) return null;
  return Math.ceil((new Date(d + "T12:00:00") - new Date()) / 86400000);
}
function today() { return new Date().toISOString().slice(0, 10); }

const STATUS_CONFIG = {
  scheduled: { label: "Agendado",   color: "#60A5FA", bg: "#60A5FA18", icon: Clock },
  approved:  { label: "Aprovado",   color: "#34D399", bg: "#34D39918", icon: CheckCircle },
  completed: { label: "Concluído",  color: "#A78BFA", bg: "#A78BFA18", icon: CheckCircle },
  cancelled: { label: "Cancelado",  color: "#6B7280", bg: "#6B728018", icon: XCircle },
};

function StatusBadge({ status }) {
  const s = STATUS_CONFIG[status] || STATUS_CONFIG.scheduled;
  const Icon = s.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
      <Icon size={10} /> {s.label}
    </span>
  );
}

function Modal({ open, onClose, title, T, children, width = 520 }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000080", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}>
      <div style={{ background: T.bgCard, borderRadius: 14, width: "100%", maxWidth: width, border: `1px solid ${T.border}`, maxHeight: "92vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 14px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.t1 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.t7, padding: 4 }}><X size={16} /></button>
        </div>
        <div style={{ padding: "20px 20px 24px" }}>{children}</div>
      </div>
    </div>
  );
}

// ── CSV Import Preview ──────────────────────────────────────────────────────
function ImportModal({ open, onClose, T, onImported }) {
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const parseCSV = (text) => {
    const lines = text.trim().split("\n").filter(l => l.trim());
    return lines.map((line, i) => {
      const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      return {
        line: i + 1,
        username:    cols[0] || "",
        startDate:   cols[1] || "",
        endDate:     cols[2] || "",
        daysEntitled: cols[3] || "30",
        acqStart:    cols[4] || "",
        acqEnd:      cols[5] || "",
        notes:       cols[6] || "",
        status:      cols[7] || "completed",
      };
    });
  };

  const handlePreview = () => setPreview(parseCSV(raw));

  const handleImport = async () => {
    setSaving(true);
    try {
      const r = await api.post("/vacations/import", { rows: preview });
      setResult(r.data);
      onImported();
    } catch (e) {
      setResult({ error: e.response?.data?.error || e.message });
    }
    setSaving(false);
  };

  const inp = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgDeep, color: T.t1, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box", resize: "vertical" };

  return (
    <Modal open={open} onClose={() => { onClose(); setRaw(""); setPreview([]); setResult(null); }} title="Importar Férias (CSV)" T={T} width={700}>
      <div style={{ fontSize: 12, color: T.t7, marginBottom: 10, background: T.bgDeep, padding: "10px 14px", borderRadius: 8, lineHeight: 1.8 }}>
        <strong style={{ color: T.t2 }}>Formato esperado (uma linha por registro):</strong><br />
        <code style={{ color: T.accent }}>username_ou_nome, data_inicio, data_fim, dias_direito, periodo_aq_inicio, periodo_aq_fim, observacoes, status</code><br />
        <span style={{ color: T.t9 }}>Datas: AAAA-MM-DD · status: scheduled/approved/completed · colunas opcionais podem ser omitidas</span>
      </div>
      <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={8}
        placeholder={"joao.silva, 2024-01-15, 2024-02-13, 30, 2023-03-01, 2024-02-28, férias 2023/24, completed\nmaria.souza, 2024-07-01, 2024-07-30, 30,,, primeiro gozo, completed"}
        style={inp} />
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button onClick={handlePreview} disabled={!raw.trim()}
          style={{ padding: "8px 16px", background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 8, color: T.t2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}>
          Pré-visualizar ({raw.trim() ? parseCSV(raw).length : 0} linhas)
        </button>
        {preview.length > 0 && !result && (
          <button onClick={handleImport} disabled={saving}
            style={{ padding: "8px 18px", background: T.accent, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Sora',sans-serif", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Importando..." : `Importar ${preview.length} registros`}
          </button>
        )}
      </div>

      {result && (
        <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 8, background: result.error ? "#E24B4A18" : "#34D39918", border: `1px solid ${result.error ? "#E24B4A40" : "#34D39940"}` }}>
          {result.error ? <div style={{ color: "#E24B4A" }}>{result.error}</div> : (
            <>
              <div style={{ color: "#34D399", fontWeight: 700 }}>{result.imported} registros importados com sucesso.</div>
              {result.errors?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {result.errors.map((e, i) => <div key={i} style={{ color: "#F87171", fontSize: 11 }}>Linha {e.line}: {e.error}</div>)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {preview.length > 0 && !result && (
        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: T.bgDeep }}>
                {["#", "Usuário", "Início", "Fim", "Dias Dir.", "Período Aq.", "Observações", "Status"].map(h => (
                  <th key={h} style={{ padding: "7px 10px", textAlign: "left", color: T.t8, fontWeight: 700, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${T.borderRow}` }}>
                  <td style={{ padding: "6px 10px", color: T.t9 }}>{r.line}</td>
                  <td style={{ padding: "6px 10px", fontWeight: 600, color: T.t1 }}>{r.username}</td>
                  <td style={{ padding: "6px 10px", color: T.t2 }}>{r.startDate}</td>
                  <td style={{ padding: "6px 10px", color: T.t2 }}>{r.endDate}</td>
                  <td style={{ padding: "6px 10px", color: T.accent }}>{r.daysEntitled}</td>
                  <td style={{ padding: "6px 10px", color: T.t7 }}>{r.acqStart ? `${r.acqStart} → ${r.acqEnd}` : "—"}</td>
                  <td style={{ padding: "6px 10px", color: T.t8, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.notes || "—"}</td>
                  <td style={{ padding: "6px 10px" }}><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function VacationsPage() {
  const { user } = useAuth();
  const { theme: T } = useTheme();
  const admin  = isAdmin(user?.role);
  const leader = isLeader(user?.role);

  const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgDeep, color: T.t1, fontSize: 13, fontFamily: "'Sora',sans-serif", outline: "none", boxSizing: "border-box" };
  const labelStyle = { display: "block", fontSize: 11, fontWeight: 600, color: T.t8, marginBottom: 5, letterSpacing: "0.04em" };


  const [viewTab,   setViewTab]   = useState("list"); // "list" | "teams"
  const [teamView,  setTeamView]  = useState([]);
  const [tvLoading, setTvLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});
  const toggleGroup = (id) => setExpandedGroups(p => ({ ...p, [id]: !p[id] }));

  const [vacations,  setVacations]  = useState([]);
  const [groups,     setGroups]     = useState([]);
  const [users,      setUsers]      = useState([]);
  const [teamUsers,  setTeamUsers]  = useState([]);
  const [mySummary, setMySummary]   = useState(null);
  const [loading,   setLoading]     = useState(false);
  const [flash,     setFlash]       = useState(null);

  // filters
  const [fStatus,    setFStatus]    = useState("");
  const [fGroup,     setFGroup]     = useState("");
  const [fUser,      setFUser]      = useState("");
  const [fDateFrom,  setFDateFrom]  = useState(() => new Date(Date.now() - 365*86400000).toISOString().slice(0,10));
  const [fDateTo,    setFDateTo]    = useState(() => new Date(Date.now() + 800*86400000).toISOString().slice(0,10));
  const [searchName, setSearchName] = useState("");

  // modals
  const [showForm,   setShowForm]   = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [saving,     setSaving]     = useState(false);

  const [form, setForm] = useState({
    userId: "", startDate: "", endDate: "", daysEntitled: 30,
    acqStart: "", acqEnd: "", notes: "", status: "scheduled",
  });
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [formUserSummary, setFormUserSummary] = useState(null);
  const [showPeriodEdit, setShowPeriodEdit] = useState(false);
  const [periodForm, setPeriodForm] = useState({ acqOverrideStart: "", acqOverrideEnd: "", concOverrideEnd: "" });
  const [savingPeriod, setSavingPeriod] = useState(false);

  // Auto-fetch user summary when form opens or userId changes → auto-fill acq period
  useEffect(() => {
    if (!showForm || !form.userId) { setFormUserSummary(null); return; }
    api.get(`/vacations/summary/${form.userId}`)
      .then(r => {
        const s = r.data;
        setFormUserSummary(s);
        // Only auto-fill acquisition period when creating a new record and fields are empty
        if (!editRecord && s?.acqStart) {
          setForm(f => ({
            ...f,
            acqStart: f.acqStart || s.acqStart,
            acqEnd:   f.acqEnd   || (s.acqEnd || ""),
          }));
        }
      })
      .catch(() => setFormUserSummary(null));
  }, [form.userId, showForm]); // eslint-disable-line

  const showMsg = (msg, ok = true) => { setFlash({ msg, ok }); setTimeout(() => setFlash(null), 4000); };

  const fetchVacations = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ dateFrom: fDateFrom, dateTo: fDateTo });
      if (fStatus) q.set("status", fStatus);
      if (fGroup)  q.set("groupId", fGroup);
      if (fUser)   q.set("userId", fUser);
      const r = await api.get("/vacations?" + q);
      setVacations(r.data.rows || []);
    } catch { setVacations([]); }
    setLoading(false);
  }, [fDateFrom, fDateTo, fStatus, fGroup, fUser]);

  const fetchMySummary = useCallback(async () => {
    try {
      const r = await api.get(`/vacations/summary/${user.id}`);
      setMySummary(r.data);
    } catch {}
  }, [user.id]);


  const fetchTeamView = useCallback(async () => {
    setTvLoading(true);
    try {
      const r = await api.get("/vacations/team-view");
      const data = r.data || [];
      setTeamView(data);
      // auto-expand all groups
      const init = {};
      data.forEach(g => { init[g.id] = true; });
      setExpandedGroups(init);
    } catch {}
    setTvLoading(false);
  }, []);

  useEffect(() => { fetchVacations(); }, [fetchVacations]);
  useEffect(() => { fetchMySummary(); }, [fetchMySummary]);
  useEffect(() => { if (viewTab === 'teams' && leader) fetchTeamView(); }, [viewTab, fetchTeamView, leader]);
  useEffect(() => {
    if (leader) api.get("/groups").then(r => setGroups(r.data || [])).catch(() => {});
    if (admin)  api.get("/users?active=1&limit=500").then(r => setUsers(r.data?.users || r.data || [])).catch(() => {});
    if (leader && !admin) api.get("/ponto/team").then(r => setTeamUsers(r.data || [])).catch(() => {});
  }, [leader, admin]);

  const savePeriodOverride = async (userId, clear = false) => {
    setSavingPeriod(true);
    try {
      if (clear) {
        await api.patch(`/vacations/period-override/${userId}`, { clearOverride: true });
        showMsg("Período resetado para cálculo automático.");
      } else {
        await api.patch(`/vacations/period-override/${userId}`, {
          acqOverrideStart: periodForm.acqOverrideStart || null,
          acqOverrideEnd:   periodForm.acqOverrideEnd   || null,
          concOverrideEnd:  periodForm.concOverrideEnd  || null,
        });
        showMsg("Período aquisitivo atualizado!");
      }
      // Re-fetch formUserSummary
      const r = await api.get(`/vacations/summary/${form.userId}`);
      setFormUserSummary(r.data);
      setShowPeriodEdit(false);
    } catch (e) {
      showMsg("Erro: " + (e.response?.data?.error || e.message));
    }
    setSavingPeriod(false);
  };

  const openCreate = (presetUserId = null) => {
    setShowPeriodEdit(false);
    setEditRecord(null);
    setForm({ userId: presetUserId || user.id, startDate: "", endDate: "", daysEntitled: 30, acqStart: "", acqEnd: "", notes: "", status: "scheduled" });
    setShowForm(true);
  };
  const openEdit = (v) => {
    setEditRecord(v);
    setForm({ userId: v.userId, startDate: v.startDate, endDate: v.endDate, daysEntitled: v.daysEntitled, acqStart: v.acqStart || "", acqEnd: v.acqEnd || "", notes: v.notes || "", status: v.status });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.startDate || !form.endDate) return showMsg("Preencha data de início e fim.", false);
    if (form.startDate > form.endDate) return showMsg("Data de início deve ser antes do fim.", false);
    setSaving(true);
    try {
      if (editRecord) {
        await api.patch(`/vacations/${editRecord.id}`, form);
        showMsg("Férias atualizadas!");
      } else {
        await api.post("/vacations", form);
        showMsg("Férias agendadas com sucesso!");
      }
      setShowForm(false);
      fetchVacations();
      fetchMySummary();
    } catch (err) { showMsg(err.response?.data?.error || "Erro ao salvar", false); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Excluir este registro de férias?")) return;
    try { await api.delete(`/vacations/${id}`); showMsg("Registro excluído."); fetchVacations(); fetchMySummary(); }
    catch { showMsg("Erro ao excluir", false); }
  };

  const handleApprove = async (v) => {
    try { await api.patch(`/vacations/${v.id}`, { status: "approved" }); showMsg("Férias aprovadas!"); fetchVacations(); }
    catch { showMsg("Erro ao aprovar", false); }
  };

  // Computed
  const upcoming  = useMemo(() => vacations.filter(v => v.startDate >= today() && v.status !== "cancelled").slice(0, 5), [vacations]);
  const myUpcomingPeriods = useMemo(() =>
    vacations
      .filter(v => v.userId === user?.id && v.startDate >= today() && v.status !== "cancelled")
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [vacations, user]);
  const onVacation = useMemo(() => vacations.filter(v => v.startDate <= today() && v.endDate >= today() && v.status !== "cancelled"), [vacations]);
  const userBalances = useMemo(() => {
    const map = {};
    for (const v of vacations) {
      if (v.status === "cancelled") continue;
      if (!map[v.userId]) map[v.userId] = 0;
      map[v.userId] += v.days;
    }
    return map;
  }, [vacations]);
  const scheduled = vacations.filter(v => v.status === "scheduled").length;
  const approved  = vacations.filter(v => v.status === "approved").length;
  const totalDays = vacations.filter(v => v.status !== "cancelled").reduce((s, v) => s + v.days, 0);
  const soonVacations = useMemo(() => {
    const todayStr = today();
    return vacations
      .filter(v => v.startDate > todayStr && v.status !== "cancelled")
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 4)
      .map(v => {
        const diff = Math.ceil((new Date(v.startDate + "T12:00:00") - new Date()) / 86400000);
        return { ...v, daysUntil: diff };
      });
  }, [vacations]);

  const previewDays = form.startDate && form.endDate && form.endDate >= form.startDate ? calcDays(form.startDate, form.endDate) : null;

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200, margin: "0 auto", overflowY: "auto" }}>

      {/* Toast */}
      {flash && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: flash.ok ? "#16a34a" : "#dc2626", color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px #0004", display: "flex", alignItems: "center", gap: 8 }}>
          {flash.ok ? <CheckCircle size={15} /> : <AlertTriangle size={15} />} {flash.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: T.t1, margin: 0, display: "flex", alignItems: "center", gap: 11 }}><span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", background: T.accent + "1f", color: T.accent, flexShrink: 0 }}><Umbrella size={18} /></span>Controle de Férias</h1>
          <p style={{ color: T.t7, fontSize: 13, margin: "4px 0 0" }}>Agendamento, aprovação e histórico de férias da equipe</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <VacExportMenu T={T} filename="ferias-equipe" data={vacations.filter(v => v.status !== "cancelled").map(v => ({
            Funcionário: v.fullName || v.username || "",
            Grupo: v.groupName || "—",
            "Início": v.startDate,
            "Fim": v.endDate,
            "Dias": v.days,
            "Status": v.status === "approved" ? "Aprovado" : v.status === "completed" ? "Concluído" : v.status === "scheduled" ? "Agendado" : v.status,
            "Período Aq. Início": v.acqStart || "",
            "Período Aq. Fim": v.acqEnd || "",
            "Dias Direito": v.daysEntitled || 30,
            "Observações": v.notes || "",
            "Aprovado Por": v.approvedByName || "",
          }))} />
          {admin && (
            <button onClick={() => setShowImport(true)}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", background: T.bgCard, color: T.t2, border: `1px solid ${T.border}`, borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}>
              <Upload size={14} /> Importar CSV
            </button>
          )}
          {leader && (
            <div style={{ display: "flex", background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 9, padding: 3, gap: 2 }}>
              {[
                { id: "list",      label: "Lista",      icon: Layers },
                { id: "teams",     label: "Equipes",    icon: Users },
                { id: "approvals", label: admin ? "Aprovações" : "Pendentes", icon: Clock, badge: vacations.filter(v => v.status === "scheduled").length },
              ].map(({ id, label, icon: Icon, badge }) => (
                <button key={id} onClick={() => setViewTab(id)}
                  style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: viewTab === id ? 700 : 500, background: viewTab === id ? T.bgCard : "transparent", color: viewTab === id ? T.t1 : T.t7, boxShadow: viewTab === id ? "0 1px 4px #00000022" : "none", transition: "background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s" }}>
                  <Icon size={13} /> {label}
                  {badge > 0 && (
                    <span style={{ position: "absolute", top: 1, right: 1, width: 14, height: 14, borderRadius: "50%", background: "#FBBF24", color: "#000", fontSize: 8, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>{badge > 9 ? "9+" : badge}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {leader && (
            <button onClick={openCreate}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", background: T.accent, color: "#fff", border: "none", borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}>
              <Plus size={15} /> Agendar Férias
            </button>
          )}
        </div>
      </div>

      {/* Personal vacation summary strip */}
      {mySummary && (
        <>
          <div style={{ fontSize: 10, color: T.t9, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <Umbrella size={11} style={{ color: T.t9 }} /> RESUMO PESSOAL
          </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <div style={{ flex: "0 0 auto", minWidth: 155, padding: "12px 16px", background: T.bgCard, border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.accent}`, borderRadius: 10 }}>
            <div style={{ fontSize: 9, color: T.t9, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>SEU SALDO — {user?.fullName?.split(" ")[0]}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: mySummary.daysRemaining > 0 ? T.accent : "#F87171", lineHeight: 1 }}>{mySummary.daysRemaining}</span>
              <span style={{ fontSize: 11, color: T.t7 }}>de {mySummary.daysEntitled}d</span>
            </div>
            {mySummary.acqStart && <div style={{ fontSize: 10, color: T.t9, marginTop: 2 }}>Período aq.: {fmtDate(mySummary.acqStart)}</div>}
            {mySummary.concEnd && <div style={{ fontSize: 10, color: T.t9, marginTop: 1 }}>Prazo: {fmtDate(mySummary.concEnd)}</div>}
          </div>
          {/* Todos os proximos periodos */}
          <div style={{ flex: 1, minWidth: 240, padding: "12px 16px", background: myUpcomingPeriods.length > 0 ? "#34D39910" : "#FBBF2408", border: "1px solid " + (myUpcomingPeriods.length > 0 ? "#34D39930" : "#FBBF2430"), borderLeft: "3px solid " + (myUpcomingPeriods.length > 0 ? "#34D399" : "#FBBF24"), borderRadius: 10 }}>
            <div style={{ fontSize: 9, color: myUpcomingPeriods.length > 0 ? "#34D399" : "#FBBF24", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 6 }}>
              {"PRÓXIMOS PERÍODOS" + (myUpcomingPeriods.length > 1 ? " (" + myUpcomingPeriods.length + ")" : "")}
            </div>
            {myUpcomingPeriods.length > 0 ? myUpcomingPeriods.map((v, i) => {
              const du = daysUntil(v.startDate);
              const isNow = v.startDate <= today() && v.endDate >= today();
              return (
                <div key={v.id} style={{ marginBottom: i < myUpcomingPeriods.length - 1 ? 8 : 0, paddingBottom: i < myUpcomingPeriods.length - 1 ? 8 : 0, borderBottom: i < myUpcomingPeriods.length - 1 ? "1px solid #34D39920" : "none" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.t1 }}>{fmtDate(v.startDate)} — {fmtDate(v.endDate)}</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#34D399" }}>{v.days} dias</span>
                    {isNow && <span style={{ fontSize: 10, fontWeight: 700, color: "#FBBF24" }}>🏖️ Em férias!</span>}
                    {!isNow && du !== null && du > 0 && <span style={{ fontSize: 10, color: T.t7 }}>em {du} dia{du !== 1 ? "s" : ""}</span>}
                    <StatusBadge status={v.status} />
                  </div>
                </div>
              );
            }) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Umbrella size={15} style={{ color: "#FBBF24", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#FBBF24" }}>Nenhuma férias agendada</div>
                  <div style={{ fontSize: 11, color: T.t7, marginTop: 2 }}>{leader ? "Use o botão acima para agendar" : "Fale com seu líder para agendar!"}</div>
                </div>
              </div>
            )}
          </div>
          {mySummary.lastVacation && (
            <div style={{ flex: "0 0 auto", minWidth: 175, padding: "12px 16px", background: T.bgCard, border: `1px solid ${T.border}`, borderLeft: "3px solid #A78BFA", borderRadius: 10 }}>
              <div style={{ fontSize: 9, color: T.t9, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>ÚLTIMAS FÉRIAS</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.t2 }}>{fmtDate(mySummary.lastVacation.start_date)}</div>
              <div style={{ fontSize: 11, color: T.t7 }}>até {fmtDate(mySummary.lastVacation.end_date)} · {mySummary.lastVacation.days}d</div>
            </div>
          )}
        </div>
        </>
      )}

      {viewTab === "list" && leader && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Agendadas",   value: scheduled,            color: "#60A5FA", icon: Clock },
            { label: "Aprovadas",   value: approved,             color: "#34D399", icon: CheckCircle },
            { label: "Em férias",   value: onVacation.length,    color: "#FBBF24", icon: Sun },
          ].map(({ label, value, color, icon: Icon }) => (
            <Card key={label} style={{ padding: "16px 18px", borderTop: `3px solid ${color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: T.t9, fontWeight: 700, letterSpacing: "0.06em" }}>{label.toUpperCase()}</span>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: color + "1A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={14} color={color} />
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
            </Card>
          ))}
          <Card style={{ padding: "16px 18px", borderTop: "3px solid #A78BFA" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <span style={{ fontSize: 10, color: T.t9, fontWeight: 700, letterSpacing: "0.06em" }}>EM BREVE</span>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: "#A78BFA1A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ChevronRight size={14} color="#A78BFA" />
              </div>
            </div>
            {soonVacations.length === 0 ? (
              <div style={{ fontSize: 11, color: T.t9 }}>Nenhuma férias próxima</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {soonVacations.map(v => (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 6, height: 6, borderRadius: 99, background: v.groupColor || "#A78BFA", flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: T.t2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
                      {v.fullName?.split(" ")[0]}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#A78BFA", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                      {v.daysUntil === 1 ? "amanhã" : `em ${v.daysUntil}d`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {viewTab === "list" && (
        <div>
      {/* On vacation now alert */}
      {onVacation.length > 0 && (
        <div style={{ marginBottom: 16, padding: "12px 16px", background: "#FBBF2418", border: "1px solid #FBBF2440", borderRadius: 10, display: "flex", alignItems: "center", gap: 12 }}>
          <Sun size={16} style={{ color: "#FBBF24", flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: T.t2 }}>
            <strong>{onVacation.map(v => v.fullName).join(", ")}</strong> {onVacation.length === 1 ? "está" : "estão"} de férias agora.
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ background: T.bgCard, borderRadius: 12, padding: "14px 16px", border: `1px solid ${T.border}`, marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search size={13} style={{ position: "absolute", left: 9, color: T.t9, pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={searchName}
            onChange={e => setSearchName(e.target.value)}
            style={{ ...inputStyle, width: 190, padding: "6px 10px 6px 28px" }}
          />
          {searchName && (
            <button onClick={() => setSearchName("")} style={{ position: "absolute", right: 7, background: "none", border: "none", cursor: "pointer", color: "inherit", display: "flex", alignItems: "center", padding: 0, opacity: 0.5 }}>
              <X size={12} />
            </button>
          )}
        </div>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}
          style={{ ...inputStyle, width: 160, padding: "6px 10px" }}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {leader && groups.length > 0 && (
          <select value={fGroup} onChange={e => setFGroup(e.target.value)}
            style={{ ...inputStyle, width: 180, padding: "6px 10px" }}>
            <option value="">Todos os grupos</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="date" value={fDateFrom} onChange={e => setFDateFrom(e.target.value)}
            style={{ ...inputStyle, width: "auto", padding: "6px 10px" }} />
          <span style={{ fontSize: 12, color: T.t9 }}>até</span>
          <input type="date" value={fDateTo} onChange={e => setFDateTo(e.target.value)}
            style={{ ...inputStyle, width: "auto", padding: "6px 10px" }} />
        </div>
        <button onClick={fetchVacations}
          style={{ padding: "6px 14px", background: T.accent, color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}>
          ↻ Filtrar
        </button>
        <div style={{ marginLeft: "auto", fontSize: 12, color: T.t7 }}>
          {searchName
            ? `${vacations.filter(v => v.fullName.toLowerCase().includes(searchName.toLowerCase())).length} de ${vacations.length} registro(s)`
            : `${vacations.length} registro(s)`}
        </div>
      </div>

      {/* Table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.borderSubtle}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.t1 }}>Registros de Férias</span>
          {upcoming.length > 0 && (
            <span style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>
              📅 {upcoming.length} próximas marcadas
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: T.t9, fontSize: 14 }}>Carregando...</div>
        ) : vacations.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <Umbrella size={42} style={{ color: T.t9, marginBottom: 14, display: "block", margin: "0 auto 14px" }} />
            <div style={{ fontSize: 14, color: T.t7, marginBottom: 6 }}>Nenhum registro de férias no período</div>
            {leader && !admin && <div style={{ fontSize: 12, color: T.t9 }}>Use "Agendar Férias" para registrar férias da sua equipe — o RH irá aprovar.</div>}
            {admin && <div style={{ fontSize: 12, color: T.t9 }}>Use "Agendar Férias" ou importe um arquivo CSV com o histórico.</div>}
            {!leader && <div style={{ fontSize: 12, color: T.t9 }}>Fale com seu líder para agendar suas férias. 🏖️</div>}
          </div>
        ) : (searchName ? vacations.filter(v => v.fullName.toLowerCase().includes(searchName.toLowerCase())) : vacations).map((v, i) => {
          const du = daysUntil(v.startDate);
          const isNow = v.startDate <= today() && v.endDate >= today();
          return (
            <div key={v.id} style={{ display: "grid", gridTemplateColumns: "48px 1fr 200px 100px 120px auto", alignItems: "start", gap: 12, padding: "14px 16px", borderBottom: `1px solid ${T.borderRow}`, background: isNow ? T.accent + "08" : i % 2 === 0 ? "transparent" : T.bgRowAlt }}>
              <Avatar name={v.fullName} size={36} color={v.groupColor || T.accent} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.t1 }}>{v.fullName}</div>
                <div style={{ fontSize: 11, color: T.t9 }}>{v.groupName || v.dept || "—"}</div>
                {v.notes && <div style={{ fontSize: 11, color: T.t8, fontStyle: "italic", marginTop: 2 }}>"{v.notes}"</div>}
                {v.acqStart && (
                  <div style={{ fontSize: 10, color: T.t9, marginTop: 2 }}>Período aq.: {fmtDate(v.acqStart)} → {fmtDate(v.acqEnd)}</div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.t1 }}>{fmtDate(v.startDate)}</div>
                <div style={{ fontSize: 11, color: T.t7 }}>até {fmtDate(v.endDate)}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, marginTop: 2 }}>{v.days} dias</div>
                {isNow && <span style={{ fontSize: 10, fontWeight: 700, color: "#FBBF24" }}>🏖️ EM FÉRIAS</span>}
                {!isNow && du !== null && du > 0 && v.status !== "cancelled" && (
                  <div style={{ fontSize: 10, color: T.t9 }}>em {du} dia{du !== 1 ? "s" : ""}</div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, color: T.t9 }}>Saldo</div>
                {(() => { const used = userBalances[v.userId] || 0; const rem = Math.max(0, 30 - used); return (<><div style={{ fontSize: 18, fontWeight: 800, color: rem > 0 ? T.accent : "#F87171" }}>{rem}d</div><div style={{ fontSize: 10, color: T.t9 }}>{used}d usados</div></>); })()}
              </div>
              <div>
                <StatusBadge status={v.status} />
                {v.approvedByName && <div style={{ fontSize: 10, color: T.t9, marginTop: 3 }}>por {v.approvedByName}</div>}
              </div>
              <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                {admin && v.status === "scheduled" && (
                  <button onClick={() => handleApprove(v)}
                    style={{ background: "#34D39918", border: "1px solid #34D39940", borderRadius: 7, padding: "5px 10px", cursor: "pointer", color: "#34D399", fontSize: 11, fontWeight: 600, fontFamily: "'Sora',sans-serif" }}>
                    Aprovar
                  </button>
                )}
                {leader && (
                  <button onClick={() => openEdit(v)}
                    style={{ background: T.accent + "18", border: `1px solid ${T.accent}40`, borderRadius: 7, padding: "5px 7px", cursor: "pointer", color: T.accent }}>
                    <Edit2 size={12} />
                  </button>
                )}
                {admin && (
                  <button onClick={() => handleDelete(v.id)}
                    style={{ background: "#ff445512", border: "1px solid #ff445530", borderRadius: 7, padding: "5px 7px", cursor: "pointer", color: "#ff7a7a" }}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </Card>
        </div>
      )}

      {/* ══ APPROVALS VIEW ══ */}
      {viewTab === "approvals" && leader && (
        <div>
          {(() => {
            const pending = vacations.filter(v => v.status === "scheduled");
            return pending.length === 0 ? (
              <div style={{ padding: 56, textAlign: "center" }}>
                <CheckCircle size={44} style={{ color: "#34D399", display: "block", margin: "0 auto 14px", opacity: 0.7 }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: T.t2, marginBottom: 4 }}>Tudo em dia!</div>
                <div style={{ fontSize: 13, color: T.t7 }}>Nenhuma férias aguardando aprovação.</div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 14, padding: "10px 16px", background: "#FBBF2410", border: "1px solid #FBBF2440", borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
                  <Clock size={15} style={{ color: "#FBBF24", flexShrink: 0 }} />
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#FBBF24" }}>{pending.length} registro{pending.length !== 1 ? "s" : ""} aguardando aprovação do RH</span>
                    {!admin && <div style={{ fontSize: 11, color: "#FBBF2499", marginTop: 2 }}>Você agendou estas férias — o RH precisa aprovar para confirmar.</div>}
                  </div>
                </div>
                {pending.map((v) => (
                  <Card key={v.id} style={{ marginBottom: 12, padding: "16px 18px", border: "1px solid #FBBF2428" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                      <Avatar name={v.fullName} size={42} color={v.groupColor || T.accent} />
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: T.t1 }}>{v.fullName}</div>
                        <div style={{ fontSize: 12, color: T.t7 }}>{v.groupName || v.dept || "—"} · {v.daysEntitled}d de direito</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.t1, marginTop: 4 }}>
                          {fmtDate(v.startDate)} → {fmtDate(v.endDate)}
                          <span style={{ marginLeft: 8, color: T.accent, fontSize: 12 }}>({v.days} dias)</span>
                        </div>
                        {v.notes && <div style={{ fontSize: 11, color: T.t8, fontStyle: "italic", marginTop: 3 }}>"{v.notes}"</div>}
                        <div style={{ fontSize: 10, color: T.t9, marginTop: 3 }}>
                          Agendado por {v.createdByName} · {new Date(v.createdAt).toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        {admin && (
                          <button onClick={() => handleApprove(v)}
                            style={{ padding: "8px 18px", background: "#34D39918", border: "1px solid #34D39944", borderRadius: 8, color: "#34D399", cursor: "pointer", fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                            <CheckCircle size={13} /> Aprovar
                          </button>
                        )}
                        <button onClick={() => openEdit(v)}
                          style={{ padding: "8px 12px", background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 8, color: T.t3, cursor: "pointer" }}>
                          <Edit2 size={13} />
                        </button>
                        {admin && (
                          <button onClick={() => handleDelete(v.id)}
                            style={{ padding: "8px 12px", background: "#ff445512", border: "1px solid #ff445530", borderRadius: 8, color: "#ff7a7a", cursor: "pointer" }}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </>
            );
          })()}
        </div>
      )}

      {/* ══ TEAMS VIEW ══ */}
      {viewTab === "teams" && leader && (
        <div>
          {tvLoading && (
            <div style={{ padding: 60, textAlign: "center", color: T.t9, fontSize: 14 }}>
              <Users size={40} style={{ color: T.t9, display: "block", margin: "0 auto 14px", opacity: 0.3 }} />
              Carregando equipes...
            </div>
          )}

          {!tvLoading && teamView.length === 0 && (
            <div style={{ padding: 60, textAlign: "center", color: T.t9 }}>
              <Users size={40} style={{ color: T.t9, display: "block", margin: "0 auto 14px", opacity: 0.3 }} />
              <div style={{ fontSize: 14 }}>Nenhum grupo encontrado</div>
            </div>
          )}

          {!tvLoading && teamView.map(g => {
            const isOpen = expandedGroups[g.id] !== false;
            const onVacNow = g.members.filter(m => m.isOnVacation);
            return (
              <Card key={g.id} style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
                {/* Group header */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: T.bgDeep, cursor: "pointer", borderLeft: `4px solid ${g.color || T.accent}` }}
                  onClick={() => toggleGroup(g.id)}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: (g.color || T.accent) + "22", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Users size={18} color={g.color || T.accent} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: T.t1 }}>{g.name}</div>
                    <div style={{ fontSize: 12, color: T.t7, marginTop: 2, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {g.leaderName && (
                        <span>👤 Líder: <strong style={{ color: T.t2 }}>{g.leaderName}</strong>{g.leaderTitle ? ` — ${g.leaderTitle}` : ""}</span>
                      )}
                      {g.coLeaders?.length > 0 && (
                        <span>Co-líderes: <strong style={{ color: T.t2 }}>{g.coLeaders.map(c => c.full_name).join(", ")}</strong></span>
                      )}
                      {g.dept && <span style={{ color: T.t9 }}>{g.dept}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: T.t7 }}>{g.members.length} membro{g.members.length !== 1 ? "s" : ""}</span>
                    {onVacNow.length > 0 && (
                      <span style={{ padding: "2px 8px", background: "#FBBF2418", border: "1px solid #FBBF2440", borderRadius: 10, fontSize: 11, fontWeight: 700, color: "#FBBF24" }}>
                        🏖️ {onVacNow.length} em férias
                      </span>
                    )}
                    {g.scheduledCount > 0 && (
                      <span style={{ padding: "2px 8px", background: "#60A5FA18", border: "1px solid #60A5FA40", borderRadius: 10, fontSize: 11, fontWeight: 600, color: "#60A5FA" }}>
                        📅 {g.scheduledCount} agendado{g.scheduledCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    {isOpen ? <ChevronDown size={16} style={{ color: T.t7 }} /> : <ChevronRight size={16} style={{ color: T.t7 }} />}
                  </div>
                </div>

                {/* Members table */}
                {isOpen && (
                  <div style={{ overflowX: "auto" }}>
                    {g.members.length === 0 ? (
                      <div style={{ padding: "20px 18px", fontSize: 13, color: T.t9 }}>Nenhum membro neste grupo.</div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: T.bgCard }}>
                            {["Funcionário", "Cargo / Setor", "1º Período", "2º Período", "Saldo", "Status"].map(h => (
                              <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.t8, letterSpacing: "0.06em", whiteSpace: "nowrap", borderBottom: `1px solid ${T.border}` }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {g.members.map((m, i) => (
                            <tr key={m.id} style={{ borderBottom: `1px solid ${T.borderRow}`, background: m.isOnVacation ? "#FBBF2408" : i % 2 === 0 ? "transparent" : T.bgRowAlt }}>
                              <td style={{ padding: "11px 14px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: (g.color || T.accent) + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: g.color || T.accent, flexShrink: 0 }}>
                                    {(m.fullName || "?")[0].toUpperCase()}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 700, color: T.t1 }}>{m.fullName}</div>
                                    <div style={{ fontSize: 10, color: T.t9 }}>{m.username}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: "11px 14px", color: T.t7 }}>
                                {m.title && <div style={{ fontWeight: 600, color: T.t2 }}>{m.title}</div>}
                                <div style={{ fontSize: 11, color: T.t9 }}>{m.dept || "—"}</div>
                              </td>
                              <td style={{ padding: "11px 14px" }}>
                                {m.allPeriods && m.allPeriods[0] ? (() => { const p = m.allPeriods[0]; const isPast = p.endDate < new Date().toISOString().slice(0,10); return (<div><div style={{ fontWeight: 600, color: isPast ? T.t7 : T.t2 }}>{new Date(p.startDate+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})}</div><div style={{ fontSize: 11, color: T.t9 }}>até {new Date(p.endDate+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"})}</div><div style={{ fontSize: 11, fontWeight: 700, color: isPast ? "#A78BFA" : "#60A5FA" }}>{p.days}d · <StatusBadge status={p.status} /></div></div>); })() : <span style={{ color: T.t9 }}>—</span>}
                              </td>
                              <td style={{ padding: "11px 14px" }}>
                                {m.allPeriods && m.allPeriods[1] ? (() => { const p = m.allPeriods[1]; const isPast = p.endDate < new Date().toISOString().slice(0,10); const extra = m.allPeriods.length - 2; return (<div><div style={{ fontWeight: 600, color: isPast ? T.t7 : T.t2 }}>{new Date(p.startDate+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})}</div><div style={{ fontSize: 11, color: T.t9 }}>até {new Date(p.endDate+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"})}</div><div style={{ fontSize: 11, fontWeight: 700, color: isPast ? "#A78BFA" : "#60A5FA", display:"flex", gap:4, alignItems:"center" }}>{p.days}d · <StatusBadge status={p.status} />{extra > 0 && <span style={{ fontSize: 9, color: T.t9, background: T.bgDeep, borderRadius: 4, padding: "1px 5px" }}>+{extra} mais</span>}</div></div>); })() : <span style={{ color: T.t9 }}>—</span>}
                              </td>
                              <td style={{ padding: "11px 14px", textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 900, color: m.daysRemaining > 10 ? T.accent : m.daysRemaining > 0 ? "#F59E0B" : "#F87171", lineHeight: 1 }}>{m.daysRemaining}</div>
                                <div style={{ fontSize: 10, color: T.t9, marginTop: 2 }}>de 30 dias</div>
                                {m.acqStart && (
                                  <div style={{ fontSize: 9, color: T.t10, marginTop: 1 }}>
                                    {new Date(m.acqStart+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})} → {new Date(m.acqEnd+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit"})}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: "11px 14px" }}>
                                {m.isOnVacation ? (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#FBBF2418", color: "#FBBF24" }}>
                                    🏖️ Em férias
                                  </span>
                                ) : m.nextVacStart && m.nextVacStatus ? (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                                    background: m.nextVacStatus === "approved" ? "#34D39918" : "#60A5FA18",
                                    color: m.nextVacStatus === "approved" ? "#34D399" : "#60A5FA" }}>
                                    {m.nextVacStatus === "approved" ? "✓ Aprovado" : "⏳ Agendado"}
                                  </span>
                                ) : (
                                  <button onClick={() => { openCreate(m.id); setViewTab("list"); }}
                                    style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:600, background:T.accent+"18", border:`1px solid ${T.accent}40`, color:T.accent, cursor:"pointer", fontFamily:"'Sora',sans-serif" }}>
                                    <Plus size={10}/> Agendar
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editRecord ? "Editar Férias" : "Agendar Férias"} T={T}>
        <form onSubmit={handleSubmit}>
          {leader && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>FUNCIONÁRIO *</label>
              <select value={form.userId} onChange={e => setF("userId", e.target.value)} style={inputStyle} required>
                {admin
                  ? <>
                      <option value={user.id}>{user.fullName} (eu)</option>
                      {users.filter(u => u.id !== user.id).map(u => (
                        <option key={u.id} value={u.id}>{u.full_name || u.fullName}</option>
                      ))}
                    </>
                  : teamUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.fullName}{u.id === user.id ? " (eu)" : ""}</option>
                    ))
                }
              </select>
              {formUserSummary && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ padding: "8px 12px", background: T.bgDeep, borderRadius: 7, border: `1px solid ${formUserSummary.hasOverride ? T.accent + "55" : T.border}`, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontSize: 11 }}>
                    <span style={{ color: T.t7 }}>
                      Saldo: <strong style={{ color: formUserSummary.daysRemaining > 0 ? T.accent : "#F87171" }}>{formUserSummary.daysRemaining}d</strong>
                      <span style={{ color: T.t9 }}> / {formUserSummary.daysEntitled}d direito</span>
                      {formUserSummary.daysUsed > 0 && <span style={{ color: T.t9 }}> ({formUserSummary.daysUsed}d usados)</span>}
                    </span>
                    {admin && formUserSummary.acqStart && (
                      <span style={{ color: T.t7 }}>
                        Período aq.: <strong style={{ color: formUserSummary.hasOverride ? T.accent : T.t2 }}>{fmtDate(formUserSummary.acqStart)}</strong> → <strong style={{ color: formUserSummary.hasOverride ? T.accent : T.t2 }}>{fmtDate(formUserSummary.acqEnd)}</strong>
                        {formUserSummary.hasOverride && <span style={{ color: T.accent, fontSize: 9, marginLeft: 3 }}>✎ manual</span>}
                      </span>
                    )}
                    {formUserSummary.concEnd && (
                      <span style={{ color: T.t9 }}>
                        Prazo concessivo: <strong style={{ color: formUserSummary.daysRemaining > 0 ? "#F59E0B" : T.t7 }}>{new Date(formUserSummary.concEnd+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"})}</strong>
                      </span>
                    )}
                    {admin && (
                      <button type="button" onClick={() => {
                        setPeriodForm({
                          acqOverrideStart: formUserSummary.acqStart || "",
                          acqOverrideEnd:   formUserSummary.acqEnd   || "",
                          concOverrideEnd:  formUserSummary.concEnd  || "",
                        });
                        setShowPeriodEdit(s => !s);
                      }} style={{ marginLeft: "auto", padding: "2px 9px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 10, color: T.t7, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}>
                        {showPeriodEdit ? "Fechar" : "✎ Editar período"}
                      </button>
                    )}
                  </div>

                  {admin && showPeriodEdit && (
                    <div style={{ marginTop: 8, padding: "12px 14px", background: T.bgCard, border: `1px solid ${T.accent}33`, borderRadius: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, marginBottom: 10, letterSpacing: "0.06em" }}>PERÍODO AQUISITIVO (OVERRIDE RH)</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 9, color: T.t9, marginBottom: 3 }}>INÍCIO PERÍODO AQ.</div>
                          <input type="date" value={periodForm.acqOverrideStart}
                            onChange={e => setPeriodForm(p => ({ ...p, acqOverrideStart: e.target.value }))}
                            style={{ width: "100%", background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 8px", color: T.t1, fontSize: 11, fontFamily: "'Sora',sans-serif", boxSizing: "border-box" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: T.t9, marginBottom: 3 }}>FIM PERÍODO AQ.</div>
                          <input type="date" value={periodForm.acqOverrideEnd}
                            onChange={e => setPeriodForm(p => ({ ...p, acqOverrideEnd: e.target.value }))}
                            style={{ width: "100%", background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 8px", color: T.t1, fontSize: 11, fontFamily: "'Sora',sans-serif", boxSizing: "border-box" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: T.t9, marginBottom: 3 }}>PRAZO CONCESSIVO</div>
                          <input type="date" value={periodForm.concOverrideEnd}
                            onChange={e => setPeriodForm(p => ({ ...p, concOverrideEnd: e.target.value }))}
                            style={{ width: "100%", background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 8px", color: T.t1, fontSize: 11, fontFamily: "'Sora',sans-serif", boxSizing: "border-box" }} />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                        {formUserSummary.hasOverride && (
                          <button type="button" onClick={() => savePeriodOverride(form.userId, true)} disabled={savingPeriod}
                            style={{ padding: "5px 12px", background: "transparent", border: `1px solid #F87171`, borderRadius: 6, color: "#F87171", fontSize: 11, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}>
                            Resetar automático
                          </button>
                        )}
                        <button type="button" onClick={() => setShowPeriodEdit(false)}
                          style={{ padding: "5px 12px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 6, color: T.t7, fontSize: 11, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}>
                          Cancelar
                        </button>
                        <button type="button" onClick={() => savePeriodOverride(form.userId)} disabled={savingPeriod}
                          style={{ padding: "5px 14px", background: T.accent, border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}>
                          {savingPeriod ? "Salvando..." : "Salvar"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>INÍCIO *</label>
              <input type="date" value={form.startDate} onChange={e => setF("startDate", e.target.value)} style={inputStyle} required />
            </div>
            <div>
              <label style={labelStyle}>FIM *</label>
              <input type="date" value={form.endDate} min={form.startDate} onChange={e => setF("endDate", e.target.value)} style={inputStyle} required />
            </div>
          </div>

          {previewDays !== null && (
            <div style={{ marginBottom: 16, padding: "10px 14px", background: T.accent + "14", border: `1px solid ${T.accent}33`, borderRadius: 8, fontSize: 13, color: T.t2 }}>
              <strong style={{ color: T.accent }}>{previewDays} dias corridos</strong> de férias
              {previewDays < 14 && <span style={{ color: "#F59E0B", marginLeft: 8 }}>⚠ Mínimo recomendado: 14 dias (CLT)</span>}
              {formUserSummary && formUserSummary.daysRemaining > 0 && previewDays > formUserSummary.daysRemaining && (
                <span style={{ color: "#F87171", marginLeft: 8 }}>⚠ Excede o saldo ({formUserSummary.daysRemaining}d disponíveis)</span>
              )}
              {formUserSummary && formUserSummary.daysRemaining <= 0 && (
                <span style={{ color: "#F87171", marginLeft: 8 }}>⚠ Saldo zerado neste período aquisitivo</span>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>DIAS A QUE TEM DIREITO</label>
              <input type="number" value={form.daysEntitled} min={1} max={60} onChange={e => setF("daysEntitled", Number(e.target.value))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>STATUS</label>
              <select value={form.status} onChange={e => setF("status", e.target.value)} style={inputStyle}>
                {Object.entries(STATUS_CONFIG)
                  .filter(([k]) => admin || ["scheduled","cancelled"].includes(k))
                  .map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              {!admin && <div style={{ fontSize: 10, color: T.t9, marginTop: 4 }}>A aprovação é feita pelo RH após o agendamento.</div>}
            </div>
          </div>

          {admin && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>INÍCIO PERÍODO AQUISITIVO</label>
              <input type="date" value={form.acqStart} onChange={e => setF("acqStart", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>FIM PERÍODO AQUISITIVO</label>
              <input type="date" value={form.acqEnd} onChange={e => setF("acqEnd", e.target.value)} style={inputStyle} />
            </div>
          </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>OBSERVAÇÕES</label>
            <textarea value={form.notes} onChange={e => setF("notes", e.target.value)} rows={3}
              placeholder="Observações sobre este período de férias..." style={{ ...inputStyle, resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setShowForm(false)}
              style={{ padding: "8px 18px", background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 8, color: T.t7, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              style={{ padding: "8px 20px", background: T.accent, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Sora',sans-serif", opacity: saving ? 0.7 : 1 }}>
              {saving ? "Salvando..." : editRecord ? "Salvar Alterações" : "Agendar"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <ImportModal open={showImport} onClose={() => setShowImport(false)} T={T} onImported={() => { setShowImport(false); fetchVacations(); fetchMySummary(); showMsg("Importação concluída!"); }} />
    </div>
  );
}
