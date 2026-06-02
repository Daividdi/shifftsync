import React, { useRef, useCallback, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import { ChevronLeft, Clock } from "lucide-react";
import { useGameTimer } from "../context/GameTimerContext";

const EMBED_CSS = [
  'aside,header,footer,',
  'div[class~="fixed"][class~="h-screen"],',
  'nav[aria-label="Breadcrumb"],',
  'section[class~="mb-12"],',
  'section[class~="mb-16"]:not([class~="space-y-6"]),',
  'section[class~="mt-16"],',
  'button[aria-label="Toggle sidebar"],',
  'nextjs-portal,',
  '[data-nextjs-toast],[data-nextjs-dialog],',
  '[data-nextjs-build-indicator],[data-nextjs-toast-wrapper]',
  '{display:none!important}',
  'main{width:100%!important}',
].join("");

function injectIntoIframe(iframe) {
  try {
    var doc = iframe.contentDocument;
    if (!doc || !doc.head) return;
    if (!doc.getElementById("ss-embed-parent")) {
      var style = doc.createElement("style");
      style.id = "ss-embed-parent";
      style.textContent = EMBED_CSS;
      doc.head.appendChild(style);
    }
  } catch (_) {}
}

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return m + ":" + sec;
}

export default function FocusGamePage({ url, title, onBack }) {
  const { theme: T } = useTheme();
  const { remaining, isExpired, startTracking, stopTracking } = useGameTimer();
  const iframeRef = useRef(null);

  useEffect(() => {
    startTracking();
    return () => stopTracking();
  }, []);

  useEffect(() => {
    if (isExpired) onBack();
  }, [isExpired]);

  const handleLoad = useCallback(function() {
    if (iframeRef.current) injectIntoIframe(iframeRef.current);
  }, []);

  const timerColor = remaining <= 60 ? "#ef4444" : remaining <= 300 ? "#f59e0b" : "#22c55e";

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      background: T.bgApp, overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "0 16px", height: 44,
        borderBottom: `1px solid ${T.borderSubtle}`,
        background: T.bgSidebar, flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "transparent", border: "none",
            color: T.t5, cursor: "pointer", padding: "4px 8px",
            borderRadius: 6, fontSize: 12, fontFamily: "inherit",
            transition: "color 0.15s, background 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = T.bgDeep; e.currentTarget.style.color = T.t2; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.t5; }}
        >
          <ChevronLeft size={14} />
          Voltar
        </button>
        <div style={{ width: 1, height: 16, background: T.borderSubtle, margin: "0 4px" }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: T.t2, flex: 1 }}>{title}</span>
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          background: timerColor + "18", border: `1px solid ${timerColor}33`,
          borderRadius: 20, padding: "3px 10px",
        }}>
          <Clock size={11} color={timerColor} />
          <span style={{
            fontSize: 12, fontWeight: 700, color: timerColor,
            fontVariantNumeric: "tabular-nums",
          }}>
            {formatTime(remaining)}
          </span>
        </div>
      </div>
      <iframe
        ref={iframeRef}
        src={url}
        onLoad={handleLoad}
        style={{ flex: 1, border: "none", width: "100%", display: "block" }}
        title={title}
        allow="fullscreen"
      />
    </div>
  );
}
