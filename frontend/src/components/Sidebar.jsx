import React, { useState, useEffect } from "react";
import {
  Layers, Calendar, ArrowLeftRight, Users, UserCheck,
  BarChart3, Clock, LogOut, GitBranch, Timer, Scale,
  ChevronDown, ChevronRight, DoorOpen, CalendarDays, FileText, Cake, Fingerprint, Umbrella,
  Newspaper, FolderOpen, TrendingUp, Zap, ClipboardList,
  Sun, Moon, Check, ChevronLeft, Palette, Gauge, Users2,
} from "lucide-react";
import { Avatar } from "./UI";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";
import NotificationBell from "./NotificationBell";

const ROLE_LABELS = { ti: "TI", hr: "RH", leader: "Líder", employee: "Funcionário" };
const ROLE_COLORS = { ti: "#F59E0B", hr: "#00C2FF", leader: "#A78BFA", employee: "#34D399" };

// Toggle sol/lua animado
// Easing com leve overshoot (sensação "mola") sem biblioteca de animação
const SPRING = "cubic-bezier(0.34, 1.45, 0.5, 1)";

function ThemeToggle({ isDark, onToggle, T }) {
  const segs = [
    { on: !isDark, Icon: Sun,  label: "Claro"  },
    { on:  isDark, Icon: Moon, label: "Escuro" },
  ];
  return (
    <button onClick={onToggle}
      aria-label={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
      onMouseDown={e => (e.currentTarget.style.transform = "scale(0.97)")}
      onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
      style={{
        position: "relative", display: "flex", alignItems: "center", width: "100%", height: 30,
        padding: 3, background: T.bgDeep, borderRadius: 15, border: `1px solid ${T.border}`,
        boxShadow: `inset 0 1px 3px ${isDark ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.07)"}`,
        cursor: "pointer", outline: "none", overflow: "hidden",
        transition: `transform 0.18s ${SPRING}, background 0.4s ease, border-color 0.4s ease`,
      }}>
      {/* Thumb deslizante com gradiente accent + brilho */}
      <div style={{
        position: "absolute", top: 3, left: 3, width: "calc(50% - 3px)", height: 22, borderRadius: 11,
        background: T.accentGradient,
        boxShadow: `0 2px 8px ${T.accent}66, 0 1px 2px rgba(0,0,0,0.25)`,
        transform: isDark ? "translateX(100%)" : "translateX(0)",
        transition: `transform 0.45s ${SPRING}, background 0.4s ease`,
        willChange: "transform",
      }} />
      {segs.map(({ on, Icon, label }, i) => (
        <div key={i} style={{
          position: "relative", zIndex: 1, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          color: on ? "#fff" : T.t6, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.02em",
          transition: "color 0.35s ease",
        }}>
          <Icon size={12} strokeWidth={2.4}
            style={{ transform: on ? "scale(1)" : "scale(0.82)", transition: `transform 0.4s ${SPRING}` }} />
          {label}
        </div>
      ))}
    </button>
  );
}

// Bolinha individual de cor (usada no popover)
function Swatch({ a, selected, accentKey, onClick, T }) {
  const isPride = !!a.gradient;
  return (
    <button onClick={onClick} title={a.label} aria-label={`Cor ${a.label}`}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.transform = "scale(1.2) translateY(-1px)"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.transform = "scale(1)"; }}
      style={{
        position: "relative", width: 22, height: 22, borderRadius: "50%", cursor: "pointer", padding: 0, flexShrink: 0,
        background: a.gradient || `linear-gradient(140deg, ${a.accent}, ${a.accentDark})`,
        backgroundSize: isPride ? "220% 100%" : "auto",
        animation: isPride ? "prideFlow 3s linear infinite" : "none",
        border: "none",
        boxShadow: selected
          ? `0 0 0 2px ${T.bgCard}, 0 0 0 3.5px ${a.accent}, 0 2px 9px ${a.accent}99`
          : "0 1px 2px rgba(0,0,0,0.28)",
        transform: selected ? "scale(1.16)" : "scale(1)",
        transition: `transform 0.32s ${SPRING}, box-shadow 0.3s ease`,
        outline: "none", willChange: "transform",
      }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", pointerEvents: "none",
        background: "radial-gradient(circle at 33% 27%, rgba(255,255,255,0.55), transparent 56%)" }} />
      {selected && (
        <span aria-hidden key={"ripple-" + accentKey} style={{
          position: "absolute", inset: -2, borderRadius: "50%", pointerEvents: "none",
          border: `2px solid ${isPride ? "#fff" : a.accent}`, animation: "swatchRipple 0.55s ease-out forwards" }} />
      )}
      {selected && (
        <Check size={11} strokeWidth={3.5} style={{ position: "absolute", inset: 0, margin: "auto", color: "#fff",
          filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.45))" }} />
      )}
    </button>
  );
}

