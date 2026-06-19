import React, { useState, useEffect, useCallback } from "react";
import { LogOut, LogIn, Clock, AlertTriangle, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Edit2, Check, X, Timer } from "lucide-react";
import { Card, Badge, Avatar, Btn, Select } from "../components/UI";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Cell, Legend, ComposedChart, Area,
} from "recharts";
import api from "../api/client";

const LIMIT_SEC  = 900;  // 15 min
const LIMIT_WARN = 1080; // 18 min

function secToMMSS(s) {
  if (!s && s!==0) return "—";
  const m = Math.floor(Math.abs(s)/60);
  const sec = Math.abs(s)%60;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}
function secToHuman(s) {
  if (!s && s!==0) return "0s";
  if (s<60) return `${Math.abs(s)}s`;
  const m = Math.floor(Math.abs(s)/60); const sec = Math.abs(s)%60;
  return sec>0?`${m}m ${sec}s`:`${m}m`;
}
function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
}
function formatDate(iso) {
  if (!iso) return "—";
  const d = iso.length>10 ? iso.slice(0,10) : iso;
  return new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{day:"numeric",month:"short"});
}
function timeColor(sec, T) {
  if (!sec) return T.t9;
  if (sec > LIMIT_WARN) return T.red;
  if (sec > LIMIT_SEC)  return T.amber;
  return T.green;
}
function timeBadge(sec, isOpen) {
  if (isOpen) return { label:"aberta",  bg:"accent" };
  if (sec > LIMIT_WARN) return { label:"crítico",  bg:"red" };
  if (sec > LIMIT_SEC)  return { label:"atenção",  bg:"amber" };
  return { label:"ok", bg:"green" };
}

function ColorLegend({ T }) {
  return (
    <div style={{display:"flex",gap:16,marginBottom:14,padding:"7px 14px",background:T.bgDeep,borderRadius:8,border:`1px solid ${T.border}`,flexWrap:"wrap",alignItems:"center"}}>
      <span style={{fontSize:11,color:T.t8,fontWeight:600}}>Tempo de ausência:</span>
      {[
        {dot:T.green, label:"até 15 min — ok"},
        {dot:T.amber, label:"15–18 min — atenção"},
        {dot:T.red,   label:"acima de 18 min — crítico"},
      ].map((l,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.t9}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:l.dot,flexShrink:0}}/>
          {l.label}
        </div>
      ))}
    </div>
  );
}

function AbsenceTimer({ startedAt, onEnd, T }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.round((Date.now()-start)/1000));
    tick(); const iv = setInterval(tick,1000); return ()=>clearInterval(iv);
  }, [startedAt]);
  const pct = Math.min(100,Math.round((elapsed/LIMIT_WARN)*100));
  const isWarn = elapsed>=LIMIT_SEC&&elapsed<LIMIT_WARN;
  const isOver = elapsed>=LIMIT_WARN;
  const color = isOver?T.red:isWarn?T.amber:T.green;
  const remain = LIMIT_SEC-elapsed;
  return (
    <div style={{border:`2px solid ${color}`,borderRadius:16,padding:"20px",textAlign:"center",animation:isOver?"pulse-border 1.2s ease-in-out infinite":"none",transition:"border-color 0.4s"}}>
      <style>{`@keyframes pulse-border{0%,100%{box-shadow:0 0 0 0 ${T.red}44;}50%{box-shadow:0 0 0 8px ${T.red}00;}}`}</style>
      <div style={{fontSize:11,color:T.t9,letterSpacing:"0.1em",marginBottom:6}}>AUSÊNCIA EM ANDAMENTO</div>
      <div style={{fontSize:50,fontWeight:700,color,fontFamily:"'JetBrains Mono',monospace",lineHeight:1,marginBottom:6,transition:"color 0.4s"}}>{secToMMSS(elapsed)}</div>
      <div style={{height:6,borderRadius:3,background:T.bgDeep,margin:"0 auto 8px",maxWidth:200,overflow:"hidden"}}>
        <div style={{height:"100%",borderRadius:3,width:`${pct}%`,background:color,transition:"width 0.5s,background 0.4s"}}/>
      </div>
      {isOver
        ? <div style={{fontSize:12,color:T.red,fontWeight:700,marginBottom:10}}>Limite ultrapassado em {secToHuman(elapsed-LIMIT_WARN)}</div>
        : isWarn
          ? <div style={{fontSize:12,color:T.amber,marginBottom:10}}>Atenção — {secToHuman(LIMIT_WARN-elapsed)} para o limite crítico</div>
          : elapsed>=LIMIT_SEC
            ? <div style={{fontSize:12,color:T.amber,marginBottom:10}}>Limite de 15 min atingido — retorne em breve</div>
            : <div style={{fontSize:12,color:T.t9,marginBottom:10}}>Saiu às {formatTime(startedAt)} · limite: 15 min</div>
      }
      <Btn onClick={onEnd} style={{background:T.green,color:"#fff",border:"none",width:"100%",justifyContent:"center"}}>
        <LogIn size={14}/> Registrar retorno
      </Btn>
    </div>
  );
}

