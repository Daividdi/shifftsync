import React, { useState, useEffect, useCallback } from "react";
import { Plus, ChevronLeft, ChevronRight, Trash2, Calendar, List, Clock, AlertTriangle, X } from "lucide-react";
import { Card, Badge, Avatar, Btn, Input, Select } from "../components/UI";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import api from "../api/client";

const WEEK_LABELS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const HOURS = Array.from({length:11},(_,i)=>i+8); // 8h-18h

function isAdmin(role)  { return role==="hr"||role==="ti"||role==="gerencia"; }
function isLeader(role) { return role==="leader"||role==="gerencia"||isAdmin(role); }

function isoWeekRange(date) {
  // Usa T12:00:00 para evitar problema de timezone ao calcular dia da semana
  const d = new Date(date + "T12:00:00");
  const day = d.getDay(); // 0=Dom,1=Seg,...,6=Sab
  const diffToMon = day===0 ? -6 : 1-day; // quanto subtrair para chegar na segunda
  const mon = new Date(d); mon.setDate(d.getDate() + diffToMon);
  const fri = new Date(mon); fri.setDate(mon.getDate()+4);
  return { from: mon.toISOString().slice(0,10), to: fri.toISOString().slice(0,10), mon, fri };
}

function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate()+n); return d;
}

function fmtTime(t) { return t?.slice(0,5)||""; }
function fmtDate(d) {
  if (!d) return "";
  return new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"numeric",month:"short"});
}
function durationMin(start, end) {
  if (!start||!end) return 0;
  return (new Date("2000-01-01T"+end)-new Date("2000-01-01T"+start))/60000;
}
function durationLabel(min) {
  if (min<60) return min+"min";
  const h=Math.floor(min/60), m=min%60;
  return m>0?`${h}h ${m}min`:`${h}h`;
}

// Cores por usuário — geradas a partir do nome
const USER_COLORS = ["#185FA5","#0F6E56","#854F0B","#534AB7","#993C1D","#3B6D11","#A32D2D"];
const colorCache = {};
function userColor(id) {
  if (!colorCache[id]) {
    const idx = Object.keys(colorCache).length % USER_COLORS.length;
    colorCache[id] = USER_COLORS[idx];
  }
  return colorCache[id];
}

