import React, { useEffect, useState } from "react";
import { Users, Calendar, ArrowLeftRight, Layers, CheckCircle, Clock, TrendingDown, TrendingUp, Minus, Cake, Umbrella, Sun, Edit2 } from "lucide-react";
import { Card, Badge, Avatar } from "../components/UI";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";

function getNextSaturday() {
  const d = new Date(); d.setHours(0,0,0,0);
  const diff = d.getDay()===6?0:6-d.getDay();
  d.setDate(d.getDate()+diff); return d;
}
function daysUntil(date) {
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((date-today)/(1000*60*60*24));
}
function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function secToHuman(s) {
  if (!s) return "0m";
  const m=Math.floor(s/60); return m<60?`${m}m`:`${Math.floor(m/60)}h${m%60>0?m%60+"m":""}`;
}
function greeting() {
  const h = new Date().getHours();
  if (h<12) return "Bom dia";
  if (h<18) return "Boa tarde";
  return "Boa noite";
}

function HolidayBar({ holidays, T }) {
  const today = toISODate(new Date());
  const in30  = toISODate(new Date(Date.now()+30*86400000));
  const upcoming = holidays.filter(h=>h.date>=today&&h.date<=in30&&h.type!=="FACULTATIVO").slice(0,4);
  if (!upcoming.length) return null;
  const typeColor = (t) => t==="MUNICIPAL"?"#3B6D11":t==="ESTADUAL"?"#534AB7":"#BA7517";
  return (
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
      {upcoming.map(h=>{
        const days = daysUntil(new Date(h.date+"T12:00:00"));
        const col = typeColor(h.type);
        return (
          <div key={h.id} style={{display:"flex",alignItems:"center",gap:7,padding:"6px 12px",background:col+"12",border:`0.5px solid ${col}33`,borderRadius:10}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:col,flexShrink:0}}/>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:col}}>{h.name}</div>
              <div style={{fontSize:10,color:col,opacity:0.8}}>
                {new Date(h.date+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"numeric",month:"short"})}
                {" · "}{days===0?"hoje":days===1?"amanhã":`em ${days} dias`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SaturdayBanner({ user, schedule, groups, T }) {
  const nextSat  = getNextSaturday();
  const satKey   = nextSat.toDateString();
  const satData  = schedule[satKey];
  const days     = daysUntil(nextSat);
  const isToday  = days===0;
  const isTomorrow = days===1;

  let myStatus=null, myGroup=null;
  if (satData) {
    for (const g of groups) {
      const gd=satData[g.id];
      if (gd?.working?.includes(user.id)) { myStatus="working"; myGroup=g.name; break; }
      if (gd?.off?.includes(user.id))     { myStatus="off";     myGroup=g.name; break; }
    }
  }

  if (!satData||myStatus===null) return (
    <div style={{borderRadius:12,padding:"14px 18px",marginBottom:16,background:T.bgDeep,border:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:14}}>
      <Calendar size={18} style={{color:T.t5,flexShrink:0}}/>
      <div style={{fontSize:13,color:T.t5}}>
        Sem escala para {nextSat.toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}
      </div>
    </div>
  );

  const isWorking = myStatus==="working";
  const color = isWorking?T.green:T.amber;
  const urgency = isToday?"hoje":isTomorrow?"amanhã":days===2?"depois de amanhã":`em ${days} dias`;

  return (
    <div style={{borderRadius:12,padding:"14px 18px",marginBottom:16,background:color+"10",border:`1px solid ${color}33`,display:"flex",alignItems:"center",gap:14}}>
      <div style={{width:40,height:40,borderRadius:10,background:color+"20",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        {isWorking?<Clock size={18} style={{color}}/>:<CheckCircle size={18} style={{color}}/>}
      </div>
      <div style={{flex:1}}>
        <div style={{fontSize:14,fontWeight:600,color,marginBottom:2}}>
          {isWorking?"Você trabalha":"Você folga"} {urgency}
          {(isToday||isTomorrow)&&<span style={{marginLeft:8,fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:color+"22",color,border:`1px solid ${color}44`}}>{isToday?"HOJE":"AMANHÃ"}</span>}
        </div>
        <div style={{fontSize:12,color:T.t5}}>
          {nextSat.toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}
          {myGroup&&<span style={{marginLeft:8,padding:"1px 8px",borderRadius:20,background:T.bgDeep,border:`1px solid ${T.border}`,fontSize:11,color:T.t7}}>{myGroup}</span>}
        </div>
      </div>
      {!isToday&&(
        <div style={{textAlign:"center",padding:"6px 14px",background:color+"18",borderRadius:8,border:`1px solid ${color}33`}}>
          <div style={{fontSize:26,fontWeight:700,color,lineHeight:1}}>{days}</div>
          <div style={{fontSize:9,color:T.t5,marginTop:2,letterSpacing:"0.06em"}}>{days===1?"DIA":"DIAS"}</div>
        </div>
      )}
    </div>
  );
}

function MyAbsenceCard({ T }) {
  const [stats, setStats] = useState(null);
  useEffect(()=>{
    const d=new Date(); const from=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;
    const to=toISODate(d);
    api.get(`/absences/me/stats?dateFrom=${from}&dateTo=${to}`).then(r=>setStats(r.data)).catch(()=>{});
  },[]);

  if (!stats) return null;
  const {summary} = stats;
  const pct = summary.totalAbsences>0?Math.round((1-summary.overLimitCount/summary.totalAbsences)*100):100;
  const trend = summary.trend;
  const trendIcon = trend==="alta"?<TrendingUp size={12} style={{color:T.red}}/>:trend==="queda"?<TrendingDown size={12} style={{color:T.green}}/>:<Minus size={12} style={{color:T.t5}}/>;

  return (
    <Card style={{marginBottom:12}}>
      <div style={{fontSize:12,fontWeight:600,color:T.t1,marginBottom:10}}>Minhas ausências — este mês</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:8}}>
        {[
          {label:"saídas",value:summary.totalAbsences,color:T.accent},
          {label:"tempo total",value:secToHuman(summary.totalSec),color:summary.avgSec>900?T.amber:T.t2},
          {label:"acima 15 min",value:summary.overLimitCount,color:summary.overLimitCount>0?T.red:T.green},
        ].map((k,i)=>(
          <div key={i} style={{background:T.bgDeep,borderRadius:8,padding:"10px 12px",border:`1px solid ${T.border}`}}>
            <div style={{fontSize:10,color:T.t5,marginBottom:3}}>{k.label}</div>
            <div style={{fontSize:18,fontWeight:600,color:k.color}}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{fontSize:10,color:T.t5,marginBottom:4,display:"flex",justifyContent:"space-between"}}>
        <span>Cumprimento do limite</span>
        <span style={{display:"flex",alignItems:"center",gap:4}}>{trendIcon} {pct}%</span>
      </div>
      <div style={{height:5,borderRadius:3,background:T.bgDeep,overflow:"hidden"}}>
        <div style={{width:`${pct}%`,height:"100%",background:pct>=80?T.green:pct>=60?T.amber:T.red,borderRadius:3,transition:"width 0.5s"}}/>
      </div>
    </Card>
  );
}

function InsightsCard({ T }) {
  const [stats, setStats] = useState(null);
  useEffect(()=>{
    const d=new Date(); const from=toISODate(new Date(d.getTime()-30*86400000)); const to=toISODate(d);
    api.get(`/absences/me/stats?dateFrom=${from}&dateTo=${to}`).then(r=>setStats(r.data)).catch(()=>{});
  },[]);

  if (!stats||!stats.summary.totalAbsences) return null;
  const {summary,byDow,comparison} = stats;
  const insights=[];
  const DAYS={1:"Segundas",2:"Terças",3:"Quartas",4:"Quintas",5:"Sextas"};
  const workDays=byDow.filter(d=>d.dow>=1&&d.dow<=5);
  if (workDays.length) {
    const busy=workDays.reduce((a,b)=>b.count>a.count?b:a,workDays[0]);
    if (busy.count>0) insights.push({color:T.t5,bg:T.bgDeep,text:`Você sai mais às ${DAYS[busy.dow]||busy.label} (${busy.count}x no período)`});
  }
  if (summary.overLimitCount>0) {
    const pct=Math.round(summary.overLimitCount/summary.totalAbsences*100);
    insights.push({color:T.red,bg:T.red+"10",text:`${pct}% das saídas passaram de 15 min (${summary.overLimitCount}x)`});
  }
  if (summary.trend==="alta") insights.push({color:T.amber,bg:T.amber+"10",text:"Tendência de alta nas ausências — fique atento"});
  else if (summary.trend==="queda") insights.push({color:T.green,bg:T.green+"10",text:"Tendência positiva — ausências diminuindo"});
  if (comparison?.vsTeam>120) insights.push({color:T.amber,bg:T.amber+"10",text:`Sua média está acima da equipe em ${secToHuman(comparison.vsTeam)}`});
  else if (comparison?.vsTeam<-60) insights.push({color:T.green,bg:T.green+"10",text:`Você está abaixo da média da equipe — ótimo!`});

  if (!insights.length) return null;
  return (
    <Card style={{marginBottom:12}}>
      <div style={{fontSize:12,fontWeight:600,color:T.t1,marginBottom:10}}>Insights</div>
      {insights.slice(0,3).map((ins,i)=>(
        <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 10px",background:ins.bg,border:`0.5px solid ${ins.color}22`,borderRadius:8,marginBottom:6}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:ins.color,flexShrink:0,marginTop:4}}/>
          <span style={{fontSize:11,color:T.t2,lineHeight:1.5}}>{ins.text}</span>
        </div>
      ))}
    </Card>
  );
}

function TeamSaturdayCard({ user, schedule, groups, users, T }) {
  const nextSat = getNextSaturday();
  const satKey  = nextSat.toDateString();
  const satData = schedule[satKey];
  const myGroups = user.role==="leader"?groups.filter(g=>g.leaderId===user.id):groups;

  const rows = [];
  for (const g of myGroups) {
    const gd = satData?.[g.id];
    if (!gd) continue;
    const offCount = (gd.off||[]).length;
    rows.push({g, workCount:gd.working?.length||0, offCount});
  }
  if (!rows.length) return null;

  return (
    <Card style={{marginBottom:12}}>
      <div style={{fontSize:12,fontWeight:600,color:T.t1,marginBottom:10,display:"flex",justifyContent:"space-between"}}>
        <span>Equipe — {nextSat.toLocaleDateString("pt-BR",{weekday:"short",day:"numeric",month:"short"})}</span>
        <span style={{fontSize:11,color:T.t5,fontWeight:400}}>próx. sábado</span>
      </div>
      {rows.map(({g,workCount,offCount},i)=>(
        <div key={g.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:i<rows.length-1?`1px solid ${T.borderRow}`:"none"}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:g.color,flexShrink:0}}/>
          <div style={{flex:1,fontSize:11,color:T.t3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.name}</div>
          <span style={{fontSize:11,color:T.green,fontWeight:600}}>{workCount} trabalham</span>
          <span style={{fontSize:11,color:T.t5}}>{offCount} folga</span>
        </div>
      ))}
    </Card>
  );
}

function TeamTodayCard({ T }) {
  const [data, setData] = useState(null);
  useEffect(()=>{
    const today=toISODate(new Date());
    api.get(`/absences/summary?dateFrom=${today}&dateTo=${today}`).then(r=>setData(r.data)).catch(()=>{});
  },[]);

  if (!data) return null;
  const absent = data.rows?.filter(r=>r.is_open)||[];
  const overToday = data.rows?.reduce((a,r)=>a+r.over_limit_count,0)||0;
  const avgSec = data.globalAvg||0;
  const color = avgSec>1080?T.red:avgSec>900?T.amber:T.green;

  return (
    <Card style={{marginBottom:12}}>
      <div style={{fontSize:12,fontWeight:600,color:T.t1,marginBottom:10}}>Equipe hoje</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
        {[
          {label:"ausentes agora",value:absent.length,color:absent.length>0?T.red:T.green},
          {label:"média ausência",value:secToHuman(avgSec),color},
          {label:"acima do limite",value:overToday,color:overToday>0?T.red:T.green},
        ].map((k,i)=>(
          <div key={i} style={{background:T.bgDeep,borderRadius:8,padding:"10px 12px",border:`1px solid ${T.border}`}}>
            <div style={{fontSize:10,color:T.t5,marginBottom:3}}>{k.label}</div>
            <div style={{fontSize:18,fontWeight:600,color:k.color}}>{k.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Aniversários do mês — visível para todos
function MonthBirthdaysCard({ T }) {
  const [birthdays, setBirthdays] = useState([]);
  useEffect(()=>{
    api.get("/users/birthdays").then(r=>setBirthdays(r.data||[])).catch(()=>{});
  },[]);

  const currentMonth = new Date().getMonth() + 1;
  const thisMonth = birthdays.filter(b => b.month === currentMonth);
  const todayBirthdays = birthdays.filter(b => b.isToday);

  if (thisMonth.length === 0) return null;

  return (
    <Card style={{marginBottom:12}}>
      <div style={{fontSize:12,fontWeight:600,color:T.t1,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{display:"flex",alignItems:"center",gap:6}}>
          <Cake size={13} color="#EC4899"/>
          Aniversários do mês
        </span>
        <span style={{fontSize:11,color:"#EC4899",fontWeight:500}}>{thisMonth.length} pessoa{thisMonth.length>1?"s":""}</span>
      </div>

      {todayBirthdays.length > 0 && (
        <div style={{marginBottom:10,padding:"8px 10px",background:"linear-gradient(135deg,#EC489920,#F4729610)",border:"1px solid #EC489940",borderRadius:8,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>🎂</span>
          <div style={{flex:1,fontSize:11,fontWeight:700,color:"#EC4899"}}>
            Hoje: {todayBirthdays.map(b=>b.fullName.split(" ")[0]).join(", ")}!
          </div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:200,overflowY:"auto"}}>
        {[...thisMonth].sort((a,b)=>a.day-b.day).map(b=>{
          const isT = b.isToday;
          const [mm,dd] = b.mmdd.split("-");
          return (
            <div key={b.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:7,background:isT?"#EC489915":T.bgDeep,border:`1px solid ${isT?"#EC489940":T.border}`}}>
              <div style={{fontSize:11,fontWeight:700,color:isT?"#EC4899":T.t8,width:32,flexShrink:0,textAlign:"center"}}>{dd}/{mm}</div>
              <Avatar name={b.fullName} size={22} color={isT?"#EC4899":T.accent}/>
              <span style={{fontSize:11,color:isT?"#EC4899":T.t3,fontWeight:isT?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{b.fullName}</span>
              {isT&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:10,background:"#EC489920",color:"#EC4899",fontWeight:700,flexShrink:0}}>HOJE</span>}
              {!isT&&b.daysUntil<=7&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:10,background:T.amber+"20",color:T.amber,fontWeight:600,flexShrink:0}}>{b.daysUntil}d</span>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}


// Beach countdown messages by days remaining
const beachMsgs = [
  (d) => `Só mais ${d} dias... a praia já sente sua falta! 🐚`,
  (d) => `Faltam ${d} dias! ☀️ Já foi à farmácia buscar o protetor solar?`,
  (d) => `${d} dias para a praia! 🌊 Vai ser incrível!`,
  (d) => `Só ${d} dias... 🏖️ Já escolheu o destino?`,
  (d) => `${d} diazinhos e você estará de férias! 🌴 Aguenta firme!`,
  (d) => `${d} dias contando... Dá pra sentir o cheiro do mar! 🌊`,
];
function beachMsg(days, name) {
  const idx = (days + name.charCodeAt(0)) % beachMsgs.length;
  return beachMsgs[idx](days);
}

function MyVacationCard({ user, T }) {
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    api.get(`/vacations/summary/${user.id}`).then(r => setSummary(r.data)).catch(() => {});
  }, [user.id]);

  if (!summary) return null;

  const next = summary.nextVacation;
  const du = next ? Math.ceil((new Date(next.start_date + "T12:00:00") - new Date()) / 86400000) : null;
  const isOnVac = next && du !== null && du <= 0 && new Date(next.end_date + "T12:00:00") >= new Date();
  const firstName = user.fullName?.split(" ")[0] || "você";

  if (isOnVac) {
    return (
      <Card style={{ marginBottom: 12, background: "linear-gradient(135deg,#FBBF2415,#F59E0B08)", border: "1px solid #FBBF2440" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 24 }}>🏖️</span>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#FBBF24" }}>{firstName}, você está de férias!</div>
        </div>
        <div style={{ fontSize: 12, color: T.t7 }}>
          Até {new Date(next.end_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })} —{" "}
          <span style={{ color: "#FBBF24", fontWeight: 600 }}>aproveite muito! 🌴</span>
        </div>
      </Card>
    );
  }

  if (next && du !== null && du > 0) {
    const urgencyColor = du <= 7 ? "#34D399" : du <= 30 ? "#60A5FA" : T.accent;
    return (
      <Card style={{ marginBottom: 12, background: `linear-gradient(135deg,${urgencyColor}0A,${urgencyColor}05)`, border: `1px solid ${urgencyColor}30` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ textAlign: "center", padding: "8px 14px", background: urgencyColor + "18", borderRadius: 10, flexShrink: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: urgencyColor, lineHeight: 1 }}>{du}</div>
            <div style={{ fontSize: 9, color: T.t5, marginTop: 2, letterSpacing: "0.06em" }}>{du === 1 ? "DIA" : "DIAS"}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: urgencyColor, marginBottom: 4 }}>
              {beachMsg(du, firstName)}
            </div>
            <div style={{ fontSize: 11, color: T.t7 }}>
              {new Date(next.start_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
              {" → "}
              {new Date(next.end_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
              {" · "}<span style={{ fontWeight: 700, color: urgencyColor }}>{next.days} dias</span>
            </div>
            {next.status === "scheduled" && (
              <div style={{ marginTop: 5, fontSize: 10, color: "#FBBF24", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                <Clock size={10} /> Aguardando aprovação do RH
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  }

  // No vacation scheduled
  return (
    <Card style={{ marginBottom: 12, background: T.bgDeep, border: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Umbrella size={20} style={{ color: T.t5, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.t2, marginBottom: 2 }}>Nenhuma férias agendada</div>
          <div style={{ fontSize: 11, color: T.t7 }}>
            Saldo: <span style={{ fontWeight: 700, color: summary.daysRemaining > 0 ? T.accent : "#F87171" }}>{summary.daysRemaining} dias</span>
            {summary.daysRemaining > 0 && " disponíveis — fale com seu líder! 🏖️"}
          </div>
        </div>
      </div>
    </Card>
  );
}

function VacationDashWidget({ T, onNavigate }) {
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [expandedOnVacation, setExpandedOnVacation] = useState(false);
  useEffect(() => {
    api.get("/vacations/dashboard-summary").then(r => setData(r.data)).catch(() => {});
  }, []);

  if (!data) return null;

  const { pendingApprovals, onVacationNow, onVacationList = [], approaching30, pendingList } = data;
  const hasPending = pendingApprovals > 0;

  return (
    <Card style={{ marginBottom: 12, border: hasPending ? "1px solid #FBBF2440" : `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.t1, display: "flex", alignItems: "center", gap: 7 }}>
          <Umbrella size={13} color="#FBBF24" /> Férias da Equipe
        </span>
        {hasPending && (
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#FBBF2418", color: "#FBBF24", fontWeight: 700 }}>
            {pendingApprovals} pendente{pendingApprovals > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: hasPending && expanded ? 12 : 0 }}>
        {[
          { label: "em férias agora", value: onVacationNow, color: "#FBBF24", onClick: onVacationNow > 0 ? () => setExpandedOnVacation(e => !e) : undefined },
          { label: "próximas 30 dias", value: approaching30, color: "#60A5FA" },
          { label: "aguard. aprovação", value: pendingApprovals, color: hasPending ? "#F59E0B" : T.green, onClick: pendingApprovals > 0 ? () => setExpanded(e => !e) : undefined },
        ].map((k, i) => (
          <div key={i} style={{ background: T.bgDeep, borderRadius: 8, padding: "10px 12px", border: `1px solid ${T.border}`, cursor: k.onClick ? "pointer" : "default" }}
            onClick={k.onClick}>
            <div style={{ fontSize: 10, color: T.t5, marginBottom: 3 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.value > 0 ? k.color : T.t9 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {expandedOnVacation && onVacationList.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {onVacationList.map(v => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "#FBBF2408", border: "1px solid #FBBF2420", borderRadius: 8, marginBottom: 6 }}>
              <Avatar name={v.fullName} size={28} color={v.groupColor || "#FBBF24"} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.fullName}</div>
                <div style={{ fontSize: 10, color: T.t5 }}>
                  {v.groupName && <span style={{ marginRight: 4, color: T.t5 }}>{v.groupName} · </span>}
                  {new Date(v.startDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  {" → "}
                  {new Date(v.endDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  {" · "}{v.days}d
                </div>
              </div>
              <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: "#FBBF2418", color: "#FBBF24", fontWeight: 600, flexShrink: 0 }}>🏖️ FÉRIAS</span>
            </div>
          ))}
        </div>
      )}

      {hasPending && expanded && (
        <div style={{ marginTop: 8 }}>
          {pendingList.map(v => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "#FBBF2408", border: "1px solid #FBBF2420", borderRadius: 8, marginBottom: 6 }}>
              <Avatar name={v.fullName} size={28} color={v.groupColor || "#FBBF24"} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.fullName}</div>
                <div style={{ fontSize: 10, color: T.t5 }}>
                  {new Date(v.startDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  {" → "}
                  {new Date(v.endDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  {" · "}{v.days}d
                </div>
              </div>
              <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: "#FBBF2418", color: "#FBBF24", fontWeight: 600, flexShrink: 0 }}>PENDENTE</span>
            </div>
          ))}
          {onNavigate && (
            <button onClick={onNavigate}
              style={{ width: "100%", marginTop: 4, padding: "7px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 7, color: T.t7, fontSize: 11, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}>
              Ver todas as aprovações →
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { theme: T } = useTheme();
  const [overview,  setOverview]  = useState(null);
  const [swaps,     setSwaps]     = useState([]);
  const [schedule,  setSchedule]  = useState({});
  const [groups,    setGroups]    = useState([]);
  const [users,     setUsers]     = useState([]);
  const [holidays,  setHolidays]  = useState([]);

  const isHR     = user.role==="hr"||user.role==="ti";
  const isLeader = user.role==="leader"||user.role==="gerencia";

  useEffect(()=>{
    const now=new Date(); const next=new Date(now.getFullYear(),now.getMonth()+1,1);
    const year=now.getFullYear();
    Promise.all([
      (isHR||isLeader)?api.get("/reports/overview"):Promise.resolve({data:null}),
      (isHR||isLeader)?api.get("/swaps"):Promise.resolve({data:[]}),
      api.get(`/schedule?year=${now.getFullYear()}&month=${now.getMonth()}`),
      api.get(`/schedule?year=${next.getFullYear()}&month=${next.getMonth()}`),
      api.get("/groups"),
      (isHR||isLeader)?api.get("/users"):Promise.resolve({data:[]}),
      api.get(`/holidays?year=${year}`),
    ]).then(([ov,sw,sc1,sc2,gr,us,hol])=>{
      setOverview(ov.data);
      setSwaps(sw.data||[]);
      const merged={...(sc1.data||{})};
      for (const [k,v] of Object.entries(sc2.data||{})) merged[k]={...(merged[k]||{}),...v};
      setSchedule(merged);
      setGroups(gr.data||[]);
      setUsers(us.data||[]);
      setHolidays(hol.data||[]);
    }).catch(console.error);
  },[user.role]);

  const now=new Date();
  const pendingSwaps=swaps.filter(s=>s.status==="pending");
  const getUserName=id=>users.find(u=>u.id===id)?.fullName||id?.slice(0,8)+"...";

  const stats=overview?[
    {label:"Funcionários",  value:overview.stats.totalUsers,        icon:<Users size={16}/>,         color:T.accent},
    {label:"Grupos ativos", value:overview.stats.totalGroups,       icon:<Layers size={16}/>,        color:T.purple},
    {label:"Trocas pend.",  value:overview.stats.pendingSwaps,      icon:<ArrowLeftRight size={16}/>,color:pendingSwaps.length>0?T.amber:T.green},
    {label:"Sáb. escalados",value:overview.stats.totalSatScheduled, icon:<Calendar size={16}/>,      color:T.accent},
  ]:[];

  const startOfYear=new Date(now.getFullYear(),0,1);
  const weekNum=Math.ceil(((now-startOfYear)/86400000+startOfYear.getDay()+1)/7);

  return (
    <div style={{padding:28,overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700,color:T.t1,marginBottom:3}}>
            {greeting()}, {user?.fullName?.split(" ")[0]} 👋
          </h1>
          <p style={{color:T.t5,fontSize:12}}>
            {now.toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})} · Semana {weekNum}
          </p>
        </div>
      </div>

      <HolidayBar holidays={holidays} T={T}/>
      <SaturdayBanner user={user} schedule={schedule} groups={groups} T={T}/>

      {stats.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
          {stats.map((s,i)=>(
            <div key={i} style={{background:T.bgDeep,borderRadius:10,padding:"12px 14px",border:`1px solid ${T.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                <div style={{color:s.color}}>{s.icon}</div>
                <div style={{fontSize:10,color:T.t5}}>{s.label}</div>
              </div>
              <div style={{fontSize:22,fontWeight:600,color:s.color}}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        {/* Col esquerda */}
        <div>
          <MyVacationCard user={user} T={T}/>
          <MyAbsenceCard T={T}/>
          {(isHR||isLeader)&&<InsightsCard T={T}/>}
          {(isHR||isLeader)&&<TeamTodayCard T={T}/>}
          {(isHR||isLeader)&&<VacationDashWidget T={T}/>}

          {/* Trocas pendentes — abaixo de Equipe hoje */}
          {(isHR||isLeader)&&(
            <Card style={{marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:600,color:T.t1,marginBottom:10,display:"flex",justifyContent:"space-between"}}>
                <span>Trocas pendentes</span>
                {pendingSwaps.length>0&&<span style={{fontSize:11,fontWeight:600,color:T.amber}}>{pendingSwaps.length} pendente{pendingSwaps.length>1?"s":""}</span>}
              </div>
              {pendingSwaps.length===0?(
                <div style={{textAlign:"center",padding:16,color:T.t5}}>
                  <CheckCircle size={24} style={{marginBottom:6,opacity:0.35,color:T.green}}/>
                  <div style={{fontSize:12}}>Nenhuma troca pendente</div>
                </div>
              ):pendingSwaps.slice(0,3).map(sw=>(
                <div key={sw.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,padding:"8px 10px",background:T.bgDeep,borderRadius:8,border:`1px solid ${T.border}`}}>
                  <Avatar name={getUserName(sw.requesterId)} size={26} color={T.amber}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:600,color:T.t2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{getUserName(sw.requesterId)} → {getUserName(sw.covererId)}</div>
                    <div style={{fontSize:10,color:T.t5}}>{new Date(sw.date+"T12:00:00").toLocaleDateString("pt-BR",{day:"numeric",month:"short"})}</div>
                  </div>
                  <span style={{fontSize:9,padding:"2px 7px",borderRadius:20,background:T.amber+"18",color:T.amber,fontWeight:600}}>PENDENTE</span>
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* Col direita */}
        <div>
          {(isHR||isLeader)&&<TeamSaturdayCard user={user} schedule={schedule} groups={groups} users={users} T={T}/>}
          {/* Aniversários do mês — visível para todos */}
          <MonthBirthdaysCard T={T}/>
        </div>
      </div>
    </div>
  );
}
