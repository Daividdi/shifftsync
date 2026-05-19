import React, { useState, useEffect, useCallback } from "react";
import { LogIn, X, AlertTriangle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";

const LIMIT_SEC = 900; // 15 min

function secToMMSS(s) {
  const m = Math.floor(Math.abs(s)/60);
  const sec = Math.abs(s)%60;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

export default function AbsenceAlert({ onNavigate }) {
  const { user } = useAuth();
  const { theme: T } = useTheme();
  const [status, setStatus] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [ending, setEnding] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await api.get("/absences/status");
      setStatus(r.data);
      if (!r.data?.isOut) setDismissed(false);
    } catch(e) {}
  }, []);

  // Polling a cada 30s
  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 30000);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  // Timer local
  useEffect(() => {
    if (!status?.isOut || !status?.openAbsence) return;
    const start = new Date(status.openAbsence.started_at).getTime();
    const tick = () => setElapsed(Math.round((Date.now()-start)/1000));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [status?.isOut, status?.openAbsence?.started_at]);

  const handleEnd = async () => {
    setEnding(true);
    try {
      await api.post("/absences/end");
      setStatus(null);
      setDismissed(false);
      setElapsed(0);
    } catch(e) {}
    setEnding(false);
  };

  // Só mostra se estiver ausente e passou do limite
  if (!status?.isOut || elapsed < LIMIT_SEC || dismissed) return null;

  const extra = elapsed - LIMIT_SEC;
  const pulse = `@keyframes abs-pulse{0%,100%{opacity:1}50%{opacity:0.6}}`;
  const slidein = `@keyframes abs-slide{from{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}`;

  return (
    <>
      <style>{pulse}{slidein}</style>
      <div style={{
        position:"fixed", top:0, left:0, right:0, zIndex:9999,
        background:`linear-gradient(135deg, ${T.red}EE, ${T.red}CC)`,
        backdropFilter:"blur(8px)",
        padding:"10px 20px",
        display:"flex", alignItems:"center", gap:12,
        boxShadow:`0 4px 24px ${T.red}44`,
        animation:"abs-slide 0.4s ease forwards",
        borderBottom:`2px solid ${T.red}`,
      }}>
        <div style={{animation:"abs-pulse 1.2s ease-in-out infinite",flexShrink:0}}>
          <AlertTriangle size={20} color="#fff"/>
        </div>

        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:800,color:"#fff",letterSpacing:"0.02em"}}>
            AUSÊNCIA EM ABERTO — {secToMMSS(elapsed)}
            <span style={{fontSize:11,fontWeight:400,marginLeft:8,opacity:0.85}}>
              ({secToMMSS(extra)} além do limite de 15 min)
            </span>
          </div>
          <div style={{fontSize:11,color:"#ffffff99",marginTop:2}}>
            Você saiu às {new Date(status.openAbsence.started_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})} e não registrou o retorno
          </div>
        </div>

        <button
          onClick={handleEnd}
          disabled={ending}
          style={{
            display:"flex", alignItems:"center", gap:6,
            padding:"8px 16px",
            background:"#fff",
            border:"none", borderRadius:8,
            color:T.red, fontSize:12, fontWeight:800,
            cursor:"pointer", flexShrink:0,
            boxShadow:"0 2px 8px #00000033",
          }}>
          <LogIn size={14}/> {ending?"Registrando...":"Registrar Retorno"}
        </button>

        <button
          onClick={()=>{ if(onNavigate) onNavigate("absences"); }}
          style={{
            display:"flex", alignItems:"center", gap:4,
            padding:"8px 12px",
            background:"rgba(255,255,255,0.15)",
            border:"1px solid rgba(255,255,255,0.3)",
            borderRadius:8, color:"#fff", fontSize:11,
            cursor:"pointer", flexShrink:0,
          }}>
          Ver detalhes
        </button>

        <button
          onClick={()=>setDismissed(true)}
          style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.7)",padding:4,flexShrink:0}}
          title="Dispensar por agora">
          <X size={16}/>
        </button>
      </div>
    </>
  );
}