function EventBlock({ booking, onDelete, canDelete, style={} }) {
  const { theme: T } = useTheme();
  const color = userColor(booking.createdBy);
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}
      style={{
        borderRadius:5, padding:"4px 7px", fontSize:11,
        borderLeft:`3px solid ${color}`,
        background: color+"18",
        color: T.t2,
        cursor:"default", position:"relative",
        transition:"opacity 0.15s",
        ...style,
      }}
    >
      <div style={{fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{booking.title}</div>
      <div style={{color:T.t9,fontSize:10}}>{fmtTime(booking.startTime)}–{fmtTime(booking.endTime)}</div>
      <div style={{color:T.t9,fontSize:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{booking.createdByName}</div>
      {booking.recurrence!=="none"&&(
        <span style={{fontSize:9,padding:"1px 5px",borderRadius:8,background:color+"22",color,marginTop:2,display:"inline-block"}}>
          {booking.recurrence==="weekly"?"Semanal":"Mensal"}
        </span>
      )}
      {canDelete&&hover&&(
        <button onClick={e=>{e.stopPropagation();onDelete(booking.id);}} style={{
          position:"absolute",top:3,right:3,background:"none",border:"none",
          cursor:"pointer",color:T.red,padding:2,lineHeight:1,
        }}><X size={10}/></button>
      )}
    </div>
  );
}

function BookingForm({ onSave, onCancel, T, user }) {
  const [form, setForm]         = useState({ title:"", description:"", date:new Date().toISOString().slice(0,10), startTime:"09:00", endTime:"10:00", recurrence:"none", recurrenceEnd:"" });
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  useEffect(() => {
    if (!form.date||!form.startTime||!form.endTime) return;
    api.get(`/meeting/conflicts?date=${form.date}&start=${form.startTime}&end=${form.endTime}`)
      .then(r=>setConflicts(r.data||[])).catch(()=>{});
  }, [form.date, form.startTime, form.endTime]);

  const handleSave = async () => {
    if (!form.title.trim()) { setError("Informe o título da reunião"); return; }
    if (form.startTime>=form.endTime) { setError("Horário de fim deve ser após o início"); return; }
    if (conflicts.length>0) { setError("Resolva o conflito de horário antes de confirmar"); return; }
    setLoading(true);
    try {
      await onSave(form);
    } catch(e) {
      setError(e.response?.data?.error||e.message);
    } finally { setLoading(false); }
  };

  const labelStyle = { fontSize:11, fontWeight:600, color:T.t8, letterSpacing:"0.06em", display:"block", marginBottom:5 };
  const inputStyle = { fontSize:12, color:T.t1, background:T.bgDeep, border:`1px solid ${T.border}`, borderRadius:8, padding:"7px 10px", width:"100%", fontFamily:"'Sora',sans-serif", outline:"none" };

  return (
    <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:14,padding:24,marginBottom:16}}>
      <div style={{fontSize:15,fontWeight:700,color:T.t1,marginBottom:20}}>Nova Reserva — Sala de Reunião</div>

      {conflicts.length>0&&(
        <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",background:T.red+"12",border:`1px solid ${T.red}33`,borderRadius:10,marginBottom:16}}>
          <AlertTriangle size={16} style={{color:T.red,flexShrink:0,marginTop:2}}/>
          <div style={{fontSize:12,color:T.t2}}>
            <strong>Conflito detectado:</strong> "{conflicts[0].title}" está agendado das {fmtTime(conflicts[0].startTime)} às {fmtTime(conflicts[0].endTime)} nesta data.
          </div>
        </div>
      )}

      {error&&<div style={{fontSize:12,color:T.red,marginBottom:12,padding:"8px 12px",background:T.red+"10",borderRadius:8,border:`1px solid ${T.red}33`}}>{error}</div>}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div style={{gridColumn:"1/-1"}}>
          <label style={labelStyle}>TÍTULO / ASSUNTO *</label>
          <input value={form.title} onChange={e=>set("title",e.target.value)} placeholder="Ex: Reunião de planejamento" style={inputStyle}/>
        </div>

        <div>
          <label style={labelStyle}>DATA *</label>
          <input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={inputStyle}/>
        </div>

        <div>
          <label style={labelStyle}>RECORRÊNCIA</label>
          <select value={form.recurrence} onChange={e=>set("recurrence",e.target.value)} style={inputStyle}>
            <option value="none">Sem recorrência</option>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensal</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>INÍCIO *</label>
          <input type="time" value={form.startTime} onChange={e=>set("startTime",e.target.value)} style={inputStyle}/>
        </div>

        <div>
          <label style={labelStyle}>FIM *</label>
          <input type="time" value={form.endTime} onChange={e=>set("endTime",e.target.value)} style={inputStyle}/>
        </div>

        {form.recurrence!=="none"&&(
          <div style={{gridColumn:"1/-1"}}>
            <label style={labelStyle}>FIM DA RECORRÊNCIA (opcional)</label>
            <input type="date" value={form.recurrenceEnd} onChange={e=>set("recurrenceEnd",e.target.value)} style={inputStyle}/>
          </div>
        )}

        <div style={{gridColumn:"1/-1"}}>
          <label style={labelStyle}>DESCRIÇÃO / PAUTA (opcional)</label>
          <textarea value={form.description} onChange={e=>set("description",e.target.value)}
            placeholder="Tópicos, objetivos ou informações adicionais..."
            style={{...inputStyle,height:72,resize:"none"}}/>
        </div>
      </div>

      {form.startTime&&form.endTime&&form.startTime<form.endTime&&(
        <div style={{fontSize:11,color:T.t9,marginTop:10}}>
          Duração: <strong style={{color:T.t2}}>{durationLabel(durationMin(form.startTime,form.endTime))}</strong>
          {form.recurrence!=="none"&&<span> · recorrente toda {form.recurrence==="weekly"?"semana":"mês"}</span>}
        </div>
      )}

      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:20}}>
        <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
        <Btn disabled={loading||conflicts.length>0} onClick={handleSave}
          style={{background:conflicts.length>0?T.t10:T.accent,color:"#fff",border:"none"}}>
          {loading?"Salvando...":"Confirmar Reserva"}
        </Btn>
      </div>
    </div>
  );
}