// Seletor de cor: ícone de paleta; ao passar o mouse, abre um popover com as cores.
function AccentPicker({ T, ACCENTS, accentKey, setAccent }) {
  const [open, setOpen] = useState(false);
  const closeTimer = React.useRef();
  const current = ACCENTS[accentKey];
  const openNow  = () => { clearTimeout(closeTimer.current); setOpen(true); };
  const closeSoon = () => { closeTimer.current = setTimeout(() => setOpen(false), 180); };
  return (
    <div className="ss-hide" style={{ position: "relative", display: "flex", justifyContent: "center" }}
      onMouseEnter={openNow} onMouseLeave={closeSoon}>
      {/* Ponte invisível cobrindo o vão entre o botão e o popover (evita fechar ao cruzar) */}
      {open && <div aria-hidden style={{ position: "absolute", left: -24, right: -24, bottom: "100%", height: 14 }} />}
      {/* Botão pincel/paleta */}
      <button title="Cor do tema" aria-label="Cor do tema"
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 9,
          border: `1px solid ${open ? T.accent + "88" : T.border}`, background: T.bgDeep, cursor: "pointer",
          color: T.accent, transition: "border-color 0.2s ease, box-shadow 0.2s ease",
          boxShadow: open ? `0 0 0 3px ${T.accent}22` : "none",
        }}>
        <Palette size={13} />
        <span style={{ fontSize: 10.5, fontWeight: 600, color: T.t5 }}>Tema</span>
        <span aria-hidden style={{
          width: 11, height: 11, borderRadius: "50%", marginLeft: 1,
          background: current?.gradient || `linear-gradient(140deg, ${current?.accent}, ${current?.accentDark})`,
          backgroundSize: current?.gradient ? "220% 100%" : "auto",
          animation: current?.gradient ? "prideFlow 3s linear infinite" : "none",
          boxShadow: `0 0 0 1.5px ${T.bgDeep}, 0 0 7px ${current?.accent}aa`,
        }} />
      </button>
      {/* Popover com as cores (abre para cima) */}
      <div style={{
        position: "absolute", bottom: "calc(100% + 9px)", left: "50%",
        transform: `translateX(-50%) translateY(${open ? 0 : 6}px) scale(${open ? 1 : 0.96})`,
        opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none",
        display: "flex", gap: 10, padding: "10px 12px", borderRadius: 14, background: T.bgCard,
        border: `1px solid ${T.border}`, boxShadow: "0 12px 34px rgba(0,0,0,0.38)", zIndex: 90,
        transition: "opacity 0.18s ease, transform 0.24s cubic-bezier(0.34,1.4,0.5,1)",
      }}>
        {Object.entries(ACCENTS).map(([key, a]) => (
          <Swatch key={key} a={a} selected={key === accentKey} accentKey={accentKey} T={T} onClick={() => setAccent(key)} />
        ))}
        {/* setinha */}
        <span aria-hidden style={{
          position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", width: 0, height: 0,
          borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `6px solid ${T.bgCard}`,
        }} />
      </div>
    </div>
  );
}

// Grupo de menu colapsável
function NavGroup({ label, icon, children, defaultOpen = true, T }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 4 }}>
      <button className="ss-group-header" onClick={() => setOpen(v => !v)} style={{
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
      {/* Sempre no DOM (display via inline) para que o modo recolhido possa
          forçar a exibição dos ícones via CSS !important */}
      <div className="ss-group-children" style={{ paddingLeft: 4, display: open ? "block" : "none" }}>{children}</div>
    </div>
  );
}

