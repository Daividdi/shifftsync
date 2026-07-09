import React, { useState, useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../hooks/useAuth";
import { BarChart3, Settings2, TrendingUp } from "lucide-react";

const SCREENS = [
  { id: "live",       label: "Produção ao vivo",     color: "#f59e0b" },
  { id: "prod-geral", label: "Produtividade Geral", color: "#06b6d4" },
  { id: "atd-prod",   label: "Produtividade ATD",   color: "#3b82f6" },
  { id: "atd-qual",   label: "Qualidade ATD",        color: "#8b5cf6" },
  { id: "qual-geral", label: "Qualidade Geral",      color: "#10b981" },
];

const BI_MANAGERS = ["hr", "ti", "gerencia", "leader"];
const EXEC_ROLES  = ["hr", "ti", "gerencia"]; // painel executivo BR × MY — mais restrito que a gestão do BI

export default function BIPage() {
  const { theme: T } = useTheme();
  const { user } = useAuth();

  const [screenIdx, setScreenIdx] = useState(0);
  const [biMode, setBiMode]       = useState("dashboard");
  const iframeRef = useRef(null);

  const role = user?.role || "employee";
  const canManageBI = BI_MANAGERS.includes(role);
  const canSeeExec  = EXEC_ROLES.includes(role);
  const biUrl = `${window.location.origin}/bi/`;

  function sendToBI(msg) {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }

  function selectScreen(i) {
    setScreenIdx(i);
    setBiMode("dashboard");
    sendToBI({ type: "SET_SCREEN", idx: i });
  }

  function openGestao() {
    setBiMode("admin");
    sendToBI({ type: "BI_GOTO_PAGE", page: "admin" });
  }

  function openExecutivo() {
    setBiMode("exec");
    sendToBI({ type: "AUTH_ROLE", role });
    sendToBI({ type: "BI_GOTO_PAGE", page: "exec" });
  }

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === "SCREEN_CHANGED") setScreenIdx(e.data.idx);
      if (e.data?.type === "BI_PAGE_BACK")   setBiMode("dashboard");
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      sendToBI({ type: "SET_SCREEN", idx: screenIdx });
      if (canSeeExec) sendToBI({ type: "AUTH_ROLE", role });
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: T.bgApp, overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "0 12px 0 16px", height: 44,
        borderBottom: `1px solid ${T.borderSubtle}`,
        background: T.bgSidebar, flexShrink: 0,
      }}>
        <BarChart3 size={15} color={T.accent} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: T.t2, flexShrink: 0 }}>ShiftSync BI</span>
        <div style={{ width: 1, height: 16, background: T.borderSubtle, margin: "0 4px", flexShrink: 0 }} />

        <div style={{ display: "flex", gap: 2, flex: 1 }}>
          {biMode === "dashboard" && SCREENS.map((s, i) => (
            <button key={s.id} onClick={() => selectScreen(i)} style={{
              background: i === screenIdx ? s.color + "18" : "transparent",
              border: `1px solid ${i === screenIdx ? s.color + "55" : "transparent"}`,
              borderRadius: 6, padding: "4px 10px",
              color: i === screenIdx ? s.color : T.t5,
              fontSize: 12, cursor: "pointer", fontWeight: i === screenIdx ? 700 : 400,
              transition: "all 0.15s", whiteSpace: "nowrap",
              fontFamily: "inherit",
            }}>
              {s.label}
            </button>
          ))}
        </div>

        {canSeeExec && biMode === "dashboard" && (
          <button
            onClick={openExecutivo}
            style={{
              display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
              background: T.bgApp, border: `1px solid ${T.border}`,
              borderRadius: 6, padding: "4px 11px",
              color: T.t4, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#8b5cf618"; e.currentTarget.style.color = "#8b5cf6"; }}
            onMouseLeave={e => { e.currentTarget.style.background = T.bgApp; e.currentTarget.style.color = T.t4; }}
            title="Painel executivo — comparativo entre centros"
          >
            <TrendingUp size={12} /> Executivo
          </button>
        )}

        {canManageBI && biMode === "dashboard" && (
          <button
            onClick={openGestao}
            style={{
              display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
              background: T.bgApp, border: `1px solid ${T.border}`,
              borderRadius: 6, padding: "4px 11px",
              color: T.t4, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#6366F118"; e.currentTarget.style.color = "#6366F1"; }}
            onMouseLeave={e => { e.currentTarget.style.background = T.bgApp; e.currentTarget.style.color = T.t4; }}
            title="Gestão de metas e upload de dados"
          >
            <Settings2 size={12} /> Gestão
          </button>
        )}
      </div>

      <iframe
        ref={iframeRef}
        src={biUrl}
        style={{ flex: 1, border: "none", width: "100%", display: "block" }}
        title="ShiftSync BI"
        allow="fullscreen"
      />
    </div>
  );
}