export default function MeetingRoom() {
  const { user } = useAuth();
  const { theme: T } = useTheme();
  const today = new Date().toISOString().slice(0,10);

  const [view, setView]         = useState("week");
  const [currentDate, setCurrentDate] = useState(today);
  const [bookings, setBookings] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [flash, setFlash]       = useState("");

  const tt = { background:T.tooltipBg, border:`1px solid ${T.border}`, borderRadius:8, fontSize:12, color:T.t1, padding:"8px 12px" };

  const weekRange = isoWeekRange(currentDate);
  const weekDays  = Array.from({length:5},(_,i)=>addDays(weekRange.mon,i).toISOString().slice(0,10));

  const fetchBookings = useCallback(async () => {
    try {
      let from, to;
      if (view==="week") { from=weekRange.from; to=weekRange.to; }
      else if (view==="day") { from=currentDate; to=currentDate; }
      else { from=new Date(Date.now()-60*86400000).toISOString().slice(0,10); to=new Date(Date.now()+60*86400000).toISOString().slice(0,10); }
      const r = await api.get(`/meeting?from=${from}&to=${to}`);
      setBookings(r.data||[]);
    } catch(e) { console.error(e); }
  }, [view, currentDate]);

  const fetchStats = useCallback(async () => {
    try {
      const from = new Date(Date.now()-30*86400000).toISOString().slice(0,10);
      const to   = today;
      const r = await api.get(`/meeting/stats?from=${from}&to=${to}`);
      setStats(r.data);
    } catch(e) { console.error(e); }
  }, []);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);
  const handleSave = async (form) => {
    await api.post("/meeting", { ...form });
    setShowForm(false);
    setFlash("Reserva criada!");
    setTimeout(()=>setFlash(""),3000);
    fetchBookings();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Excluir esta reserva?")) return;
    await api.delete(`/meeting/${id}`);
    setFlash("Reserva removida.");
    setTimeout(()=>setFlash(""),3000);
    fetchBookings();
  };

  const bookingsForDay = (date) => bookings.filter(b=>b.expandedDate===date).sort((a,b)=>a.startTime.localeCompare(b.startTime));

  const navigate = (dir) => {
    const d = new Date(currentDate);
    if (view==="week") d.setDate(d.getDate()+dir*7);
    else d.setDate(d.getDate()+dir);
    setCurrentDate(d.toISOString().slice(0,10));
  };

  const periodLabel = () => {
    if (view==="week") {
      const from = new Date(weekRange.from+"T12:00:00").toLocaleDateString("pt-BR",{day:"numeric",month:"short"});
      const to   = new Date(weekRange.to+"T12:00:00").toLocaleDateString("pt-BR",{day:"numeric",month:"short",year:"numeric"});
      return `${from} – ${to}`;
    }
    return new Date(currentDate+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  };

  // ── Visão Semana ──
  const WeekView = () => (
    <div style={{overflowX:"auto"}}>
      <div style={{minWidth:700}}>
        {/* Header dias */}
        <div style={{display:"grid",gridTemplateColumns:"52px repeat(5,1fr)",borderBottom:`1px solid ${T.border}`,marginBottom:0}}>
          <div/>
          {weekDays.map(d=>{
            const isToday = d===today;
            const dow = new Date(d+"T12:00:00").getDay();
            const dayBookings = bookingsForDay(d);
            return (
              <div key={d} style={{padding:"8px 6px",textAlign:"center",cursor:"pointer"}} onClick={()=>{setCurrentDate(d);setView("day");}}>
                <div style={{fontSize:10,color:T.t9,fontWeight:600}}>{WEEK_LABELS[dow].toUpperCase()}</div>
                <div style={{fontSize:20,fontWeight:800,color:isToday?T.accent:T.t1,lineHeight:1.2,marginTop:2}}>{new Date(d+"T12:00:00").getDate()}</div>
                {dayBookings.length>0&&<div style={{fontSize:9,color:T.t9,marginTop:2}}>{dayBookings.length} reserva{dayBookings.length>1?"s":""}</div>}
              </div>
            );
          })}
        </div>

        {/* Grade de horas */}
        {HOURS.map(h=>(
          <div key={h} style={{display:"grid",gridTemplateColumns:"52px repeat(5,1fr)",borderBottom:`1px solid ${T.borderRow}`,minHeight:56}}>
            <div style={{padding:"4px 8px 4px 0",textAlign:"right",fontSize:10,color:T.t10,fontFamily:"monospace",paddingTop:8}}>{String(h).padStart(2,"0")}:00</div>
            {weekDays.map(d=>{
              const dayBks = bookingsForDay(d).filter(b=>{
                const bh = parseInt(b.startTime.split(":")[0]);
                const eh = parseInt(b.endTime.split(":")[0]);
                return bh===h||(bh<h&&eh>h);
              });
              return (
                <div key={d} style={{borderLeft:`1px solid ${T.borderRow}`,padding:"3px 4px",background:d===today?T.accent+"05":"transparent"}}>
                  {dayBks.map(b=>(
                    parseInt(b.startTime.split(":")[0])===h&&(
                      <EventBlock key={b.id} booking={b} T={T}
                        canDelete={b.createdBy===user.id||isAdmin(user.role)}
                        onDelete={handleDelete}
                        style={{marginBottom:2}}
                      />
                    )
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  // ── Visão Dia ──
  const DayView = () => {
    const dayBks = bookingsForDay(currentDate);
    const dayLabel = new Date(currentDate+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"});
    return (
      <div>
        {/* Header do dia */}
        <div style={{padding:"10px 16px",marginBottom:8,background:T.bgDeep,borderRadius:8,border:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:14,fontWeight:700,color:T.t1,textTransform:"capitalize"}}>{dayLabel}</div>
          {currentDate===today&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:T.accent+"22",color:T.accent,fontWeight:600}}>HOJE</span>}
          <span style={{fontSize:12,color:T.t9,marginLeft:"auto"}}>{dayBks.length} reserva{dayBks.length!==1?"s":""}</span>
        </div>
        {dayBks.length===0&&(
          <div style={{textAlign:"center",padding:48,color:T.t9,fontSize:14}}>
            Nenhuma reserva para este dia.
            {isLeader(user.role)&&<div style={{marginTop:8,fontSize:12}}>Clique em "+ Reservar" para agendar.</div>}
          </div>
        )}
        {HOURS.map(h=>{
          const hBks = dayBks.filter(b=>parseInt(b.startTime.split(":")[0])===h);
          return (
            <div key={h} style={{display:"grid",gridTemplateColumns:"52px 1fr",borderBottom:`1px solid ${T.borderRow}`,minHeight:52}}>
              <div style={{padding:"8px 10px 8px 0",textAlign:"right",fontSize:10,color:T.t10,fontFamily:"monospace"}}>{String(h).padStart(2,"0")}:00</div>
              <div style={{padding:"4px 8px",borderLeft:`1px solid ${T.borderRow}`,display:"flex",flexDirection:"column",gap:4}}>
                {hBks.map(b=>(
                  <div key={b.id} style={{background:userColor(b.createdBy)+"18",borderLeft:`3px solid ${userColor(b.createdBy)}`,borderRadius:6,padding:"8px 12px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:700,color:T.t1}}>{b.title}</div>
                        <div style={{fontSize:11,color:T.t8,marginTop:2}}>{fmtTime(b.startTime)} – {fmtTime(b.endTime)} · {durationLabel(durationMin(b.startTime,b.endTime))}</div>
                        <div style={{fontSize:11,color:T.t9}}>Agendado por {b.createdByName}</div>
                        {b.description&&<div style={{fontSize:11,color:T.t8,marginTop:4,fontStyle:"italic"}}>"{b.description}"</div>}
                        {b.recurrence!=="none"&&<Badge color={userColor(b.createdBy)} small style={{marginTop:4}}>{b.recurrence==="weekly"?"Semanal":"Mensal"}</Badge>}
                      </div>
                      {(b.createdBy===user.id||isAdmin(user.role))&&(
                        <button onClick={()=>handleDelete(b.id)} style={{background:"none",border:"none",cursor:"pointer",color:T.red,padding:4}}>
                          <Trash2 size={14}/>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Visão Lista ──
  const ListView = () => {
    const sorted = [...bookings].sort((a,b)=>a.expandedDate.localeCompare(b.expandedDate)||a.startTime.localeCompare(b.startTime));
    const grouped = {};
    for (const b of sorted) {
      if (!grouped[b.expandedDate]) grouped[b.expandedDate] = [];
      grouped[b.expandedDate].push(b);
    }
    return (
      <div>
        {Object.keys(grouped).length===0&&(
          <div style={{textAlign:"center",padding:48,color:T.t9,fontSize:14}}>Nenhuma reserva no período.</div>
        )}
        {Object.entries(grouped).map(([date, bks])=>(
          <div key={date} style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:T.t10,letterSpacing:"0.1em",marginBottom:8,padding:"4px 0",borderBottom:`1px solid ${T.border}`}}>
              {fmtDate(date).toUpperCase()}
              {date===today&&<span style={{marginLeft:8,fontSize:10,padding:"1px 8px",borderRadius:10,background:T.accent+"22",color:T.accent}}>HOJE</span>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {bks.map(b=>(
                <div key={b.id+b.expandedDate} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:T.bgDeep,borderRadius:10,border:`1px solid ${T.border}`,borderLeft:`3px solid ${userColor(b.createdBy)}`}}>
                  <div style={{fontFamily:"monospace",fontSize:12,color:T.t6,minWidth:90}}>{fmtTime(b.startTime)}–{fmtTime(b.endTime)}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:T.t1}}>{b.title}</div>
                    <div style={{fontSize:11,color:T.t9}}>{b.createdByName} · {durationLabel(durationMin(b.startTime,b.endTime))}{b.recurrence!=="none"?` · ${b.recurrence==="weekly"?"Semanal":"Mensal"}`:""}</div>
                    {b.description&&<div style={{fontSize:11,color:T.t8,marginTop:2,fontStyle:"italic"}}>"{b.description}"</div>}
                  </div>
                  {(b.createdBy===user.id||isAdmin(user.role))&&(
                    <button onClick={()=>handleDelete(b.id)} style={{background:"none",border:"none",cursor:"pointer",color:T.red,padding:4}}>
                      <Trash2 size={14}/>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };


  return (
    <div style={{padding:28,overflowY:"auto"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:800,color:T.t1}}>Sala de Reunião</h1>
          <p style={{color:T.t8,fontSize:13}}>Calendário compartilhado · conflitos detectados automaticamente</p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {flash&&<div style={{padding:"6px 12px",background:flash.includes("removida")?T.red+"18":T.green+"18",border:`1px solid ${flash.includes("removida")?T.red:T.green}44`,borderRadius:8,fontSize:12,color:flash.includes("removida")?T.red:T.green,fontWeight:600}}>{flash}</div>}

          {isLeader(user.role)&&(
            <Btn onClick={()=>setShowForm(v=>!v)} icon={<Plus size={14}/>} style={{background:T.accent,color:"#fff",border:"none"}}>
              Reservar
            </Btn>
          )}
        </div>
      </div>

      {/* Formulário */}
      {showForm&&isLeader(user.role)&&(
        <BookingForm onSave={handleSave} onCancel={()=>setShowForm(false)} T={T} user={user}/>
      )}

      {/* Navegação */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <Btn variant="ghost" small icon={<ChevronLeft size={14}/>} onClick={()=>navigate(-1)}/>
          <button onClick={()=>setCurrentDate(today)} style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${T.border}`,background:T.bgDeep,color:T.t7,fontSize:12,cursor:"pointer",fontFamily:"'Sora',sans-serif"}}>Hoje</button>
          <Btn variant="ghost" small icon={<ChevronRight size={14}/>} onClick={()=>navigate(1)}/>
          <span style={{fontSize:14,fontWeight:700,color:T.t1,marginLeft:4}}>{periodLabel()}</span>
        </div>
        <div style={{display:"flex",gap:4,background:T.bgDeep,padding:3,borderRadius:8,border:`1px solid ${T.border}`}}>
          {[["week","Semana",<Calendar size={13}/>],["day","Dia",<Clock size={13}/>],["list","Lista",<List size={13}/>]].map(([v,l,ic])=>(
            <button key={v} onClick={()=>setView(v)} style={{padding:"5px 12px",borderRadius:6,border:"none",cursor:"pointer",background:view===v?T.bgCard:"transparent",color:view===v?T.t1:T.t8,fontSize:12,fontWeight:view===v?600:400,fontFamily:"'Sora',sans-serif",display:"flex",alignItems:"center",gap:5,boxShadow:view===v?"0 1px 4px #00000022":"none",transition:"all 0.15s"}}>
              {ic}{l}
            </button>
          ))}
        </div>
      </div>

      {/* Legenda */}
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <span style={{fontSize:11,color:T.t9}}>Legenda:</span>
        {USER_COLORS.slice(0,4).map((c,i)=>(
          <span key={i} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:T.t8}}>
            <span style={{width:10,height:10,borderRadius:2,background:c,display:"inline-block"}}/>
            Líder {i+1}
          </span>
        ))}
        <span style={{fontSize:11,color:T.t9}}>· cores por usuário</span>
      </div>

      {/* Conteúdo */}
      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.borderSubtle}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,color:T.t9,fontWeight:700}}>SALA DE REUNIÃO</span>
          <span style={{fontSize:11,color:T.t9}}>{bookings.length} reserva{bookings.length!==1?"s":""} no período</span>
        </div>
        <div style={{padding:16}}>
          {view==="week"&&<WeekView/>}
          {view==="day"&&<DayView/>}
          {view==="list"&&<ListView/>}
        </div>
      </Card>
    </div>
  );
}