// Item de menu individual
function NavItem({ id, label, icon, active, setActive, T, badge, onClick }) {
  const isActive = active === id;
  const [hovered, setHovered] = React.useState(false);
  return (
    <button className="ss-navitem" onClick={() => (onClick ? onClick() : setActive(id))} title={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex", alignItems: "center", gap: 9, width: "100%",
        padding: "8px 10px", borderRadius: 9, border: "none", cursor: "pointer",
        background: isActive
          ? `linear-gradient(90deg, ${T.accent}2b 0%, ${T.accent}05 100%)`
          : hovered ? T.bgSelected : "transparent",
        color: isActive ? T.accent : hovered ? T.t3 : T.t4,
        fontSize: 12.5, fontWeight: isActive ? 700 : 400,
        marginBottom: 1, textAlign: "left", transition: "background 0.15s ease, color 0.15s ease",
        fontFamily: "'Sora', sans-serif",
      }}>
      {/* Indicador ativo: barra em gradiente com brilho na cor do tema */}
      {isActive && (
        <span aria-hidden className="ss-active-bar" style={{
          position: "absolute", left: 0, top: 6, bottom: 6, width: 3, borderRadius: "0 4px 4px 0",
          background: T.accentGradient, boxShadow: `0 0 9px ${T.accent}, 0 0 2px ${T.accent}`,
        }} />
      )}
      <span style={{ opacity: isActive ? 1 : hovered ? 0.9 : 0.8, flexShrink: 0, transition: "opacity 0.12s", filter: isActive ? `drop-shadow(0 0 5px ${T.accent}66)` : "none" }}>{icon}</span>
      <span className="ss-label" style={{ flex: 1 }}>{label}</span>
      {badge && (
        <span className="ss-label" style={{
          fontSize: 9, fontWeight: 700, padding: "1px 5px",
          borderRadius: 8, background: T.red + "22", color: T.red,
        }}>{badge}</span>
      )}
    </button>
  );
}

