import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Edit2, Check, X, AlertTriangle, CalendarDays } from "lucide-react";
import { Card, Badge, Btn } from "../components/UI";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";

const TYPE_LABELS = {
  NACIONAL:    { label:"Nacional",    color:"#185FA5" },
  ESTADUAL:    { label:"Estadual",    color:"#534AB7" },
  MUNICIPAL:   { label:"Municipal",   color:"#3B6D11" },
  FACULTATIVO: { label:"Facultativo", color:"#BA7517" },
  MANUAL:      { label:"Manual",      color:"#5F5E5A" },
};

function typeColor(type, T) {
  return TYPE_LABELS[type]?.color || T.t8;
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"});
}

function fmtDateShort(d) {
  if (!d) return "—";
  return new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});
}

const EMPTY_FORM = { date:"", name:"", type:"NACIONAL", description:"" };

export default function HolidaysManager() {
  const { user } = useAuth();
  const { theme: T } = useTheme();
  const isHR = user.role==="hr"||user.role==="ti";

  const [year,     setYear]     = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [flash,    setFlash]    = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [filter,   setFilter]   = useState("ALL");
  const [editingId, setEditingId] = useState(null);
  const [editForm,  setEditForm]  = useState({ date:"", name:"", type:"", description:"" });

  const setF = (k,v) => setForm(f=>({...f,[k]:v}));

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/holidays?year=${year}`);
      setHolidays(r.data||[]);
    } catch(e) { console.error(e); }
    setLoading(false);
  }, [year]);

  useEffect(() => { fetchHolidays(); }, [fetchHolidays]);

const handleAdd = async () => {
    if (!form.date||!form.name||!form.type) {
      setFlash("Preencha data, nome e tipo"); setTimeout(()=>setFlash(""),3000); return;
    }
    try {
      await api.post("/holidays", form);
      setFlash("Feriado adicionado!");
      setShowForm(false); setForm(EMPTY_FORM); fetchHolidays();
    } catch(e) { setFlash("Erro: "+(e.response?.data?.error||e.message)); }
    setTimeout(()=>setFlash(""),3000);
  };

  const handleEditSave = async () => {
    try {
      await api.patch("/holidays/"+editingId, editForm);
      setFlash("Feriado atualizado!"); setEditingId(null);
      fetchHolidays();
    } catch(e) { setFlash("Erro: "+(e.response?.data?.error||e.message)); }
    setTimeout(()=>setFlash(""),3000);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Excluir este feriado manual?")) return;
    try { await api.delete("/holidays/"+id); fetchHolidays(); }
    catch(e) { setFlash("Erro: "+(e.response?.data?.error||e.message)); setTimeout(()=>setFlash(""),3000); }
  };

  const filtered = filter==="ALL" ? holidays : holidays.filter(h=>h.type===filter);

  // Agrupa por mês
  const byMonth = {};
  for (const h of filtered) {
    const m = h.date?.slice(0,7);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(h);
  }

  const inputStyle = { fontSize:12, color:T.t1, background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:8, padding:"7px 10px", fontFamily:"'Sora',sans-serif", outline:"none" };

  // Próximos feriados
  const today = new Date().toISOString().slice(0,10);
  const upcoming = holidays.filter(h=>h.date>=today).slice(0,5);

  return (
    <div style={{padding:28,overflowY:"auto"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:800,color:T.t1, display: "flex", alignItems: "center", gap: 11 }}><span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", background: T.accent + "1f", color: T.accent, flexShrink: 0 }}><CalendarDays size={18} /></span>Feriados</h1>
          <p style={{color:T.t8,fontSize:13,marginTop:2}}>Nacionais · Estaduais MG · Municipais Muriaé</p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {flash&&<div style={{fontSize:12,padding:"7px 12px",background:flash.startsWith("Erro")?T.red+"18":T.green+"18",border:`1px solid ${flash.startsWith("Erro")?T.red:T.green}44`,borderRadius:8,color:flash.startsWith("Erro")?T.red:T.green,maxWidth:360}}>{flash}</div>}
          <select value={year} onChange={e=>setYear(parseInt(e.target.value))}
            style={{...inputStyle,width:100}}>
            {[2026,2027,2028,2029,2030].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          {isHR&&(
            <>

              <Btn icon={<Plus size={13}/>} onClick={()=>setShowForm(v=>!v)}
                style={{background:T.accent,color:"#fff",border:"none"}}>
                Adicionar
              </Btn>
            </>
          )}
        </div>
      </div>

      {/* Próximos feriados */}
      {upcoming.length>0&&(
        <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
          {upcoming.map(h=>(
            <div key={h.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",background:typeColor(h.type,T)+"12",border:`0.5px solid ${typeColor(h.type,T)}33`,borderRadius:10}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:typeColor(h.type,T),flexShrink:0}}/>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:T.t1}}>{h.name}</div>
                <div style={{fontSize:10,color:T.t9}}>{fmtDate(h.date)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {upcoming.length===0&&holidays.length===0&&(
        <div style={{padding:"20px 24px",background:T.amber+"10",border:`1px solid ${T.amber}33`,borderRadius:10,marginBottom:20,display:"flex",gap:10,alignItems:"center"}}>
          <AlertTriangle size={16} style={{color:T.amber,flexShrink:0}}/>
          <div style={{fontSize:13,color:T.t2}}>
            Nenhum feriado cadastrado para {year}. {isHR?"Clique em \"Sincronizar GitHub\" para importar automaticamente.":"Solicite ao RH para sincronizar os feriados."}
          </div>
        </div>
      )}

      {/* Formulário */}
      {showForm&&isHR&&(
        <Card style={{marginBottom:20,padding:20}}>
          <div style={{fontSize:14,fontWeight:700,color:T.t1,marginBottom:16}}>Adicionar Feriado Manual</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
            <div>
              <div style={{fontSize:11,color:T.t8,fontWeight:600,marginBottom:5}}>DATA *</div>
              <input type="date" value={form.date} onChange={e=>setF("date",e.target.value)} style={{...inputStyle,width:"100%"}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:T.t8,fontWeight:600,marginBottom:5}}>NOME *</div>
              <input type="text" value={form.name} onChange={e=>setF("name",e.target.value)}
                placeholder="Nome do feriado" style={{...inputStyle,width:"100%"}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:T.t8,fontWeight:600,marginBottom:5}}>TIPO *</div>
              <select value={form.type} onChange={e=>setF("type",e.target.value)} style={{...inputStyle,width:"100%"}}>
                <option value="NACIONAL">Nacional</option>
                <option value="ESTADUAL">Estadual MG</option>
                <option value="MUNICIPAL">Municipal Muriaé</option>
                <option value="FACULTATIVO">Facultativo</option>
              </select>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <div style={{fontSize:11,color:T.t8,fontWeight:600,marginBottom:5}}>DESCRIÇÃO (opcional)</div>
              <input type="text" value={form.description} onChange={e=>setF("description",e.target.value)}
                placeholder="Observações..." style={{...inputStyle,width:"100%"}}/>
            </div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
            <Btn variant="ghost" onClick={()=>{setShowForm(false);setForm(EMPTY_FORM);}}>Cancelar</Btn>
            <Btn onClick={handleAdd} style={{background:T.accent,color:"#fff",border:"none"}}>Salvar</Btn>
          </div>
        </Card>
      )}

      {/* Filtros */}
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {[{id:"ALL",label:"Todos"},{id:"NACIONAL",label:"Nacional"},{id:"ESTADUAL",label:"Estadual"},{id:"MUNICIPAL",label:"Municipal"},{id:"FACULTATIVO",label:"Facultativo"}].map(f=>(
          <button key={f.id} onClick={()=>setFilter(f.id)}
            style={{padding:"5px 14px",borderRadius:20,border:`1px solid ${filter===f.id?T.accent:T.border}`,background:filter===f.id?T.accent+"18":"transparent",color:filter===f.id?T.accent:T.t8,fontSize:12,cursor:"pointer",fontFamily:"'Sora',sans-serif",fontWeight:filter===f.id?600:400}}>
            {f.label} {f.id!=="ALL"&&`(${holidays.filter(h=>h.type===f.id).length})`}
          </button>
        ))}
        <span style={{marginLeft:"auto",fontSize:12,color:T.t9,alignSelf:"center"}}>{filtered.length} feriados</span>
      </div>

      {/* Lista por mês */}
      {loading&&<div style={{textAlign:"center",padding:40,color:T.t9}}>Carregando...</div>}

      {Object.entries(byMonth).sort(([a],[b])=>a.localeCompare(b)).map(([month, items])=>(
        <div key={month} style={{marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:700,color:T.t8,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,padding:"0 4px"}}>
            {new Date(month+"-01T12:00:00").toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {items.map(h=>{
              const color = typeColor(h.type, T);
              const typeInfo = TYPE_LABELS[h.type];
              return (
                <div key={h.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",background:T.bgCard,border:`0.5px solid ${T.border}`,borderRadius:10,borderLeft:`3px solid ${color}`}}>
                  <div style={{minWidth:36,textAlign:"center"}}>
                    <div style={{fontSize:18,fontWeight:800,color,lineHeight:1}}>{h.date?.slice(8,10)}</div>
                    <div style={{fontSize:9,color:T.t9,textTransform:"uppercase"}}>{new Date(h.date+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short"})}</div>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:T.t1}}>{h.name}</div>
                    {h.description&&<div style={{fontSize:11,color:T.t9,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.description}</div>}
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:10,padding:"3px 10px",borderRadius:20,background:color+"18",color,border:`0.5px solid ${color}33`,fontWeight:600,whiteSpace:"nowrap"}}>
                      {typeInfo?.label||h.type}
                    </span>

                    {isHR&&(
                      <div style={{display:"flex",gap:4}}>
                        <button onClick={()=>{setEditingId(h.id);setEditForm({date:h.date,name:h.name,type:h.type,description:h.description||""});}}
                          style={{background:"none",border:"none",cursor:"pointer",color:T.t8,padding:3}} title="Editar">
                          <Edit2 size={12}/>
                        </button>
                        {h.source==="manual"&&(
                          <button onClick={()=>handleDelete(h.id)}
                            style={{background:"none",border:"none",cursor:"pointer",color:T.red,padding:3}} title="Excluir">
                            <Trash2 size={12}/>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                {editingId===h.id&&(
                  <div style={{padding:"12px 16px",background:T.bgDeep,borderTop:"1px solid "+T.border,display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
                    <div>
                      <div style={{fontSize:10,color:T.t9,marginBottom:3}}>Data:</div>
                      <input type="date" value={editForm.date} onChange={e=>setEditForm(f=>({...f,date:e.target.value}))}
                        style={{fontSize:12,color:T.t1,background:T.bgCard,border:"1px solid "+T.border,borderRadius:7,padding:"5px 8px"}}/>
                    </div>
                    <div style={{flex:1,minWidth:160}}>
                      <div style={{fontSize:10,color:T.t9,marginBottom:3}}>Nome:</div>
                      <input type="text" value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))}
                        style={{width:"100%",fontSize:12,color:T.t1,background:T.bgCard,border:"1px solid "+T.border,borderRadius:7,padding:"5px 8px",fontFamily:"Sora,sans-serif"}}/>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={handleEditSave} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 12px",background:T.green,border:"none",borderRadius:7,color:"#fff",fontSize:12,cursor:"pointer"}}>
                        <Check size={12}/> Salvar
                      </button>
                      <button onClick={()=>setEditingId(null)} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",background:T.bgCard,border:"1px solid "+T.border,borderRadius:7,color:T.t6,fontSize:12,cursor:"pointer"}}>
                        <X size={12}/> Cancelar
                      </button>
                    </div>
                  </div>
                )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filtered.length===0&&!loading&&holidays.length>0&&(
        <div style={{textAlign:"center",padding:32,color:T.t9,fontSize:13}}>Nenhum feriado para o filtro selecionado.</div>
      )}
    </div>
  );
}
