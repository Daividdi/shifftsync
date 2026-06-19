import React, { useState, useEffect, useCallback } from "react";
import { Download, Search, Users, CheckCircle, XCircle, TrendingUp, Award, Activity, AlertTriangle, UserX, DoorOpen, Fingerprint, AlertOctagon, Clock, Umbrella, Sun, Calendar, BarChart3 } from "lucide-react";
import { Card, Badge, Avatar, Btn, Input, Select } from "../components/UI";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, Area, ComposedChart, ReferenceLine,
} from "recharts";
import api from "../api/client";
import FormsReport from "./FormsReport";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const LIMIT_SEC   = 900;

function secToHuman(s) {
  if (!s && s!==0) return "—";
  const m = Math.floor(Math.abs(s)/60);
  const sec = Math.abs(s)%60;
  return sec>0 ? `${m}m ${sec}s` : `${m}m`;
}

function secToMMSS(s) {
  if (!s && s!==0) return "—";
  const m = Math.floor(Math.abs(s)/60);
  const sec = Math.abs(s)%60;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

function monthLabel(ym) {
  if (!ym) return "";
  const [y,m] = ym.split("-");
  return `${MONTH_NAMES[parseInt(m)-1]}/${y.slice(2)}`;
}


// ── Utilitários de exportação ─────────────────────────────

// Títulos amigáveis em português por nome de arquivo
const REPORT_TITLES = {
  "ausencias-ranking-colaboradores": "Ausências — Ranking de Colaboradores",
  "ausencias-por-grupo":             "Ausências por Grupo",
  "ausencias-desvios-colaboradores": "Ausências — Desvios por Colaborador",
  "ocorrencias-detalhado":           "Ocorrências — Detalhado",
  "relatorio-grupos-times":          "Relatório de Grupos e Times",
  "trocas-detalhado":                "Trocas de Turno — Detalhado",
  "sala-reuniao-uso-por-lider":      "Sala de Reunião — Uso por Líder",
  "ferias-historico":                "Férias — Histórico Completo",
  "ferias-relatorio":                "Férias — Relatório Geral",
  "compliance-ferias":               "Férias — Compliance CLT",
  "ponto-por-funcionario":           "Ponto — Resumo por Funcionário",
  "ponto-relatorio":                 "Ponto — Relatório Geral",
  "controle-ponto":                  "Controle de Ponto",
  "ferias-equipe":                   "Férias da Equipe",
};

function reportTitle(filename) {
  if (REPORT_TITLES[filename]) return REPORT_TITLES[filename];
  const lower = ["de","do","da","dos","das","e","em","a","o","ao","para","por","com","no","na"];
  return filename.replace(/-/g, " ")
    .split(" ")
    .map((w, i) => (i === 0 || !lower.includes(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w)
    .join(" ");
}

// ── Logo loader (cached per session) ─────────────────────
let _logoWhiteB64 = null, _logoBlueB64 = null;
async function getLogoWhiteB64() {
  if (_logoWhiteB64) return _logoWhiteB64;
  try {
    const r = await fetch("/angeltreat-logo-white.png");
    if (!r.ok) return null;
    const blob = await r.blob();
    return new Promise(resolve => {
      const fr = new FileReader();
      fr.onloadend = () => { _logoWhiteB64 = fr.result; resolve(fr.result); };
      fr.onerror   = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}
async function getLogoBlueB64() {
  if (_logoBlueB64) return _logoBlueB64;
  try {
    const r = await fetch("/angeltreat-logo.png");
    if (!r.ok) return null;
    const blob = await r.blob();
    return new Promise(resolve => {
      const fr = new FileReader();
      fr.onloadend = () => { _logoBlueB64 = fr.result; resolve(fr.result); };
      fr.onerror   = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

function downloadExcel(data, filename, sheetName) {
  if (!data || data.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(data);
  const keys = Object.keys(data[0]);
  ws["!cols"] = keys.map(k => ({
    wch: Math.min(50, Math.max(k.length + 2, ...data.map(r => String(r[k] ?? "").length + 1)))
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, reportTitle(filename).slice(0, 31));
  XLSX.writeFile(wb, filename + ".xlsx");
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename + ".json";
  a.click(); URL.revokeObjectURL(url);
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
  const HEADER_H = 28;
  const FOOTER_H = 14;
  const title = reportTitle(filename);
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // Fetch both logos before drawing — awaited so they are available on page 1
  const [logoWhite, logoBlue] = await Promise.all([getLogoWhiteB64(), getLogoBlueB64()]);

  function drawHeader() {
    // Blue header bar
    doc.setFillColor(0, 144, 204);
    doc.rect(0, 0, pageW, HEADER_H, "F");
    // Darker accent strip at bottom of header
    doc.setFillColor(0, 108, 160);
    doc.rect(0, HEADER_H - 4, pageW, 4, "F");

    // White angelTREAT logo — right-aligned, vertically centered in header
    if (logoWhite) {
      const lH = 11;
      const lW = Math.round(lH * (1304 / 257));
      const lX = pageW - lW - 10;
      const lY = (HEADER_H - lH) / 2;
      try { doc.addImage(logoWhite, "PNG", lX, lY, lW, lH, undefined, "FAST"); } catch (_) {}
    }

    // Report title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(title, 10, 12);

    // Date + record count
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(185, 228, 248);
    doc.text(
      "Gerado em " + dateStr + "  ·  " + rows.length + " registro" + (rows.length !== 1 ? "s" : ""),
      10, HEADER_H - 6
    );
  }

  function drawFooter(pageNum, totalPages) {
    // Light footer bar
    doc.setFillColor(244, 247, 251);
    doc.rect(0, pageH - FOOTER_H, pageW, FOOTER_H, "F");
    doc.setDrawColor(208, 216, 228);
    doc.setLineWidth(0.3);
    doc.line(0, pageH - FOOTER_H, pageW, pageH - FOOTER_H);

    // Blue angelTREAT logo — left
    if (logoBlue) {
      const fH = 6;
      const fW = Math.round(fH * (1304 / 257));
      const fY = pageH - FOOTER_H + (FOOTER_H - fH) / 2;
      try { doc.addImage(logoBlue, "PNG", 10, fY, fW, fH, undefined, "FAST"); } catch (_) {}
    }

    // Page N of N — center
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(140, 150, 165);
    doc.text("Página " + pageNum + " de " + totalPages, pageW / 2, pageH - FOOTER_H / 2 + 1, { align: "center" });

    // Brand — right
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(0, 144, 204);
    doc.text("ShiftSync · Workforce Manager", pageW - 10, pageH - FOOTER_H / 2 + 1, { align: "right" });
  }

  // Draw first-page header
  drawHeader();

  // Render table
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: HEADER_H + 2,
    margin: { left: 10, right: 10, bottom: FOOTER_H + 2 },
    styles: {
      fontSize: 8.5,
      font: "helvetica",
      cellPadding: { top: 3.5, right: 5, bottom: 3.5, left: 5 },
      lineColor: [208, 216, 228],
      lineWidth: 0.15,
      textColor: [35, 45, 60],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [15, 25, 50],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      cellPadding: { top: 4.5, right: 5, bottom: 4.5, left: 5 },
    },
    alternateRowStyles: { fillColor: [246, 249, 253] },
    rowPageBreak: "auto",
    didDrawPage: (hd) => { if (hd.pageNumber > 1) drawHeader(); },
  });

  // Draw footers on all pages after table finishes
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(p, totalPages);
  }

  doc.save(filename + ".pdf");
}

function ExportMenu({ data, filename, T }) {
  const [open, setOpen] = useState(false);
  const hasData = data && data.length > 0;
  return (
    <div style={{position:"relative",display:"inline-block"}}>
      <button onClick={()=>hasData && setOpen(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",border:`1px solid ${T.border}`,borderRadius:8,background:T.bgCard,color:hasData?T.t6:T.t9,fontSize:12,fontWeight:600,cursor:hasData?"pointer":"default",fontFamily:"'Sora',sans-serif",opacity:hasData?1:0.5}}>
        <Download size={13}/> Exportar
      </button>
      {open&&(
        <>
          <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:99}}/>
          <div style={{position:"absolute",right:0,top:"110%",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:6,zIndex:100,minWidth:140,boxShadow:"0 8px 24px #00000033"}}>
            {[
              {label:"Excel (.xlsx)", icon:"📊", action:()=>{ downloadExcel(data, filename); setOpen(false); }},
              {label:"PDF",           icon:"📄", action:()=>{ downloadPDF(data, filename).catch(()=>{}); setOpen(false); }},
              {label:"JSON",          icon:"{ }", action:()=>{ downloadJSON(data, filename); setOpen(false); }},
            ].map((item,i)=>(
              <button key={i} onClick={item.action} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 12px",background:"none",border:"none",borderRadius:7,color:T.t3,fontSize:12,cursor:"pointer",textAlign:"left",fontFamily:"'Sora',sans-serif",transition:"background 0.1s"}}
                onMouseEnter={e=>e.currentTarget.style.background=T.bgDeep}
                onMouseLeave={e=>e.currentTarget.style.background="none"}>
                <span style={{fontSize:13,width:18,textAlign:"center"}}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}


    </div>
  );
}

const TABS = [
  { id:"overview",     label:"Visão Geral" },
  { id:"absences",     label:"Ausências" },
  { id:"occurrences",  label:"Ocorrências" },
  { id:"meeting",      label:"Sala de Reunião" },
  { id:"swaps",        label:"Trocas" },
  { id:"groups",       label:"Times" },
  { id:"users",        label:"Funcionários" },
  { id:"ponto",        label:"Ponto" },
  { id:"ferias",       label:"Férias" },
  { id:"forms",       label:"Formulários" },
];

export default function Reports() {
  const { user } = useAuth();
  const { theme: T } = useTheme();
  const isAdmin  = user.role==="hr"||user.role==="ti"||user.role==="gerencia";
  const isLeader = user.role==="leader"||user.role==="gerencia";

  const [tab, setTab]           = useState("overview");
  const [overview, setOverview] = useState(null);
  const [users,    setUsers]    = useState([]);
  const [groups,   setGroups]   = useState([]);

  // ── Ausências state ──────────────────────────────────────────────
  const [abTab, setAbTab]           = useState("ranking");
  const [abOverview, setAbOverview] = useState(null);
  const [abByGroup,  setAbByGroup]  = useState([]);
  const [abByDay,    setAbByDay]    = useState([]);
  const [abHeatmap,  setAbHeatmap]  = useState([]);
  const [abTrend,    setAbTrend]    = useState([]);
  const [abCompare,  setAbCompare]  = useState(null);
  const [abAlerts,   setAbAlerts]   = useState([]);
  const [leaderPanel, setLeaderPanel] = useState(null);
  const [meetingStats,   setMeetingStats]   = useState(null);
  const [occStats,       setOccStats]       = useState(null);
  const [occList,        setOccList]        = useState([]);
  const [swapsList,      setSwapsList]      = useState([]);
  const [occGroupFilter, setOccGroupFilter] = useState("");
  const [occDateFrom,    setOccDateFrom]    = useState(()=>{ const d=new Date(); d.setDate(d.getDate()-90); return d.toISOString().slice(0,10); });
  const [occDateTo,      setOccDateTo]      = useState(new Date().toISOString().slice(0,10));
  const [meetingFrom,  setMeetingFrom]  = useState(() => { const d=new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10); });
  const [meetingTo,    setMeetingTo]    = useState(new Date().toISOString().slice(0,10));
  const [abPeriod,   setAbPeriod]   = useState("month");


  // ── Férias state ─────────────────────────────────────────────────────
  const [vacData,        setVacData]        = useState(null);
  const [vacDateFrom,    setVacDateFrom]    = useState(()=>{ const d=new Date(); d.setFullYear(d.getFullYear()-1); return d.toISOString().slice(0,10); });
  const [vacDateTo,      setVacDateTo]      = useState(()=>{ const d=new Date(); d.setFullYear(d.getFullYear()+1); return d.toISOString().slice(0,10); });
  const [vacGroupFilter, setVacGroupFilter] = useState("");
  const [vacLoading,     setVacLoading]     = useState(false);
  const [compliance,     setCompliance]     = useState([]);
  const [compLoading,    setCompLoading]    = useState(false);
  const [compGroupFilter,setCompGroupFilter]= useState("");

  // ── Ponto state ──────────────────────────────────────────────────
  const [pontoSummary,  setPontoSummary]  = useState(null);
  const [pontoByEmp,    setPontoByEmp]    = useState([]);
  const [pontoDateFrom, setPontoDateFrom] = useState(()=>{ const d=new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10); });
  const [pontoDateTo,   setPontoDateTo]   = useState(new Date().toISOString().slice(0,10));
  const [pontoGroupFilter, setPontoGroupFilter] = useState("");
  const [pontoLoading,  setPontoLoading]  = useState(false);

  const [abGroupFilter, setAbGroupFilter] = useState("");
  const [compareM1, setCompareM1] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth()-1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  });
  const [compareM2, setCompareM2] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  });

  const [abDateFrom, setAbDateFrom] = useState(() => {
    const d=new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10);
  });
  const [abDateTo, setAbDateTo] = useState(new Date().toISOString().slice(0,10));

  // ── Funcionários state ────────────────────────────────────────────
  const [search,       setSearch]       = useState("");
  const [filterDept,   setFilterDept]   = useState("all");
  const [selectedUser, setSelectedUser] = useState(null);
  const [userReport,   setUserReport]   = useState(null);
  const [selectedGroup,setSelectedGroup]= useState(null);
  const [groupReport,  setGroupReport]  = useState(null);

  useEffect(() => {
    Promise.all([api.get("/reports/overview"), api.get("/users"), api.get("/groups")])
      .then(([ov,us,gr]) => { setOverview(ov.data); setUsers(us.data||[]); setGroups(gr.data||[]); })
      .catch(console.error);
  }, []);

  const fetchAbsences = useCallback(async () => {
    const q = new URLSearchParams({ dateFrom:abDateFrom, dateTo:abDateTo });
    if (abGroupFilter) q.set("groupId", abGroupFilter);
    try {
      const [ov, grp, day, hm, tr, al] = await Promise.all([
        api.get("/reports/absences/overview?"+q),
        api.get("/reports/absences/by-group?"+q),
        api.get("/reports/absences/by-day?"+q),
        api.get("/reports/absences/heatmap?"+q),
        api.get("/reports/absences/trend?"+new URLSearchParams({...Object.fromEntries(q), period:abPeriod, dateFrom: new Date(Date.now()-180*86400000).toISOString().slice(0,10)})),
        api.get("/reports/absences/alerts?"+q),
      ]);
      setAbOverview(ov.data);
      setAbByGroup(grp.data||[]);
      setAbByDay(day.data||[]);
      setAbHeatmap(hm.data||[]);
      setAbTrend(tr.data||[]);
      setAbAlerts(al.data||[]);
    } catch(e) { console.error(e); }
  }, [abDateFrom, abDateTo, abGroupFilter, abPeriod]);

  const fetchCompare = useCallback(async () => {
    const q = new URLSearchParams({ month1:compareM1, month2:compareM2 });
    if (abGroupFilter) q.set("groupId", abGroupFilter);
    try {
      const r = await api.get("/reports/absences/compare?"+q);
      setAbCompare(r.data);
    } catch(e) { console.error(e); }
  }, [compareM1, compareM2, abGroupFilter]);

  useEffect(() => {
    if (tab!=="absences") return;
    fetchAbsences(); fetchCompare();
    const q = new URLSearchParams({ dateFrom:abDateFrom, dateTo:abDateTo });
    if (abGroupFilter) q.set("groupId", abGroupFilter);
    api.get("/absences/leader-panel?"+q).then(r=>setLeaderPanel(r.data)).catch(console.error);
  }, [tab, fetchAbsences, fetchCompare, abDateFrom, abDateTo, abGroupFilter]);

  useEffect(() => {
    if (tab!=="meeting") return;
    api.get(`/meeting/stats?from=${meetingFrom}&to=${meetingTo}`)
      .then(r=>setMeetingStats(r.data)).catch(console.error);
  }, [tab, meetingFrom, meetingTo]);

  useEffect(() => {
    if (tab!=="occurrences") return;
    const q = new URLSearchParams({ dateFrom: occDateFrom, dateTo: occDateTo, limit: 1000 });
    if (occGroupFilter) q.set("groupId", occGroupFilter);
    api.get("/occurrences/stats?"+q).then(r=>setOccStats(r.data)).catch(console.error);
    api.get("/occurrences?"+q).then(r=>setOccList(r.data?.rows||[])).catch(console.error);
  }, [tab, occDateFrom, occDateTo, occGroupFilter]);

  useEffect(() => {
    if (tab!=="swaps") return;
    api.get("/swaps").then(r=>setSwapsList(r.data||[])).catch(console.error);
  }, [tab]);

  useEffect(() => {
    if (!selectedUser) return;
    api.get(`/reports/user/${selectedUser.id}`).then(r=>setUserReport(r.data)).catch(console.error);
  }, [selectedUser]);
  useEffect(() => {
    if (!selectedGroup) return;
    api.get(`/reports/group/${selectedGroup.id}`).then(r=>setGroupReport(r.data)).catch(console.error);
  }, [selectedGroup]);

  const depts = ["all",...new Set(users.map(u=>u.dept).filter(Boolean))];
  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    return (!q||u.fullName?.toLowerCase().includes(q)||u.username?.toLowerCase().includes(q))&&(filterDept==="all"||u.dept===filterDept);
  });

  const getUserGroup  = uid => groups.find(g=>g.memberIds?.includes(uid));
  const statusColor   = { pending:T.amber, approved:T.green, rejected:T.red };
  const tt = { background:T.tooltipBg, border:`1px solid ${T.border}`, borderRadius:8, fontSize:12, color:T.t1, padding:"8px 12px" };
  const yAxisWidth = overview?.groupSizes?.length ? Math.min(200,Math.max(100,Math.max(...overview.groupSizes.map(g=>(g.name?.length||0)))*7)) : 140;
  const groupChartHeight = overview?.groupSizes?.length ? Math.max(200, overview.groupSizes.length*36+40) : 200;
  const CustomYTick = ({x,y,payload}) => <text x={x} y={y} dy={4} textAnchor="end" fill={T.t5} fontSize={11} fontFamily="'Sora',sans-serif">{payload.value}</text>;

  const StatCard = ({label,value,color,sub,icon}) => (
    <Card style={{padding:"16px 20px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:11,color:T.t9,fontWeight:600,letterSpacing:"0.06em",marginBottom:8}}>{label}</div>
          <div style={{fontSize:30,fontWeight:900,color,lineHeight:1}}>{value}</div>
          {sub&&<div style={{fontSize:11,color:T.t9,marginTop:5}}>{sub}</div>}
        </div>
        {icon&&<div style={{width:38,height:38,borderRadius:10,background:color+"18",display:"flex",alignItems:"center",justifyContent:"center",color}}>{icon}</div>}
      </div>
    </Card>
  );

  const TabBtn = ({id,label}) => (
    <button onClick={()=>setTab(id)} style={{padding:"7px 20px",borderRadius:8,border:"none",cursor:"pointer",background:tab===id?T.bgCard:"transparent",color:tab===id?T.t1:T.t8,fontSize:13,fontWeight:tab===id?600:400,fontFamily:"'Sora',sans-serif",boxShadow:tab===id?"0 1px 6px #00000022":"none",transition:"background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s"}}>{label}</button>
  );

  const AbTabBtn = ({id,label}) => (
    <button onClick={()=>setAbTab(id)} style={{padding:"5px 14px",borderRadius:6,border:`1px solid ${abTab===id?T.accent:T.border}`,cursor:"pointer",background:abTab===id?T.accent+"18":"transparent",color:abTab===id?T.accent:T.t8,fontSize:12,fontWeight:abTab===id?600:400,fontFamily:"'Sora',sans-serif",transition:"background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s"}}>{label}</button>
  );

  // ── Heatmap helper ────────────────────────────────────────────────
  const heatmapMax = abHeatmap.length ? Math.max(...abHeatmap.map(h=>h.count)) : 1;
  const hours = Array.from({length:12},(_,i)=>i+7); // 7h-18h
  const days  = [1,2,3,4,5]; // Seg-Sex


  const fetchPontoStats = async () => {
    setPontoLoading(true);
    try {
      const q = new URLSearchParams({ dateFrom: pontoDateFrom, dateTo: pontoDateTo });
      if (pontoGroupFilter) q.set("groupId", pontoGroupFilter);
      const [sumR, empR] = await Promise.all([
        api.get("/ponto/analytics/summary?" + q),
        api.get("/ponto/analytics/by-employee?" + q),
      ]);
      setPontoSummary(sumR.data);
      setPontoByEmp(empR.data.rows || []);
    } catch (e) {}
    setPontoLoading(false);
  };

  useEffect(() => { if (tab === "ponto") fetchPontoStats(); }, [tab]); // eslint-disable-line

  useEffect(() => { if (tab === "ferias") { fetchVacationStats(); fetchComplianceData(); } }, [tab]); // eslint-disable-line


  const fetchComplianceData = async () => {
    setCompLoading(true);
    try {
      const r = await api.get("/vacations/compliance");
      setCompliance(r.data || []);
    } catch (e) {}
    setCompLoading(false);
  };

  const fetchVacationStats = async () => {
    setVacLoading(true);
    try {
      const q = new URLSearchParams({ dateFrom: vacDateFrom, dateTo: vacDateTo });
      if (vacGroupFilter) q.set("groupId", vacGroupFilter);
      const r = await api.get("/vacations/analytics?" + q);
      setVacData(r.data);
    } catch (e) {}
    setVacLoading(false);
  };



  return (
    <div style={{padding:28,overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:800,color:T.t1, display: "flex", alignItems: "center", gap: 11 }}><span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", background: T.accent + "1f", color: T.accent, flexShrink: 0 }}><BarChart3 size={18} /></span>Relatórios & Analytics</h1>
          <p style={{color:T.t8,fontSize:13}}>Escalas, ausências, times e funcionários</p>
        </div>

      </div>

      <div style={{display:"flex",gap:4,marginBottom:24,background:T.bgDeep,borderRadius:10,padding:4,width:"fit-content",border:`1px solid ${T.border}`}}>
        {TABS.map(t=><TabBtn key={t.id} id={t.id} label={t.label}/>)}
      </div>

      {/* ── ABA AUSÊNCIAS ─────────────────────────────────────────── */}
      {tab==="absences" && (
        <div>
          {/* Filtros globais */}
          <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"center",padding:"14px 16px",background:T.bgCard,borderRadius:12,border:`1px solid ${T.border}`}}>
            <Select value={abGroupFilter} onChange={e=>setAbGroupFilter(e.target.value)}
              options={[{value:"",label:"Todos os grupos"},...groups.map(g=>({value:g.id,label:g.name}))]}
              style={{width:200}} />
            <input type="date" value={abDateFrom} onChange={e=>setAbDateFrom(e.target.value)}
              style={{fontSize:12,color:T.t1,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px"}}/>
            <span style={{fontSize:12,color:T.t9}}>até</span>
            <input type="date" value={abDateTo} onChange={e=>setAbDateTo(e.target.value)}
              style={{fontSize:12,color:T.t1,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px"}}/>
            <Btn small variant="ghost" onClick={()=>{fetchAbsences();fetchCompare();}}>Atualizar</Btn>
          </div>

          {/* KPIs */}
          {abOverview && (
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
              <StatCard label="TOTAL AUSÊNCIAS"     value={abOverview.totalAbsences}   color={T.accent}  icon={<Activity size={18}/>} />
              <StatCard label="ACIMA DO LIMITE"     value={abOverview.overLimitCount}  color={abOverview.overLimitCount>0?T.red:T.green} icon={<AlertTriangle size={18}/>} />
              <StatCard label="% CUMPRIMENTO"       value={abOverview.complianceRate+"%"} color={abOverview.complianceRate>=90?T.green:abOverview.complianceRate>=70?T.amber:T.red} icon={<Award size={18}/>}/>
              <StatCard label="MÉDIA GERAL"         value={secToHuman(abOverview.globalAvg)} color={abOverview.globalAvg>LIMIT_SEC?T.red:abOverview.globalAvg>600?T.amber:T.green} icon={<TrendingUp size={18}/>}/>
            </div>
          )}

          {/* Alertas automáticos */}
          {abAlerts.length>0 && (
            <div style={{marginBottom:20}}>
              {abAlerts.slice(0,3).map((a,i)=>(
                <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 16px",background:a.alerts[0]?.level==="high"?T.red+"10":T.amber+"10",border:`1px solid ${a.alerts[0]?.level==="high"?T.red:T.amber}33`,borderRadius:10,marginBottom:8}}>
                  <AlertTriangle size={16} style={{color:a.alerts[0]?.level==="high"?T.red:T.amber,flexShrink:0,marginTop:2}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:T.t1,marginBottom:4}}>
                      {a.full_name} <span style={{fontSize:11,fontWeight:400,color:T.t8}}>· {a.group_name}</span>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {a.alerts.map((al,j)=>(
                        <span key={j} style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:T.bgDeep,color:al.level==="high"?T.red:al.level==="medium"?T.amber:T.t8,border:`1px solid ${T.border}`}}>{al.msg}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:T.red}}>{secToHuman(a.avg_sec)}</div>
                    <div style={{fontSize:10,color:T.t9}}>média</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sub-tabs */}
          <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
            <AbTabBtn id="leader"    label="Painel do Líder"/>
            <AbTabBtn id="ranking"   label="Ranking"/>
            <AbTabBtn id="groups"    label="Comparativo Grupos"/>
            <AbTabBtn id="trend"     label="Evolução"/>
            <AbTabBtn id="weekdays"  label="Dias da Semana"/>
            <AbTabBtn id="heatmap"   label="Heatmap de Horários"/>
            <AbTabBtn id="compare"   label="Comparar Meses"/>
            <AbTabBtn id="deviation" label="Desvios"/>
          </div>


          {/* PAINEL DO LÍDER */}
          {abTab==="leader" && (
            <div>
              {!leaderPanel ? (
                <div style={{textAlign:"center",padding:48,color:T.t9}}>Carregando painel...</div>
              ) : (
                <div>
                  {/* KPIs sumário */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
                    {[
                      {label:"Membros analisados",  value:leaderPanel.totalMembers,         color:T.accent},
                      {label:"Sem registro",         value:leaderPanel.noRecord.length,      color:leaderPanel.noRecord.length>0?T.amber:T.green},
                      {label:"Sub-registro",         value:leaderPanel.underRecord.length,   color:leaderPanel.underRecord.length>0?T.amber:T.green},
                      {label:"Perfil crítico",       value:leaderPanel.problematic.length,   color:leaderPanel.problematic.length>0?T.red:T.green},
                    ].map((s,i)=>(
                      <Card key={i} style={{padding:"14px 16px"}}>
                        <div style={{fontSize:10,color:T.t9,marginBottom:6,fontWeight:600,letterSpacing:"0.06em"}}>{s.label}</div>
                        <div style={{fontSize:28,fontWeight:900,color:s.color}}>{s.value}</div>
                      </Card>
                    ))}
                  </div>

                  {/* Médias de referência */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                    <Card style={{padding:"12px 16px",display:"flex",alignItems:"center",gap:16}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:10,color:T.t9,marginBottom:4}}>MÉDIA DO TIME</div>
                        <div style={{fontSize:22,fontWeight:800,color:leaderPanel.teamAvg>LIMIT_SEC?T.red:leaderPanel.teamAvg>720?T.amber:T.green}}>{secToHuman(leaderPanel.teamAvg)}</div>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:10,color:T.t9,marginBottom:4}}>MÉDIA GLOBAL</div>
                        <div style={{fontSize:22,fontWeight:800,color:T.t2}}>{secToHuman(leaderPanel.globalAvg)}</div>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:10,color:T.t9,marginBottom:4}}>DESVIO TIME vs GLOBAL</div>
                        <div style={{fontSize:22,fontWeight:800,color:leaderPanel.teamAvg>leaderPanel.globalAvg+60?T.red:leaderPanel.teamAvg<leaderPanel.globalAvg-60?T.green:T.t8}}>
                          {leaderPanel.teamAvg>leaderPanel.globalAvg?"+":""}{secToHuman(leaderPanel.teamAvg-leaderPanel.globalAvg)}
                        </div>
                      </div>
                    </Card>
                    <Card style={{padding:"12px 16px"}}>
                      <div style={{fontSize:11,fontWeight:600,color:T.t1,marginBottom:8}}>Distribuição de risco</div>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        {[
                          {label:"Crítico",   count:leaderPanel.members.filter(m=>m.riskScore>=70).length,  color:T.red},
                          {label:"Alto",      count:leaderPanel.members.filter(m=>m.riskScore>=50&&m.riskScore<70).length, color:T.amber},
                          {label:"Moderado",  count:leaderPanel.members.filter(m=>m.riskScore>=25&&m.riskScore<50).length, color:"#F59E0B"},
                          {label:"Ok",        count:leaderPanel.members.filter(m=>m.riskScore<25).length,   color:T.green},
                        ].map((r,i)=>(
                          <div key={i} style={{flex:1,textAlign:"center",padding:"8px 4px",background:r.color+"14",borderRadius:8,border:`1px solid ${r.color}33`}}>
                            <div style={{fontSize:18,fontWeight:800,color:r.color}}>{r.count}</div>
                            <div style={{fontSize:9,color:T.t9,marginTop:2}}>{r.label}</div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>

                  {/* Alertas críticos */}
                  {leaderPanel.noRecord.length>0&&(
                    <div style={{marginBottom:12,padding:"12px 16px",background:T.amber+"10",border:`1px solid ${T.amber}33`,borderRadius:10}}>
                      <div style={{fontSize:12,fontWeight:700,color:T.amber,marginBottom:8}}>⚠ Sem nenhum registro no período ({leaderPanel.noRecord.length} {leaderPanel.noRecord.length===1?"pessoa":"pessoas"})</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {leaderPanel.noRecord.map(m=>(
                          <span key={m.id} style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:T.bgDeep,border:`1px solid ${T.border}`,color:T.t4}}>{m.full_name}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {leaderPanel.underRecord.length>0&&(
                    <div style={{marginBottom:16,padding:"12px 16px",background:T.accent+"08",border:`1px solid ${T.accent}22`,borderRadius:10}}>
                      <div style={{fontSize:12,fontWeight:700,color:T.accent,marginBottom:8}}>ℹ Sub-registro provável ({leaderPanel.underRecord.length} {leaderPanel.underRecord.length===1?"pessoa":"pessoas"} com menos de 3 registros)</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {leaderPanel.underRecord.map(m=>(
                          <span key={m.id} style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:T.bgDeep,border:`1px solid ${T.border}`,color:T.t4}}>{m.full_name} ({m.totalAbsences}x)</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Painel individual por pessoa */}
                  <Card style={{padding:0,overflow:"hidden"}}>
                    <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.borderSubtle}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:13,fontWeight:700,color:T.t1}}>Análise Individual</span>
                      <span style={{fontSize:11,color:T.t9}}>ordenado por score de risco</span>
                    </div>
                    <div>
                      {leaderPanel.members.map((m,i)=>{
                        const riskColor = m.riskScore>=70?T.red:m.riskScore>=50?T.amber:m.riskScore>=25?"#F59E0B":T.green;
                        const riskLabel = m.riskScore>=70?"Crítico":m.riskScore>=50?"Alto":m.riskScore>=25?"Moderado":"Ok";
                        const devTeamColor = m.deviationTeam===null?T.t9:m.deviationTeam>60?T.red:m.deviationTeam<-60?T.green:T.t8;
                        const devGlColor   = m.deviationGlobal===null?T.t9:m.deviationGlobal>60?T.red:m.deviationGlobal<-60?T.green:T.t8;
                        return (
                          <div key={m.id} style={{padding:"14px 16px",borderBottom:`1px solid ${T.borderRow}`,background:i%2===0?"transparent":T.bgRowAlt}}>
                            {/* Header da pessoa */}
                            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                              <Avatar name={m.full_name} size={32} color={riskColor}/>
                              <div style={{flex:1}}>
                                <div style={{fontSize:13,fontWeight:700,color:T.t1}}>{m.full_name}</div>
                                <div style={{fontSize:10,color:T.t9}}>{m.totalAbsences} saídas · {m.daysActive} dias ativos</div>
                              </div>
                              {/* Score de risco */}
                              <div style={{textAlign:"center",minWidth:70}}>
                                <div style={{fontSize:10,color:T.t9,marginBottom:2}}>RISCO</div>
                                <div style={{fontSize:18,fontWeight:800,color:riskColor}}>{m.riskScore}</div>
                                <div style={{fontSize:9,color:riskColor,fontWeight:600}}>{riskLabel}</div>
                              </div>
                              {/* Barra de risco */}
                              <div style={{width:80,height:6,borderRadius:3,background:T.bgDeep,overflow:"hidden"}}>
                                <div style={{width:`${m.riskScore}%`,height:"100%",background:riskColor,borderRadius:3,transition:"width 0.5s"}}/>
                              </div>
                            </div>

                            {/* Stats em grid */}
                            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginBottom:10}}>
                              {[
                                {label:"Média",      value:m.totalAbsences>0?secToMMSS(m.avgSec):"—",       color:m.avgSec>LIMIT_SEC?T.red:m.avgSec>720?T.amber:T.green},
                                {label:"Máximo",     value:m.maxSec>0?secToMMSS(m.maxSec):"—",              color:m.maxSec>LIMIT_SEC?T.red:T.t2},
                                {label:"Acima lim.", value:m.overLimitCount,                                 color:m.overLimitCount>0?T.red:T.green},
                                {label:"vs Time",    value:m.deviationTeam!==null?(m.deviationTeam>0?"+":"")+secToHuman(Math.abs(m.deviationTeam)):"—", color:devTeamColor},
                                {label:"vs Global",  value:m.deviationGlobal!==null?(m.deviationGlobal>0?"+":"")+secToHuman(Math.abs(m.deviationGlobal)):"—", color:devGlColor},
                                {label:"Tendência",  value:m.trend,                                          color:m.trend==="alta"?T.red:m.trend==="queda"?T.green:T.t8},
                              ].map((s,j)=>(
                                <div key={j} style={{background:T.bgDeep,borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                                  <div style={{fontSize:9,color:T.t9,marginBottom:2}}>{s.label}</div>
                                  <div style={{fontSize:11,fontWeight:700,color:s.color,textTransform:"capitalize"}}>{s.value}</div>
                                </div>
                              ))}
                            </div>

                            {/* Insights da pessoa */}
                            {m.insights.length>0&&(
                              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                                {m.insights.slice(0,4).map((ins,j)=>{
                                  const c = ins.level==="high"?T.red:ins.level==="medium"?T.amber:ins.level==="ok"?T.green:T.accent;
                                  return (
                                    <span key={j} style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:c+"14",border:`1px solid ${c}33`,color:T.t3}}>
                                      {ins.level==="high"?"⚠ ":ins.level==="ok"?"✓ ":ins.level==="medium"?"● ":"· "}{ins.msg}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Card>

                  {/* Compliant — bons exemplos */}
                  {leaderPanel.compliant.length>0&&(
                    <Card style={{marginTop:16,padding:14}}>
                      <div style={{fontSize:12,fontWeight:700,color:T.green,marginBottom:8}}>✓ Dentro dos padrões ({leaderPanel.compliant.length})</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {leaderPanel.compliant.map(m=>(
                          <div key={m.id} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",background:T.green+"10",border:`1px solid ${T.green}22`,borderRadius:20}}>
                            <Avatar name={m.full_name} size={18} color={T.green}/>
                            <span style={{fontSize:11,color:T.t3}}>{m.full_name}</span>
                            <span style={{fontSize:10,color:T.green,fontFamily:"monospace"}}>{secToHuman(m.avgSec)}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>
              )}
            </div>
          )}

          {abTab==="ranking" && abOverview && (

            <Card>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{fontSize:14,fontWeight:700,color:T.t1}}>Ranking de Ausências</div>
                <ExportMenu data={abOverview.rows.map(r=>({Nome:r.full_name,Grupo:r.group_name,Saídas:r.total_absences,"Tempo Total (s)":r.total_sec,"Média (s)":r.avg_sec,"Acima Limite":r.over_limit_count}))} filename="ausencias-ranking-colaboradores" T={T}/>
              </div>
              <div style={{fontSize:11,color:T.t9,marginBottom:16}}>Ordenado por tempo total ausente no período</div>
              <div style={{display:"flex",flexDirection:"column",gap:0}}>
                {abOverview.rows.map((r,i)=>{
                  const pct = Math.min(100,Math.round(r.avg_sec/LIMIT_SEC*100));
                  return (
                    <div key={r.user_id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${T.borderRow}`}}>
                      <div style={{width:24,fontSize:12,fontWeight:700,color:i<3?T.amber:T.t10,textAlign:"center"}}>{i+1}</div>
                      <Avatar name={r.full_name} size={28} color={r.group_color||T.accent}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:T.t2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.full_name}</div>
                        <div style={{fontSize:10,color:T.t9}}>{r.group_name} · {r.total_absences} saídas</div>
                      </div>
                      <div style={{width:120}}>
                        <div style={{height:5,borderRadius:3,background:T.bgDeep,overflow:"hidden"}}>
                          <div style={{width:`${pct}%`,height:"100%",background:r.avg_sec>LIMIT_SEC?T.red:r.avg_sec>700?T.amber:T.green,borderRadius:3,transition:"width 0.4s"}}/>
                        </div>
                      </div>
                      <div style={{minWidth:60,textAlign:"right",fontSize:12,fontWeight:700,color:r.avg_sec>LIMIT_SEC?T.red:r.avg_sec>700?T.amber:T.green}}>
                        {secToHuman(r.avg_sec)}
                      </div>
                      {r.over_limit_count>0&&<Badge color={T.red} small>{r.over_limit_count}x</Badge>}
                    </div>
                  );
                })}
                {abOverview.rows.length===0&&<div style={{padding:32,textAlign:"center",color:T.t9,fontSize:13}}>Nenhuma ausência no período</div>}
              </div>
            </Card>
          )}

          {/* COMPARATIVO GRUPOS */}
          {abTab==="groups" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <Card>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <div style={{fontSize:14,fontWeight:700,color:T.t1}}>Média por Grupo</div>
                  <ExportMenu data={abByGroup.map(g=>({Grupo:g.name,Turma:g.team||"—","Média (seg)":g.avg_sec,"Total Saídas":g.total_absences,"Acima Limite":g.over_limit,"Pessoas":g.unique_users}))} filename="ausencias-por-grupo" T={T}/>
                </div>
                <div style={{fontSize:11,color:T.t9,marginBottom:16}}>Linha = limite de 15 min</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={abByGroup} layout="vertical" margin={{right:50,left:8}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} horizontal={false}/>
                    <XAxis type="number" tickFormatter={v=>`${Math.round(v/60)}m`} tick={{fill:T.t8,fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="name" tick={{fill:T.t5,fontSize:10}} axisLine={false} tickLine={false} width={110} interval={0}/>
                    <Tooltip contentStyle={tt} formatter={v=>[secToHuman(v),"Média"]}/>
                    <ReferenceLine x={LIMIT_SEC} stroke={T.red} strokeDasharray="4 2"/>
                    <Bar dataKey="avg_sec" radius={[0,4,4,0]} barSize={18} label={{position:"right",fontSize:10,fill:T.t6,formatter:v=>secToHuman(v)}}>
                      {abByGroup.map((g,i)=><Cell key={i} fill={g.avg_sec>LIMIT_SEC?T.red:g.avg_sec>700?T.amber:g.color||T.green}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card>
                <div style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:4}}>Saídas Acima do Limite</div>
                <div style={{fontSize:11,color:T.t9,marginBottom:16}}>Quantidade de registros além de 15 min por grupo</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {abByGroup.map((g,i)=>{
                    const max = Math.max(...abByGroup.map(x=>x.total_absences),1);
                    const pct = Math.round(g.total_absences/max*100);
                    const overPct = g.total_absences>0?Math.round(g.over_limit/g.total_absences*100):0;
                    return (
                      <div key={i}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <div style={{width:8,height:8,borderRadius:"50%",background:g.color||T.accent}}/>
                            <span style={{fontSize:11,color:T.t4}}>{g.name}</span>
                          </div>
                          <span style={{fontSize:11,color:T.t8}}>{g.over_limit}/{g.total_absences} ({overPct}%)</span>
                        </div>
                        <div style={{height:5,borderRadius:3,background:T.bgDeep,overflow:"hidden"}}>
                          <div style={{width:`${pct}%`,height:"100%",background:overPct>30?T.red:overPct>15?T.amber:g.color||T.green,borderRadius:3}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}

          {/* EVOLUÇÃO */}
          {abTab==="trend" && (
            <Card>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:T.t1}}>Evolução ao Longo do Tempo</div>
                  <div style={{fontSize:11,color:T.t9}}>Média de duração das ausências por período</div>
                </div>
                <div style={{display:"flex",gap:6}}>
                  {["week","month"].map(p=>(
                    <button key={p} onClick={()=>setAbPeriod(p)} style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${abPeriod===p?T.accent:T.border}`,background:abPeriod===p?T.accent+"18":"transparent",color:abPeriod===p?T.accent:T.t8,fontSize:11,cursor:"pointer"}}>
                      {p==="week"?"Semana":"Mês"}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={abTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
                  <XAxis dataKey="period" tick={{fill:T.t8,fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis yAxisId="avg" orientation="left" tickFormatter={v=>`${Math.round(v/60)}m`} tick={{fill:T.t8,fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis yAxisId="count" orientation="right" tick={{fill:T.t8,fontSize:10}} axisLine={false} tickLine={false} allowDecimals={false}/>
                  <Tooltip contentStyle={tt} formatter={(v,n)=>n==="Saídas"?[v,n]:[secToHuman(v),n]}/>
                  <Legend wrapperStyle={{fontSize:11}}/>
                  <ReferenceLine yAxisId="avg" y={LIMIT_SEC} stroke={T.red} strokeDasharray="4 2" label={{value:"15m",fill:T.red,fontSize:10}}/>
                  <Area yAxisId="avg" type="monotone" dataKey="avg_sec" name="Média" stroke={T.accent} fill={T.accent+"22"} strokeWidth={2} dot={{r:3,fill:T.accent}}/>
                  <Bar yAxisId="count" dataKey="count" name="Saídas" fill={T.purple} opacity={0.5} radius={[3,3,0,0]} barSize={14}/>
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* DIAS DA SEMANA */}
          {abTab==="weekdays" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <Card>
                <div style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:4}}>Frequência por Dia da Semana</div>
                <div style={{fontSize:11,color:T.t9,marginBottom:16}}>Quantas saídas ocorrem em cada dia</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={abByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
                    <XAxis dataKey="label" tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false} allowDecimals={false}/>
                    <Tooltip contentStyle={tt} formatter={v=>[v,"Saídas"]}/>
                    <Bar dataKey="count" radius={[4,4,0,0]} barSize={28}>
                      {abByDay.map((d,i)=><Cell key={i} fill={d.count===Math.max(...abByDay.map(x=>x.count))?T.red:T.accent}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card>
                <div style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:4}}>Duração Média por Dia</div>
                <div style={{fontSize:11,color:T.t9,marginBottom:16}}>Linha = limite de 15 min</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={abByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
                    <XAxis dataKey="label" tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false}/>
                    <YAxis tickFormatter={v=>`${Math.round(v/60)}m`} tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={tt} formatter={v=>[secToHuman(v),"Média"]}/>
                    <ReferenceLine y={LIMIT_SEC} stroke={T.red} strokeDasharray="4 2" label={{value:"15m",fill:T.red,fontSize:10}}/>
                    <Bar dataKey="avg_sec" radius={[4,4,0,0]} barSize={28}>
                      {abByDay.map((d,i)=><Cell key={i} fill={d.avg_sec>LIMIT_SEC?T.red:d.avg_sec>700?T.amber:T.green}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          )}

          {/* HEATMAP */}
          {abTab==="heatmap" && (
            <Card>
              <div style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:4}}>Heatmap de Horários de Saída</div>
              <div style={{fontSize:11,color:T.t9,marginBottom:20}}>Concentração de saídas por hora e dia da semana — quanto mais escuro, mais saídas</div>
              <div style={{overflowX:"auto"}}>
                <div style={{display:"grid",gridTemplateColumns:`60px repeat(${hours.length},1fr)`,gap:3,minWidth:500}}>
                  {/* Header horas */}
                  <div/>
                  {hours.map(h=>(
                    <div key={h} style={{textAlign:"center",fontSize:10,color:T.t9,paddingBottom:4}}>{h}h</div>
                  ))}
                  {/* Linhas dias */}
                  {days.map(d=>{
                    const dayLabels=["","Seg","Ter","Qua","Qui","Sex"];
                    return (
                      <React.Fragment key={d}>
                        <div style={{fontSize:11,color:T.t6,display:"flex",alignItems:"center"}}>{dayLabels[d]}</div>
                        {hours.map(h=>{
                          const cell = abHeatmap.find(x=>x.dow===d&&x.hour===h);
                          const count = cell?.count||0;
                          const intensity = heatmapMax>0?count/heatmapMax:0;
                          const bg = count===0?T.bgDeep
                            :intensity>0.7?T.red
                            :intensity>0.4?T.amber
                            :T.accent+"99";
                          return (
                            <div key={h} title={`${dayLabels[d]} ${h}h: ${count} saídas`} style={{height:32,borderRadius:4,background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:count>0?"#fff":T.t11,cursor:"default",transition:"opacity 0.2s"}}>
                              {count>0?count:""}
                            </div>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </div>
                {/* Legenda */}
                <div style={{display:"flex",alignItems:"center",gap:6,marginTop:16,fontSize:11,color:T.t9}}>
                  <span>Menos</span>
                  {[T.bgDeep,T.accent+"99",T.amber,T.red].map((c,i)=>(
                    <div key={i} style={{width:20,height:12,borderRadius:3,background:c}}/>
                  ))}
                  <span>Mais saídas</span>
                </div>
              </div>
            </Card>
          )}

          {/* COMPARAR MESES */}
          {abTab==="compare" && (
            <div>
              <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:20,padding:"14px 16px",background:T.bgCard,borderRadius:12,border:`1px solid ${T.border}`}}>
                <div>
                  <div style={{fontSize:11,color:T.t9,marginBottom:4}}>Mês 1</div>
                  <input type="month" value={compareM1} onChange={e=>setCompareM1(e.target.value)}
                    style={{fontSize:12,color:T.t1,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px"}}/>
                </div>
                <span style={{fontSize:16,color:T.t9,marginTop:16}}>vs</span>
                <div>
                  <div style={{fontSize:11,color:T.t9,marginBottom:4}}>Mês 2</div>
                  <input type="month" value={compareM2} onChange={e=>setCompareM2(e.target.value)}
                    style={{fontSize:12,color:T.t1,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px"}}/>
                </div>
                <Btn small variant="ghost" onClick={fetchCompare} style={{marginTop:16}}>Comparar</Btn>
              </div>

              {abCompare && (
                <>
                  {/* Resumo dos dois meses */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                    {[{m:compareM1,data:abCompare.m1data},{m:compareM2,data:abCompare.m2data}].map(({m,data},mi)=>{
                      const avgGeral = data.length>0?Math.round(data.reduce((s,r)=>s+r.avg_sec,0)/data.length):0;
                      const overTotal = data.reduce((s,r)=>s+r.over_limit,0);
                      return (
                        <Card key={mi}>
                          <div style={{fontSize:13,fontWeight:700,color:T.t1,marginBottom:12}}>{monthLabel(m)}</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                            <div style={{background:T.bgDeep,borderRadius:8,padding:"10px 12px"}}>
                              <div style={{fontSize:10,color:T.t9}}>Média geral</div>
                              <div style={{fontSize:18,fontWeight:700,color:avgGeral>LIMIT_SEC?T.red:T.green}}>{secToHuman(avgGeral)}</div>
                            </div>
                            <div style={{background:T.bgDeep,borderRadius:8,padding:"10px 12px"}}>
                              <div style={{fontSize:10,color:T.t9}}>Acima limite</div>
                              <div style={{fontSize:18,fontWeight:700,color:overTotal>0?T.red:T.green}}>{overTotal}</div>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>

                  {/* Tabela comparativa */}
                  <Card style={{padding:0,overflow:"hidden"}}>
                    <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.borderSubtle}`,display:"flex",justifyContent:"space-between"}}>
                      <span style={{fontSize:13,fontWeight:600,color:T.t1}}>Comparativo por Pessoa</span>
                      <span style={{fontSize:11,color:T.t9}}>Ordenado por maior variação</span>
                    </div>
                    <div style={{maxHeight:400,overflowY:"auto"}}>
                      {abCompare.merged.map((r,i)=>(
                        <div key={r.user_id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",borderBottom:`1px solid ${T.borderRow}`,background:i%2===0?"transparent":T.bgRowAlt}}>
                          <Avatar name={r.full_name} size={26} color={r.group_color||T.accent}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12,fontWeight:600,color:T.t2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.full_name}</div>
                            <div style={{fontSize:10,color:T.t9}}>{r.group_name}</div>
                          </div>
                          <div style={{display:"flex",gap:16,alignItems:"center"}}>
                            <div style={{textAlign:"center"}}>
                              <div style={{fontSize:11,color:T.t9,marginBottom:2}}>{monthLabel(compareM1)}</div>
                              <div style={{fontSize:13,fontWeight:600,color:r.m1.avg_sec>LIMIT_SEC?T.red:T.t2}}>{secToHuman(r.m1.avg_sec)}</div>
                            </div>
                            <div style={{fontSize:10,color:T.t9}}>→</div>
                            <div style={{textAlign:"center"}}>
                              <div style={{fontSize:11,color:T.t9,marginBottom:2}}>{monthLabel(compareM2)}</div>
                              <div style={{fontSize:13,fontWeight:600,color:r.m2.avg_sec>LIMIT_SEC?T.red:T.t2}}>{secToHuman(r.m2.avg_sec)}</div>
                            </div>
                            <div style={{minWidth:70,textAlign:"right"}}>
                              <div style={{fontSize:13,fontWeight:700,color:r.delta>60?T.red:r.delta<-60?T.green:T.t8}}>
                                {r.delta>0?"+":""}{secToHuman(r.delta)}
                              </div>
                              <div style={{fontSize:10,color:T.t9}}>{r.delta>0?"piora":"melhora"}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </>
              )}
            </div>
          )}

          {/* DESVIOS */}
          {abTab==="deviation" && abOverview && (
            <Card>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div style={{fontSize:14,fontWeight:700,color:T.t1}}>Desvio Individual vs Média da Equipe</div>
              <ExportMenu data={abOverview.rows.map(r=>({Nome:r.full_name,Grupo:r.group_name,"Média (s)":r.avg_sec,"Desvio (s)":r.deviation,"Acima Limite":r.over_limit_count}))} filename="ausencias-desvios-colaboradores" T={T}/>
            </div>
              <div style={{fontSize:11,color:T.t9,marginBottom:4}}>
                Média global: <strong style={{color:T.t2}}>{secToHuman(abOverview.globalAvg)}</strong> · Barra à direita = acima da média
              </div>
              <div style={{fontSize:10,color:T.t9,marginBottom:16}}>Vermelho = ultrapassou o limite · Laranja = acima da média · Verde = abaixo da média</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {[...abOverview.rows].sort((a,b)=>b.deviation-a.deviation).map((r,i)=>{
                  const isOver   = r.deviation > 60;   // acima da média por mais de 1min
                  const isUnder  = r.deviation < -60;  // abaixo da média por mais de 1min
                  const isNeutral = !isOver && !isUnder;
                  const overLimit = r.avg_sec > LIMIT_SEC; // média acima de 15min
                  const barPct   = Math.min(45, Math.abs(r.deviation)/LIMIT_SEC*100);
                  const devColor = overLimit ? T.red : isOver ? T.amber : isNeutral ? T.t9 : T.green;
                  const devLabel = isNeutral
                    ? "na média"
                    : (isOver ? "+" : "-") + secToHuman(Math.abs(r.deviation));
                  return (
                    <div key={r.user_id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${T.borderRow}`}}>
                      <div style={{fontSize:11,color:T.t10,minWidth:20,textAlign:"right"}}>{i+1}</div>
                      <Avatar name={r.full_name} size={24} color={r.group_color||T.accent}/>
                      <div style={{minWidth:130,fontSize:11,color:T.t3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.full_name}</div>
                      <div style={{fontSize:10,color:T.t9,minWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.group_name}</div>
                      <div style={{flex:1,height:8,position:"relative",background:T.bgDeep,borderRadius:4,overflow:"hidden"}}>
                        <div style={{position:"absolute",left:"50%",top:0,width:1,height:"100%",background:T.border}}/>
                        {!isNeutral&&<div style={{position:"absolute",height:"100%",[isOver?"left":"right"]:"50%",width:`${barPct}%`,background:devColor,borderRadius:4}}/>}
                      </div>
                      <div style={{minWidth:70,fontSize:11,textAlign:"right",fontWeight:600,color:devColor}}>
                        {devLabel}
                      </div>
                      <div style={{minWidth:55,fontSize:11,color:T.t9,textAlign:"right"}}>{secToHuman(r.avg_sec)}</div>
                      {r.over_limit_count>0&&<Badge color={T.red} small>{r.over_limit_count}x</Badge>}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}


      {/* ── ABA OCORRÊNCIAS ─────────────────────────────────────── */}
      {tab==="occurrences" && (
        <div>
          {/* Filtros */}
          <div style={{display:"flex",gap:10,marginBottom:20,alignItems:"center",padding:"14px 16px",background:T.bgCard,borderRadius:12,border:`1px solid ${T.border}`}}>
            <Select value={occGroupFilter} onChange={e=>setOccGroupFilter(e.target.value)}
              options={[{value:"",label:"Todos os grupos"},...groups.map(g=>({value:g.id,label:g.name}))]} style={{width:200}}/>
            <input type="date" value={occDateFrom} onChange={e=>setOccDateFrom(e.target.value)}
              style={{fontSize:12,color:T.t1,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px"}}/>
            <span style={{fontSize:12,color:T.t9}}>até</span>
            <input type="date" value={occDateTo} onChange={e=>setOccDateTo(e.target.value)}
              style={{fontSize:12,color:T.t1,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px"}}/>
            <Btn small variant="ghost" onClick={()=>{
              const q = new URLSearchParams({ dateFrom: occDateFrom, dateTo: occDateTo });
              if (occGroupFilter) q.set("groupId", occGroupFilter);
              api.get("/occurrences/stats?"+q).then(r=>setOccStats(r.data)).catch(console.error);
              api.get("/occurrences?"+q).then(r=>setOccList(r.data?.rows||[])).catch(console.error);
            }}>Atualizar</Btn>
          </div>

          {occStats ? (
            <div>
              {/* KPIs */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
                {[
                  {label:"Total ocorrências",     value:occStats.totals.total||0,       color:T.accent},
                  {label:"Dias ausentes",         value:occStats.totals.total_days||0,  color:T.purple},
                  {label:"Faltas injustificadas", value:occStats.totals.unexcused||0,   color:occStats.totals.unexcused>0?T.red:T.green},
                  {label:"Atestados médicos",     value:occStats.totals.medical||0,     color:T.amber},
                  {label:"Férias registradas",    value:occStats.totals.vacation||0,    color:T.green},
                ].map((s,i)=>(
                  <Card key={i} style={{padding:"14px 16px"}}>
                    <div style={{fontSize:10,color:T.t9,fontWeight:600,letterSpacing:"0.06em",marginBottom:6}}>{s.label}</div>
                    <div style={{fontSize:28,fontWeight:900,color:s.color}}>{s.value}</div>
                  </Card>
                ))}
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                {/* Por tipo */}
                <Card>
                  <h3 style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:4}}>Distribuição por Tipo</h3>
                  <p style={{fontSize:11,color:T.t9,marginBottom:16}}>Ocorrências e dias por categoria</p>
                  {occStats.byType.length===0 ? (
                    <div style={{textAlign:"center",padding:24,color:T.t9,fontSize:13}}>Nenhuma ocorrência registrada</div>
                  ) : (
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {occStats.byType.map((t,i)=>{
                        const max = occStats.byType[0]?.count||1;
                        const pct = Math.round(t.count/max*100);
                        const typeColors = {"Falta Injustificada":T.red,"Atestado Médico":T.amber,"Licença Médica":T.amber,"Férias":T.green,"Banco de Horas":T.green,"Falta Justificada":T.purple,"Licença Maternidade/Paternidade":T.accent,"Declaração de Comparecimento":T.t6,"Outros":T.t8};
                        const color = typeColors[t.type]||T.t8;
                        return (
                          <div key={i}>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                              <div style={{display:"flex",alignItems:"center",gap:6}}>
                                <div style={{width:8,height:8,borderRadius:"50%",background:color}}/>
                                <span style={{fontSize:12,color:T.t3}}>{t.type}</span>
                              </div>
                              <div style={{display:"flex",gap:12}}>
                                <span style={{fontSize:11,color:T.t9}}>{t.total_days}d</span>
                                <span style={{fontSize:12,fontWeight:700,color}}>{t.count}x</span>
                              </div>
                            </div>
                            <div style={{height:5,borderRadius:3,background:T.bgDeep,overflow:"hidden"}}>
                              <div style={{width:`${pct}%`,height:"100%",background:color,borderRadius:3,transition:"width 0.5s"}}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>

                {/* Evolução mensal */}
                <Card>
                  <h3 style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:4}}>Evolução Mensal</h3>
                  <p style={{fontSize:11,color:T.t9,marginBottom:16}}>Ocorrências e dias ausentes por mês</p>
                  {occStats.byMonth.length>0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <ComposedChart data={occStats.byMonth}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
                        <XAxis dataKey="month" tick={{fill:T.t8,fontSize:10}} axisLine={false} tickLine={false}/>
                        <YAxis yAxisId="count" orientation="left" tick={{fill:T.t8,fontSize:10}} axisLine={false} tickLine={false} allowDecimals={false}/>
                        <YAxis yAxisId="days" orientation="right" tick={{fill:T.t8,fontSize:10}} axisLine={false} tickLine={false} allowDecimals={false}/>
                        <Tooltip contentStyle={tt} formatter={(v,n)=>[v, n==="count"?"Ocorrências":"Dias"]}/>
                        <Legend wrapperStyle={{fontSize:11}}/>
                        <Bar yAxisId="count" dataKey="count" name="Ocorrências" fill={T.accent} opacity={0.8} radius={[4,4,0,0]} barSize={20}/>
                        <Line yAxisId="days" type="monotone" dataKey="total_days" name="Dias" stroke={T.red} strokeWidth={2} dot={{r:3}}/>
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : <div style={{textAlign:"center",padding:40,color:T.t9,fontSize:13}}>Sem dados no período</div>}
                </Card>
              </div>

              {/* Ranking por pessoa */}
              <Card style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <h3 style={{fontSize:14,fontWeight:700,color:T.t1}}>Ranking por Colaborador</h3>
                  <ExportMenu data={occList.map(o=>({Nome:o.fullName,Time:o.groupName||"—","Data Início":o.dateStart,"Data Fim":o.dateEnd||o.dateStart,Dias:o.days||1,Tipo:o.type,Descrição:o.description||""}))} filename="ocorrencias-detalhado" T={T}/>
                </div>
                <p style={{fontSize:11,color:T.t9,marginBottom:16}}>Ordenado por número de ocorrências</p>
                {occStats.byUser.length===0 ? (
                  <div style={{textAlign:"center",padding:24,color:T.t9,fontSize:13}}>Nenhuma ocorrência registrada no período</div>
                ) : (
                  <div style={{display:"flex",flexDirection:"column",gap:0}}>
                    {occStats.byUser.map((u,i)=>(
                      <div key={u.user_id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${T.borderRow}`}}>
                        <div style={{width:24,fontSize:12,fontWeight:700,color:i<3?T.amber:T.t10,textAlign:"center"}}>{i+1}</div>
                        <Avatar name={u.full_name} size={28} color={u.group_color||T.accent}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:600,color:T.t2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.full_name}</div>
                          <div style={{fontSize:10,color:T.t9}}>{u.group_name}</div>
                        </div>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          {u.unexcused>0&&<Badge color={T.red} small>{u.unexcused}x injust.</Badge>}
                          {u.medical>0&&<Badge color={T.amber} small>{u.medical}x atestado</Badge>}
                          {u.vacation>0&&<Badge color={T.green} small>{u.vacation}x férias</Badge>}
                          <div style={{textAlign:"right",minWidth:70}}>
                            <div style={{fontSize:13,fontWeight:700,color:u.unexcused>0?T.red:T.t1}}>{u.count} ocorr.</div>
                            <div style={{fontSize:10,color:T.t9}}>{u.total_days}d ausente</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Por grupo */}
              {isAdmin&&occStats.byGroup.filter(g=>g.count>0).length>0&&(
                <Card>
                  <h3 style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:14}}>Comparativo por Grupo</h3>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {occStats.byGroup.filter(g=>g.count>0).map((g,i)=>{
                      const max = Math.max(...occStats.byGroup.map(x=>x.count),1);
                      const pct = Math.round(g.count/max*100);
                      return (
                        <div key={g.id}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <div style={{width:8,height:8,borderRadius:"50%",background:g.color||T.accent}}/>
                              <span style={{fontSize:12,color:T.t3}}>{g.name}</span>
                            </div>
                            <div style={{display:"flex",gap:12}}>
                              {g.unexcused>0&&<span style={{fontSize:11,color:T.red}}>{g.unexcused}x injust.</span>}
                              <span style={{fontSize:12,fontWeight:700,color:T.t1}}>{g.count} · {g.total_days||0}d</span>
                            </div>
                          </div>
                          <div style={{height:6,borderRadius:3,background:T.bgDeep,overflow:"hidden"}}>
                            <div style={{width:`${pct}%`,height:"100%",background:g.unexcused>0?T.red:g.color||T.accent,borderRadius:3,transition:"width 0.5s"}}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>
          ) : (
            <div style={{textAlign:"center",padding:60,color:T.t9,fontSize:14}}>Carregando estatísticas...</div>
          )}
        </div>
      )}

      {/* ── ABA VISÃO GERAL ─────────────────────────────────────────── */}
      {tab==="overview" && overview && (
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
            <StatCard label="FUNCIONÁRIOS ATIVOS"  value={overview.stats.totalUsers}        color={T.accent}  icon={<Users size={18}/>} sub={`${overview.stats.totalUsersHistory} histórico total`}/>
            <StatCard label="GRUPOS ATIVOS"         value={overview.stats.totalGroups}       color={T.purple}  icon={<Activity size={18}/>}/>
            <StatCard label="SÁBADOS ESCALADOS"     value={overview.stats.totalSatScheduled} color={T.emerald} icon={<Award size={18}/>}/>
            <StatCard label="TROCAS PENDENTES"      value={overview.stats.pendingSwaps}      color={overview.stats.pendingSwaps>0?T.amber:T.green} icon={<TrendingUp size={18}/>} sub={`${overview.stats.totalSwaps} total`}/>
          </div>

          {overview.stats.deactivatedUsers>0&&(
            <div style={{marginBottom:20,padding:"14px 18px",background:T.red+"10",border:`1px solid ${T.red}33`,borderRadius:12,display:"flex",alignItems:"flex-start",gap:14}}>
              <UserX size={20} style={{color:T.red,flexShrink:0,marginTop:2}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:T.t1,marginBottom:4}}>{overview.stats.deactivatedUsers} {overview.stats.deactivatedUsers===1?"funcionário desligado":"funcionários desligados"} no histórico</div>
                <div style={{fontSize:12,color:T.t7}}>Dados preservados para fins estatísticos.</div>
              </div>
            </div>
          )}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
            <Card>
              <h3 style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:4}}>Turnos de Trabalho por Mês</h3>
              <p style={{fontSize:11,color:T.t9,marginBottom:16}}>Sábados escalados e total de pessoas</p>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={overview.monthlyWorking}>
                  <defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.accent} stopOpacity={0.25}/><stop offset="95%" stopColor={T.accent} stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
                  <XAxis dataKey="label" tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false}/>
                  <YAxis yAxisId="people" orientation="left" tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false} label={{value:"Pessoas",angle:-90,position:"insideLeft",fill:T.t10,fontSize:10,dx:-2}}/>
                  <YAxis yAxisId="sats" orientation="right" tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false} allowDecimals={false} label={{value:"Sábados",angle:90,position:"insideRight",fill:T.t10,fontSize:10,dx:10}}/>
                  <Tooltip contentStyle={tt} formatter={(v,n)=>n==="Pessoas escaladas"?[`${v} pessoas`,n]:[`${v} sábados`,n]}/>
                  <Legend wrapperStyle={{fontSize:11,color:T.t7}}/>
                  <Area yAxisId="people" type="monotone" dataKey="total_people" name="Pessoas escaladas" stroke={T.accent} fill="url(#wg)" strokeWidth={2} dot={{fill:T.accent,r:3}}/>
                  <Bar yAxisId="sats" dataKey="saturdays" name="Sábados escalados" fill={T.purple} opacity={0.7} radius={[4,4,0,0]} barSize={20}/>
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
            <Card>
              <h3 style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:4}}>Trocas por Mês</h3>
              <p style={{fontSize:11,color:T.t9,marginBottom:16}}>Aprovadas, rejeitadas e pendentes</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={overview.monthlySwaps}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
                  <XAxis dataKey="label" tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false} allowDecimals={false}/>
                  <Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontSize:11,color:T.t7}}/>
                  <Bar dataKey="approved" name="Aprovadas" stackId="a" fill={T.green}/>
                  <Bar dataKey="rejected" name="Rejeitadas" stackId="a" fill={T.red}/>
                  <Bar dataKey="pending"  name="Pendentes"  stackId="a" fill={T.amber} radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:20,marginBottom:20}}>
            <Card>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                <h3 style={{fontSize:14,fontWeight:700,color:T.t1}}>Tamanho dos Times <span style={{fontSize:11,color:T.t9,fontWeight:400}}>({overview.groupSizes.length} grupos · apenas ativos)</span></h3>
                <ExportMenu data={(overview?.groupSizes||[]).map(g=>({Grupo:g.name,Turma:g.team||"—","Membros Ativos":g.member_count}))} filename="relatorio-grupos-times" T={T}/>
              </div>
              <p style={{fontSize:11,color:T.t9,marginBottom:16}}>Membros ativos por grupo</p>
              <ResponsiveContainer width="100%" height={groupChartHeight}>
                <BarChart data={overview.groupSizes} layout="vertical" margin={{top:4,right:44,bottom:4,left:8}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} horizontal={false}/>
                  <XAxis type="number" tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false} allowDecimals={false}/>
                  <YAxis type="category" dataKey="name" tick={<CustomYTick/>} axisLine={false} tickLine={false} width={yAxisWidth} interval={0}/>
                  <Tooltip contentStyle={tt} formatter={v=>[`${v} membros ativos`,"Total"]} labelFormatter={l=>`Grupo: ${l}`}/>
                  <Bar dataKey="member_count" radius={[0,4,4,0]} barSize={22} label={{position:"right",fontSize:11,fill:T.t6,formatter:v=>v>0?v:""}}>
                    {overview.groupSizes.map(g=><Cell key={g.id} fill={g.color||T.accent}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card>
              <h3 style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:4}}>Status das Trocas</h3>
              <p style={{fontSize:11,color:T.t9,marginBottom:12}}>Distribuição geral</p>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={overview.swapsByStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="count" paddingAngle={3}>
                      {overview.swapsByStatus.map(s=><Cell key={s.status} fill={statusColor[s.status]||T.t10}/>)}
                    </Pie>
                    <Tooltip contentStyle={tt} formatter={(v,n,p)=>[`${v} (${overview.stats.totalSwaps>0?Math.round(v/overview.stats.totalSwaps*100):0}%)`,p.payload.status]}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{width:"100%"}}>
                  {overview.swapsByStatus.map(s=>(
                    <div key={s.status} style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <div style={{width:10,height:10,borderRadius:3,background:statusColor[s.status]||T.t10,flexShrink:0}}/>
                      <span style={{fontSize:12,color:T.t6,flex:1,textTransform:"capitalize"}}>{s.status}</span>
                      <span style={{fontSize:13,fontWeight:700,color:statusColor[s.status]||T.t1}}>{s.count}</span>
                    </div>
                  ))}
                  {overview.stats.totalSwaps>0&&(
                    <div style={{marginTop:10,padding:"8px 12px",background:T.green+"14",border:`1px solid ${T.green}33`,borderRadius:8,textAlign:"center"}}>
                      <div style={{fontSize:20,fontWeight:800,color:T.green}}>{overview.stats.approvalRate}%</div>
                      <div style={{fontSize:10,color:T.t8,fontWeight:600}}>TAXA DE APROVAÇÃO</div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            <Card>
              <h3 style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:4}}>Distribuição por Departamento</h3>
              <p style={{fontSize:11,color:T.t9,marginBottom:16}}>Funcionários ativos por área</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={overview.deptDistribution} layout="vertical" margin={{top:4,right:44,bottom:4,left:8}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} horizontal={false}/>
                  <XAxis type="number" tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false} allowDecimals={false}/>
                  <YAxis type="category" dataKey="dept" tick={{fill:T.t5,fontSize:11}} axisLine={false} tickLine={false} width={100} interval={0}/>
                  <Tooltip contentStyle={tt} formatter={v=>[`${v} funcionários`,"Total"]}/>
                  <Bar dataKey="count" fill={T.purple} radius={[0,4,4,0]} barSize={18} label={{position:"right",fontSize:11,fill:T.t6,formatter:v=>v>0?v:""}}/>
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card>
              <h3 style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:4}}>Trocas por Grupo</h3>
              <p style={{fontSize:11,color:T.t9,marginBottom:16}}>Grupos com maior atividade</p>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {overview.groupSwapActivity.map((g,i)=>{
                  const max=overview.groupSwapActivity[0]?.swap_count||1;
                  const pct=Math.round((g.swap_count/max)*100);
                  return (
                    <div key={i}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:g.color||T.accent}}/>
                          <span style={{fontSize:12,color:T.t4}}>{g.name}</span>
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:T.t2}}>{g.swap_count}</span>
                      </div>
                      <div style={{height:5,borderRadius:3,background:T.bgDeep,overflow:"hidden"}}>
                        <div style={{width:`${pct}%`,height:"100%",background:g.color||T.accent,borderRadius:3,transition:"width 0.6s"}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </>
      )}

      {/* ── ABA TROCAS ──────────────────────────────────────────────── */}
      {tab==="swaps" && overview && (
        <>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
            <ExportMenu data={swapsList.map(s=>({Solicitante:(users.find(u=>u.id===s.requesterId)?.fullName||s.requesterId),"Coberto Por":(users.find(u=>u.id===s.covererId)?.fullName||s.covererId),Data:s.date,Motivo:s.reason||"",Status:s.status==="approved"?"Aprovada":s.status==="rejected"?"Rejeitada":"Pendente","Data Solicitação":(s.createdAt||"").slice(0,10)}))} filename="trocas-detalhado" T={T}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
            <StatCard label="TOTAL DE TROCAS" value={overview.stats.totalSwaps}    color={T.accent}/>
            <StatCard label="APROVADAS"        value={overview.stats.approvedSwaps} color={T.green} sub={`${overview.stats.approvalRate}% taxa`}/>
            <StatCard label="REJEITADAS"       value={overview.stats.rejectedSwaps} color={T.red}/>
            <StatCard label="PENDENTES"        value={overview.stats.pendingSwaps}  color={T.amber}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
            <Card>
              <h3 style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:4}}>Evolução Mensal</h3>
              <p style={{fontSize:11,color:T.t9,marginBottom:16}}>Histórico de solicitações</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={overview.monthlySwaps}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
                  <XAxis dataKey="label" tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false} allowDecimals={false}/>
                  <Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontSize:11,color:T.t7}}/>
                  <Line type="monotone" dataKey="approved" name="Aprovadas"  stroke={T.green}  strokeWidth={2} dot={{r:4}}/>
                  <Line type="monotone" dataKey="rejected" name="Rejeitadas" stroke={T.red}    strokeWidth={2} dot={{r:4}}/>
                  <Line type="monotone" dataKey="total"    name="Total"      stroke={T.accent} strokeWidth={2} strokeDasharray="4 2" dot={{r:3}}/>
                </LineChart>
              </ResponsiveContainer>
            </Card>
            <Card>
              <h3 style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:16}}>Taxa de Aprovação</h3>
              <div style={{display:"flex",alignItems:"center",gap:24}}>
                <div style={{flex:1}}>
                  {[
                    {label:"Aprovadas", value:overview.stats.approvedSwaps, color:T.green, pct:overview.stats.approvalRate},
                    {label:"Rejeitadas",value:overview.stats.rejectedSwaps, color:T.red,   pct:overview.stats.totalSwaps>0?Math.round(overview.stats.rejectedSwaps/overview.stats.totalSwaps*100):0},
                    {label:"Pendentes", value:overview.stats.pendingSwaps,  color:T.amber, pct:overview.stats.totalSwaps>0?Math.round(overview.stats.pendingSwaps/overview.stats.totalSwaps*100):0},
                  ].map(item=>(
                    <div key={item.label} style={{marginBottom:14}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                        <span style={{fontSize:12,color:T.t6}}>{item.label}</span>
                        <span style={{fontSize:12,fontWeight:700,color:item.color}}>{item.value} ({item.pct}%)</span>
                      </div>
                      <div style={{height:10,borderRadius:5,background:T.bgDeep,overflow:"hidden"}}>
                        <div style={{width:`${item.pct}%`,height:"100%",background:item.color,borderRadius:5,transition:"width 0.8s"}}/>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{textAlign:"center",padding:"20px 30px",background:T.green+"14",borderRadius:14,border:`2px solid ${T.green}33`}}>
                  <div style={{fontSize:48,fontWeight:900,color:T.green,lineHeight:1}}>{overview.stats.approvalRate}%</div>
                  <div style={{fontSize:12,color:T.t7,marginTop:6,fontWeight:600}}>TAXA DE<br/>APROVAÇÃO</div>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      {/* ── ABA TIMES ──────────────────────────────────────────────── */}
      {tab==="groups" && (
        <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:20}}>
          <Card style={{padding:0,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.borderSubtle}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:11,color:T.t9,fontWeight:700}}>GRUPOS</span>
              <Badge small color={T.accent}>{groups.length}</Badge>
            </div>
            <div style={{maxHeight:520,overflowY:"auto"}}>
              {groups.map((g,i)=>{
                const isSelected=selectedGroup?.id===g.id;
                return (
                  <div key={g.id} onClick={()=>setSelectedGroup(isSelected?null:g)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:`1px solid ${T.borderRow}`,cursor:"pointer",background:isSelected?T.bgSelected:i%2===0?"transparent":T.bgRowAlt,borderLeft:isSelected?`3px solid ${g.color}`:"3px solid transparent",transition:"background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s"}}>
                    <div style={{width:10,height:10,borderRadius:3,background:g.color,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:T.t2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.name}</div>
                      <div style={{fontSize:10,color:T.t9}}>{g.memberIds?.length??0} membros</div>
                    </div>
                    {g.team&&<Badge color={g.team==="A"?T.green:T.purple} small>T.{g.team}</Badge>}
                  </div>
                );
              })}
            </div>
          </Card>
          <div>
            {selectedGroup&&groupReport?(
              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                <Card>
                  <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
                    <div style={{width:48,height:48,borderRadius:12,background:selectedGroup.color+"22",border:`2px solid ${selectedGroup.color}55`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <div style={{width:20,height:20,borderRadius:5,background:selectedGroup.color}}/>
                    </div>
                    <div>
                      <div style={{fontSize:18,fontWeight:800,color:T.t1}}>{selectedGroup.name}</div>
                      <div style={{display:"flex",gap:8,marginTop:4}}>
                        {selectedGroup.dept&&<Badge color={selectedGroup.color} small>{selectedGroup.dept}</Badge>}
                        {selectedGroup.team&&<Badge color={selectedGroup.team==="A"?T.green:T.purple} small>Turma {selectedGroup.team}</Badge>}
                      </div>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                    {[
                      {label:"Membros Ativos",        value:groupReport.membersStats.filter(m=>m.active).length,                              color:T.accent},
                      {label:"Membros Histórico",     value:groupReport.membersStats.length,                                                   color:T.purple},
                      {label:"Total Turnos Trabalho", value:groupReport.membersStats.reduce((a,m)=>a+m.working_count,0),                       color:T.green},
                      {label:"Total Folgas",          value:groupReport.membersStats.reduce((a,m)=>a+m.off_count,0),                           color:T.amber},
                    ].map(s=>(
                      <div key={s.label} style={{background:T.bgDeep,borderRadius:10,padding:"12px 14px",border:`1px solid ${s.color}22`}}>
                        <div style={{fontSize:22,fontWeight:800,color:s.color}}>{s.value}</div>
                        <div style={{fontSize:11,color:T.t8,marginTop:2}}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card>
                  <h3 style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:16}}>Participação dos Membros</h3>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {groupReport.membersStats.map(m=>{
                      const total=m.working_count+m.off_count;
                      const pct=total>0?Math.round((m.working_count/total)*100):0;
                      return (
                        <div key={m.id} style={{opacity:m.active?1:0.6}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontSize:12,color:m.active?T.t3:T.t7}}>{m.full_name}</span>
                              {!m.active&&<span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:10,background:T.red+"18",color:T.red,border:`1px solid ${T.red}33`}}>DESLIGADO</span>}
                            </div>
                            <div style={{display:"flex",gap:10}}>
                              <span style={{fontSize:11,color:T.green}}>{m.working_count}t</span>
                              <span style={{fontSize:11,color:T.t9}}>{m.off_count}f</span>
                            </div>
                          </div>
                          <div style={{height:6,borderRadius:3,background:T.bgDeep,overflow:"hidden"}}>
                            <div style={{width:`${pct}%`,height:"100%",background:m.active?selectedGroup.color:T.t10,borderRadius:3,transition:"width 0.5s"}}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>
            ):(
              <Card style={{textAlign:"center",padding:60}}>
                <Users size={40} style={{color:T.t9,marginBottom:14}}/>
                <div style={{fontSize:14,color:T.t8}}>Selecione um grupo para ver detalhes</div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ── ABA FUNCIONÁRIOS ────────────────────────────────────────── */}
      {tab==="users" && (
        <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:20}}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Card style={{padding:16}}>
              <div style={{fontSize:11,color:T.t9,fontWeight:700,letterSpacing:"0.1em",marginBottom:12}}>FILTRAR</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome ou usuário..." icon={<Search size={13}/>}/>
                <Select value={filterDept} onChange={e=>{setFilterDept(e.target.value);setSelectedUser(null);}}
                  options={depts.map(d=>({value:d,label:d==="all"?"Todos os depto.":d}))} style={{width:"100%"}}/>
              </div>
            </Card>
            <Card style={{padding:0,overflow:"hidden"}}>
              <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.borderSubtle}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:11,color:T.t9,fontWeight:700}}>FUNCIONÁRIOS</span>
                <Badge small color={T.accent}>{filteredUsers.length}</Badge>
              </div>
              <div style={{maxHeight:440,overflowY:"auto"}}>
                {filteredUsers.map((u,i)=>{
                  const ug=getUserGroup(u.id);
                  const isSelected=selectedUser?.id===u.id;
                  return (
                    <div key={u.id} onClick={()=>setSelectedUser(isSelected?null:u)}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:`1px solid ${T.borderRow}`,cursor:"pointer",background:isSelected?T.bgSelected:i%2===0?"transparent":T.bgRowAlt,borderLeft:isSelected?`3px solid ${T.accent}`:"3px solid transparent",transition:"background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s"}}>
                      <Avatar name={u.fullName} size={28} color={ug?.color||T.t9}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:isSelected?T.t1:T.t3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.fullName}</div>
                        <div style={{fontSize:10,color:T.t9}}>{u.dept}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
          <div>
            {selectedUser&&userReport?(
              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                <Card>
                  <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:18}}>
                    <Avatar name={userReport.user.fullName} size={52} color={getUserGroup(userReport.user.id)?.color||T.accent}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:18,fontWeight:800,color:T.t1}}>{userReport.user.fullName}</div>
                      <div style={{display:"flex",gap:8,marginTop:5,flexWrap:"wrap"}}>
                        {userReport.user.dept&&<Badge color={T.accent} small>{userReport.user.dept}</Badge>}
                        {userReport.user.title&&<Badge color={T.emerald} small>{userReport.user.title}</Badge>}
                      </div>
                    </div>
                    <div className="mono" style={{fontSize:11,color:T.t9}}>{userReport.user.username}</div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                    {[
                      {label:"Trabalhando",value:userReport.working?.length||0,           color:T.green},
                      {label:"Folgas",     value:userReport.off?.length||0,               color:T.amber},
                      {label:"Total Sábs.",value:(userReport.working?.length||0)+(userReport.off?.length||0),color:T.accent},
                      {label:"Trocas",     value:userReport.swaps?.length||0,             color:T.purple},
                    ].map(s=>(
                      <div key={s.label} style={{background:T.bgDeep,borderRadius:10,padding:"12px 14px",border:`1px solid ${s.color}22`}}>
                        <div style={{fontSize:22,fontWeight:800,color:s.color}}>{s.value}</div>
                        <div style={{fontSize:11,color:T.t8,marginTop:2}}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </Card>
                {userReport.monthlyActivity?.length>0&&(
                  <Card>
                    <h3 style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:16}}>Atividade Mensal</h3>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={userReport.monthlyActivity}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
                        <XAxis dataKey="label" tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false} allowDecimals={false}/>
                        <Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontSize:11,color:T.t7}}/>
                        <Bar dataKey="working" name="Trabalhando" fill={T.green} radius={[4,4,0,0]}/>
                        <Bar dataKey="off"     name="Folga"       fill={T.amber} radius={[4,4,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}
                {(userReport.working?.length>0||userReport.off?.length>0)&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                    <Card>
                      <div style={{fontSize:11,color:T.green,letterSpacing:"0.1em",fontWeight:700,marginBottom:12}}>SÁBADOS TRABALHANDO</div>
                      <div style={{maxHeight:200,overflowY:"auto"}}>
                        {userReport.working.map((item,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,padding:"5px 10px",background:T.green+"14",borderRadius:7,border:`1px solid ${T.green}22`}}>
                            <CheckCircle size={12} style={{color:T.green,flexShrink:0}}/>
                            <span style={{fontSize:11,color:T.t4}}>{new Date(item.date+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",month:"short",day:"numeric"})}</span>
                            <span style={{fontSize:10,color:T.t9,marginLeft:"auto"}}>{item.group_name}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                    <Card>
                      <div style={{fontSize:11,color:T.amber,letterSpacing:"0.1em",fontWeight:700,marginBottom:12}}>DIAS DE FOLGA</div>
                      <div style={{maxHeight:200,overflowY:"auto"}}>
                        {userReport.off.map((item,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,padding:"5px 10px",background:T.amber+"14",borderRadius:7,border:`1px solid ${T.amber}22`}}>
                            <XCircle size={12} style={{color:T.amber,flexShrink:0}}/>
                            <span style={{fontSize:11,color:T.t4}}>{new Date(item.date+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",month:"short",day:"numeric"})}</span>
                            <span style={{fontSize:10,color:T.t9,marginLeft:"auto"}}>{item.group_name}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            ):(
              <Card style={{textAlign:"center",padding:60}}>
                <Users size={40} style={{color:T.t9,marginBottom:14}}/>
                <div style={{fontSize:14,color:T.t8}}>Selecione um funcionário para ver o relatório</div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ── ABA SALA DE REUNIÃO ─────────────────────────────────────── */}
      {tab==="meeting" && (
        <div>
          {/* Filtros */}
          <div style={{display:"flex",gap:10,marginBottom:20,alignItems:"center",padding:"14px 16px",background:T.bgCard,borderRadius:12,border:`1px solid ${T.border}`}}>
            <DoorOpen size={16} style={{color:T.accent}}/>
            <span style={{fontSize:13,fontWeight:600,color:T.t1}}>Sala de Reunião</span>
            <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
              <input type="date" value={meetingFrom} onChange={e=>setMeetingFrom(e.target.value)}
                style={{fontSize:12,color:T.t1,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px"}}/>
              <span style={{fontSize:12,color:T.t9}}>até</span>
              <input type="date" value={meetingTo} onChange={e=>setMeetingTo(e.target.value)}
                style={{fontSize:12,color:T.t1,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px"}}/>
            </div>
          </div>

          {meetingStats && (
            <>
              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
                <ExportMenu data={(meetingStats?.byUser||[]).map(u=>({Líder:u.name,"Reservas":u.count,"Horas Totais":Math.round(u.totalMin/60)+"h"}))} filename="sala-reuniao-uso-por-lider" T={T}/>
              </div>
              {/* KPIs */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
                {[
                  {label:"RESERVAS NO PERÍODO",  value:meetingStats.totalBookings,                      color:T.accent,  icon:<DoorOpen size={18}/>},
                  {label:"TAXA DE OCUPAÇÃO",      value:meetingStats.occupancyRate+"%",                  color:meetingStats.occupancyRate>80?T.red:meetingStats.occupancyRate>50?T.amber:T.green, icon:<TrendingUp size={18}/>},
                  {label:"DURAÇÃO MÉDIA",         value:meetingStats.avgDuration<60?meetingStats.avgDuration+"min":Math.floor(meetingStats.avgDuration/60)+"h"+(meetingStats.avgDuration%60>0?" "+meetingStats.avgDuration%60+"min":""), color:T.purple, icon:<Award size={18}/>},
                  {label:"HORAS RESERVADAS",      value:Math.round(meetingStats.totalBookedMin/60)+"h",  color:T.emerald, icon:<Activity size={18}/>},
                ].map((s,i)=>(
                  <Card key={i} style={{padding:"16px 20px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{fontSize:11,color:T.t9,fontWeight:600,letterSpacing:"0.06em",marginBottom:8}}>{s.label}</div>
                        <div style={{fontSize:30,fontWeight:900,color:s.color,lineHeight:1}}>{s.value}</div>
                      </div>
                      <div style={{width:38,height:38,borderRadius:10,background:s.color+"18",display:"flex",alignItems:"center",justifyContent:"center",color:s.color}}>{s.icon}</div>
                    </div>
                  </Card>
                ))}
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                {/* Por dia da semana */}
                <Card>
                  <h3 style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:4}}>Reservas por Dia da Semana</h3>
                  <p style={{fontSize:11,color:T.t9,marginBottom:16}}>Dias com maior demanda</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={meetingStats.byDow.filter(d=>d.dow>=1&&d.dow<=5)}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
                      <XAxis dataKey="label" tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false} allowDecimals={false}/>
                      <Tooltip contentStyle={tt} formatter={v=>[v,"Reservas"]}/>
                      <Bar dataKey="count" radius={[4,4,0,0]} barSize={32}>
                        {meetingStats.byDow.filter(d=>d.dow>=1&&d.dow<=5).map((d,i)=>(
                          <Cell key={i} fill={d.count===Math.max(...meetingStats.byDow.map(x=>x.count))?T.accent:T.accent+"55"}/>
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                {/* Por horário */}
                <Card>
                  <h3 style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:4}}>Pico de Horários</h3>
                  <p style={{fontSize:11,color:T.t9,marginBottom:16}}>Horas com mais reservas</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={meetingStats.byHour.filter(h=>h.hour>=8&&h.hour<=17)}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
                      <XAxis dataKey="hour" tickFormatter={h=>h+"h"} tick={{fill:T.t8,fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:T.t8,fontSize:11}} axisLine={false} tickLine={false} allowDecimals={false}/>
                      <Tooltip contentStyle={tt} formatter={v=>[v,"Reservas"]} labelFormatter={h=>h+"h"}/>
                      <Bar dataKey="count" radius={[4,4,0,0]} barSize={20}>
                        {meetingStats.byHour.filter(h=>h.hour>=8&&h.hour<=17).map((h,i)=>(
                          <Cell key={i} fill={h.count===Math.max(...meetingStats.byHour.map(x=>x.count))?T.red:T.purple+"88"}/>
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>

              {/* Evolução mensal */}
              {meetingStats.byMonth.length>0&&(
                <Card style={{marginBottom:16}}>
                  <h3 style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:4}}>Evolução Mensal</h3>
                  <p style={{fontSize:11,color:T.t9,marginBottom:16}}>Reservas e horas utilizadas por mês</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={meetingStats.byMonth.map(m=>({...m,hours:Math.round(m.totalMin/60)}))}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
                      <XAxis dataKey="month" tick={{fill:T.t8,fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis yAxisId="count" orientation="left"  tick={{fill:T.t8,fontSize:10}} axisLine={false} tickLine={false} allowDecimals={false} label={{value:"Reservas",angle:-90,position:"insideLeft",fill:T.t10,fontSize:10,dx:-2}}/>
                      <YAxis yAxisId="hours" orientation="right" tick={{fill:T.t8,fontSize:10}} axisLine={false} tickLine={false} label={{value:"Horas",angle:90,position:"insideRight",fill:T.t10,fontSize:10,dx:10}}/>
                      <Tooltip contentStyle={tt} formatter={(v,n)=>n==="Reservas"?[v,n]:[v+"h",n]}/>
                      <Legend wrapperStyle={{fontSize:11,color:T.t7}}/>
                      <Bar  yAxisId="count" dataKey="count" name="Reservas" fill={T.accent} opacity={0.8} radius={[4,4,0,0]} barSize={20}/>
                      <Line yAxisId="hours" type="monotone" dataKey="hours" name="Horas" stroke={T.purple} strokeWidth={2} dot={{r:3,fill:T.purple}}/>
                    </ComposedChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Ranking por usuário */}
              <Card>
                <h3 style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:14}}>Ranking por Líder</h3>
                {meetingStats.byUser.length===0&&(
                  <div style={{textAlign:"center",padding:24,color:T.t9,fontSize:13}}>Nenhuma reserva no período</div>
                )}
                {meetingStats.byUser.map((u,i)=>{
                  const max = meetingStats.byUser[0]?.count||1;
                  const pct = Math.round(u.count/max*100);
                  const totalH = Math.floor(u.totalMin/60);
                  const totalM = u.totalMin%60;
                  const colors = ["#185FA5","#0F6E56","#854F0B","#534AB7","#993C1D","#3B6D11"];
                  const c = colors[i%colors.length];
                  return (
                    <div key={i} style={{marginBottom:14}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:22,height:22,borderRadius:"50%",background:c+"22",border:`1px solid ${c}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:c}}>{i+1}</div>
                          <span style={{fontSize:13,color:T.t2}}>{u.name}</span>
                        </div>
                        <div style={{display:"flex",gap:16,alignItems:"center"}}>
                          <span style={{fontSize:11,color:T.t9}}>{totalH>0?totalH+"h ":""}{totalM>0?totalM+"min":""} total</span>
                          <span style={{fontSize:13,fontWeight:700,color:T.t1}}>{u.count} reserva{u.count!==1?"s":""}</span>
                        </div>
                      </div>
                      <div style={{height:6,borderRadius:3,background:T.bgDeep,overflow:"hidden"}}>
                        <div style={{width:`${pct}%`,height:"100%",background:c,borderRadius:3,transition:"width 0.5s"}}/>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </>
          )}

          {!meetingStats&&(
            <div style={{textAlign:"center",padding:60,color:T.t9,fontSize:14}}>
              <DoorOpen size={40} style={{color:T.t9,marginBottom:14,display:"block",margin:"0 auto 14px"}}/>
              Carregando dados da sala de reunião...
            </div>
          )}
        </div>
      )}



      {/* ══ FÉRIAS TAB ══ */}
      {tab === "ferias" && (
        <div>
          {/* Filters */}
          <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"center",padding:"14px 16px",background:T.bgCard,borderRadius:12,border:`1px solid ${T.border}`}}>
            <input type="date" value={vacDateFrom} onChange={e=>setVacDateFrom(e.target.value)}
              style={{fontSize:12,color:T.t1,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px"}}/>
            <span style={{fontSize:12,color:T.t9}}>até</span>
            <input type="date" value={vacDateTo} onChange={e=>setVacDateTo(e.target.value)}
              style={{fontSize:12,color:T.t1,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px"}}/>
            {(isAdmin||isLeader) && (
              <select value={vacGroupFilter} onChange={e=>setVacGroupFilter(e.target.value)}
                style={{fontSize:12,color:T.t1,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",fontFamily:"'Sora',sans-serif",outline:"none"}}>
                <option value="">Todos os grupos</option>
                {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
            <button onClick={fetchVacationStats}
              style={{padding:"7px 16px",background:T.accent,border:"none",borderRadius:8,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Sora',sans-serif"}}>
              ↻ Atualizar
            </button>
            <ExportMenu T={T} filename="ferias-relatorio" data={vacData?.vacations?.map(v=>({
              Funcionário:v.fullName, Grupo:v.groupName||"—", Início:v.startDate, Fim:v.endDate,
              Dias:v.days, Status:v.status, Observações:v.notes||"",
            }))||[]} />
          </div>

          {vacLoading && (
            <div style={{textAlign:"center",padding:60,color:T.t9,fontSize:14}}>
              <Umbrella size={40} style={{color:T.t9,marginBottom:14,display:"block",margin:"0 auto 14px"}}/>
              Carregando dados de férias...
            </div>
          )}

          {vacData && !vacLoading && (
            <>
              {/* Summary cards */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
                {[
                  {label:"Total de períodos", value:vacData.totalVacations, color:T.accent,  sub:"registros"},
                  {label:"Total de dias",      value:vacData.totalDays,      color:"#A78BFA", sub:"dias de férias"},
                  {label:"Agendados",          value:(vacData.byStatus||[]).find(s=>s.status==="scheduled")?.c||0, color:"#60A5FA", sub:"aguardando"},
                  {label:"Aprovados",          value:(vacData.byStatus||[]).find(s=>s.status==="approved")?.c||0,  color:"#34D399", sub:"confirmados"},
                ].map((s,i)=>(
                  <Card key={i} style={{padding:"16px 18px",borderTop:`3px solid ${s.color}`}}>
                    <div style={{fontSize:10,color:T.t9,fontWeight:600,letterSpacing:"0.06em",marginBottom:8}}>{s.label.toUpperCase()}</div>
                    <div style={{fontSize:28,fontWeight:900,color:s.color,lineHeight:1}}>{s.value}</div>
                    <div style={{fontSize:11,color:T.t9,marginTop:6}}>{s.sub}</div>
                  </Card>
                ))}
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:24}}>
                {/* Dias por mês */}
                <Card style={{padding:"18px 20px"}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.t1,marginBottom:16}}>Dias de Férias por Mês</div>
                  {vacData.byMonth && vacData.byMonth.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={vacData.byMonth} margin={{top:0,right:10,bottom:0,left:0}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.borderSubtle}/>
                        <XAxis dataKey="month" tick={{fontSize:9,fill:T.t9}}
                          tickFormatter={v=>{const [y,m]=v.split("-");const mn=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];return mn[parseInt(m)-1]+"/"+y.slice(2);}}/>
                        <YAxis tick={{fontSize:10,fill:T.t9}}/>
                        <Tooltip contentStyle={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,fontSize:12}}/>
                        <Bar dataKey="days" name="Dias" fill={T.accent} radius={[4,4,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <div style={{textAlign:"center",padding:60,color:T.t9,fontSize:13}}>Sem dados</div>}
                </Card>

                {/* Status breakdown */}
                <Card style={{padding:"18px 20px"}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.t1,marginBottom:16}}>Distribuição por Status</div>
                  {vacData.byStatus && vacData.byStatus.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={vacData.byStatus} dataKey="c" nameKey="status" cx="50%" cy="50%" outerRadius={80}
                          label={({status,c})=>`${({scheduled:"Agendado",approved:"Aprovado",completed:"Concluído",cancelled:"Cancelado"}[status]||status)}: ${c}`}>
                          {vacData.byStatus.map((s,i)=>(
                            <Cell key={i} fill={s.status==="approved"?"#34D399":s.status==="completed"?"#A78BFA":s.status==="cancelled"?"#6B7280":"#60A5FA"}/>
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,fontSize:12}}
                          formatter={(v,n)=>[v,{scheduled:"Agendado",approved:"Aprovado",completed:"Concluído",cancelled:"Cancelado"}[n]||n]}/>
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:200,color:T.t9}}>
                      <Umbrella size={32} style={{color:T.t9,marginBottom:10}}/>
                      <div style={{fontSize:13}}>Nenhum dado de férias</div>
                    </div>
                  )}
                </Card>
              </div>

              {/* Upcoming vacations */}
              {vacData.upcoming && vacData.upcoming.length > 0 && (
                <Card style={{padding:0,overflow:"hidden",marginBottom:24}}>
                  <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.borderSubtle}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,fontWeight:700,color:T.t1}}>Próximas Férias Agendadas</span>
                    <Calendar size={15} style={{color:T.accent}}/>
                  </div>
                  {vacData.upcoming.map((v,i)=>{
                    const du = Math.ceil((new Date(v.startDate+"T12:00:00")-new Date())/86400000);
                    return (
                      <div key={v.id} style={{display:"grid",gridTemplateColumns:"48px 1fr 180px 80px 100px",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:`1px solid ${T.borderRow}`,background:i%2===0?"transparent":T.bgRowAlt}}>
                        <div style={{width:36,height:36,borderRadius:"50%",background:(v.groupColor||T.accent)+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:v.groupColor||T.accent}}>
                          {(v.fullName||"?")[0]}
                        </div>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:T.t1}}>{v.fullName}</div>
                          <div style={{fontSize:11,color:T.t9}}>{v.groupName||v.dept||"—"}</div>
                        </div>
                        <div>
                          <div style={{fontSize:12,fontWeight:600,color:T.t2}}>
                            {new Date(v.startDate+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})} → {new Date(v.endDate+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"})}
                          </div>
                          <div style={{fontSize:11,color:T.t9,marginTop:1}}>{v.days} dias</div>
                        </div>
                        <div style={{textAlign:"center",fontSize:12,fontWeight:700,color:du<=30?"#F59E0B":T.t7}}>
                          {du > 0 ? `em ${du}d` : "🏖️ agora"}
                        </div>
                        <div>
                          <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,
                            background:v.status==="approved"?"#34D39918":v.status==="completed"?"#A78BFA18":"#60A5FA18",
                            color:v.status==="approved"?"#34D399":v.status==="completed"?"#A78BFA":"#60A5FA"}}>
                            {v.status==="approved"?"Aprovado":v.status==="completed"?"Concluído":"Agendado"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              )}

              {/* Full table with export */}
              {vacData.vacations && vacData.vacations.length > 0 && (
                <Card style={{padding:0,overflow:"hidden"}}>
                  <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.borderSubtle}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,fontWeight:700,color:T.t1}}>Histórico Completo</span>
                    <ExportMenu T={T} filename="ferias-historico" data={vacData.vacations.map(v=>({
                      Funcionário:v.fullName, Grupo:v.groupName||"—", Início:v.startDate, Fim:v.endDate,
                      Dias:v.days, "Dias Direito":v.daysEntitled, "Período Aq. Início":v.acqStart||"",
                      "Período Aq. Fim":v.acqEnd||"", Status:v.status, Observações:v.notes||"",
                      "Aprovado Por":v.approvedByName||"",
                    }))} />
                  </div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead>
                        <tr style={{background:T.bgDeep}}>
                          {["Funcionário","Grupo","Início","Fim","Dias","Direito","Período Aq.","Status"].map(h=>(
                            <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,fontWeight:700,color:T.t8,letterSpacing:"0.06em",whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {vacData.vacations.map((v,i)=>(
                          <tr key={v.id} style={{borderBottom:`1px solid ${T.borderRow}`,background:i%2===0?"transparent":T.bgRowAlt}}>
                            <td style={{padding:"10px 14px",fontWeight:600,color:T.t1}}>{v.fullName}</td>
                            <td style={{padding:"10px 14px",color:T.t7}}>{v.groupName||"—"}</td>
                            <td style={{padding:"10px 14px",color:T.t2,whiteSpace:"nowrap"}}>{new Date(v.startDate+"T12:00:00").toLocaleDateString("pt-BR")}</td>
                            <td style={{padding:"10px 14px",color:T.t2,whiteSpace:"nowrap"}}>{new Date(v.endDate+"T12:00:00").toLocaleDateString("pt-BR")}</td>
                            <td style={{padding:"10px 14px",fontWeight:700,color:T.accent}}>{v.days}</td>
                            <td style={{padding:"10px 14px",color:T.t7}}>{v.daysEntitled}</td>
                            <td style={{padding:"10px 14px",color:T.t9,fontSize:11}}>{v.acqStart?`${v.acqStart} → ${v.acqEnd}`:"—"}</td>
                            <td style={{padding:"10px 14px"}}>
                              <span style={{display:"inline-block",padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:700,
                                background:v.status==="approved"?"#34D39918":v.status==="completed"?"#A78BFA18":v.status==="cancelled"?"#6B728018":"#60A5FA18",
                                color:v.status==="approved"?"#34D399":v.status==="completed"?"#A78BFA":v.status==="cancelled"?"#6B7280":"#60A5FA"}}>
                                {v.status==="approved"?"Aprovado":v.status==="completed"?"Concluído":v.status==="cancelled"?"Cancelado":"Agendado"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {vacData.totalVacations === 0 && (
                <div style={{textAlign:"center",padding:60,color:T.t9}}>
                  <Umbrella size={40} style={{color:T.t9,marginBottom:14,display:"block",margin:"0 auto 14px"}}/>
                  <div style={{fontSize:14,marginBottom:6}}>Sem dados de férias no período</div>
                  <div style={{fontSize:12,color:T.t10}}>Acesse "Controle de Férias" para cadastrar ou importar histórico</div>
                </div>
              )}
            </>
          )}



              {/* ══ Visão por Funcionário ══ */}
              {compliance.length > 0 && (() => {
                const isHRRole = user?.role === "hr" || user?.role === "ti";

                // Group summary cards for HR
                const groupMap = {};
                compliance.forEach(c => {
                  const gid = c.groupId || "__none";
                  if (!groupMap[gid]) groupMap[gid] = {
                    id: gid, name: c.groupName || "Sem grupo", color: c.groupColor,
                    members: 0, onVac: 0, scheduled: 0, approved: 0, needsSched: 0, critical: 0
                  };
                  groupMap[gid].members++;
                  if (c.isOnVacation)              groupMap[gid].onVac++;
                  if (c.scheduledCount > 0)        groupMap[gid].scheduled++;
                  if (c.approvedCount > 0)         groupMap[gid].approved++;
                  if (c.hasRemainingUnscheduled)   groupMap[gid].needsSched++;
                  if (c.urgency === "critical" || c.urgency === "overdue") groupMap[gid].critical++;
                });
                const grpList = Object.values(groupMap);

                return (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: T.t1 }}>
                        Visão por Funcionário
                      </div>
                      <span style={{ fontSize: 11, color: T.t7 }}>{compliance.length} funcionário{compliance.length !== 1 ? "s" : ""}</span>
                    </div>

                    {isHRRole && grpList.length > 1 && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 10, marginBottom: 16 }}>
                        {grpList.map(g => (
                          <div key={g.id} style={{ padding: "12px 14px", background: T.bgCard, border: `1px solid ${g.critical > 0 ? "#F8717140" : T.border}`, borderLeft: `3px solid ${g.color || T.accent}`, borderRadius: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: T.t1, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px", fontSize: 10 }}>
                              <span style={{ color: T.t7 }}>{g.members} membros</span>
                              {g.onVac > 0 && <span style={{ color: "#FBBF24", fontWeight: 700 }}>🏖️ {g.onVac} em férias</span>}
                              {g.scheduled > 0 && <span style={{ color: "#60A5FA" }}>📅 {g.scheduled} agend.</span>}
                              {g.approved > 0 && <span style={{ color: "#34D399" }}>✓ {g.approved} aprov.</span>}
                              {g.needsSched > 0 && <span style={{ color: "#F59E0B", fontWeight: 700 }}>⚠ {g.needsSched} sem agenda</span>}
                              {g.critical > 0 && <span style={{ color: "#F87171", fontWeight: 700 }}>🔴 {g.critical} crítico</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ background: T.bgCard, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: T.bgDeep }}>
                              {["Funcionário", ...(isHRRole ? ["Grupo"] : []), "Agend.", "Aprov.", "Concluídas", "Dias Usados", "Saldo", "Próximas Férias", "Prazo CLT", "Status"].map(h => (
                                <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.t8, letterSpacing: "0.06em", whiteSpace: "nowrap", borderBottom: `1px solid ${T.border}` }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[...compliance].sort((a, b) => {
                              const ord = { overdue: 0, critical: 1, warn: 2, ok: 3 };
                              return (ord[a.urgency] ?? 3) - (ord[b.urgency] ?? 3);
                            }).map((c, i) => {
                              const urgCol = c.urgency === "overdue" ? "#F87171" : c.urgency === "critical" ? "#F59E0B" : c.urgency === "warn" ? "#FBBF24" : "#34D399";
                              return (
                                <tr key={c.userId} style={{ borderBottom: `1px solid ${T.borderRow}`, background: c.isOnVacation ? "#FBBF2406" : i % 2 === 0 ? "transparent" : T.bgRowAlt }}>
                                  <td style={{ padding: "10px 12px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                      <div style={{ width: 26, height: 26, borderRadius: "50%", background: (c.groupColor || T.accent) + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: c.groupColor || T.accent, flexShrink: 0 }}>
                                        {(c.fullName || "?")[0]}
                                      </div>
                                      <div>
                                        <div style={{ fontWeight: 700, color: T.t1, whiteSpace: "nowrap", fontSize: 11 }}>{c.fullName}</div>
                                        <div style={{ fontSize: 10, color: T.t9 }}>{c.dept || c.username}</div>
                                      </div>
                                    </div>
                                  </td>
                                  {isHRRole && (
                                    <td style={{ padding: "10px 12px" }}>
                                      <span style={{ padding: "2px 7px", borderRadius: 8, background: (c.groupColor || T.accent) + "18", color: c.groupColor || T.accent, fontSize: 10, fontWeight: 600, whiteSpace: "nowrap" }}>{c.groupName || "—"}</span>
                                    </td>
                                  )}
                                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: c.scheduledCount > 0 ? "#60A5FA" : T.t9 }}>{c.scheduledCount}</span>
                                  </td>
                                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: c.approvedCount > 0 ? "#34D399" : T.t9 }}>{c.approvedCount}</span>
                                  </td>
                                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: c.completedCount > 0 ? "#A78BFA" : T.t9 }}>{c.completedCount}</span>
                                  </td>
                                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: T.t2 }}>{c.daysTaken}d</div>
                                    <div style={{ fontSize: 9, color: T.t9 }}>/ {c.daysEntitled}d</div>
                                  </td>
                                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                                    <div style={{ fontSize: 15, fontWeight: 900, color: c.daysRemaining > 10 ? "#34D399" : c.daysRemaining > 0 ? "#F59E0B" : "#F87171" }}>{c.daysRemaining}</div>
                                    <div style={{ fontSize: 9, color: T.t9 }}>dias</div>
                                  </td>
                                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                                    {c.isOnVacation ? (
                                      <div>
                                        <span style={{ color: "#FBBF24", fontWeight: 700, fontSize: 11 }}>🏖️ Em férias</span>
                                        {c.returnDate && <div style={{ fontSize: 10, color: T.t9 }}>volta {new Date(c.returnDate+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})}</div>}
                                      </div>
                                    ) : c.nextScheduledStart ? (
                                      <div>
                                        <div style={{ fontWeight: 600, color: T.t2, fontSize: 11 }}>{new Date(c.nextScheduledStart+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})}</div>
                                        <div style={{ fontSize: 10, color: T.t7 }}>{c.nextScheduledDays}d · <span style={{ color: c.nextScheduledStatus === "approved" ? "#34D399" : "#60A5FA", fontWeight: 600 }}>{c.nextScheduledStatus === "approved" ? "Aprov." : "Agend."}</span></div>
                                      </div>
                                    ) : (
                                      <span style={{ color: c.daysRemaining > 0 ? "#F59E0B" : T.t9, fontSize: 11, fontWeight: c.daysRemaining > 0 ? 700 : 400 }}>
                                        {c.daysRemaining > 0 ? "⚠ Sem agenda" : "—"}
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                                    {c.daysUntilDeadline !== null ? (
                                      <div>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: urgCol }}>{c.daysUntilDeadline < 0 ? "Vencido!" : `${c.daysUntilDeadline}d`}</div>
                                        {c.deadlineDate && <div style={{ fontSize: 9, color: T.t9 }}>{new Date(c.deadlineDate+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"2-digit"})}</div>}
                                      </div>
                                    ) : <span style={{ color: T.t9, fontSize: 11 }}>—</span>}
                                  </td>
                                  <td style={{ padding: "10px 12px" }}>
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: urgCol + "18", color: urgCol, whiteSpace: "nowrap" }}>
                                      {c.urgency === "overdue" ? "Vencido" : c.urgency === "critical" ? "Crítico" : c.urgency === "warn" ? "Atenção" : "OK"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── Compliance / CLT Report ── */}
              {compliance.length > 0 && (
                <Card style={{padding:0,overflow:"hidden",marginTop:24}}>
                  <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.borderSubtle}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                    <div>
                      <span style={{fontSize:13,fontWeight:700,color:T.t1}}>Relatório de Férias por Funcionário</span>
                      <div style={{fontSize:11,color:T.t8,marginTop:2}}>Saldo, prazos CLT e alertas de agendamento</div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      {(isAdmin||isLeader) && (
                        <select value={compGroupFilter} onChange={e=>setCompGroupFilter(e.target.value)}
                          style={{fontSize:11,color:T.t1,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 9px",fontFamily:"'Sora',sans-serif",outline:"none"}}>
                          <option value="">Todos os grupos</option>
                          {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      )}
                      <button onClick={()=>downloadExcel(compliance.map(c=>({
                        funcionario:c.fullName,grupo:c.groupName||"—",
                        dias_direito:c.daysEntitled,dias_tomados:c.daysTaken,dias_restantes:c.daysRemaining,
                        periodo_aq_inicio:c.acqStart||"",periodo_aq_fim:c.acqEnd||"",
                        prazo_concessivo:c.concEnd||"",dias_ate_prazo:c.daysUntilDeadline??"-",
                        urgencia:c.urgency,em_ferias_agora:c.isOnVacation?"sim":"não",
                        retorno:c.returnDate||"",proximas_inicio:c.nextScheduledStart||"",
                      })),"compliance-ferias")}
                        style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",color:T.accent,fontSize:11,fontWeight:600,fontFamily:"'Sora',sans-serif"}}>
                        <Download size={12}/> Excel
                      </button>
                    </div>
                  </div>

                  {/* Alert summary bar */}
                  {(() => {
                    const critical = compliance.filter(c=>c.urgency==="critical").length;
                    const warn     = compliance.filter(c=>c.urgency==="warn").length;
                    const overdue  = compliance.filter(c=>c.urgency==="overdue").length;
                    return (critical+warn+overdue) > 0 ? (
                      <div style={{display:"flex",gap:12,padding:"10px 16px",background:"#F59E0B08",borderBottom:`1px solid ${T.border}`,flexWrap:"wrap"}}>
                        {overdue>0&&<span style={{fontSize:12,fontWeight:700,color:"#E24B4A",display:"flex",alignItems:"center",gap:5}}>⛔ {overdue} prazo vencido{overdue>1?"s":""}</span>}
                        {critical>0&&<span style={{fontSize:12,fontWeight:700,color:"#F87171",display:"flex",alignItems:"center",gap:5}}>🚨 {critical} crítico{critical>1?"s":""} (≤30 dias)</span>}
                        {warn>0&&<span style={{fontSize:12,fontWeight:600,color:"#F59E0B",display:"flex",alignItems:"center",gap:5}}>⚠️ {warn} atenção (≤90 dias)</span>}
                        <span style={{fontSize:11,color:T.t9,marginLeft:"auto"}}>Agendar as férias restantes com no máximo 30 dias de antecedência do prazo</span>
                      </div>
                    ) : null;
                  })()}

                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead>
                        <tr style={{background:T.bgDeep}}>
                          {["Funcionário","Grupo","Tomados","Restantes","Período Aq.","Prazo Concessivo","Dias p/ Prazo","Próx. Agendado","Status"].map(h=>(
                            <th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:T.t8,letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {compliance
                          .filter(c=>!compGroupFilter||c.groupId===compGroupFilter)
                          .map((c,i)=>{
                          const urgColor = c.urgency==="overdue"?"#E24B4A":c.urgency==="critical"?"#F87171":c.urgency==="warn"?"#F59E0B":T.green;
                          const urgBg    = c.urgency==="overdue"?"#E24B4A0F":c.urgency==="critical"?"#F871710F":c.urgency==="warn"?"#F59E0B0F":"transparent";
                          return (
                            <tr key={c.userId} style={{borderBottom:`1px solid ${T.borderRow}`,background:urgBg||( i%2===0?"transparent":T.bgRowAlt)}}>
                              <td style={{padding:"10px 12px"}}>
                                <div style={{display:"flex",alignItems:"center",gap:8}}>
                                  <div style={{width:28,height:28,borderRadius:"50%",background:(c.groupColor||T.accent)+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:c.groupColor||T.accent,flexShrink:0}}>
                                    {(c.fullName||"?")[0]}
                                  </div>
                                  <div>
                                    <div style={{fontWeight:700,color:T.t1}}>{c.fullName}</div>
                                    {c.isOnVacation&&<span style={{fontSize:9,fontWeight:700,color:"#FBBF24"}}>🏖️ em férias</span>}
                                    {c.returnDate&&<div style={{fontSize:10,color:T.t9}}>retorno: {new Date(c.returnDate+"T12:00:00").toLocaleDateString("pt-BR")}</div>}
                                  </div>
                                </div>
                              </td>
                              <td style={{padding:"10px 12px",color:T.t7,fontSize:11}}>{c.groupName||"—"}</td>
                              <td style={{padding:"10px 12px",fontWeight:700,color:"#A78BFA",textAlign:"center"}}>{c.daysTaken}d</td>
                              <td style={{padding:"10px 12px",textAlign:"center"}}>
                                <span style={{fontSize:16,fontWeight:900,color:c.daysRemaining===0?T.green:urgColor}}>{c.daysRemaining}</span>
                                <span style={{fontSize:10,color:T.t9}}>/30</span>
                              </td>
                              <td style={{padding:"10px 12px",fontSize:11,color:T.t8,whiteSpace:"nowrap"}}>
                                {c.acqStart?`${new Date(c.acqStart+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})} → ${new Date(c.acqEnd+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit"})}`:"—"}
                              </td>
                              <td style={{padding:"10px 12px",fontSize:11,whiteSpace:"nowrap"}}>
                                {c.concEnd?(
                                  <span style={{color:urgColor,fontWeight:c.urgency!=="ok"?700:400}}>
                                    {new Date(c.concEnd+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit"})}
                                  </span>
                                ):"—"}
                              </td>
                              <td style={{padding:"10px 12px",textAlign:"center"}}>
                                {c.daysUntilDeadline!==null?(
                                  <div style={{display:"inline-flex",flexDirection:"column",alignItems:"center"}}>
                                    <span style={{fontSize:16,fontWeight:900,color:urgColor,lineHeight:1}}>
                                      {c.daysUntilDeadline<0?`${Math.abs(c.daysUntilDeadline)}d atraso`:c.daysUntilDeadline+"d"}
                                    </span>
                                    {c.urgency==="critical"&&<span style={{fontSize:9,fontWeight:700,color:"#F87171"}}>URGENTE</span>}
                                    {c.urgency==="overdue"&&<span style={{fontSize:9,fontWeight:700,color:"#E24B4A"}}>VENCIDO</span>}
                                    {c.urgency==="warn"&&<span style={{fontSize:9,color:"#F59E0B"}}>atenção</span>}
                                  </div>
                                ):<span style={{color:T.t9,fontSize:12}}>—</span>}
                              </td>
                              <td style={{padding:"10px 12px",fontSize:11,whiteSpace:"nowrap"}}>
                                {c.nextScheduledStart?(
                                  <div>
                                    <div style={{color:T.t2,fontWeight:600}}>{new Date(c.nextScheduledStart+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})}</div>
                                    <div style={{fontSize:10,color:T.t9}}>{c.nextScheduledDays}d · <span style={{color:c.nextScheduledStatus==="approved"?"#34D399":"#60A5FA"}}>{c.nextScheduledStatus==="approved"?"Aprovado":"Agendado"}</span></div>
                                  </div>
                                ):(
                                  c.hasRemainingUnscheduled?(
                                    <span style={{fontSize:10,fontWeight:700,color:urgColor}}>⚠ Não agendado</span>
                                  ):<span style={{color:T.t9}}>—</span>
                                )}
                              </td>
                              <td style={{padding:"10px 12px"}}>
                                {c.daysRemaining===0?(
                                  <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:12,fontSize:10,fontWeight:700,background:"#34D39918",color:"#34D399"}}>✓ Completo</span>
                                ):c.urgency==="overdue"?(
                                  <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:12,fontSize:10,fontWeight:700,background:"#E24B4A18",color:"#E24B4A"}}>⛔ Vencido</span>
                                ):c.urgency==="critical"?(
                                  <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:12,fontSize:10,fontWeight:700,background:"#F8717118",color:"#F87171"}}>🚨 Crítico</span>
                                ):c.urgency==="warn"?(
                                  <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:12,fontSize:10,fontWeight:700,background:"#F59E0B18",color:"#F59E0B"}}>⚠ Atenção</span>
                                ):(
                                  <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:12,fontSize:10,fontWeight:600,background:T.bgDeep,color:T.t7}}>Normal</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

          {!vacData && !vacLoading && (
            <div style={{textAlign:"center",padding:60,color:T.t9}}>
              <Umbrella size={40} style={{color:T.t9,marginBottom:14,display:"block",margin:"0 auto 14px"}}/>
              <div style={{fontSize:14,marginBottom:6}}>Clique em "Atualizar" para carregar os dados</div>
            </div>
          )}
        </div>
      )}

      {/* ══ PONTO TAB ══ */}
      {tab === "ponto" && (
        <div>
          {/* Filters */}
          <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"center",padding:"14px 16px",background:T.bgCard,borderRadius:12,border:`1px solid ${T.border}`}}>
            <input type="date" value={pontoDateFrom} onChange={e=>setPontoDateFrom(e.target.value)}
              style={{fontSize:12,color:T.t1,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px"}}/>
            <span style={{fontSize:12,color:T.t9}}>até</span>
            <input type="date" value={pontoDateTo} onChange={e=>setPontoDateTo(e.target.value)}
              style={{fontSize:12,color:T.t1,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px"}}/>
            {(isAdmin||isLeader) && (
              <select value={pontoGroupFilter} onChange={e=>setPontoGroupFilter(e.target.value)}
                style={{fontSize:12,color:T.t1,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",fontFamily:"'Sora',sans-serif",outline:"none"}}>
                <option value="">Todos os grupos</option>
                {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
            <button onClick={fetchPontoStats} style={{padding:"7px 16px",background:T.accent,border:"none",borderRadius:8,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Sora',sans-serif"}}>
              ↻ Atualizar
            </button>
            <ExportMenu T={T} filename="ponto-relatorio" data={pontoByEmp.length > 0 ? pontoByEmp.map(e=>({
              Funcionário:e.fullName, Departamento:e.dept||"—",
              "Total Batidas":e.totalBatidas, "Dias Trabalhados":e.daysWorked,
              "Dias Incompletos":e.incompleteDays,
            })) : []} />
          </div>

          {pontoLoading && (
            <div style={{textAlign:"center",padding:60,color:T.t9,fontSize:14}}>
              <Clock size={40} style={{color:T.t9,marginBottom:14,display:"block",margin:"0 auto 14px"}}/>
              Carregando dados de ponto...
            </div>
          )}

          {pontoSummary && !pontoLoading && (
            <>
              {/* Summary cards */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:24}}>
                {[
                  {label:"Total de Batidas",      value:pontoSummary.totalBatidas, color:T.accent,  sub:"registros no período"},
                  {label:"Funcionários com Ponto", value:pontoSummary.totalUsers,   color:T.purple,  sub:"marcaram ponto"},
                  {label:"Dias Incompletos",       value:(pontoSummary.topIncomplete||[]).reduce((s,u)=>s+u.incomplete_days,0), color:"#F59E0B", sub:"pares de batida ímpares"},
                ].map((s,i)=>(
                  <Card key={i} style={{padding:"16px 18px"}}>
                    <div style={{fontSize:10,color:T.t9,fontWeight:600,letterSpacing:"0.06em",marginBottom:8}}>{s.label}</div>
                    <div style={{fontSize:28,fontWeight:900,color:s.color,lineHeight:1}}>{s.value}</div>
                    <div style={{fontSize:11,color:T.t9,marginTop:6}}>{s.sub}</div>
                  </Card>
                ))}
              </div>

              {/* Batidas por dia */}
              {pontoSummary.byDay && pontoSummary.byDay.length > 0 && (
                <Card style={{padding:"18px 20px",marginBottom:24}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.t1,marginBottom:16}}>Batidas por Dia</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={pontoSummary.byDay} margin={{top:0,right:10,bottom:0,left:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.borderSubtle}/>
                      <XAxis dataKey="date" tick={{fontSize:9,fill:T.t9}}
                        tickFormatter={v=>{const d=new Date(v+"T12:00:00");return `${d.getDate()}/${d.getMonth()+1}`;}}/>
                      <YAxis tick={{fontSize:10,fill:T.t9}}/>
                      <Tooltip contentStyle={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,fontSize:12}}
                        labelFormatter={v=>{const d=new Date(v+"T12:00:00");return d.toLocaleDateString("pt-BR");}}/>
                      <Bar dataKey="c" name="Batidas" fill={T.accent} radius={[3,3,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Top incompletos */}
              {pontoSummary.topIncomplete && pontoSummary.topIncomplete.length > 0 && (
                <Card style={{padding:0,overflow:"hidden",marginBottom:24}}>
                  <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.borderSubtle}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,fontWeight:700,color:T.t1}}>Funcionários com mais Dias Incompletos</span>
                    <AlertOctagon size={15} style={{color:"#F59E0B"}}/>
                  </div>
                  {pontoSummary.topIncomplete.map((f,i)=>{
                    const max = pontoSummary.topIncomplete[0]?.incomplete_days || 1;
                    const pct = Math.round(f.incomplete_days / max * 100);
                    return (
                      <div key={f.user_id} style={{padding:"12px 16px",borderBottom:`1px solid ${T.borderRow}`,background:i%2===0?"transparent":T.bgRowAlt}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:26,height:26,borderRadius:"50%",background:"#F59E0B22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#F59E0B"}}>{i+1}</div>
                            <span style={{fontSize:13,fontWeight:600,color:T.t1}}>{f.full_name}</span>
                          </div>
                          <span style={{fontSize:13,fontWeight:700,color:"#F59E0B"}}>{f.incomplete_days} dia{f.incomplete_days!==1?"s":""}</span>
                        </div>
                        <div style={{height:5,borderRadius:3,background:T.bgDeep,overflow:"hidden"}}>
                          <div style={{width:`${pct}%`,height:"100%",background:"#F59E0B",borderRadius:3,transition:"width 0.5s"}}/>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              )}

              {/* Per-employee table */}
              {pontoByEmp.length > 0 && (
                <Card style={{padding:0,overflow:"hidden"}}>
                  <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.borderSubtle}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,fontWeight:700,color:T.t1}}>Resumo por Funcionário</span>
                    <ExportMenu T={T} filename="ponto-por-funcionario" data={pontoByEmp.map(e=>({
                      Funcionário:e.fullName, Departamento:e.dept||"—",
                      "Total Batidas":e.totalBatidas, "Dias Trabalhados":e.daysWorked,
                      "Dias Incompletos":e.incompleteDays,
                    }))} />
                  </div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead>
                        <tr style={{background:T.bgDeep}}>
                          {["Funcionário","Setor","Total Batidas","Dias Trabalhados","Dias Incompletos"].map(h=>(
                            <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,fontWeight:700,color:T.t8,letterSpacing:"0.06em",whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pontoByEmp.map((e,i)=>(
                          <tr key={e.userId} style={{borderBottom:`1px solid ${T.borderRow}`,background:i%2===0?"transparent":T.bgRowAlt}}>
                            <td style={{padding:"10px 14px",fontWeight:600,color:T.t1}}>{e.fullName}</td>
                            <td style={{padding:"10px 14px",color:T.t7}}>{e.dept||"—"}</td>
                            <td style={{padding:"10px 14px",fontWeight:700,color:T.accent}}>{e.totalBatidas}</td>
                            <td style={{padding:"10px 14px",color:T.green}}>{e.daysWorked}</td>
                            <td style={{padding:"10px 14px",fontWeight:700,color:e.incompleteDays>0?"#F59E0B":T.t9}}>{e.incompleteDays}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {pontoSummary.totalBatidas === 0 && (
                <div style={{textAlign:"center",padding:60,color:T.t9}}>
                  <Fingerprint size={40} style={{color:T.t9,marginBottom:14,display:"block",margin:"0 auto 14px"}}/>
                  <div style={{fontSize:14,marginBottom:6}}>Sem dados de ponto no período</div>
                  <div style={{fontSize:12,color:T.t10}}>Ajuste o filtro de datas ou aguarde registros de integração</div>
                </div>
              )}
            </>
          )}

          {!pontoSummary && !pontoLoading && (
            <div style={{textAlign:"center",padding:60,color:T.t9}}>
              <Fingerprint size={40} style={{color:T.t9,marginBottom:14,display:"block",margin:"0 auto 14px"}}/>
              <div style={{fontSize:14,marginBottom:6}}>Clique em "Atualizar" para carregar os dados</div>
            </div>
          )}
        </div>
      )}

      {tab==="forms" && (
        <div style={{padding:"4px 0"}}>
          <FormsReport />
        </div>
      )}

    </div>
  );
}

// ── Batidas Dashboard (standalone component used inside Reports) ──────────────