function PersonalStats({ T, tt }) {
  const [stats, setStats] = useState(null);
  const [dateFrom, setDateFrom] = useState(()=>{ const d=new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10); });
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0,10));
  const FULL_DAYS = {Seg:"Segundas",Ter:"Terças",Qua:"Quartas",Qui:"Quintas",Sex:"Sextas"};

  const fetchStats = useCallback(async () => {
    try {
      const r = await api.get(`/absences/me/stats?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      setStats(r.data);
    } catch(e) { console.error(e); }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (!stats) return <div style={{textAlign:"center",padding:32,color:T.t9,fontSize:12}}>Carregando...</div>;

  const { summary, comparison, byDow, byHourArr, byDayArr } = stats;
  const vsTeamColor   = comparison.vsTeam===null?T.t9:comparison.vsTeam>60?T.red:comparison.vsTeam<-60?T.green:T.t8;
  const vsGlobalColor = comparison.vsGlobal===null?T.t9:comparison.vsGlobal>60?T.red:comparison.vsGlobal<-60?T.green:T.t8;
  const trendIcon = summary.trend==="alta"?<TrendingUp size={13} style={{color:T.red}}/>:summary.trend==="queda"?<TrendingDown size={13} style={{color:T.green}}/>:<Minus size={13} style={{color:T.t9}}/>;

  return (
    <div>
      {/* Filtro período */}
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14,flexWrap:"wrap"}}>
        <span style={{fontSize:11,color:T.t9}}>Período:</span>
        {[{label:"7d",days:7},{label:"30d",days:30},{label:"90d",days:90}].map(p=>{
          const from = new Date(Date.now()-p.days*86400000).toISOString().slice(0,10);
          const isActive = dateFrom===from;
          return (
            <button key={p.label} onClick={()=>{ setDateFrom(from); setDateTo(new Date().toISOString().slice(0,10)); }}
              style={{padding:"3px 10px",borderRadius:20,border:`1px solid ${isActive?T.accent:T.border}`,background:isActive?T.accent+"18":"transparent",color:isActive?T.accent:T.t8,fontSize:11,cursor:"pointer",fontFamily:"'Sora',sans-serif"}}>
              {p.label}
            </button>
          );
        })}
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
          style={{fontSize:11,color:T.t1,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 8px"}}/>
        <span style={{fontSize:11,color:T.t9}}>até</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
          style={{fontSize:11,color:T.t1,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 8px"}}/>
      </div>

      {/* KPIs 4x2 */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
        {[
          {label:"saídas no período",   value:summary.totalAbsences,        color:T.accent},
          {label:"tempo total",         value:secToHuman(summary.totalSec), color:timeColor(summary.totalSec/Math.max(1,summary.totalAbsences),T)},
          {label:"média por saída",     value:secToMMSS(summary.avgSec),    color:timeColor(summary.avgSec,T)},
          {label:"acima do limite",     value:summary.overLimitCount,       color:summary.overLimitCount>0?T.red:T.green},
        ].map((s,i)=>(
          <div key={i} style={{background:T.bgDeep,borderRadius:8,padding:"10px 12px",border:`1px solid ${T.border}`}}>
            <div style={{fontSize:10,color:T.t9,marginBottom:3}}>{s.label}</div>
            <div style={{fontSize:18,fontWeight:700,color:s.color}}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
        {[
          {label:"maior ausência",     value:secToMMSS(summary.maxSec),  color:timeColor(summary.maxSec,T)},
          {label:"menor ausência",     value:secToMMSS(summary.minSec),  color:T.t2},
          {label:"dias c/ 2+ saídas", value:summary.daysMultiple,       color:summary.daysMultiple>3?T.amber:T.t2},
          {label:"tendência",          value:summary.trend,              color:summary.trend==="alta"?T.red:summary.trend==="queda"?T.green:T.t8, icon:trendIcon},
        ].map((s,i)=>(
          <div key={i} style={{background:T.bgDeep,borderRadius:8,padding:"10px 12px",border:`1px solid ${T.border}`}}>
            <div style={{fontSize:10,color:T.t9,marginBottom:3}}>{s.label}</div>
            <div style={{fontSize:14,fontWeight:600,color:s.color,display:"flex",alignItems:"center",gap:4,textTransform:"capitalize"}}>{s.icon}{s.value}</div>
          </div>
        ))}
      </div>

      {/* Comparativo */}
      <Card style={{marginBottom:14,padding:14}}>
        <div style={{fontSize:12,fontWeight:600,color:T.t1,marginBottom:12}}>Comparativos</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:10,color:T.t9,marginBottom:4}}>MINHA MÉDIA</div>
            <div style={{fontSize:22,fontWeight:700,color:timeColor(comparison.myAvg,T)}}>{secToMMSS(comparison.myAvg)}</div>
            <div style={{fontSize:10,color:T.t9,marginTop:3}}>por saída</div>
          </div>
          <div style={{textAlign:"center",borderLeft:`1px solid ${T.border}`,borderRight:`1px solid ${T.border}`,padding:"0 12px"}}>
            <div style={{fontSize:10,color:T.t9,marginBottom:4}}>MÉDIA DO TIME</div>
            <div style={{fontSize:22,fontWeight:700,color:T.t2}}>{comparison.teamAvg!==null?secToMMSS(comparison.teamAvg):"—"}</div>
            <div style={{fontSize:9,color:T.t10,marginTop:2}}>anônimo</div>
            {comparison.vsTeam!==null&&(
              <div style={{fontSize:11,color:vsTeamColor,marginTop:3,fontWeight:600}}>
                {comparison.vsTeam>0?"+":""}{secToHuman(comparison.vsTeam)} vs time
              </div>
            )}
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:10,color:T.t9,marginBottom:4}}>MÉDIA GLOBAL</div>
            <div style={{fontSize:22,fontWeight:700,color:T.t2}}>{comparison.globalAvg?secToMMSS(comparison.globalAvg):"—"}</div>
            <div style={{fontSize:9,color:T.t10,marginTop:2}}>anônimo</div>
            {comparison.vsGlobal!==null&&(
              <div style={{fontSize:11,color:vsGlobalColor,marginTop:3,fontWeight:600}}>
                {comparison.vsGlobal>0?"+":""}{secToHuman(comparison.vsGlobal)} vs empresa
              </div>
            )}
          </div>
        </div>
        {comparison.globalAvg>0&&(
          <div style={{marginTop:12}}>
            <div style={{height:6,borderRadius:3,background:T.bgDeep,position:"relative"}}>
              <div style={{position:"absolute",left:`${Math.min(95,Math.round(LIMIT_SEC/1800*100))}%`,top:-2,width:1,height:10,background:T.amber,borderRadius:1}} title="15 min"/>
              <div style={{position:"absolute",left:`${Math.min(95,Math.round(LIMIT_WARN/1800*100))}%`,top:-2,width:1,height:10,background:T.red,borderRadius:1}} title="18 min"/>
              {comparison.teamAvg!==null&&(
                <div style={{position:"absolute",left:`${Math.min(95,Math.round(comparison.teamAvg/1800*100))}%`,top:0,width:8,height:6,borderRadius:"50%",background:T.purple,transform:"translateX(-50%)",zIndex:2}}/>
              )}
              <div style={{position:"absolute",left:`${Math.min(95,Math.round(comparison.myAvg/1800*100))}%`,top:-3,width:12,height:12,borderRadius:"50%",background:timeColor(comparison.myAvg,T),transform:"translateX(-50%)",zIndex:3,boxShadow:"0 0 0 2px white"}}/>
            </div>
            <div style={{display:"flex",gap:12,marginTop:6,fontSize:10}}>
              <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:"50%",background:timeColor(comparison.myAvg,T),display:"inline-block"}}/> Você</span>
              {comparison.teamAvg!==null&&<span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:"50%",background:T.purple,display:"inline-block"}}/> Time</span>}
              <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:1,height:8,background:T.amber,display:"inline-block"}}/> 15m</span>
              <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:1,height:8,background:T.red,display:"inline-block"}}/> 18m</span>
            </div>
          </div>
        )}
      </Card>

      {/* Gráficos 2 col */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        <Card style={{padding:14}}>
          <div style={{fontSize:12,fontWeight:600,color:T.t1,marginBottom:10}}>Por dia da semana</div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={byDow.filter(d=>d.dow>=1&&d.dow<=5)}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
              <XAxis dataKey="label" tick={{fill:T.t8,fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis yAxisId="count" orientation="left" tick={{fill:T.t8,fontSize:9}} axisLine={false} tickLine={false} allowDecimals={false}/>
              <YAxis yAxisId="avg" orientation="right" tickFormatter={v=>`${Math.round(v/60)}m`} tick={{fill:T.t8,fontSize:9}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={tt} formatter={(v,n)=>n==="Saídas"?[v,n]:[secToHuman(v),n]}/>
              <Bar yAxisId="count" dataKey="count" name="Saídas" radius={[3,3,0,0]} barSize={18}>
                {byDow.filter(d=>d.dow>=1&&d.dow<=5).map((d,i)=>(
                  <Cell key={i} fill={timeColor(d.avg_sec,T)} opacity={0.75}/>
                ))}
              </Bar>
              <Line yAxisId="avg" type="monotone" dataKey="avg_sec" name="Duração média" stroke={T.purple} strokeWidth={2} dot={{r:3}}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card style={{padding:14}}>
          <div style={{fontSize:12,fontWeight:600,color:T.t1,marginBottom:10}}>Horários mais frequentes</div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={byHourArr.filter(h=>h.hour>=7&&h.hour<=18)}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
              <XAxis dataKey="hour" tickFormatter={h=>h+"h"} tick={{fill:T.t8,fontSize:9}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:T.t8,fontSize:9}} axisLine={false} tickLine={false} allowDecimals={false}/>
              <Tooltip contentStyle={tt} formatter={(v,n)=>[v,"Saídas"]} labelFormatter={h=>h+"h"}/>
              <Bar dataKey="count" radius={[3,3,0,0]} barSize={16}>
                {byHourArr.filter(h=>h.hour>=7&&h.hour<=18).map((h,i)=>(
                  <Cell key={i} fill={h.count===Math.max(...byHourArr.map(x=>x.count))?T.red:T.accent+"88"}/>
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {byDayArr.length>0&&(
        <Card style={{padding:14,marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:600,color:T.t1,marginBottom:10}}>Evolução diária</div>
          <ResponsiveContainer width="100%" height={130}>
            <ComposedChart data={byDayArr}>
              <defs>
                <linearGradient id="myGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={T.accent} stopOpacity={0.25}/>
                  <stop offset="95%" stopColor={T.accent} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
              <XAxis dataKey="label" tick={{fill:T.t8,fontSize:9}} axisLine={false} tickLine={false}/>
              <YAxis yAxisId="avg" tickFormatter={v=>`${Math.round(v/60)}m`} tick={{fill:T.t8,fontSize:9}} axisLine={false} tickLine={false}/>
              <YAxis yAxisId="count" orientation="right" tick={{fill:T.t8,fontSize:9}} axisLine={false} tickLine={false} allowDecimals={false}/>
              <Tooltip contentStyle={tt} formatter={(v,n)=>n==="Saídas"?[v,n]:[secToHuman(v),n]}/>
              <Legend wrapperStyle={{fontSize:10}}/>
              <ReferenceLine yAxisId="avg" y={LIMIT_SEC}  stroke={T.amber} strokeDasharray="4 2" label={{value:"15m",fill:T.amber,fontSize:9}}/>
              <ReferenceLine yAxisId="avg" y={LIMIT_WARN} stroke={T.red}   strokeDasharray="4 2" label={{value:"18m",fill:T.red,fontSize:9}}/>
              <Area yAxisId="avg" type="monotone" dataKey="avg_sec" name="Duração média" stroke={T.accent} fill="url(#myGrad)" strokeWidth={2} dot={{r:3,fill:T.accent}}/>
              <Bar yAxisId="count" dataKey="count" name="Saídas" fill={T.purple} opacity={0.4} radius={[2,2,0,0]} barSize={10}/>
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Insights */}
      {summary.totalAbsences>0&&(()=>{
        const insights = [];
        const workDays = byDow.filter(d=>d.dow>=1&&d.dow<=5);
        const busyDay  = workDays.reduce((a,b)=>b.count>a.count?b:a, workDays[0]||{count:0});
        const FULL_DAYS = {Seg:"Segundas",Ter:"Terças",Qua:"Quartas",Qui:"Quintas",Sex:"Sextas"};
        if (busyDay?.count>0) insights.push({dot:T.t9, text:`Você sai mais às ${FULL_DAYS[busyDay.label]||busyDay.label} (${busyDay.count}x).`, level:"info"});
        const peakHour = byHourArr.length>0 ? byHourArr.reduce((a,b)=>b.count>a.count?b:a) : null;
        if (peakHour?.count>0) insights.push({dot:T.t9, text:`Pico às ${peakHour.hour}h (${peakHour.count} saída${peakHour.count>1?"s":""}).`, level:"info"});
        if (summary.overLimitCount>0) {
          const pct = Math.round(summary.overLimitCount/summary.totalAbsences*100);
          insights.push({dot:T.red, text:`${pct}% das saídas ultrapassaram 15 min (${summary.overLimitCount}x).`, level:"warn"});
        }
        if (comparison.vsTeam!==null) {
          if (comparison.vsTeam>120) insights.push({dot:T.amber, text:`Sua média está ${secToHuman(comparison.vsTeam)} acima do time.`, level:"warn"});
          else if (comparison.vsTeam<-60) insights.push({dot:T.green, text:`Você está ${secToHuman(Math.abs(comparison.vsTeam))} abaixo da média do time.`, level:"ok"});
          else insights.push({dot:T.t9, text:`Sua média está próxima à do time.`, level:"info"});
        }
        if (summary.trend==="alta") insights.push({dot:T.red, text:`Tendência de alta: ausências aumentando no período.`, level:"warn"});
        else if (summary.trend==="queda") insights.push({dot:T.green, text:`Tendência positiva: ausências diminuindo.`, level:"ok"});
        if (summary.daysMultiple>2) insights.push({dot:T.amber, text:`Em ${summary.daysMultiple} dias você saiu mais de uma vez.`, level:"info"});
        return (
          <Card style={{padding:14,marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:600,color:T.t1,marginBottom:10}}>Padrões identificados</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {insights.slice(0,6).map((ins,i)=>{
                const bg = ins.level==="warn"?T.amber+"12":ins.level==="ok"?T.green+"12":T.bgDeep;
                const border = ins.level==="warn"?T.amber+"33":ins.level==="ok"?T.green+"33":T.border;
                return (
                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 10px",background:bg,border:`0.5px solid ${border}`,borderRadius:7}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:ins.dot,flexShrink:0,marginTop:3}}/>
                    <span style={{fontSize:11,color:T.t2,lineHeight:1.5}}>{ins.text}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}

      {byDayArr.length===0&&summary.totalAbsences===0&&(
        <div style={{textAlign:"center",padding:20,color:T.t9,fontSize:13,background:T.bgDeep,borderRadius:8,border:`1px solid ${T.border}`}}>
          Nenhuma ausência registrada no período selecionado.
        </div>
      )}
    </div>
  );
}

export default function AbsenceControl() {
  const { user } = useAuth();
  const { theme: T } = useTheme();

  const isHR     = user.role==="hr"||user.role==="ti"||user.role==="gerencia";
  const isLeader = user.role==="leader"||user.role==="gerencia";

  const [activeTab, setActiveTab]   = useState(isHR?"admin":isLeader?"leader":"me");
  const [status,    setStatus]      = useState(null);
  const [history,   setHistory]     = useState([]);
  const [summary,   setSummary]     = useState(null);
  const [daily,     setDaily]       = useState([]);
  const [groups,    setGroups]      = useState([]);
  const [users,     setUsers]       = useState([]);
  const [loading,   setLoading]     = useState(false);
  const [flash,     setFlash]       = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [filterUser,  setFilterUser]  = useState("");
  const [expandedId,  setExpandedId]  = useState(null);
  const [editingId,   setEditingId]   = useState(null);
  const [editForm,    setEditForm]    = useState({ endedAt:"", note:"" });
  const [editLoading, setEditLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(()=>{ const d=new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10); });
  const [dateTo,   setDateTo]   = useState(new Date().toISOString().slice(0,10));

  const tt = { background:T.tooltipBg, border:`1px solid ${T.border}`, borderRadius:8, fontSize:12, color:T.t1, padding:"8px 12px" };

  const fetchStatus = useCallback(async () => {
    const r = await api.get("/absences/status");
    setStatus(r.data);
  }, []);

  const fetchHistory = useCallback(async (forTab) => {
    const params = new URLSearchParams({ dateFrom, dateTo, limit:100 });
    const currentTab = forTab!==undefined?forTab:activeTab;
    if (currentTab==="me") {
      params.set("userId", user.id);
    } else {
      if (filterUser)  params.set("userId",  filterUser);
      if (filterGroup) params.set("groupId", filterGroup);
    }
    const r = await api.get("/absences?"+params);
    setHistory(r.data.rows||[]);
  }, [dateFrom, dateTo, filterUser, filterGroup, activeTab, user.id]);

  const fetchSummary = useCallback(async () => {
    if (!isHR&&!isLeader) return;
    const params = new URLSearchParams({ dateFrom, dateTo });
    if (filterGroup) params.set("groupId", filterGroup);
    const [sum, day] = await Promise.all([
      api.get("/absences/summary?"+params),
      api.get("/absences/daily?"+params),
    ]);
    setSummary(sum.data);
    setDaily(day.data);
  }, [dateFrom, dateTo, filterGroup, isHR, isLeader]);

  useEffect(() => {
    fetchStatus();
    const initTab = isHR?"admin":isLeader?"leader":"me";
    fetchHistory(initTab);
    if (isHR||isLeader) {
      fetchSummary();
      api.get("/groups").then(r=>setGroups(r.data||[]));
      if (isHR) api.get("/users").then(r=>setUsers(r.data||[]));
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        const tab = isHR?"admin":isLeader?"leader":"me";
        fetchHistory(tab);
        if (isHR||isLeader) {
          fetchSummary();
          api.get("/groups").then(r=>setGroups(r.data||[]));
        }
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchHistory, fetchSummary, isHR, isLeader]);

  useEffect(() => {
    if (!status?.isOut) return;
    const iv = setInterval(fetchStatus, 30000);
    return ()=>clearInterval(iv);
  }, [status?.isOut, fetchStatus]);

  const handleStart = async () => {
    setLoading(true);
    try { await api.post("/absences/start"); setFlash("Saída registrada!"); fetchStatus(); }
    catch(e) { setFlash("Erro: "+(e.response?.data?.error||e.message)); }
    finally { setLoading(false); setTimeout(()=>setFlash(""),3000); }
  };

  const handleEnd = async () => {
    setLoading(true);
    try {
      const r = await api.post("/absences/end");
      setFlash(r.data.overLimit?`Retorno — limite ultrapassado (${secToHuman(r.data.durationSec)})`:`Retorno registrado — ${secToHuman(r.data.durationSec)}`);
      fetchStatus(); fetchHistory(activeTab); fetchSummary();
    }
    catch(e) { setFlash("Erro: "+(e.response?.data?.error||e.message)); }
    finally { setLoading(false); setTimeout(()=>setFlash(""),4000); }
  };

  const handleEdit = async (absenceId) => {
    setEditLoading(true);
    try {
      // Converte datetime-local (2026-04-10T14:22) para ISO completo
      const endedAtISO = editForm.endedAt ? new Date(editForm.endedAt).toISOString() : "";
      if (editForm.startedAt && new Date(endedAtISO) <= new Date(editForm.startedAt)) {
        setFlash("Retorno deve ser após a saída ("+formatTime(editForm.startedAt)+")");
        setEditLoading(false);
        setTimeout(()=>setFlash(""),4000);
        return;
      }
      await api.patch(`/absences/${absenceId}`, { endedAt: endedAtISO, note: editForm.note });
      setEditingId(null);
      setEditForm({ endedAt:"", note:"" });
      fetchHistory(activeTab);
      fetchSummary();
      setFlash("Ausência corrigida!");
      setTimeout(()=>setFlash(""),3000);
    } catch(e) {
      setFlash("Erro: "+(e.response?.data?.error||e.message));
      setTimeout(()=>setFlash(""),4000);
    }
    setEditLoading(false);
  };

  const tabs = [
    { id:"me",     label:"Minha Ausência", show:true },
    { id:"leader", label:"Minha Equipe",   show:isLeader||isHR },
    { id:"admin",  label:"Visão Geral",    show:isHR },
  ].filter(t=>t.show);

  return (
    <div style={{padding:28,overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:800,color:T.t1, display: "flex", alignItems: "center", gap: 11 }}><span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", background: T.accent + "1f", color: T.accent, flexShrink: 0 }}><Timer size={18} /></span>Controle de Ausências</h1>
          <p style={{color:T.t8,fontSize:13,marginTop:2}}>Registre saídas · acompanhe padrões · limite de 15 min</p>
        </div>
        {flash&&(
          <div style={{padding:"8px 14px",background:flash.startsWith("Erro")?T.red+"18":T.green+"18",border:`1px solid ${flash.startsWith("Erro")?T.red:T.green}44`,borderRadius:8,fontSize:12,color:flash.startsWith("Erro")?T.red:T.green,fontWeight:600}}>
            {flash}
          </div>
        )}
      </div>

      <div style={{display:"flex",gap:4,marginBottom:20,background:T.bgDeep,borderRadius:10,padding:4,width:"fit-content",border:`1px solid ${T.border}`}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>{ setActiveTab(t.id); fetchHistory(t.id); }} style={{padding:"7px 20px",borderRadius:8,border:"none",cursor:"pointer",background:activeTab===t.id?T.bgCard:"transparent",color:activeTab===t.id?T.t1:T.t8,fontSize:13,fontWeight:activeTab===t.id?600:400,fontFamily:"'Sora',sans-serif",boxShadow:activeTab===t.id?"0 1px 6px #00000022":"none",transition:"background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── MINHA AUSÊNCIA ── */}
      {activeTab==="me"&&(
        <div>
          <ColorLegend T={T}/>
          <div style={{display:"grid",gridTemplateColumns:"260px 1fr",gap:14,marginBottom:14}}>
            <div>
              {status?.isOut&&status.openAbsence
                ? <AbsenceTimer startedAt={status.openAbsence.started_at} onEnd={handleEnd} T={T}/>
                : (
                  <Card style={{textAlign:"center",padding:"24px 16px",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10}}>
                    <div style={{width:48,height:48,borderRadius:"50%",background:T.green+"18",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <Clock size={20} style={{color:T.green}}/>
                    </div>
                    <div>
                      <div style={{fontSize:14,fontWeight:600,color:T.t1,marginBottom:3}}>Você está no posto</div>
                      <div style={{fontSize:12,color:T.t8}}>Hoje: <strong style={{color:timeColor(status?.todayTotalSec,T)}}>{secToHuman(status?.todayTotalSec||0)}</strong></div>
                    </div>
                    <Btn onClick={handleStart} disabled={loading} style={{background:T.accent,color:"#fff",border:"none",justifyContent:"center",width:"100%",padding:"10px 16px",fontSize:13}}>
                      <LogOut size={14}/> Registrar saída
                    </Btn>
                    {history.length>0&&(
                      <div style={{fontSize:11,color:T.t9}}>última: {formatTime(history[0]?.startedAt)} · {history[0]?.isOpen?"aberta":secToMMSS(history[0]?.durationSec)}</div>
                    )}
                  </Card>
                )
              }
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {[
                  {label:"saídas hoje",   value:history.filter(h=>h.date===new Date().toISOString().slice(0,10)).length, color:T.accent},
                  {label:"tempo hoje",    value:secToHuman(status?.todayTotalSec||0), color:timeColor(status?.todayTotalSec,T)},
                  {label:"saídas no mês", value:history.length, color:T.purple},
                ].map((s,i)=>(
                  <div key={i} style={{background:T.bgDeep,borderRadius:10,padding:"12px 14px",border:`1px solid ${T.border}`,textAlign:"center"}}>
                    <div style={{fontSize:10,color:T.t9,marginBottom:4}}>{s.label}</div>
                    <div style={{fontSize:22,fontWeight:700,color:s.color}}>{s.value}</div>
                  </div>
                ))}
              </div>
              <Card style={{padding:0,overflow:"hidden",flex:1}}>
                <div style={{padding:"9px 14px",borderBottom:`1px solid ${T.borderSubtle}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:12,fontWeight:600,color:T.t1}}>Histórico recente</span>
                  <div style={{display:"flex",gap:5,alignItems:"center"}}>
                    <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{fontSize:10,color:T.t6,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:5,padding:"2px 6px"}}/>
                    <span style={{fontSize:10,color:T.t9}}>–</span>
                    <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{fontSize:10,color:T.t6,background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:5,padding:"2px 6px"}}/>
                    <Btn small variant="ghost" onClick={()=>fetchHistory("me")}>↻</Btn>
                  </div>
                </div>
                <div style={{maxHeight:160,overflowY:"auto"}}>
                  {history.length===0&&<div style={{padding:14,textAlign:"center",fontSize:12,color:T.t9}}>Nenhuma ausência no período</div>}
                  {history.map(h=>{
                    const tc = timeColor(h.durationSec, T);
                    const tb = timeBadge(h.durationSec, h.isOpen);
                    const bc = tb.bg==="red"?T.red:tb.bg==="amber"?T.amber:tb.bg==="accent"?T.accent:T.green;
                    return (
                      <div key={h.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 14px",borderBottom:`1px solid ${T.borderRow}`}}>
                        <div style={{minWidth:56}}>
                          <div style={{fontSize:11,fontWeight:600,color:T.t2}}>{formatDate(h.startedAt)}</div>
                          <div style={{fontSize:10,color:T.t9}}>{formatTime(h.startedAt)}</div>
                        </div>
                        <div style={{flex:1,fontSize:11,color:T.t7}}>{h.endedAt?`retorno ${formatTime(h.endedAt)}`:"em andamento"}</div>
                        <div style={{fontFamily:"monospace",fontSize:12,color:tc,fontWeight:600}}>{h.isOpen?"—":secToMMSS(h.durationSec)}</div>
                        <Badge color={bc} small>{tb.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>
          <PersonalStats T={T} tt={tt}/>
        </div>
      )}

      {/* ── MINHA EQUIPE ── */}
      {activeTab==="leader"&&(isLeader||isHR)&&(
        <div>
          <ColorLegend T={T}/>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center",padding:"10px 14px",background:T.bgDeep,borderRadius:8,border:`1px solid ${T.border}`}}>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{fontSize:12,color:T.t1,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 9px"}}/>
            <span style={{fontSize:12,color:T.t9}}>até</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{fontSize:12,color:T.t1,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 9px"}}/>
            <Btn small variant="ghost" onClick={()=>{ fetchSummary(); fetchHistory(activeTab); }}>↻ Atualizar</Btn>
          </div>
          {summary&&(
            <>
              {/* KPIs */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:12}}>
                {[
                  {label:"Média do time",   value:secToHuman(summary.globalAvg), color:timeColor(summary.globalAvg,T)},
                  {label:"Total saídas",    value:summary.rows.reduce((a,r)=>a+r.total_absences,0), color:T.accent},
                  {label:"Acima do limite", value:summary.rows.reduce((a,r)=>a+r.over_limit_count,0), color:T.red},
                  {label:"Cumprimento",     value:Math.round((1-summary.rows.reduce((a,r)=>a+r.over_limit_count,0)/Math.max(1,summary.rows.reduce((a,r)=>a+r.total_absences,0)))*100)+"%", color:T.green},
                ].map((s,i)=>(
                  <div key={i} style={{background:T.bgDeep,borderRadius:10,padding:"12px 14px",border:`1px solid ${T.border}`}}>
                    <div style={{fontSize:10,color:T.t9,marginBottom:4}}>{s.label}</div>
                    <div style={{fontSize:20,fontWeight:700,color:s.color}}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Alertas críticos compactos */}
              {summary.rows.filter(r=>r.over_limit_count>=2).map(r=>(
                <div key={r.user_id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",background:T.red+"10",border:`1px solid ${T.red}33`,borderRadius:8,marginBottom:6}}>
                  <AlertTriangle size={13} style={{color:T.red,flexShrink:0}}/>
                  <div style={{fontSize:12,color:T.t2,flex:1}}><strong>{r.full_name}</strong> — {r.over_limit_count}× acima do limite · média {secToHuman(r.avg_sec)}</div>
                  <span style={{fontSize:10,color:T.t8}}>{r.group_name}</span>
                </div>
              ))}

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                {/* Desvio por colaborador */}
                <Card>
                  <div style={{fontSize:12,fontWeight:600,color:T.t1,marginBottom:4}}>Desvio vs média do time</div>
                  <div style={{fontSize:10,color:T.t9,marginBottom:12}}>Média: <strong style={{color:T.t2}}>{secToHuman(summary.globalAvg)}</strong></div>
                  {summary.rows.map(r=>{
                    const isOver=r.deviation>60; const isUnder=r.deviation<-60; const isNeutral=!isOver&&!isUnder;
                    const devColor=timeColor(r.avg_sec,T);
                    const barPct=Math.min(45,Math.abs(r.deviation)/LIMIT_WARN*100);
                    const devLabel=isNeutral?"na média":(isOver?"+":"-")+secToHuman(Math.abs(r.deviation));
                    return (
                      <div key={r.user_id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:`1px solid ${T.borderRow}`}}>
                        <Avatar name={r.full_name} size={22} color={devColor}/>
                        <div style={{minWidth:100,fontSize:11,color:T.t3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.full_name}</div>
                        <div style={{flex:1,height:6,position:"relative",background:T.bgDeep,borderRadius:3,overflow:"hidden"}}>
                          <div style={{position:"absolute",left:"50%",top:0,width:1,height:"100%",background:T.border}}/>
                          {!isNeutral&&<div style={{position:"absolute",height:"100%",[isOver?"left":"right"]:"50%",width:`${barPct}%`,background:devColor,borderRadius:3}}/>}
                        </div>
                        <div style={{minWidth:54,fontSize:10,textAlign:"right",fontWeight:600,color:devColor}}>{devLabel}</div>
                        <div style={{minWidth:44,fontSize:10,color:T.t9,textAlign:"right"}}>{secToHuman(r.avg_sec)}</div>
                        {r.over_limit_count>0&&<Badge color={T.red} small>{r.over_limit_count}×</Badge>}
                      </div>
                    );
                  })}
                </Card>

                {/* Gráfico diário */}
                {daily.length>0&&(
                  <Card>
                    <div style={{fontSize:12,fontWeight:600,color:T.t1,marginBottom:10}}>Média diária do time</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={daily}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
                        <XAxis dataKey="label" tick={{fill:T.t8,fontSize:10}} axisLine={false} tickLine={false}/>
                        <YAxis tickFormatter={v=>`${Math.round(v/60)}m`} tick={{fill:T.t8,fontSize:10}} axisLine={false} tickLine={false}/>
                        <Tooltip contentStyle={tt} formatter={v=>[secToHuman(v),"Média"]}/>
                        <ReferenceLine y={LIMIT_SEC}  stroke={T.amber} strokeDasharray="4 2" label={{value:"15m",fill:T.amber,fontSize:9}}/>
                        <ReferenceLine y={LIMIT_WARN} stroke={T.red}   strokeDasharray="4 2" label={{value:"18m",fill:T.red,fontSize:9}}/>
                        <Bar dataKey="avg_sec" radius={[4,4,0,0]} barSize={18}>
                          {daily.map((d,i)=><Cell key={i} fill={timeColor(d.avg_sec,T)}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}
              </div>

              {/* Registros individuais com edição */}
              <Card style={{padding:0,overflow:"hidden"}}>
                <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.borderSubtle}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:12,fontWeight:600,color:T.t1}}>Registros individuais</span>
                  <span style={{fontSize:11,color:T.t9}}>{history.length} registro{history.length!==1?"s":""}</span>
                </div>
                <div style={{maxHeight:400,overflowY:"auto"}}>
                  {history.map(h=>{
                    const tc = timeColor(h.durationSec, T);
                    const tb = timeBadge(h.durationSec, h.isOpen);
                    const bc = tb.bg==="red"?T.red:tb.bg==="amber"?T.amber:tb.bg==="accent"?T.accent:T.green;
                    return (
                      <div key={h.id}>
                        <div onClick={()=>setExpandedId(expandedId===h.id?null:h.id)}
                          style={{display:"flex",alignItems:"center",gap:10,padding:"9px 16px",borderBottom:editingId===h.id?`1px solid ${T.border}`:`1px solid ${T.borderRow}`,cursor:"pointer",background:expandedId===h.id||editingId===h.id?T.bgDeep:"transparent"}}>
                          <Avatar name={h.fullName} size={26} color={tc}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:11,fontWeight:600,color:T.t2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.fullName}</div>
                            <div style={{fontSize:10,color:T.t9}}>{h.groupName} · {formatDate(h.startedAt)} {formatTime(h.startedAt)}</div>
                          </div>
                          <div style={{fontFamily:"monospace",fontSize:12,fontWeight:700,color:tc}}>{h.isOpen?"ABERTA":secToMMSS(h.durationSec)}</div>
                          <Badge color={bc} small>{tb.label}</Badge>
                          {h.editedBy&&<span style={{fontSize:9,color:T.t9,fontStyle:"italic"}}>editado</span>}
                          <button onClick={e=>{e.stopPropagation();setEditingId(editingId===h.id?null:h.id);setEditForm({
                          endedAt:h.endedAt?(() => {
                            const d=new Date(h.endedAt);
                            const off=d.getTimezoneOffset()*60000;
                            return new Date(d.getTime()-off).toISOString().slice(0,16);
                          })():"",
                          note:"",
                          startedAt:h.startedAt
                        });}}
                            style={{background:"none",border:"none",cursor:"pointer",color:T.t8,padding:4,flexShrink:0}} title="Editar">
                            <Edit2 size={12}/>
                          </button>
                          {expandedId===h.id?<ChevronUp size={12} style={{color:T.t9}}/>:<ChevronDown size={12} style={{color:T.t9}}/>}
                        </div>
                        {editingId===h.id&&(
                          <div style={{padding:"12px 16px",background:T.bgDeep,borderBottom:`1px solid ${T.border}`}}>
                            <div style={{fontSize:11,fontWeight:600,color:T.t8,marginBottom:8}}>CORRIGIR RETORNO — {h.fullName}</div>
                            <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
                              <div>
                                <div style={{fontSize:10,color:T.t9,marginBottom:3}}>Saída: <strong style={{color:T.t2}}>{formatTime(h.startedAt)}</strong> · {formatDate(h.startedAt)}</div>
                                <div style={{fontSize:10,color:T.amber,marginBottom:4}}>Retorno deve ser após {formatTime(h.startedAt)}:</div>
                                <input type="datetime-local" value={editForm.endedAt}
                                  onChange={e=>setEditForm(f=>({...f,endedAt:e.target.value}))}
                                  style={{fontSize:12,color:T.t1,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 10px"}}/>
                              </div>
                              <div style={{flex:1,minWidth:160}}>
                                <div style={{fontSize:10,color:T.t9,marginBottom:4}}>Observação (opcional):</div>
                                <input type="text" value={editForm.note} onChange={e=>setEditForm(f=>({...f,note:e.target.value}))}
                                  placeholder="Ex: esqueceu de marcar retorno"
                                  style={{width:"100%",fontSize:12,color:T.t1,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 10px",fontFamily:"'Sora',sans-serif"}}/>
                              </div>
                              <div style={{display:"flex",gap:6}}>
                                <button onClick={()=>handleEdit(h.id)} disabled={!editForm.endedAt||editLoading}
                                  style={{display:"flex",alignItems:"center",gap:4,padding:"7px 14px",background:T.green,border:"none",borderRadius:7,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                                  <Check size={12}/> {editLoading?"Salvando...":"Salvar"}
                                </button>
                                <button onClick={()=>setEditingId(null)}
                                  style={{display:"flex",alignItems:"center",gap:4,padding:"7px 10px",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:7,color:T.t6,fontSize:12,cursor:"pointer"}}>
                                  <X size={12}/> Cancelar
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {history.length===0&&<div style={{padding:20,textAlign:"center",fontSize:13,color:T.t9}}>Nenhum registro no período</div>}
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ── VISÃO GERAL (admin) ── */}
      {activeTab==="admin"&&isHR&&(
        <div>
          <ColorLegend T={T}/>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center",padding:"10px 14px",background:T.bgDeep,borderRadius:8,border:`1px solid ${T.border}`}}>
            <Select value={filterGroup} onChange={e=>setFilterGroup(e.target.value)}
              options={[{value:"",label:"Todos os grupos"},...groups.map(g=>({value:g.id,label:g.name}))]} style={{width:200}}/>
            <Select value={filterUser} onChange={e=>setFilterUser(e.target.value)}
              options={[{value:"",label:"Todos os funcionários"},...users.map(u=>({value:u.id,label:u.fullName}))]} style={{width:200}}/>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{fontSize:12,color:T.t1,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 9px"}}/>
            <span style={{fontSize:12,color:T.t9}}>até</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{fontSize:12,color:T.t1,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 9px"}}/>
            <Btn small variant="ghost" onClick={()=>{ fetchSummary(); fetchHistory(activeTab); }}>↻ Atualizar</Btn>
          </div>
          {summary&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:12}}>
                {[
                  {label:"Funcionários analisados", value:summary.rows.length, color:T.accent},
                  {label:"Média geral", value:secToHuman(summary.globalAvg), color:timeColor(summary.globalAvg,T)},
                  {label:"Total acima do limite", value:summary.rows.reduce((a,r)=>a+r.over_limit_count,0), color:T.red},
                  {label:"% cumprimento", value:Math.round((1-summary.rows.reduce((a,r)=>a+r.over_limit_count,0)/Math.max(1,summary.rows.reduce((a,r)=>a+r.total_absences,0)))*100)+"%", color:T.green},
                ].map((s,i)=>(
                  <div key={i} style={{background:T.bgDeep,borderRadius:10,padding:"12px 14px",border:`1px solid ${T.border}`}}>
                    <div style={{fontSize:10,color:T.t9,marginBottom:4}}>{s.label}</div>
                    <div style={{fontSize:20,fontWeight:700,color:s.color}}>{s.value}</div>
                  </div>
                ))}
              </div>

              {summary.rows.filter(r=>r.over_limit_count>=3).map(r=>(
                <div key={r.user_id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",background:T.red+"10",border:`1px solid ${T.red}33`,borderRadius:8,marginBottom:6}}>
                  <AlertTriangle size={13} style={{color:T.red,flexShrink:0}}/>
                  <div style={{fontSize:12,color:T.t2,flex:1}}><strong>{r.full_name}</strong> ultrapassou <strong>{r.over_limit_count}×</strong> — média {secToHuman(r.avg_sec)}</div>
                  <span style={{fontSize:11,color:T.t8}}>{r.group_name}</span>
                </div>
              ))}

              {daily.length>0&&(
                <Card style={{marginBottom:14}}>
                  <div style={{fontSize:12,fontWeight:600,color:T.t1,marginBottom:10}}>Média diária geral</div>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={daily}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
                      <XAxis dataKey="label" tick={{fill:T.t8,fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tickFormatter={v=>`${Math.round(v/60)}m`} tick={{fill:T.t8,fontSize:10}} axisLine={false} tickLine={false}/>
                      <Tooltip contentStyle={tt} formatter={v=>[secToHuman(v),"Média"]}/>
                      <ReferenceLine y={LIMIT_SEC}  stroke={T.amber} strokeDasharray="4 2" label={{value:"15m",fill:T.amber,fontSize:9}}/>
                      <ReferenceLine y={LIMIT_WARN} stroke={T.red}   strokeDasharray="4 2" label={{value:"18m",fill:T.red,fontSize:9}}/>
                      <Bar dataKey="avg_sec" radius={[4,4,0,0]} barSize={16}>
                        {daily.map((d,i)=><Cell key={i} fill={timeColor(d.avg_sec,T)}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                <Card>
                  <div style={{fontSize:12,fontWeight:600,color:T.t1,marginBottom:10}}>Ranking por funcionário</div>
                  {summary.rows.slice(0,8).map((r,i)=>{
                    const max=summary.rows[0]?.avg_sec||1;
                    const pct=Math.round(r.avg_sec/max*100);
                    const tc=timeColor(r.avg_sec,T);
                    return (
                      <div key={r.user_id} style={{marginBottom:10}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:10,color:T.t9,minWidth:14}}>{i+1}</span>
                            <Avatar name={r.full_name} size={20} color={tc}/>
                            <span style={{fontSize:11,color:T.t3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:100}}>{r.full_name}</span>
                          </div>
                          <span style={{fontSize:11,fontWeight:700,color:tc}}>{secToHuman(r.avg_sec)}</span>
                        </div>
                        <div style={{height:4,borderRadius:2,background:T.bgDeep,overflow:"hidden"}}>
                          <div style={{width:`${pct}%`,height:"100%",background:tc,borderRadius:2}}/>
                        </div>
                      </div>
                    );
                  })}
                </Card>
                <Card style={{padding:0,overflow:"hidden"}}>
                  <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.borderSubtle}`,fontSize:12,fontWeight:600,color:T.t1}}>Registros recentes</div>
                  <div style={{maxHeight:300,overflowY:"auto"}}>
                    {history.slice(0,20).map(h=>{
                      const tc=timeColor(h.durationSec,T);
                      return (
                        <div key={h.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderBottom:`1px solid ${T.borderRow}`}}>
                          <Avatar name={h.fullName} size={22} color={tc}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:11,fontWeight:600,color:T.t2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.fullName}</div>
                            <div style={{fontSize:10,color:T.t9}}>{formatDate(h.startedAt)} {formatTime(h.startedAt)}</div>
                          </div>
                          <div style={{fontFamily:"monospace",fontSize:11,fontWeight:700,color:tc}}>
                            {h.isOpen?"—":secToMMSS(h.durationSec)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
