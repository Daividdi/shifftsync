import React, { useState, useEffect } from "react";
import {
  Layers, Calendar, ArrowLeftRight, Users, UserCheck,
  BarChart3, Clock, LogOut, GitBranch, Timer, Scale,
  ChevronDown, ChevronRight, DoorOpen, CalendarDays, FileText, Cake, Fingerprint, Umbrella,
  Newspaper, FolderOpen, TrendingUp, Zap, ClipboardList,
} from "lucide-react";
import { Avatar } from "./UI";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";
import NotificationBell from "./NotificationBell";

const ROLE_LABELS = { ti: "TI", hr: "RH", leader: "Líder", employee: "Funcionário" };
const ROLE_COLORS = { ti: "#F59E0B", hr: "#00C2FF", leader: "#A78BFA", employee: "#34D399" };

// Toggle sol/lua animado
function ThemeToggle({ isDark, onToggle, T }) {
  return (
    <button onClick={onToggle} style={{
      display: "flex", alignItems: "center", gap: 0, width: "100%",
      padding: "6px 8px", background: T.bgDeep, border: `1px solid ${T.border}`,
      borderRadius: 20, cursor: "pointer", transition: "background 0.3s, border-color 0.3s",
      position: "relative", overflow: "hidden",
    }}>
      {/* Track */}
      <div style={{
        width: "100%", height: 24, borderRadius: 12, position: "relative",
        background: isDark ? "#1a1b2e" : "#e8f4fd", transition: "background 0.3s",
        display: "flex", alignItems: "center", padding: "0 4px",
      }}>
        {/* Sol */}
        <span style={{
          fontSize: 14, position: "absolute", left: 5,
          opacity: isDark ? 0.3 : 1, transition: "opacity 0.3s",
          filter: isDark ? "grayscale(1)" : "none",
        }}>☀️</span>
        {/* Lua */}
        <span style={{
          fontSize: 13, position: "absolute", right: 5,
          opacity: isDark ? 1 : 0.3, transition: "opacity 0.3s",
          filter: isDark ? "none" : "grayscale(1)",
        }}>🌙</span>
        {/* Bolinha deslizante */}
        <div style={{
          width: 18, height: 18, borderRadius: "50%",
          background: isDark ? "#A78BFA" : "#F59E0B",
          position: "absolute",
          left: isDark ? "calc(100% - 22px)" : 4,
          transition: "left 0.3s cubic-bezier(.4,0,.2,1), background 0.3s",
          boxShadow: "0 1px 4px #0004",
        }} />
      </div>
    </button>
  );
}

// Grupo de menu colapsável
function NavGroup({ label, icon, children, defaultOpen = true, T }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 4 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        padding: "5px 10px", background: "transparent", border: "none",
        cursor: "pointer", color: T.t5, fontSize: 10,
        fontWeight: 700, letterSpacing: "0.1em",
        fontFamily: "'Sora', sans-serif", textTransform: "uppercase",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {icon && <span style={{ opacity: 0.6 }}>{icon}</span>}
          {label}
        </div>
        {open
          ? <ChevronDown size={11} />
          : <ChevronRight size={11} />
        }
      </button>
      {open && <div style={{ paddingLeft: 4 }}>{children}</div>}
    </div>
  );
}

// Item de menu individual
function NavItem({ id, label, icon, active, setActive, T, badge }) {
  const isActive = active === id;
  const [hovered, setHovered] = React.useState(false);
  return (
    <button onClick={() => setActive(id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 9, width: "100%",
        padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer",
        background: isActive
          ? `linear-gradient(90deg, ${T.accent}22 0%, ${T.accent}08 100%)`
          : hovered ? T.bgSelected : "transparent",
        color: isActive ? T.accent : hovered ? T.t3 : T.t4,
        fontSize: 12.5, fontWeight: isActive ? 700 : 400,
        marginBottom: 1, textAlign: "left", transition: "background 0.12s, color 0.12s, border-color 0.12s",
        fontFamily: "'Sora', sans-serif",
        borderLeft: isActive ? `3px solid ${T.accent}` : "3px solid transparent",
        paddingLeft: isActive ? 8 : 10,
      }}>
      <span style={{ opacity: isActive ? 1 : hovered ? 0.9 : 0.8, flexShrink: 0, transition: "opacity 0.12s" }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "1px 5px",
          borderRadius: 8, background: T.red + "22", color: T.red,
        }}>{badge}</span>
      )}
    </button>
  );
}