export default function Sidebar({ active, setActive }) {
  const { user, logout } = useAuth();
  const { theme: T, isDark, toggleTheme, accentKey, setAccent, ACCENTS } = useTheme();

  const isAdmin  = user?.role === "ti" || user?.role === "hr";
  const isLeader = user?.role === "leader" || user?.role === "gerencia";
  const isHR       = user?.role === "hr" || user?.role === "ti";
  const [isAbsent,      setIsAbsent]      = useState(false);
  const [upcomingHoliday, setUpcomingHoliday] = useState(null);
  // Menu retrátil: recolhido (fixado) + hover para expandir (overlay, sem empurrar o conteúdo)
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("shiftsync_sidebar") === "1"; } catch { return false; } });
  const [hover, setHover] = useState(false);
  useEffect(() => { try { localStorage.setItem("shiftsync_sidebar", collapsed ? "1" : "0"); } catch {} }, [collapsed]);
  const expanded = !collapsed || hover;

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

  const RAIL = 76, FULL = 224;
  return (
    <div style={{
      width: collapsed ? RAIL : FULL, flexShrink: 0, position: "relative", height: "100vh",
      transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
    }}>
    <div className={expanded ? "ss-sidebar" : "ss-sidebar ss-collapsed"}
      onMouseEnter={() => { if (collapsed) setHover(true); }}
      onMouseLeave={() => setHover(false)}
      style={{
        width: expanded ? FULL : RAIL, background: T.bgSidebar, borderRight: `1px solid ${T.borderSubtle}`,
        display: "flex", flexDirection: "column", height: "100vh",
        position: "absolute", top: 0, left: 0, zIndex: 50,
        boxShadow: (collapsed && hover) ? "10px 0 30px rgba(0,0,0,0.30)" : "none",
        transition: "width 0.22s cubic-bezier(0.4,0,0.2,1), background 0.25s, border-color 0.25s, box-shadow 0.2s",
      }}>
      {/* Faixa de destaque no topo — cor do tema */}
      <div aria-hidden style={{ height: 3, flexShrink: 0, background: T.accentGradient }} />
      {/* Setinha de recolher/expandir — borda direita, centro vertical */}
      <button onClick={() => { setCollapsed(v => !v); setHover(false); }}
        title={collapsed ? "Expandir menu" : "Recolher menu"} aria-label="Recolher menu"
        onMouseEnter={e => { e.currentTarget.style.color = T.accent; e.currentTarget.style.borderColor = T.accent + "88"; }}
        onMouseLeave={e => { e.currentTarget.style.color = T.t5; e.currentTarget.style.borderColor = T.border; }}
        style={{
          position: "absolute", top: "50%", right: -9, transform: "translateY(-50%)", zIndex: 60,
          width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          background: T.bgCard, border: `1px solid ${T.border}`, color: T.t5, cursor: "pointer",
          boxShadow: "0 1px 5px rgba(0,0,0,0.25)", padding: 0,
          transition: "color 0.15s, border-color 0.15s",
        }}>
        <ChevronLeft size={12} strokeWidth={2.5} style={{ transform: collapsed ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s cubic-bezier(0.34,1.4,0.5,1)" }} />
      </button>

      {/* Logo com brilho que passa periodicamente (luz mascarada pelo formato da logo) */}
      <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${T.borderSubtle}` }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
            <img className="ss-logo"
              src={isDark ? "/angeltreat-logo-white.png" : "/angeltreat-logo.png"}
              alt="angelTREAT"
              style={{ height: 26, width: "auto", display: "block" }}
            />
            <span aria-hidden style={{
              position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none",
              WebkitMaskImage: `url(${isDark ? "/angeltreat-logo-white.png" : "/angeltreat-logo.png"})`,
              maskImage: `url(${isDark ? "/angeltreat-logo-white.png" : "/angeltreat-logo.png"})`,
              WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
              WebkitMaskSize: "contain", maskSize: "contain",
              WebkitMaskPosition: "center", maskPosition: "center",
            }}>
              <span style={{
                position: "absolute", top: "-20%", bottom: "-20%", left: 0, width: "45%",
                background: `linear-gradient(90deg, transparent, ${isDark ? T.accent : "rgba(255,255,255,0.95)"}, transparent)`,
                animation: "logoShine 6.5s ease-in-out infinite",
                willChange: "transform",
              }} />
            </span>
          </div>
        </div>
        <div className="ss-hide" style={{ textAlign: "center", fontSize: 9, color: T.t10, letterSpacing: "0.12em", fontWeight: 700, textTransform: "uppercase" }}>
          ShiftSync · Workforce Manager
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 8px 8px", overflowY: "auto" }}>

        {/* Geral — todos veem */}
        <NavGroup label="Geral" T={T} defaultOpen={true}>
          <NavItem id="dashboard" label="Dashboard"    icon={<Layers size={15} />}   active={active} setActive={setActive} T={T} />
          <NotificationBell T={T} setActive={setActive} />
          <NavItem id="birthdays" label="Aniversários"
            icon={<Cake size={15}/>} active={active} setActive={setActive} T={T} />
          <NavItem id="bi" label="BI & Analytics" icon={<TrendingUp size={15} />} active={active} setActive={setActive} T={T} />
          <NavItem id="indicadores" label="Indicadores Pessoais" icon={<Gauge size={15} />} active={active} setActive={setActive} T={T} />
          {(isLeader || isHR) && (
            <NavItem id="indicadores_gestao" label="Visão de Gestão" icon={<Users2 size={15} />} active={active} setActive={setActive} T={T} />
          )}
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
        <div className="ss-hide" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ThemeToggle isDark={isDark} onToggle={toggleTheme} T={T} />
          <AccentPicker T={T} ACCENTS={ACCENTS} accentKey={accentKey} setAccent={setAccent} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", background: T.bgDeep, borderRadius: 10, border: `1px solid ${T.border}` }}>
          <Avatar name={user?.fullName} size={32} color={ROLE_COLORS[user?.role] || T.accent} />
          <div className="ss-label" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.fullName}
            </div>
            <div style={{ fontSize: 10, color: ROLE_COLORS[user?.role] || T.t10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: ROLE_COLORS[user?.role] || T.accent, display: "inline-block", flexShrink: 0 }}/>
              {ROLE_LABELS[user?.role] || user?.role}
            </div>
          </div>
          {/* Sair — discreto, ao lado do nome */}
          <button className="ss-label" onClick={logout} title="Sair"
            onMouseEnter={e => { e.currentTarget.style.background = T.red + "1f"; e.currentTarget.style.color = T.red; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.t8; }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, flexShrink: 0,
              background: "transparent", border: "none", borderRadius: 8, cursor: "pointer", color: T.t8,
              transition: "background 0.15s, color 0.15s",
            }}>
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}
