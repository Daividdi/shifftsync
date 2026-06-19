import React, { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Trash2, FileText, AlertTriangle, CheckCircle, XCircle, Clock, ChevronDown, AlertOctagon, Edit2 } from "lucide-react";
import { Card, Badge, Avatar, Btn } from "../components/UI";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";

function isAdmin(role)  { return role === "hr" || role === "ti" || role === "gerencia"; }
function isLeader(role) { return role === "leader" || role === "gerencia" || isAdmin(role); }

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{day:"numeric",month:"short",year:"numeric"});
}
function fmtDateLong(d) {
  if (!d) return "—";
  const dt = new Date(d+"T12:00:00");
  const days = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${dt.getDate()} ${months[dt.getMonth()]}. ${dt.getFullYear()} — ${days[dt.getDay()]}`;
}

const TYPE_COLORS = {
  "Falta Injustificada": "#E24B4A", "Atestado Médico": "#BA7517",
  "Licença Médica": "#BA7517", "Férias": "#3B6D11", "Banco de Horas": "#3B6D11",
  "Falta Justificada": "#534AB7", "Licença Maternidade/Paternidade": "#185FA5",
  "Declaração de Comparecimento": "#5F5E5A", "Outros": "#888780",
};
const STATUS_CONFIG = {
  pending:  { label: "Pendente",  color: "#F59E0B", bg: "#F59E0B18" },
  approved: { label: "Aprovado",  color: "#34D399", bg: "#34D39918" },
  rejected: { label: "Rejeitado", color: "#F87171", bg: "#F8717118" },
};


const FALTA_TYPE_LABELS = {
  entrada: "Entrada",
  saida: "Saída",
  inicio_intervalo: "Início Intervalo",
  fim_intervalo: "Fim Intervalo",
};
const FALTA_STATUS_CONFIG = {
  pending:   { label: "Pendente",   color: "#F59E0B", bg: "#F59E0B18" },
  confirmed: { label: "Confirmado", color: "#F87171", bg: "#F8717118" },
  dismissed: { label: "Descartado", color: "#6B7280", bg: "#6B728018" },
};
function FaltaStatusBadge({ status, T }) {
  const s = FALTA_STATUS_CONFIG[status] || FALTA_STATUS_CONFIG.pending;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:20,
      fontSize:11, fontWeight:600, background:s.bg, color:s.color }}>
      {status === "confirmed" ? <AlertOctagon size={11}/> : status === "dismissed" ? <XCircle size={11}/> : <Clock size={11}/>}
      {s.label}
    </span>
  );
}

function StatusBadge({ status, T }) {
  const s = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:20,
      fontSize:11, fontWeight:600, background:s.bg, color:s.color }}>
      {status === "approved" ? <CheckCircle size={11}/> : status === "rejected" ? <XCircle size={11}/> : <Clock size={11}/>}
      {s.label}
    </span>
  );
}

export default function OccurrencesPage() {
  const { user } = useAuth();
  const { theme: T } = useTheme();

  const [tab, setTab] = useState("occurrences");

  // ── Occurrences state ──
  const [occurrences, setOccurrences] = useState([]);
  const [types,       setTypes]       = useState([]);
  const [groups,      setGroups]      = useState([]);
  const [users,       setUsers]       = useState([]);
  const [showForm,    setShowForm]    = useState(false);
  const [editOccurrence, setEditOccurrence] = useState(null);
  const [flash,       setFlash]       = useState("");
  const [form, setForm] = useState({ userId:"", type:"", dateStart:"", dateEnd:"", description:"" });
  const [filter, setFilter] = useState({
    type:"", userId:"", groupId:"",
    dateFrom: new Date(Date.now()-30*86400000).toISOString().slice(0,10),
    dateTo:   new Date().toISOString().slice(0,10),
  });

  // ── Abono state ──
  const [abonos,       setAbonos]       = useState([]);
  const [abonoReasons, setAbonoReasons] = useState([]);
  const [showAbono,    setShowAbono]    = useState(false);
  const [reviewModal,  setReviewModal]  = useState(null);
  const [reviewNote,   setReviewNote]   = useState("");
  const [savingAbono,  setSavingAbono]  = useState(false);
  const [editAbono,    setEditAbono]    = useState(null);
  const [abonoForm, setAbonoForm] = useState({
    userId:"", punchDate: new Date().toISOString().slice(0,10), punchDateTo:"",
    punchTime:"", punchTimeTo:"", punchType:"entrada", reason:"", justification:"",
  });
  const [abonoFilter, setAbonoFilter] = useState({
    status:"", dateFrom: new Date(Date.now()-30*86400000).toISOString().slice(0,10),
    dateTo: new Date().toISOString().slice(0,10),
  });


  // ── Falta de Ponto state ──
  const [faltas,       setFaltas]      = useState([]);
  const [showFalta,    setShowFalta]   = useState(false);
  const occFormRef   = useRef(null);
  const faltaFormRef = useRef(null);
  const [editFalta,    setEditFalta]   = useState(null);
  const [faltaForm, setFaltaForm] = useState({
    userId:"", faltaDate: new Date().toISOString().slice(0,10),
    expectedType:"entrada", reason:"", notes:"",
  });
  const [faltaFilter, setFaltaFilter] = useState({
    status:"", dateFrom: new Date(Date.now()-30*86400000).toISOString().slice(0,10),
    dateTo: new Date().toISOString().slice(0,10),
  });
  const setFFrm = (k,v) => setFaltaForm(f=>({...f,[k]:v}));
  const setFF   = (k,v) => setFaltaFilter(f=>({...f,[k]:v}));

  const setF    = (k,v) => setFilter(f=>({...f,[k]:v}));
  const setFrm  = (k,v) => setForm(f=>({...f,[k]:v}));
  const setAF   = (k,v) => setAbonoFilter(f=>({...f,[k]:v}));
  const setAFrm = (k,v) => setAbonoForm(f=>({...f,[k]:v}));

  function showFlash(msg) { setFlash(msg); setTimeout(()=>setFlash(""), 4000); }

  useEffect(() => {
    if (showForm && occFormRef.current) {
      occFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [showForm]);

  useEffect(() => {
    if (showFalta && faltaFormRef.current) {
      faltaFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [showFalta]);

  const fetchOccurrences = useCallback(async () => {
    try {
      const q = new URLSearchParams({ dateFrom:filter.dateFrom, dateTo:filter.dateTo });
      if (filter.type)    q.set("type",    filter.type);
      if (filter.userId)  q.set("userId",  filter.userId);
      if (filter.groupId) q.set("groupId", filter.groupId);
      const r = await api.get("/occurrences?"+q);
      setOccurrences(r.data.rows||[]);
    } catch(e) {}
  }, [filter]);

  const fetchAbonos = useCallback(async () => {
    try {
      const q = new URLSearchParams({ dateFrom:abonoFilter.dateFrom, dateTo:abonoFilter.dateTo });
      if (abonoFilter.status) q.set("status", abonoFilter.status);
      const r = await api.get("/occurrences/abono?"+q);
      setAbonos(r.data.rows||[]);
    } catch(e) {}
  }, [abonoFilter]);

  useEffect(() => {
    api.get("/occurrences/types").then(r=>setTypes(r.data||[]));
    api.get("/occurrences/abono/reasons").then(r=>setAbonoReasons(r.data||[]));
    api.get("/groups").then(r=>setGroups(r.data||[]));
    api.get("/users").then(r=>setUsers((r.data||[]).filter(u=>u.active!==0)));
  }, []);


  const fetchFaltas = useCallback(async () => {
    try {
      const q = new URLSearchParams({ dateFrom:faltaFilter.dateFrom, dateTo:faltaFilter.dateTo });
      if (faltaFilter.status) q.set("status", faltaFilter.status);
      const r = await api.get("/occurrences/falta-ponto?"+q);
      setFaltas(r.data.rows||[]);
    } catch(e) {}
  }, [faltaFilter]);

  useEffect(() => { fetchOccurrences(); }, [fetchOccurrences]);
  useEffect(() => { if (tab === "abono") fetchAbonos(); }, [tab, fetchAbonos]);
  useEffect(() => { if (tab === "falta") fetchFaltas(); }, [tab, fetchFaltas]);

  const submitOccurrence = async () => {
    if (!form.type || !form.dateStart || (!editOccurrence && !form.userId)) {
      showFlash("Erro: Preencha funcionário, tipo e data de início."); return;
    }
    try {
      if (editOccurrence) {
        await api.patch("/occurrences/"+editOccurrence.id, {
          type: form.type, dateStart: form.dateStart,
          dateEnd: form.dateEnd || null, description: form.description,
        });
        showFlash("Ocorrência atualizada com sucesso!");
      } else {
        await api.post("/occurrences", form);
        showFlash("Ocorrência registrada com sucesso!");
      }
      setForm({ userId:"", type:"", dateStart:"", dateEnd:"", description:"" });
      setEditOccurrence(null); setShowForm(false); fetchOccurrences();
    } catch(e) { showFlash("Erro: "+(e.response?.data?.error||e.message)); }
  };

  const removeOccurrence = async (id) => {
    if (!window.confirm("Excluir esta ocorrência?")) return;
    try { await api.delete("/occurrences/"+id); fetchOccurrences(); }
    catch(e) { showFlash("Erro ao excluir"); }
  };

  const submitAbono = async (e) => {
    e.preventDefault();
    const { userId, punchDate, punchDateTo, punchTime, punchTimeTo, punchType, reason, justification } = abonoForm;
    const isMultiDay = !!(punchDateTo && punchDateTo !== punchDate);
    const isRange = !!(punchTime && punchTimeTo);
    const justificationRequired = !["Atestado Médico", "Férias"].includes(reason);
    if (!editAbono && !userId) { showFlash("Erro: Selecione o funcionário."); return; }
    if (!punchDate || (!isMultiDay && !punchTime && !punchTimeTo) || !reason || (justificationRequired && !justification)) {
      showFlash("Erro: Preencha todos os campos obrigatórios."); return;
    }
    if (punchDateTo && punchDateTo < punchDate) {
      showFlash("Erro: Data fim deve ser igual ou após a data início."); return;
    }
    if (isRange && punchTimeTo <= punchTime) {
      showFlash("Erro: Hora de retorno deve ser após a saída."); return;
    }
    setSavingAbono(true);
    try {
      if (editAbono) {
        await api.put(`/occurrences/abono/${editAbono.id}`, { punchDate, punchDateTo, punchTime, punchTimeTo, punchType, reason, justification });
        showFlash("Abono atualizado com sucesso!");
        setEditAbono(null);
      } else {
        await api.post("/occurrences/abono", abonoForm);
        showFlash("Abono solicitado com sucesso!");
      }
      setShowAbono(false);
      setAbonoForm({ userId:"", punchDate: new Date().toISOString().slice(0,10), punchDateTo:"", punchTime:"", punchTimeTo:"", punchType:"entrada", reason:"", justification:"" });
      fetchAbonos();
    } catch(e) { showFlash("Erro: "+(e.response?.data?.error||e.message)); }
    setSavingAbono(false);
  };

  const reviewAbono = async (status) => {
    if (!reviewModal) return;
    setSavingAbono(true);
    try {
      await api.patch(`/occurrences/abono/${reviewModal.id}`, { status, reviewNote });
      showFlash(status === "approved" ? "Abono aprovado!" : "Abono rejeitado.");
      setReviewModal(null); setReviewNote("");
      fetchAbonos();
    } catch(e) { showFlash("Erro ao revisar"); }
    setSavingAbono(false);
  };

  const deleteAbono = async (id) => {
    if (!window.confirm("Excluir esta solicitação?")) return;
    try { await api.delete(`/occurrences/abono/${id}`); fetchAbonos(); }
    catch(e) { showFlash("Erro: "+(e.response?.data?.error||e.message)); }
  };

  const submitFalta = async (e) => {
    e?.preventDefault();
    const { userId, faltaDate, expectedType } = faltaForm;
    if (!userId || !faltaDate || !expectedType) {
      showFlash("Erro: Preencha funcionário, data e tipo esperado."); return;
    }
    try {
      if (editFalta) {
        await api.patch("/occurrences/falta-ponto/"+editFalta.id, faltaForm);
        showFlash("Falta de ponto atualizada!");
      } else {
        await api.post("/occurrences/falta-ponto", faltaForm);
        showFlash("Falta de ponto registrada!");
      }
      setShowFalta(false); setEditFalta(null);
      setFaltaForm({ userId:"", faltaDate: new Date().toISOString().slice(0,10), expectedType:"entrada", reason:"", notes:"" });
      fetchFaltas();
    } catch(e) { showFlash("Erro: "+(e.response?.data?.error||e.message)); }
  };

  const deleteFalta = async (id) => {
    if (!window.confirm("Excluir este registro de falta de ponto?")) return;
    try { await api.delete("/occurrences/falta-ponto/"+id); fetchFaltas(); }
    catch(e) { showFlash("Erro: "+(e.response?.data?.error||e.message)); }
  };

  const updateFaltaStatus = async (id, status) => {
    try {
      await api.patch("/occurrences/falta-ponto/"+id, { status });
      showFlash(status === "confirmed" ? "Falta confirmada." : "Falta descartada.");
      fetchFaltas();
    } catch(e) { showFlash("Erro: "+(e.response?.data?.error||e.message)); }
  };

  const totalDays = occurrences.reduce((s,o)=>s+o.days,0);
  const unexcused = occurrences.filter(o=>o.type==="Falta Injustificada").length;
  const medical   = occurrences.filter(o=>o.type==="Atestado Médico").length;
  const pendingAbonos = abonos.filter(a=>a.status==="pending").length;
  const pendingFaltas = faltas.filter(f=>f.status==="pending").length;

  const inputStyle  = { width:"100%", fontSize:12, color:T.t1, background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 10px", fontFamily:"'Sora',sans-serif", outline:"none", boxSizing:"border-box" };
  const labelStyle  = { fontSize:11, color:T.t8, fontWeight:600, display:"block", marginBottom:5, letterSpacing:"0.04em" };

  return (
    <div style={{padding:28, overflowY:"auto"}}>
      {/* Header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20, fontWeight:800, color:T.t1, display: "flex", alignItems: "center", gap: 11 }}><span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", background: T.accent + "1f", color: T.accent, flexShrink: 0 }}><FileText size={18} /></span>Ocorrências & Abonos</h1>
          <p style={{color:T.t8, fontSize:13}}>Controle de faltas, atestados, férias e solicitações de abono de ponto</p>
        </div>
        <div style={{display:"flex", gap:10, alignItems:"center"}}>
          {flash && (
            <div style={{padding:"7px 14px", background:flash.startsWith("Erro")?T.red+"18":T.green+"18",
              border:`1px solid ${flash.startsWith("Erro")?T.red:T.green}44`, borderRadius:8,
              fontSize:12, color:flash.startsWith("Erro")?T.red:T.green, fontWeight:600}}>{flash}</div>
          )}
          {tab === "occurrences" && (
            <Btn icon={<Plus size={14}/>} onClick={()=>{setEditOccurrence(null);setForm({userId:"",type:"",dateStart:"",dateEnd:"",description:""});setShowForm(v=>!v);}} style={{background:T.accent, color:"#fff", border:"none"}}>
              Nova Ocorrência
            </Btn>
          )}
          {tab === "abono" && (
            <Btn icon={<Plus size={14}/>} onClick={()=>setShowAbono(v=>!v)} style={{background:T.accent, color:"#fff", border:"none"}}>
              Solicitar Abono
            </Btn>
          )}
          {tab === "falta" && isAdmin(user.role) && (
            <Btn icon={<Plus size={14}/>} onClick={()=>{setEditFalta(null);setFaltaForm({userId:"",faltaDate:new Date().toISOString().slice(0,10),expectedType:"entrada",reason:"",notes:""});setShowFalta(v=>!v);}} style={{background:"#E24B4A", color:"#fff", border:"none"}}>
              Registrar Falta de Ponto
            </Btn>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex", gap:0, marginBottom:20, borderBottom:`1px solid ${T.border}`}}>
        {[
          { id:"occurrences", label:"Ocorrências" },
          { id:"abono",       label: <span style={{display:"flex", alignItems:"center", gap:6}}>Abono de Ponto{pendingAbonos > 0 && tab !== "abono" && <span style={{background:T.accent, color:"#fff", fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:8}}>{pendingAbonos}</span>}</span> },
          { id:"falta",       label: <span style={{display:"flex", alignItems:"center", gap:6}}>Falta de Ponto{pendingFaltas > 0 && tab !== "falta" && <span style={{background:"#E24B4A", color:"#fff", fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:8}}>{pendingFaltas}</span>}</span> },
        ].map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:"9px 20px", background:"none", border:"none", cursor:"pointer",
            fontSize:13, fontWeight:tab===t.id?700:400, color:tab===t.id?T.accent:T.t7,
            borderBottom:`2px solid ${tab===t.id?T.accent:"transparent"}`,
            fontFamily:"'Sora',sans-serif", transition:"background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ══ OCCURRENCES TAB ══ */}
      {tab === "occurrences" && (
        <>
          {showForm && (
            <div ref={occFormRef}><Card style={{marginBottom:20, padding:24}}>
              <div style={{fontSize:15, fontWeight:700, color:T.t1, marginBottom:20}}>{editOccurrence ? "Editar Ocorrência" : "Nova Ocorrência"}</div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16}}>
                <div>
                  <label style={labelStyle}>FUNCIONÁRIO *</label>
                  <select value={form.userId} onChange={e=>setFrm("userId",e.target.value)} style={{...inputStyle, opacity:editOccurrence?0.6:1}} disabled={!!editOccurrence}>
                    <option value="">Selecione...</option>
                    {users.map(u=><option key={u.id} value={u.id}>{u.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>TIPO DE OCORRÊNCIA *</label>
                  <select value={form.type} onChange={e=>setFrm("type",e.target.value)} style={inputStyle}>
                    <option value="">Selecione o tipo...</option>
                    {types.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>DATA DE INÍCIO *</label>
                  <input type="date" value={form.dateStart} onChange={e=>setFrm("dateStart",e.target.value)} style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>DATA DE FIM <span style={{fontWeight:400,color:T.t10}}>(opcional)</span></label>
                  <input type="date" value={form.dateEnd} min={form.dateStart} onChange={e=>setFrm("dateEnd",e.target.value)} style={inputStyle}/>
                  {form.dateStart&&form.dateEnd&&form.dateEnd>=form.dateStart&&(
                    <div style={{fontSize:10, color:T.t9, marginTop:4}}>
                      {Math.round((new Date(form.dateEnd+"T12:00:00")-new Date(form.dateStart+"T12:00:00"))/86400000)+1} dias corridos
                    </div>
                  )}
                </div>
                <div style={{gridColumn:"1/-1"}}>
                  <label style={labelStyle}>DESCRIÇÃO <span style={{fontWeight:400,color:T.t10}}>(opcional)</span></label>
                  <textarea value={form.description} onChange={e=>setFrm("description",e.target.value)}
                    placeholder="CID, número do protocolo, observações..." style={{...inputStyle, minHeight:70, resize:"vertical"}}/>
                </div>
              </div>
              {form.type && (
                <div style={{marginTop:14, display:"flex", flexDirection:"column", gap:8}}>
                  <div style={{padding:"10px 14px", background:(TYPE_COLORS[form.type]||"#888")+"14",
                    border:`1px solid ${TYPE_COLORS[form.type]||"#888"}33`, borderRadius:8, display:"flex", alignItems:"center", gap:8}}>
                    <div style={{width:8, height:8, borderRadius:"50%", background:TYPE_COLORS[form.type]||"#888"}}/>
                    <span style={{fontSize:12, color:T.t2}}>Registrando como: <strong>{form.type}</strong></span>
                  </div>
                  <div style={{padding:"10px 14px", background:T.amber+"12", border:`1px solid ${T.amber}35`,
                    borderRadius:8, display:"flex", alignItems:"center", gap:10}}>
                    <AlertTriangle size={13} style={{color:T.amber, flexShrink:0}}/>
                    <span style={{fontSize:12, color:T.t2, lineHeight:1.5}}>
                      Se a ausência gerou horas ou dias que precisam ser compensados,{" "}
                      <button onClick={()=>{setShowForm(false);setTab("abono");}}
                        style={{background:"none", border:"none", padding:0, cursor:"pointer", color:T.accent, fontWeight:700, fontSize:12, fontFamily:"'Sora',sans-serif", textDecoration:"underline"}}>
                        registre também em Abono de Ponto
                      </button>
                    </span>
                  </div>
                </div>
              )}
              <div style={{display:"flex", gap:10, justifyContent:"flex-end", marginTop:20}}>
                <Btn variant="ghost" onClick={()=>{setShowForm(false);setEditOccurrence(null);setForm({userId:"",type:"",dateStart:"",dateEnd:"",description:""});}}>Cancelar</Btn>
                <Btn onClick={submitOccurrence} style={{background:T.accent, color:"#fff", border:"none", padding:"9px 20px"}}>{editOccurrence ? "Salvar Alterações" : "Confirmar Registro"}</Btn>
              </div>
            </Card></div>
          )}

          <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20}}>
            {[
              {label:"Total de ocorrências", value:occurrences.length, color:T.accent,   sub:"no período"},
              {label:"Dias ausentes",        value:totalDays,          color:T.purple,   sub:"dias corridos"},
              {label:"Faltas injustificadas",value:unexcused,          color:unexcused>0?T.red:T.green, sub:"requer atenção"},
              {label:"Atestados médicos",    value:medical,            color:T.amber,    sub:"registrados"},
            ].map((s,i)=>(
              <Card key={i} style={{padding:"16px 18px"}}>
                <div style={{fontSize:10, color:T.t9, fontWeight:600, letterSpacing:"0.06em", marginBottom:8}}>{s.label}</div>
                <div style={{fontSize:28, fontWeight:900, color:s.color, lineHeight:1}}>{s.value}</div>
                <div style={{fontSize:11, color:T.t9, marginTop:6}}>{s.sub}</div>
              </Card>
            ))}
          </div>

          {unexcused>0&&(
            <div style={{marginBottom:16, padding:"12px 16px", background:T.red+"10", border:`1px solid ${T.red}33`, borderRadius:10, display:"flex", alignItems:"center", gap:12}}>
              <AlertTriangle size={16} style={{color:T.red, flexShrink:0}}/>
              <div style={{fontSize:13, color:T.t2}}>
                <strong>{unexcused} falta{unexcused>1?"s":""} injustificada{unexcused>1?"s":""}</strong> registrada{unexcused>1?"s":""} no período.
              </div>
            </div>
          )}

          <div style={{display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center", padding:"14px 16px", background:T.bgCard, borderRadius:12, border:`1px solid ${T.border}`}}>
            <select value={filter.type} onChange={e=>setF("type",e.target.value)} style={{...inputStyle, width:200}}>
              <option value="">Todos os tipos</option>
              {types.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            {isAdmin(user.role)&&(
              <select value={filter.groupId} onChange={e=>setF("groupId",e.target.value)} style={{...inputStyle, width:180}}>
                <option value="">Todos os grupos</option>
                {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
            <input type="date" value={filter.dateFrom} onChange={e=>setF("dateFrom",e.target.value)}
              style={{fontSize:12, color:T.t1, background:T.bgDeep, border:`1px solid ${T.border}`, borderRadius:8, padding:"6px 10px"}}/>
            <span style={{fontSize:12, color:T.t9}}>até</span>
            <input type="date" value={filter.dateTo} onChange={e=>setF("dateTo",e.target.value)}
              style={{fontSize:12, color:T.t1, background:T.bgDeep, border:`1px solid ${T.border}`, borderRadius:8, padding:"6px 10px"}}/>
            <Btn small variant="ghost" onClick={fetchOccurrences}>↻ Filtrar</Btn>
          </div>

          <Card style={{padding:0, overflow:"hidden"}}>
            <div style={{padding:"12px 16px", borderBottom:`1px solid ${T.borderSubtle}`, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <span style={{fontSize:13, fontWeight:700, color:T.t1}}>Ocorrências registradas</span>
              <span style={{fontSize:11, color:T.t9}}>{occurrences.length} registro{occurrences.length!==1?"s":""}</span>
            </div>
            {occurrences.length===0 ? (
              <div style={{padding:48, textAlign:"center", color:T.t9}}>
                <FileText size={40} style={{color:T.t9, marginBottom:14, display:"block", margin:"0 auto 14px"}}/>
                <div style={{fontSize:14, marginBottom:6}}>Nenhuma ocorrência no período</div>
                <div style={{fontSize:12, color:T.t10}}>Use "Nova Ocorrência" para registrar</div>
              </div>
            ) : occurrences.map((o,i)=>{
              const color = TYPE_COLORS[o.type]||T.t8;
              return (
                <div key={o.id} style={{display:"grid", gridTemplateColumns:"4px 48px 1fr 180px 140px auto", alignItems:"center", gap:12, padding:"14px 16px", borderBottom:`1px solid ${T.borderRow}`, background:i%2===0?"transparent":T.bgRowAlt}}>
                  <div style={{width:4, height:48, borderRadius:2, background:color}}/>
                  <Avatar name={o.fullName} size={36} color={o.groupColor||T.accent}/>
                  <div>
                    <div style={{fontSize:13, fontWeight:700, color:T.t1}}>{o.fullName}</div>
                    <div style={{fontSize:11, color:T.t9, marginTop:2}}>{o.groupName}</div>
                    {o.description&&<div style={{fontSize:11, color:T.t8, marginTop:3, fontStyle:"italic", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:300}}>"{o.description}"</div>}
                  </div>
                  <div>
                    <span style={{fontSize:11, padding:"4px 12px", borderRadius:20, background:color+"18", color, border:`1px solid ${color}33`, fontWeight:600, display:"inline-block"}}>{o.type}</span>
                    <div style={{fontSize:10, color:T.t9, marginTop:4}}>por {o.createdByName}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:12, fontWeight:600, color:T.t2}}>{fmtDate(o.dateStart)}</div>
                    {o.dateEnd&&o.dateEnd!==o.dateStart&&<div style={{fontSize:11, color:T.t9}}>até {fmtDate(o.dateEnd)}</div>}
                    <div style={{fontSize:11, color, fontWeight:600, marginTop:2}}>{o.days} dia{o.days!==1?"s":""}</div>
                  </div>
                  <div style={{display:"flex", gap:2, alignItems:"center"}}>
                    {isAdmin(user.role)&&(
                      <button onClick={()=>{setEditOccurrence(o);setForm({userId:o.userId,type:o.type,dateStart:o.dateStart,dateEnd:o.dateEnd||"",description:o.description||""});setShowForm(true);}}
                        style={{background:"none", border:"none", cursor:"pointer", color:T.accent, padding:"6px", borderRadius:6}}>
                        <Edit2 size={14}/>
                      </button>
                    )}
                    {(isAdmin(user.role)||o.createdBy===user.id)&&(
                      <button onClick={()=>removeOccurrence(o.id)} style={{background:"none", border:"none", cursor:"pointer", color:T.red, padding:"6px", borderRadius:6}}>
                        <Trash2 size={14}/>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        </>
      )}

      {/* ══ ABONO TAB ══ */}
      {tab === "abono" && (
        <>
          {/* Form */}
          {showAbono && (
            <Card style={{marginBottom:20, padding:0, overflow:"hidden"}}>
              {/* Date header — like TOTVS */}
              <div style={{padding:"16px 24px 12px", borderBottom:`1px solid ${T.border}`, background:T.bgDeep}}>
                <div style={{fontSize:13, fontWeight:700, color:T.accent, marginBottom:4, letterSpacing:"0.04em"}}>
                  {editAbono ? "EDITAR ABONO" : "NOVO ABONO"}
                </div>
                <div style={{fontSize:18, fontWeight:700, color:T.t1}}>
                  {abonoForm.punchDate
                    ? (abonoForm.punchDateTo && abonoForm.punchDateTo !== abonoForm.punchDate
                        ? `${fmtDateLong(abonoForm.punchDate)} → ${fmtDate(abonoForm.punchDateTo)}`
                        : fmtDateLong(abonoForm.punchDate))
                    : "Selecione a data"}
                </div>
              </div>
              <form onSubmit={submitAbono} style={{padding:24}}>

                {/* ── Guia de modos ── */}
                {!editAbono && (
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:20}}>
                    {[
                      {
                        active: !!(abonoForm.punchTime && !abonoForm.punchTimeTo && !( abonoForm.punchDateTo && abonoForm.punchDateTo !== abonoForm.punchDate)),
                        color:"#34D399",
                        icon:"⏱",
                        title:"Batida única",
                        desc:"Esqueceu de bater entrada ou saída",
                        fields:[
                          {label:"HORA",  example:"08:03"},
                          {label:"TIPO",  example:"Entrada  ou  Saída"},
                        ],
                      },
                      {
                        active: !!(abonoForm.punchTime && abonoForm.punchTimeTo && !( abonoForm.punchDateTo && abonoForm.punchDateTo !== abonoForm.punchDate)),
                        color:"#60A5FA",
                        icon:"↔",
                        title:"Intervalo",
                        desc:"Saiu e voltou no mesmo dia",
                        fields:[
                          {label:"SAÍDA",   example:"12:30"},
                          {label:"RETORNO", example:"14:00"},
                        ],
                      },
                      {
                        active: !!(abonoForm.punchDateTo && abonoForm.punchDateTo !== abonoForm.punchDate),
                        color:"#A78BFA",
                        icon:"📅",
                        title:"Período completo",
                        desc:"Ausente por vários dias seguidos",
                        fields:[
                          {label:"DATA INÍCIO", example:"18/05"},
                          {label:"DATA FIM",    example:"20/05"},
                        ],
                      },
                    ].map((m,i)=>(
                      <div key={i} style={{
                        padding:"10px 12px", borderRadius:10,
                        border:`1.5px solid ${m.active ? m.color : T.border}`,
                        background: m.active ? m.color+"14" : T.bgDeep,
                        transition:"border-color 0.2s, background 0.2s",
                      }}>
                        <div style={{display:"flex", alignItems:"center", gap:6, marginBottom:5}}>
                          <span style={{fontSize:14}}>{m.icon}</span>
                          <span style={{fontSize:12, fontWeight:700, color: m.active ? m.color : T.t2}}>{m.title}</span>
                        </div>
                        <div style={{fontSize:11, color:T.t8, marginBottom:8, lineHeight:1.4}}>{m.desc}</div>
                        <div style={{display:"flex", gap:6}}>
                          {m.fields.map((f,j)=>(
                            <div key={j} style={{flex:1, background:T.bgCard, borderRadius:6, padding:"4px 7px", border:`1px solid ${T.borderSubtle}`}}>
                              <div style={{fontSize:9, color:T.t9, fontWeight:600, letterSpacing:"0.04em", marginBottom:2}}>{f.label}</div>
                              <div style={{fontSize:10, color:T.t5, fontFamily:"'JetBrains Mono',monospace", fontWeight:600}}>{f.example}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:16, marginBottom:16}}>
                  <div>
                    <label style={labelStyle}>FUNCIONÁRIO *</label>
                    {editAbono ? (
                      <div style={{...inputStyle, display:"flex", alignItems:"center", color:T.t2, fontWeight:600}}>
                        {users.find(u=>u.id===abonoForm.userId)?.fullName || editAbono.fullName}
                      </div>
                    ) : (
                      <select value={abonoForm.userId} onChange={e=>setAFrm("userId",e.target.value)} style={inputStyle} required>
                        <option value="">Selecione o funcionário...</option>
                        {users.map(u=><option key={u.id} value={u.id}>{u.fullName}</option>)}
                      </select>
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>DATA INÍCIO *</label>
                    <input type="date" value={abonoForm.punchDate} onChange={e=>setAFrm("punchDate",e.target.value)} style={inputStyle} required/>
                  </div>
                  <div>
                    <label style={labelStyle}>DATA FIM <span style={{fontWeight:400,color:T.t9}}>(opcional)</span></label>
                    <input type="date" value={abonoForm.punchDateTo} min={abonoForm.punchDate||undefined} onChange={e=>{
                      const v=e.target.value;
                      setAFrm("punchDateTo",v);
                      if(v && v!==abonoForm.punchDate){setAFrm("punchTime","");setAFrm("punchTimeTo","");}
                    }} style={inputStyle}/>
                    {abonoForm.punchDate&&abonoForm.punchDateTo&&abonoForm.punchDateTo>=abonoForm.punchDate&&(
                      <div style={{fontSize:10,color:T.t9,marginTop:4}}>
                        {(()=>{
                          let n=0;const s=new Date(abonoForm.punchDate+'T12:00:00Z');const e=new Date(abonoForm.punchDateTo+'T12:00:00Z');
                          for(let c=new Date(s);c<=e;c.setUTCDate(c.getUTCDate()+1)){const d=c.getUTCDay();if(d!==0&&d!==6)n++;}
                          return n+' dia'+(n!==1?'s':'')+' útei'+(n!==1?'s':'l');
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Hora(s) — apenas para dia único */}
                {(()=>{
                  const isMultiDay = abonoForm.punchDateTo && abonoForm.punchDateTo !== abonoForm.punchDate;
                  if (isMultiDay) return (
                    <div style={{marginBottom:16, padding:"10px 14px", background:T.accent+"12", borderRadius:8, border:`1px solid ${T.accent}30`, fontSize:12, color:T.accent, fontWeight:600}}>
                      Período de dias completos — cada dia útil do intervalo será abonado integralmente (09:00–18:00)
                    </div>
                  );
                  return (<>
                    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16}}>
                      <div>
                        <label style={labelStyle}>{abonoForm.punchTimeTo ? "SAÍDA *" : "HORA *"}</label>
                        <input type="time" value={abonoForm.punchTime} onChange={e=>setAFrm("punchTime",e.target.value)}
                          style={{...inputStyle, fontSize:18, fontWeight:600, fontFamily:"'JetBrains Mono',monospace"}}/>
                      </div>
                      <div>
                        <label style={labelStyle}>RETORNO <span style={{fontWeight:400, color:T.t9}}>(opcional)</span></label>
                        <input type="time" value={abonoForm.punchTimeTo} onChange={e=>setAFrm("punchTimeTo",e.target.value)}
                          style={{...inputStyle, fontSize:18, fontWeight:600, fontFamily:"'JetBrains Mono',monospace"}}/>
                      </div>
                    </div>
                    {!abonoForm.punchTimeTo && (
                      <div style={{display:"flex", gap:24, alignItems:"center", marginBottom:20}}>
                        <span style={{fontSize:12, fontWeight:600, color:T.t7, letterSpacing:"0.05em"}}>TIPO</span>
                        {["entrada","saida"].map(pt=>(
                          <label key={pt} style={{display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:14, fontWeight:600, color:T.t2}}>
                            <div onClick={()=>setAFrm("punchType",pt)} style={{
                              width:20, height:20, borderRadius:"50%", border:`2px solid ${abonoForm.punchType===pt?T.accent:T.border}`,
                              background:abonoForm.punchType===pt?T.accent:"transparent",
                              display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", transition:"background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s",
                            }}>
                              {abonoForm.punchType===pt && <div style={{width:8, height:8, borderRadius:"50%", background:"#fff"}}/>}
                            </div>
                            {pt === "entrada" ? "Entrada" : "Saída"}
                          </label>
                        ))}
                      </div>
                    )}
                    {abonoForm.punchTime && abonoForm.punchTimeTo && (()=>{
                      const [h1,m1]=abonoForm.punchTime.split(':').map(Number);
                      const [h2,m2]=abonoForm.punchTimeTo.split(':').map(Number);
                      const dur=(h2*60+m2)-(h1*60+m1);
                      const ls=h1*60+m1+240; const le=ls+60;
                      const fmt=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
                      return (
                        <div style={{marginBottom:16, padding:"8px 12px", background:T.accent+"12", borderRadius:8, border:`1px solid ${T.accent}30`, fontSize:12, color:T.accent}}>
                          {dur>=300
                            ? `Dia completo: ${abonoForm.punchTime}–${fmt(ls)} e ${fmt(le)}–${abonoForm.punchTimeTo} (almoço ${fmt(ls)}–${fmt(le)} descontado automaticamente)`
                            : `Intervalo abonado: ${abonoForm.punchTime} → ${abonoForm.punchTimeTo}`}
                        </div>
                      );
                    })()}
                  </>);
                })()}

                <div style={{marginBottom:16}}>
                  <label style={labelStyle}>MOTIVO *</label>
                  <div style={{position:"relative"}}>
                    <select value={abonoForm.reason} onChange={e=>setAFrm("reason",e.target.value)} style={{...inputStyle, appearance:"none", paddingRight:36}} required>
                      <option value="">Selecione o motivo...</option>
                      {abonoReasons.map(r=><option key={r} value={r}>{r.toUpperCase()}</option>)}
                    </select>
                    <ChevronDown size={14} style={{position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", color:T.t7, pointerEvents:"none"}}/>
                  </div>
                </div>

                {(() => {
                  const justifReq = !["Atestado Médico", "Férias"].includes(abonoForm.reason);
                  return (
                    <div style={{marginBottom:20}}>
                      <label style={labelStyle}>JUSTIFICATIVA {justifReq ? "*" : "(opcional)"}</label>
                      <textarea value={abonoForm.justification} onChange={e=>setAFrm("justification",e.target.value)}
                        placeholder={justifReq ? "Descreva a justificativa para a inclusão desta batida..." : "Opcional para atestado ou férias"}
                        style={{...inputStyle, minHeight:90, resize:"vertical"}} required={justifReq}/>
                    </div>
                  );
                })()}

                <div style={{display:"flex", gap:10, justifyContent:"flex-end"}}>
                  <Btn variant="ghost" onClick={()=>{setShowAbono(false);setEditAbono(null);setAbonoForm({userId:"",punchDate:new Date().toISOString().slice(0,10),punchDateTo:"",punchTime:"",punchTimeTo:"",punchType:"entrada",reason:"",justification:""});}}>
                    Cancelar
                  </Btn>
                  <Btn type="submit" disabled={savingAbono} style={{background:T.accent, color:"#fff", border:"none", padding:"9px 24px", opacity:savingAbono?0.7:1}}>
                    {savingAbono ? "Salvando..." : editAbono ? "Salvar Alterações" : "Confirmar"}
                  </Btn>
                </div>
              </form>
            </Card>
          )}

          {/* Filters */}
          <div style={{display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center", padding:"14px 16px", background:T.bgCard, borderRadius:12, border:`1px solid ${T.border}`}}>
            <select value={abonoFilter.status} onChange={e=>setAF("status",e.target.value)}
              style={{fontSize:12, color:T.t1, background:T.bgDeep, border:`1px solid ${T.border}`, borderRadius:8, padding:"6px 10px", fontFamily:"'Sora',sans-serif", outline:"none"}}>
              <option value="">Todos os status</option>
              <option value="pending">Pendente</option>
              <option value="approved">Aprovado</option>
              <option value="rejected">Rejeitado</option>
            </select>
            <input type="date" value={abonoFilter.dateFrom} onChange={e=>setAF("dateFrom",e.target.value)}
              style={{fontSize:12, color:T.t1, background:T.bgDeep, border:`1px solid ${T.border}`, borderRadius:8, padding:"6px 10px"}}/>
            <span style={{fontSize:12, color:T.t9}}>até</span>
            <input type="date" value={abonoFilter.dateTo} onChange={e=>setAF("dateTo",e.target.value)}
              style={{fontSize:12, color:T.t1, background:T.bgDeep, border:`1px solid ${T.border}`, borderRadius:8, padding:"6px 10px"}}/>
            <Btn small variant="ghost" onClick={fetchAbonos}>↻ Filtrar</Btn>
          </div>

          {/* History table */}
          <Card style={{padding:0, overflow:"hidden"}}>
            <div style={{padding:"12px 16px", borderBottom:`1px solid ${T.borderSubtle}`, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <span style={{fontSize:13, fontWeight:700, color:T.t1}}>Histórico das marcações realizadas</span>
              <span style={{fontSize:11, color:T.t9}}>{abonos.length} solicitação{abonos.length!==1?"ões":""}</span>
            </div>
            {abonos.length === 0 ? (
              <div style={{padding:48, textAlign:"center", color:T.t9}}>
                <Clock size={40} style={{color:T.t9, marginBottom:14, display:"block", margin:"0 auto 14px"}}/>
                <div style={{fontSize:14, marginBottom:6}}>Nenhuma solicitação de abono</div>
                <div style={{fontSize:12, color:T.t10}}>Use "Solicitar Abono" para registrar uma inclusão de batida</div>
              </div>
            ) : (
              <div>
                {abonos.map((a,i)=>(
                  <div key={a.id} style={{display:"grid", gridTemplateColumns:"48px 1fr 110px 120px 100px auto", alignItems:"center", gap:12, padding:"14px 16px", borderBottom:`1px solid ${T.borderRow}`, background:i%2===0?"transparent":T.bgRowAlt}}>
                    <Avatar name={a.fullName} size={36} color={a.groupColor||T.accent}/>
                    <div>
                      <div style={{fontSize:13, fontWeight:700, color:T.t1}}>{a.fullName}</div>
                      <div style={{fontSize:11, color:T.t9}}>{a.groupName}</div>
                      <div style={{fontSize:11, color:T.t8, marginTop:2}}>{a.reason}</div>
                      {a.justification&&<div style={{fontSize:11, color:T.t9, fontStyle:"italic", marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:320}}>"{a.justification}"</div>}
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:13, fontWeight:700, color:T.t1}}>{fmtDate(a.punchDate)}</div>
                      {a.punchDateTo && a.punchDateTo !== a.punchDate && (
                        <div style={{fontSize:10,color:T.t9}}>até {fmtDate(a.punchDateTo)}</div>
                      )}
                      {a.punchTimeTo ? (
                        <>
                          <div style={{fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:700, color:T.accent, marginTop:2}}>
                            {a.punchTime} → {a.punchTimeTo}
                          </div>
                          <span style={{fontSize:10, padding:"2px 8px", borderRadius:10, fontWeight:600, background:"#8B5CF618", color:"#8B5CF6"}}>
                            Intervalo
                          </span>
                        </>
                      ) : (
                        <>
                          <div style={{fontFamily:"'JetBrains Mono',monospace", fontSize:16, fontWeight:700, color:T.accent, marginTop:2}}>{a.punchTime}</div>
                          <span style={{fontSize:10, padding:"2px 8px", borderRadius:10, fontWeight:600,
                            background: a.punchType==="entrada"?"#34D39918":"#F8717118",
                            color: a.punchType==="entrada"?"#34D399":"#F87171"}}>
                            {a.punchType==="entrada"?"Entrada":"Saída"}
                          </span>
                        </>
                      )}
                    </div>
                    <div>
                      <StatusBadge status={a.status} T={T}/>
                      {a.reviewedByName&&<div style={{fontSize:10, color:T.t9, marginTop:3}}>por {a.reviewedByName}</div>}
                      {a.reviewNote&&<div style={{fontSize:10, color:T.t8, fontStyle:"italic", marginTop:1}}>"{a.reviewNote}"</div>}
                    </div>
                    <div style={{fontSize:10, color:T.t9}}>
                      {new Date(a.createdAt).toLocaleDateString("pt-BR")}
                      <div style={{marginTop:2}}>por {a.createdByName}</div>
                    </div>
                    <div style={{display:"flex", gap:6, flexWrap:"wrap", justifyContent:"flex-end"}}>
                      {isAdmin(user.role) && a.status === "pending" && (
                        <button onClick={()=>{setReviewModal(a);setReviewNote("");}}
                          style={{background:T.accent+"18", border:`1px solid ${T.accent}40`, borderRadius:6, padding:"5px 10px", cursor:"pointer", color:T.accent, fontSize:11, fontWeight:600, fontFamily:"'Sora',sans-serif"}}>
                          Revisar
                        </button>
                      )}
                      {(isAdmin(user.role)||(a.createdBy===user.id&&a.status==="pending"))&&(
                        <button onClick={()=>{
                          setEditAbono(a);
                          setAbonoForm({
                            userId:     a.userId,
                            punchDate:  a.punchDate,
                            punchDateTo: a.punchDateTo||"",
                            punchTime:  a.punchTime||"",
                            punchTimeTo: a.punchTimeTo||"",
                            punchType:  a.punchType||"entrada",
                            reason:     a.reason||"",
                            justification: a.justification||"",
                          });
                          setShowAbono(true);
                        }}
                          style={{background:T.accent+"18", border:`1px solid ${T.accent}40`, borderRadius:6, padding:"5px 7px", cursor:"pointer", color:T.accent}}>
                          <Edit2 size={12}/>
                        </button>
                      )}
                      {(isAdmin(user.role)||(a.createdBy===user.id&&a.status==="pending"))&&(
                        <button onClick={()=>deleteAbono(a.id)}
                          style={{background:"#ff445512", border:"1px solid #ff445530", borderRadius:6, padding:"5px 7px", cursor:"pointer", color:"#ff7a7a"}}>
                          <Trash2 size={12}/>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}


      {/* ══ FALTA DE PONTO TAB ══ */}
      {tab === "falta" && (
        <>
          {/* Form */}
          {showFalta && isAdmin(user.role) && (
            <div ref={faltaFormRef}>
            <Card style={{marginBottom:20, padding:0, overflow:"hidden"}}>
              <div style={{padding:"16px 24px 12px", borderBottom:`1px solid ${T.border}`, background:T.bgDeep}}>
                <div style={{fontSize:18, fontWeight:700, color:"#E24B4A"}}>
                  {editFalta ? "Editar Falta de Ponto" : "Registrar Falta de Ponto"}
                </div>
                <div style={{fontSize:12, color:T.t8, marginTop:2}}>
                  {faltaForm.faltaDate ? fmtDateLong(faltaForm.faltaDate) : "Selecione a data"}
                </div>
              </div>
              <form onSubmit={submitFalta} style={{padding:24}}>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16}}>
                  <div>
                    <label style={labelStyle}>FUNCIONÁRIO *</label>
                    <select value={faltaForm.userId} onChange={e=>setFFrm("userId",e.target.value)} style={inputStyle} required>
                      <option value="">Selecione o funcionário...</option>
                      {users.map(u=><option key={u.id} value={u.id}>{u.fullName}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>DATA *</label>
                    <input type="date" value={faltaForm.faltaDate} onChange={e=>setFFrm("faltaDate",e.target.value)} style={inputStyle} required/>
                  </div>
                </div>

                <div style={{marginBottom:16}}>
                  <label style={labelStyle}>TIPO DE MARCAÇÃO AUSENTE *</label>
                  <div style={{display:"flex", gap:16, flexWrap:"wrap"}}>
                    {Object.entries(FALTA_TYPE_LABELS).map(([k,label])=>(
                      <label key={k} style={{display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13, fontWeight:600, color:faltaForm.expectedType===k?T.accent:T.t2}}>
                        <div onClick={()=>setFFrm("expectedType",k)} style={{
                          width:18, height:18, borderRadius:"50%", border:`2px solid ${faltaForm.expectedType===k?T.accent:T.border}`,
                          background:faltaForm.expectedType===k?T.accent:"transparent",
                          display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", transition:"background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s",
                        }}>
                          {faltaForm.expectedType===k && <div style={{width:7, height:7, borderRadius:"50%", background:"#fff"}}/>}
                        </div>
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20}}>
                  <div>
                    <label style={labelStyle}>MOTIVO <span style={{fontWeight:400,color:T.t10}}>(opcional)</span></label>
                    <input value={faltaForm.reason} onChange={e=>setFFrm("reason",e.target.value)} placeholder="Ex: Esqueceu de bater o ponto..." style={inputStyle}/>
                  </div>
                  <div>
                    <label style={labelStyle}>OBSERVAÇÕES <span style={{fontWeight:400,color:T.t10}}>(opcional)</span></label>
                    <input value={faltaForm.notes} onChange={e=>setFFrm("notes",e.target.value)} placeholder="Notas adicionais..." style={inputStyle}/>
                  </div>
                </div>

                <div style={{display:"flex", gap:10, justifyContent:"flex-end"}}>
                  <Btn variant="ghost" onClick={()=>{setShowFalta(false);setEditFalta(null);}}>Cancelar</Btn>
                  <Btn type="submit" style={{background:"#E24B4A", color:"#fff", border:"none", padding:"9px 24px"}}>
                    {editFalta ? "Salvar Alterações" : "Registrar"}
                  </Btn>
                </div>
              </form>
            </Card>
            </div>
          )}

          {/* Summary cards */}
          <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20}}>
            {[
              {label:"Total registros", value:faltas.length, color:"#E24B4A", sub:"no período"},
              {label:"Pendentes", value:faltas.filter(f=>f.status==="pending").length, color:"#F59E0B", sub:"aguardando revisão"},
              {label:"Confirmadas", value:faltas.filter(f=>f.status==="confirmed").length, color:"#F87171", sub:"faltas confirmadas"},
              {label:"Descartadas", value:faltas.filter(f=>f.status==="dismissed").length, color:"#6B7280", sub:"sem impacto"},
            ].map((s,i)=>(
              <Card key={i} style={{padding:"16px 18px"}}>
                <div style={{fontSize:10, color:T.t9, fontWeight:600, letterSpacing:"0.06em", marginBottom:8}}>{s.label}</div>
                <div style={{fontSize:28, fontWeight:900, color:s.color, lineHeight:1}}>{s.value}</div>
                <div style={{fontSize:11, color:T.t9, marginTop:6}}>{s.sub}</div>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <div style={{display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center", padding:"14px 16px", background:T.bgCard, borderRadius:12, border:`1px solid ${T.border}`}}>
            <select value={faltaFilter.status} onChange={e=>setFF("status",e.target.value)}
              style={{fontSize:12, color:T.t1, background:T.bgDeep, border:`1px solid ${T.border}`, borderRadius:8, padding:"6px 10px", fontFamily:"'Sora',sans-serif", outline:"none"}}>
              <option value="">Todos os status</option>
              <option value="pending">Pendente</option>
              <option value="confirmed">Confirmado</option>
              <option value="dismissed">Descartado</option>
            </select>
            <input type="date" value={faltaFilter.dateFrom} onChange={e=>setFF("dateFrom",e.target.value)}
              style={{fontSize:12, color:T.t1, background:T.bgDeep, border:`1px solid ${T.border}`, borderRadius:8, padding:"6px 10px"}}/>
            <span style={{fontSize:12, color:T.t9}}>até</span>
            <input type="date" value={faltaFilter.dateTo} onChange={e=>setFF("dateTo",e.target.value)}
              style={{fontSize:12, color:T.t1, background:T.bgDeep, border:`1px solid ${T.border}`, borderRadius:8, padding:"6px 10px"}}/>
            <Btn small variant="ghost" onClick={fetchFaltas}>↻ Filtrar</Btn>
          </div>

          {/* Table */}
          <Card style={{padding:0, overflow:"hidden"}}>
            <div style={{padding:"12px 16px", borderBottom:`1px solid ${T.borderSubtle}`, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <span style={{fontSize:13, fontWeight:700, color:T.t1}}>Faltas de Ponto Registradas</span>
              <span style={{fontSize:11, color:T.t9}}>{faltas.length} registro{faltas.length!==1?"s":""}</span>
            </div>
            {faltas.length === 0 ? (
              <div style={{padding:48, textAlign:"center", color:T.t9}}>
                <AlertOctagon size={40} style={{color:T.t9, marginBottom:14, display:"block", margin:"0 auto 14px"}}/>
                <div style={{fontSize:14, marginBottom:6}}>Nenhuma falta de ponto no período</div>
                {isAdmin(user.role) && <div style={{fontSize:12, color:T.t10}}>Use "Registrar Falta de Ponto" para adicionar</div>}
              </div>
            ) : faltas.map((f,i)=>(
              <div key={f.id} style={{display:"grid", gridTemplateColumns:"4px 48px 1fr 150px 140px 120px auto", alignItems:"center", gap:12, padding:"14px 16px", borderBottom:`1px solid ${T.borderRow}`, background:i%2===0?"transparent":T.bgRowAlt}}>
                <div style={{width:4, height:48, borderRadius:2, background:"#E24B4A"}}/>
                <Avatar name={f.fullName} size={36} color={f.groupColor||"#E24B4A"}/>
                <div>
                  <div style={{fontSize:13, fontWeight:700, color:T.t1}}>{f.fullName}</div>
                  <div style={{fontSize:11, color:T.t9}}>{f.groupName}</div>
                  {f.reason && <div style={{fontSize:11, color:T.t8, marginTop:2, fontStyle:"italic"}}>"{f.reason}"</div>}
                  {f.notes  && <div style={{fontSize:10, color:T.t10, marginTop:1}}>{f.notes}</div>}
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:12, fontWeight:600, color:T.t2}}>{fmtDate(f.faltaDate)}</div>
                  <span style={{fontSize:10, padding:"2px 8px", borderRadius:10, fontWeight:600,
                    background:"#E24B4A18", color:"#E24B4A", display:"inline-block", marginTop:3}}>
                    {FALTA_TYPE_LABELS[f.expectedType]||f.expectedType}
                  </span>
                </div>
                <div>
                  <FaltaStatusBadge status={f.status} T={T}/>
                  {f.reviewedByName&&<div style={{fontSize:10, color:T.t9, marginTop:3}}>por {f.reviewedByName}</div>}
                </div>
                <div style={{fontSize:10, color:T.t9}}>
                  {new Date(f.createdAt).toLocaleDateString("pt-BR")}
                  <div style={{marginTop:2}}>por {f.createdByName}</div>
                </div>
                <div style={{display:"flex", gap:4, flexDirection:"column", alignItems:"flex-end"}}>
                  {isAdmin(user.role) && f.status === "pending" && (
                    <>
                      <button onClick={()=>updateFaltaStatus(f.id,"confirmed")}
                        style={{background:"#F8717118", border:"1px solid #F8717140", borderRadius:6, padding:"4px 8px", cursor:"pointer", color:"#F87171", fontSize:10, fontWeight:600, fontFamily:"'Sora',sans-serif", whiteSpace:"nowrap"}}>
                        Confirmar
                      </button>
                      <button onClick={()=>updateFaltaStatus(f.id,"dismissed")}
                        style={{background:T.t3+"18", border:`1px solid ${T.border}`, borderRadius:6, padding:"4px 8px", cursor:"pointer", color:T.t7, fontSize:10, fontWeight:600, fontFamily:"'Sora',sans-serif"}}>
                        Descartar
                      </button>
                    </>
                  )}
                  {isAdmin(user.role) && (
                    <>
                      <button onClick={()=>{setEditFalta(f);setFaltaForm({userId:f.userId,faltaDate:f.faltaDate,expectedType:f.expectedType,reason:f.reason||"",notes:f.notes||""});setShowFalta(true);}}
                        style={{background:T.accent+"18", border:`1px solid ${T.accent}40`, borderRadius:6, padding:"4px 7px", cursor:"pointer", color:T.accent}}>
                        <Edit2 size={11}/>
                      </button>
                      <button onClick={()=>deleteFalta(f.id)}
                        style={{background:"#ff445512", border:"1px solid #ff445530", borderRadius:6, padding:"4px 7px", cursor:"pointer", color:"#ff7a7a"}}>
                        <Trash2 size={11}/>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      {/* Review Modal */}
      {reviewModal && (
        <div style={{position:"fixed", inset:0, background:"#00000080", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16}}
          onClick={()=>setReviewModal(null)}>
          <div style={{background:T.bgCard, borderRadius:14, width:"100%", maxWidth:460, border:`1px solid ${T.border}`}}
            onClick={e=>e.stopPropagation()}>
            <div style={{padding:"18px 20px 14px", borderBottom:`1px solid ${T.border}`, fontSize:15, fontWeight:700, color:T.t1}}>
              Revisar Solicitação de Abono
            </div>
            <div style={{padding:20}}>
              <div style={{background:T.bgDeep, borderRadius:8, padding:"12px 14px", marginBottom:16, fontSize:12}}>
                <div style={{fontWeight:600, color:T.t1, marginBottom:4}}>{reviewModal.fullName}</div>
                <div style={{color:T.t7}}>
                  {fmtDate(reviewModal.punchDate)} — {reviewModal.punchTimeTo
                    ? `Intervalo ${reviewModal.punchTime} → ${reviewModal.punchTimeTo}`
                    : `${reviewModal.punchType==="entrada"?"Entrada":"Saída"} às ${reviewModal.punchTime}`}
                </div>
                <div style={{color:T.t8, marginTop:2}}>{reviewModal.reason}</div>
                <div style={{color:T.t9, fontStyle:"italic", marginTop:2}}>"{reviewModal.justification}"</div>
              </div>
              <label style={labelStyle}>OBSERVAÇÃO (opcional)</label>
              <textarea value={reviewNote} onChange={e=>setReviewNote(e.target.value)} rows={3}
                placeholder="Adicione uma observação à revisão..."
                style={{...inputStyle, resize:"vertical", marginBottom:16}}/>
              <div style={{display:"flex", gap:10, justifyContent:"flex-end"}}>
                <Btn variant="ghost" onClick={()=>setReviewModal(null)}>Cancelar</Btn>
                <button onClick={()=>reviewAbono("rejected")} disabled={savingAbono}
                  style={{padding:"8px 18px", background:"#ff445518", border:"1px solid #ff445540", borderRadius:8, color:"#ff7a7a", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'Sora',sans-serif"}}>
                  Rejeitar
                </button>
                <button onClick={()=>reviewAbono("approved")} disabled={savingAbono}
                  style={{padding:"8px 18px", background:T.accent, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'Sora',sans-serif"}}>
                  Aprovar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
