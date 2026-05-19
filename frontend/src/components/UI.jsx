import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";

export const Badge = ({ color = "#00C2FF", children, small }) => (
  <span style={{
    background: color + "22", color,
    border: `1px solid ${color}44`,
    padding: small ? "1px 7px" : "3px 10px",
    borderRadius: 20, fontSize: small ? 10 : 11,
    fontWeight: 600, letterSpacing: "0.04em", whiteSpace: "nowrap",
  }}>{children}</span>
);

export const Avatar = ({ name, size = 32, color = "#00C2FF" }) => {
  const initials = name
    ? name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "??";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color + "22", border: `2px solid ${color}55`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 700, color, flexShrink: 0,
    }}>{initials}</div>
  );
};

export const Card = ({ children, style = {}, className = "" }) => {
  const { theme: T } = useTheme();
  return (
    <div className={className} style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: 12, padding: 20,
      transition: "background 0.25s, border-color 0.25s",
      ...style,
    }}>{children}</div>
  );
};

export const Btn = ({ children, onClick, variant = "primary", small, icon, disabled, style = {}, type = "button" }) => {
  const { theme: T } = useTheme();
  const styles = {
    primary: { background: `linear-gradient(135deg,${T.accent},${T.accentDark})`, color: "#fff", border: "none" },
    ghost:   { background: "transparent", color: T.t6, border: `1px solid ${T.border}` },
    danger:  { background: T.red + "22", color: T.red, border: `1px solid ${T.red}44` },
    success: { background: T.green + "22", color: T.green, border: `1px solid ${T.green}44` },
    outline: { background: "transparent", color: T.accent, border: `1px solid ${T.accent}44` },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...styles[variant],
      borderRadius: 8, padding: small ? "5px 12px" : "8px 16px",
      fontSize: small ? 12 : 13, fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer",
      display: "flex", alignItems: "center", gap: 6,
      opacity: disabled ? 0.5 : 1, transition: "background-color 0.15s ease-out, border-color 0.15s ease-out, opacity 0.15s ease-out",
      fontFamily: "'Sora',sans-serif", whiteSpace: "nowrap", ...style,
    }}>{icon && icon}{children}</button>
  );
};

export const Input = ({ value, onChange, placeholder, icon, type = "text", style = {}, autoComplete, onKeyDown }) => {
  const { theme: T } = useTheme();
  return (
    <div style={{ position: "relative" }}>
      {icon && (
        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.t10, pointerEvents: "none" }}>
          {icon}
        </span>
      )}
      <input
        type={type} value={value} onChange={onChange}
        placeholder={placeholder} autoComplete={autoComplete}
        onKeyDown={onKeyDown}
        style={{
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8,
          padding: icon ? "8px 12px 8px 34px" : "8px 12px",
          color: T.t1, fontSize: 13, width: "100%",
          fontFamily: "'Sora',sans-serif", outline: "none",
          transition: "border-color 0.25s, background 0.25s", ...style,
        }}
        onFocus={(e) => (e.target.style.borderColor = T.accent + "88")}
        onBlur={(e) => (e.target.style.borderColor = T.border)}
      />
    </div>
  );
};

export const Select = ({ value, onChange, options, style = {} }) => {
  const { theme: T } = useTheme();
  return (
    <select value={value} onChange={onChange} style={{
      background: T.bgCard,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      padding: "8px 12px",
      color: T.t1,
      fontSize: 13,
      fontFamily: "'Sora',sans-serif",
      outline: "none",
      cursor: "pointer",
      transition: "background 0.25s, color 0.25s",
      ...style,
    }}>
      {options.map((o) => (
        <option
          key={o.value}
          value={o.value}
          style={{
            background: T.bgCard,
            color: T.t1,
          }}
        >
          {o.label}
        </option>
      ))}
    </select>
  );
};

export const Modal = ({ open, onClose, title, children, width = 500 }) => {
  const { theme: T } = useTheme();
  if (!open) return null;
  return createPortal(
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "#000000BB",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9999, padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: T.bgCard, border: `1px solid ${T.border}`,
        borderRadius: 16, width: "100%", maxWidth: width,
        maxHeight: "90vh", overflowY: "auto", padding: 28,
        animation: "fadeUp 0.25s ease",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: T.t1 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.t8, cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
};

export const Spinner = ({ size = 24 }) => {
  const { theme: T } = useTheme();
  return (
    <div style={{
      width: size, height: size,
      border: `${size / 8}px solid ${T.border}`,
      borderTopColor: T.accent,
      borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
    }} />
  );
};

export const Toast = ({ message, type = "success", onClose }) => {
  const { theme: T } = useTheme();
  const colors = { success: T.green, error: T.red, info: T.accent };
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: T.bgCard, border: `1px solid ${colors[type]}55`,
      borderLeft: `3px solid ${colors[type]}`,
      borderRadius: 10, padding: "12px 18px",
      display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 8px 32px #00000044",
      animation: "fadeUp 0.3s ease",
    }}>
      <span style={{ color: colors[type], fontSize: 13, fontWeight: 600 }}>{message}</span>
      {onClose && <button onClick={onClose} style={{ background: "none", border: "none", color: T.t9, cursor: "pointer" }}>✕</button>}
    </div>
  );
};
