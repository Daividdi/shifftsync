import React, { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Fingerprint, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";

export default function PontoEsquecidoAlert({ onNavigate }) {
  const { user } = useAuth();
  const { theme: T } = useTheme();
  const [esquecidos, setEsquecidos] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const dismissKey = `ponto_alerta_dismissed_${today}`;

  const fetch = useCallback(async () => {
    if (localStorage.getItem(dismissKey)) { setDismissed(true); return; }
    try {
      const r = await api.get("/batidas/alerta-esquecidos");
      setEsquecidos(r.data || []);
    } catch {}
  }, [dismissKey]);

  useEffect(() => {
    fetch();
    const iv = setInterval(fetch, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [fetch]);

  const dismiss = () => {
    localStorage.setItem(dismissKey, "1");
    setDismissed(true);
  };

  if (dismissed || esquecidos.length === 0) return null;

  const isEmployee = user?.role === "employee";
  const isLeader   = ["leader","gerencia","hr","ti"].includes(user?.role);
  const myEntry    = esquecidos.find(e => e.userId === user?.id);

  const slidein = `@keyframes pe-slide{from{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}`;

  return (
    <>
      <style>{slidein}</style>
      <div style={{
        position:"fixed", top:0, left:0, right:0, zIndex:9998,
        
        background:`linear-gradient(135deg, #D97706EE, #B45309CC)`,
        backdropFilter:"blur(8px)",
        padding:"10px 20px",
        display:"flex", alignItems:"center", gap:12,
        boxShadow:`0 4px 24px #D9770644`,
        animation:"pe-slide 0.4s ease forwards",
        borderBottom:`2px solid #D97706`,
      }}>
        <Fingerprint size={20} color="#fff" style={{ flexShrink: 0 }}/>

        <div style={{ flex: 1 }}>
          {isEmployee && myEntry ? (
            <>
              <div style={{ fontSize:13, fontWeight:800, color:"#fff", letterSpacing:"0.02em" }}>
                POSSÍVEL BATIDA ESQUECIDA — {myEntry.punchCount} registro{myEntry.punchCount !== 1 ? "s" : ""} hoje
              </div>
              <div style={{ fontSize:11, color:"#ffffff99", marginTop:2 }}>
                Número ímpar de batidas — verifique se esqueceu de registrar a saída ou retorno do intervalo
              </div>
            </>
          ) : isLeader && esquecidos.length > 0 ? (
            <div style={{ fontSize:13, fontWeight:800, color:"#fff", letterSpacing:"0.02em" }}>
              {esquecidos.length} COLABORADOR{esquecidos.length > 1 ? "ES" : ""} COM BATIDA ÍMPAR HOJE
              <span style={{ fontSize:11, fontWeight:400, opacity:0.75, marginLeft:10 }}>Clique em "Ver Batidas" para detalhes</span>
            </div>
          ) : null}
        </div>

        {isLeader && onNavigate && (
          <button
            onClick={() => onNavigate("batidas")}
            style={{
              display:"flex", alignItems:"center", gap:4,
              padding:"8px 12px",
              background:"rgba(255,255,255,0.15)",
              border:"1px solid rgba(255,255,255,0.3)",
              borderRadius:8, color:"#fff", fontSize:11,
              cursor:"pointer", flexShrink:0, fontFamily:"'Sora',sans-serif",
            }}>
            Ver Batidas
          </button>
        )}

        <button
          onClick={dismiss}
          style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.7)", padding:4, flexShrink:0 }}
          title="Dispensar por hoje">
          <X size={16}/>
        </button>
      </div>
    </>
  );
}