export default function Sidebar({ active, setActive }) {
  const { user, logout } = useAuth();
  const { theme: T, isDark, toggleTheme } = useTheme();

  const isAdmin  = user?.role === "ti" || user?.role === "hr";
  const isLeader = user?.role === "leader" || user?.role === "gerencia";
  const isHR       = user?.role === "hr" || user?.role === "ti";
  const [isAbsent,      setIsAbsent]      = useState(false);
  const [upcomingHoliday, setUpcomingHoliday] = useState(null);

  useEffect(() => {
    if (!user) return;
    const check = async () => {
      try {
        const r = await api.get("/absences/status");
        if (r.data?.isOut && r.data?.openAbsence) {
          const elapsed = Math.round((Date.now() - new Date(r.data.openAbsence.started_at).getTime()) / 1000);
          setIsAbsent(elapsed >= 900);
        } else {
          setIsAbsent(false);
        }
      } catch(e) {}
    };
    check();
    const iv = setInterval(check, 30000);
    return () => clearInterval(iv);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    api.get("/holidays?year="+new Date().getFullYear()).then(r=>{
      const today = new Date();
      const next7 = new Date(today.getTime()+7*86400000);
      const todayStr = today.toISOString().slice(0,10);
      const next7Str = next7.toISOString().slice(0,10);
      const found = (r.data||[]).find(h=>h.date>=todayStr&&h.date<=next7Str&&h.type!=="FACULTATIVO");
      setUpcomingHoliday(found||null);
    }).catch(()=>{});
  }, [user]);

  return (
    <div style={{
      width: 224, background: T.bgSidebar, borderRight: `1px solid ${T.borderSubtle}`,
      display: "flex", flexDirection: "column", height: "100vh", flexShrink: 0,
      position: "sticky", top: 0, transition: "background 0.25s, border-color 0.25s",
    }}>
      {/* Logo */}
      <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${T.borderSubtle}` }}>
        <img
          src={isDark ? "/angeltreat-logo-white.png" : "/angeltreat-logo.png"}
          alt="angelTREAT"
          style={{ height: 26, width: "auto", display: "block", margin: "0 auto 8px" }}
        />
        <div style={{ textAlign: "center", fontSize: 9, color: T.t10, letterSpacing: "0.12em", fontWeight: 700, textTransform: "uppercase" }}>
          ShiftSync · Workforce Manager
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 8px 8px", overflowY: "auto" }}>

        {/* Geral — todos veem */}
        <NavGroup label="Geral" T={T} defaultOpen={true}>
          <NavItem id="dashboard" label="Dashboard"    icon={<Layers size={15} />}   active={active} setActive={setActive} T={T} />
          <NavItem id="birthdays" label="Aniversários"
            icon={<Cake size={15}/>} active={active} setActive={setActive} T={T} />
          <NotificationBell T={T} setActive={setActive} />
          <NavItem id="bi" label="BI & Analytics" icon={<TrendingUp size={15} />} active={active} setActive={setActive} T={T} />
        </NavGroup>

        {/* Plataformas — todos veem */}
        <NavItem id="plataformas" label="Plataformas" icon={<Zap size={15} />} active={active} setActive={setActive} T={T} />

        {/* Comunicação — todos veem */}
        <NavGroup label="Comunicação" T={T} defaultOpen={true}>
          <NavItem id="mural"     label="Mural de Avisos" icon={<Newspaper     size={15} />} active={active} setActive={setActive} T={T} />
          <NavItem id="forms"     label="Formulários"     icon={<ClipboardList size={15} />} active={active} setActive={setActive} T={T} />
          <NavItem id="documents" label="Documentos"      icon={<FolderOpen size={15} />} active={active} setActive={setActive} T={T} />
        </NavGroup>

        {/* Escalas */}
        <NavGroup label="Escalas" T={T} defaultOpen={true}>
          <NavItem id="calendar" label="Calendário"       icon={<Calendar size={15} />}        active={active} setActive={setActive} T={T} />
          <NavItem id="meeting"  label="Sala de Reunião"  icon={<DoorOpen size={15} />}         active={active} setActive={setActive} T={T} />
          <NavItem id="holidays"
            label={
              <span style={{display:"flex",alignItems:"center",gap:6}}>
                Feriados
                {upcomingHoliday&&(
                  <span style={{width:7,height:7,borderRadius:"50%",background:"#BA7517",display:"inline-block",flexShrink:0}}
                    title={upcomingHoliday.name+" — "+upcomingHoliday.date}/>
                )}
              </span>
            }
            icon={<CalendarDays size={15}/>} active={active} setActive={setActive} T={T} />
          {(isLeader || isHR) && (
            <NavItem id="swaps" label="Trocas de Turno"   icon={<ArrowLeftRight size={15} />}  active={active} setActive={setActive} T={T} />
          )}
          {isHR && (
            <NavItem id="schedule" label="Gerenciar Escalas" icon={<GitBranch size={15} />}    active={active} setActive={setActive} T={T} />
          )}
        </NavGroup>

        {/* Ausências — todos veem */}
        <NavGroup label="Ausências" T={T} defaultOpen={true}>
          <NavItem id="absences"
            label={
              <span style={{display:"flex",alignItems:"center",gap:6}}>
                Controle de Ausências
                {isAbsent&&(
                  <span style={{width:8,height:8,borderRadius:"50%",background:"#E24B4A",display:"inline-block",animation:"abs-badge-pulse 1.2s ease-in-out infinite",flexShrink:0,boxShadow:"0 0 0 2px #E24B4A44"}}/>
                )}
              </span>
            }
            icon={<Timer size={15}/>} active={active} setActive={setActive} T={T} />
          <style>{`@keyframes abs-badge-pulse{0%,100%{box-shadow:0 0 0 0 #E24B4A44}50%{box-shadow:0 0 0 4px #E24B4A00}}`}</style>
          {(isLeader||isHR)&&<NavItem id="occurrences" label="Ocorrências"           icon={<FileText size={15} />} active={active} setActive={setActive} T={T} />}
        </NavGroup>

        {/* Ponto */}
        <NavGroup label="Ponto" T={T} defaultOpen={true}>
          <NavItem id="ponto"   label="Controle de Ponto" icon={<Fingerprint size={15} />} active={active} setActive={setActive} T={T} />
          <NavItem id="batidas"      label="Batidas de Ponto"  icon={<Clock  size={15} />} active={active} setActive={setActive} T={T} />
          <NavItem id="saldo_horas" label="Saldo de Horas"   icon={<Scale  size={15} />} active={active} setActive={setActive} T={T} />
        </NavGroup>

        {/* Férias */}
        <NavGroup label="Férias" T={T} defaultOpen={true}>
          <NavItem id="vacations" label="Controle de Férias" icon={<Umbrella size={15} />} active={active} setActive={setActive} T={T} />
        </NavGroup>

        {/* Gestão — líder e acima */}
        {(isLeader || isHR) && (
          <NavGroup label="Gestão" T={T} defaultOpen={false}>
            <NavItem id="reports" label="Relatórios" icon={<BarChart3 size={15} />} active={active} setActive={setActive} T={T} />
            {(isHR || user?.role === "gerencia") && (
              <NavItem id="groups" label="Grupos & Times"  icon={<Users size={15} />}     active={active} setActive={setActive} T={T} />
            )}
            {isHR && <NavItem id="users"  label="Usuários (LDAP)" icon={<UserCheck size={15} />} active={active} setActive={setActive} T={T} />}
          </NavGroup>
        )}

      </nav>

      {/* Footer */}
      <div style={{ padding: "10px 10px 14px", borderTop: `1px solid ${T.borderSubtle}`, display: "flex", flexDirection: "column", gap: 8 }}>
        <ThemeToggle isDark={isDark} onToggle={toggleTheme} T={T} />

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", background: T.bgDeep, borderRadius: 10, border: `1px solid ${T.border}` }}>
          <Avatar name={user?.fullName} size={32} color={ROLE_COLORS[user?.role] || T.accent} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.fullName}
            </div>
            <div style={{ fontSize: 10, color: ROLE_COLORS[user?.role] || T.t10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: ROLE_COLORS[user?.role] || T.accent, display: "inline-block", flexShrink: 0 }}/>
              {ROLE_LABELS[user?.role] || user?.role}
            </div>
          </div>
        </div>

        <button onClick={logout} style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          padding: "7px 10px", background: "#FF445512", border: "1px solid #FF445530",
          borderRadius: 7, color: "#FF7A7A", cursor: "pointer",
          fontSize: 12, fontWeight: 600, fontFamily: "'Sora', sans-serif", transition: "background 0.15s, color 0.15s, border-color 0.15s",
        }}>
          <LogOut size={13} /> Sair
        </button>
      </div>
    </div>
  );
}
