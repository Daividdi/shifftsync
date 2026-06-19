import React from "react";
import {
  ExternalLink, Clock, Zap, ArrowRight, ChevronRight, Lock,
  Brain, Grid3X3, Eye, Target, Layers, Box, Hash, LayoutGrid, Search,
  ClipboardList, BookOpen,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useGameTimer } from "../context/GameTimerContext";

const RAHOOT_URL = "https://rahoot.angel.br";
const MOODLE_URL = "http://sga.angel.br";

const GAMES = [
  { slug: "dual-n-back",            name: "Dual N-Back",          Icon: Brain,       color: "#6366F1", desc: "Memória de trabalho — padrão ouro da neurociência cognitiva." },
  { slug: "schulte-table",          name: "Tabela de Schulte",    Icon: LayoutGrid,  color: "#0891B2", desc: "Velocidade de percepção visual e amplitude de atenção." },
  { slug: "stroop-effect-test",     name: "Teste de Stroop",      Icon: Eye,         color: "#DC2626", desc: "Controle inibitório e atenção seletiva sob interferência." },
  { slug: "reaction-time",          name: "Tempo de Reação",      Icon: Zap,         color: "#D97706", desc: "Meça sua velocidade de reação simples em milissegundos." },
  { slug: "memory-matching-game",   name: "Memória Visual",       Icon: Layers,      color: "#059669", desc: "Pares de cartas para exercitar memória e concentração." },
  { slug: "block-memory-challenge", name: "Sequência de Blocos",  Icon: Box,         color: "#7C3AED", desc: "Memorize e repita sequências de blocos crescentes." },
  { slug: "focus-reaction-test",    name: "Foco & Reação",        Icon: Target,      color: "#0D9488", desc: "Reação com atenção dividida — identifique o estímulo correto." },
  { slug: "counting-boxes",         name: "Contagem de Caixas",   Icon: Hash,        color: "#BE185D", desc: "Aritmética mental rápida com foco em tarefa sequencial." },
  { path: "/cog/include/main_enumeration_task.html",  name: "Enumeração",              Icon: Grid3X3, color: "#0891B2", desc: "Contagem rápida de pontos — avalia velocidade e precisão numérica." },
  { path: "/pixelhunt/",                              name: "PixelHunt",               Icon: Search,  color: "#E11D48", desc: "Encontre os personagens escondidos na imagem — jogo de atenção visual e memória." },
  { path: "/cog/include/main_moteval_task.html",      name: "Rastreamento de Objetos", Icon: Eye,     color: "#7C3AED", desc: "Rastreie múltiplos objetos em movimento para treinar atenção seletiva." },
];

const TESTS = [
  { path: "/adhd-assessment",            name: "Avaliação TDAH",    Icon: ClipboardList, color: "#0891B2", desc: "Questionário padronizado de triagem para sintomas de TDAH." },
  { path: "/adult-adhd-assessment",      name: "TDAH Adulto (ASRS)", Icon: ClipboardList, color: "#7C3AED", desc: "Escala ASRS — avaliação de TDAH específica para adultos." },
  { slug: "free-short-term-memory-test", name: "Memória Imediata",  Icon: BookOpen,      color: "#D97706", desc: "Avalie sua capacidade de memória de trabalho com palavras." },
];

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return m + ":" + sec;
}

function RahootLogo({ size = 32 }) {
  return (
    <img src="/logos/rahoot-icon.svg" alt="Rahoot"
      style={{ width: size, height: size, objectFit: "contain" }} />
  );
}

function MoodleLogo() {
  return (
    <img src="/logos/moodle-logo.svg" alt="Moodle"
      style={{ width: "100%", height: "auto", maxHeight: 28, objectFit: "contain" }} />
  );
}

function StatusBadge({ status }) {
  const cfg = {
    active: { label: "Ativo",    bg: "#22c55e18", color: "#22c55e" },
    soon:   { label: "Em breve", bg: "#f59e0b18", color: "#f59e0b" },
  };
  const c = cfg[status] || cfg.soon;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: c.bg, color: c.color,
      fontSize: 10, fontWeight: 700, padding: "3px 8px",
      borderRadius: 20, letterSpacing: "0.04em",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
      {c.label}
    </span>
  );
}

function ToolCard({ logo, logoWide, name, description, url, color, status, T }) {
  const isActive = status === "active";
  function handleOpen() {
    if (!isActive || !url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }
  return (
    <div
      style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16,
        padding: "20px 20px 18px", display: "flex", flexDirection: "column", gap: 14,
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: "0 1px 3px #0000000a", position: "relative", overflow: "hidden",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = color + "66";
        e.currentTarget.style.boxShadow = `0 4px 20px ${color}18`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = T.border;
        e.currentTarget.style.boxShadow = "0 1px 3px #0000000a";
      }}
    >
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: isActive ? `linear-gradient(90deg, ${color}, ${color}66)` : T.border,
        borderRadius: "16px 16px 0 0",
      }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        {logoWide ? (
          <div style={{ flex: 1, height: 44, padding: "8px 12px", borderRadius: 10, background: color + "12", border: `1px solid ${color}25`, display: "flex", alignItems: "center" }}>
            {logo}
          </div>
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: 13, flexShrink: 0, background: color + "14", border: `1px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {logo}
          </div>
        )}
        <StatusBadge status={status} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.t1, marginBottom: 5 }}>{name}</div>
        <div style={{ fontSize: 12.5, color: T.t6, lineHeight: 1.55 }}>{description}</div>
      </div>
      <button
        onClick={handleOpen}
        disabled={!isActive}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          padding: "10px 16px", borderRadius: 10, border: "none", width: "100%",
          background: isActive ? color : T.bgDeep,
          color: isActive ? "#fff" : T.t8,
          fontSize: 13, fontWeight: 700, cursor: isActive ? "pointer" : "not-allowed",
          fontFamily: "'Sora', sans-serif", opacity: isActive ? 1 : 0.55,
        }}
        onMouseEnter={e => { if (isActive) e.currentTarget.style.filter = "brightness(1.12)"; }}
        onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
      >
        {isActive ? <><ExternalLink size={13} /> Abrir</> : <><Clock size={13} /> Em breve</>}
      </button>
    </div>
  );
}

function GameCard({ name, desc, Icon, color, onOpen, disabled, T }) {
  function handleClick() {
    if (!disabled) onOpen();
  }
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={e => e.key === "Enter" && handleClick()}
      style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12,
        padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "border-color 0.15s, box-shadow 0.15s, opacity 0.2s",
        outline: "none",
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = color + "55"; e.currentTarget.style.boxShadow = `0 2px 12px ${color}14`; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: disabled ? T.bgDeep : color + "14",
        border: `1px solid ${disabled ? T.border : color + "28"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={17} color={disabled ? T.t8 : color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: disabled ? T.t7 : T.t1 }}>{name}</div>
        <div style={{ fontSize: 11.5, color: T.t8, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{desc}</div>
      </div>
      {disabled
        ? <Lock size={13} color={T.t8} style={{ flexShrink: 0 }} />
        : <ChevronRight size={14} color={T.t8} style={{ flexShrink: 0 }} />}
    </div>
  );
}

function SectionHeader({ title, subtitle, T }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: T.t1 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11.5, color: T.t7, marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

function SubHeader({ title, T }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: T.t7, textTransform: "uppercase",
      letterSpacing: "0.06em", marginBottom: 10, marginTop: 4,
    }}>
      {title}
    </div>
  );
}

function TimerWidget({ remaining, isExpired, T }) {
  const TOTAL = 25 * 60;
  const pct = isExpired ? 0 : remaining / TOTAL;
  const color = isExpired ? "#ef4444" : remaining <= 60 ? "#ef4444" : remaining <= 300 ? "#f59e0b" : "#22c55e";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      background: isExpired ? "#ef444410" : color + "0d",
      border: `1px solid ${isExpired ? "#ef444430" : color + "30"}`,
      borderRadius: 12, padding: "10px 16px", marginBottom: 20,
    }}>
      <div style={{ position: "relative", width: 36, height: 36, flexShrink: 0 }}>
        <svg width="36" height="36" viewBox="0 0 36 36" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="18" cy="18" r="15" fill="none" stroke={T.border} strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15" fill="none"
            stroke={color} strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * 15}`}
            strokeDashoffset={`${2 * Math.PI * 15 * (1 - pct)}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s" }}
          />
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {isExpired
            ? <Lock size={13} color={color} />
            : <Clock size={12} color={color} />}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        {isExpired ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color }}>Tempo diário esgotado</div>
            <div style={{ fontSize: 11.5, color: T.t7, marginTop: 1 }}>Os jogos estarão disponíveis novamente amanhã.</div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{formatTime(remaining)}</span>
              <span style={{ fontSize: 11, color: T.t7 }}>restantes hoje</span>
            </div>
            <div style={{ marginTop: 5, height: 4, borderRadius: 4, background: T.border, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 4,
                background: `linear-gradient(90deg, ${color}, ${color}bb)`,
                width: `${pct * 100}%`,
                transition: "width 1s linear, background 0.5s",
              }} />
            </div>
          </>
        )}
      </div>
      {!isExpired && (
        <div style={{ fontSize: 10, color: T.t8, textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontWeight: 700, color: T.t6 }}>25:00</div>
          <div>por dia</div>
        </div>
      )}
    </div>
  );
}

export default function PlataformasPage({ onOpenGame }) {
  const { theme: T } = useTheme();
  const { remaining, isExpired } = useGameTimer();
  const origin = window.location.origin;

  function openGame(item) {
    if (isExpired) return;
    const url = item.path ? origin + item.path : origin + "/games/" + item.slug;
    onOpenGame(url, item.name);
  }

  return (
    <div style={{ padding: "28px 32px" }}>

      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <Zap size={20} color={T.accent} />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: T.t1, margin: 0, display: "flex", alignItems: "center", gap: 11 }}><span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", background: T.accent + "1f", color: T.accent, flexShrink: 0 }}><Zap size={18} /></span>Plataformas</h1>
        </div>
        <p style={{ color: T.t6, fontSize: 13, margin: 0 }}>Ferramentas, jogos cognitivos e avaliações</p>
      </div>

      <SectionHeader title="Ferramentas" subtitle="Aplicações e sistemas integrados" T={T} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 40 }}>
        <ToolCard logo={<RahootLogo size={30} />} name="Rahoot!" description="Quizzes interativos para treinamentos, integração e engajamento da equipe em tempo real." url={RAHOOT_URL} color="#4F46E5" status="active" T={T} />
        <ToolCard logo={<MoodleLogo />} logoWide name="Moodle" description="Plataforma de ensino a distância e gestão de aprendizagem — cursos, materiais e avaliações." url={MOODLE_URL} color="#F98012" status="active" T={T} />
      </div>

      <SectionHeader title="Jogos Mentais" subtitle="Exercícios cognitivos científicos para treinar foco, memória e atenção" T={T} />
      <TimerWidget remaining={remaining} isExpired={isExpired} T={T} />

      <SubHeader title="Jogos" T={T} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10, marginBottom: 24 }}>
        {GAMES.map(g => (
          <GameCard key={g.slug || g.path} name={g.name} desc={g.desc} Icon={g.Icon} color={g.color} onOpen={() => openGame(g)} disabled={isExpired} T={T} />
        ))}
      </div>

      <SubHeader title="Testes & Avaliações" T={T} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
        {TESTS.map((t, i) => (
          <GameCard key={t.path || t.slug || i} name={t.name} desc={t.desc} Icon={t.Icon} color={t.color} onOpen={() => openGame(t)} disabled={isExpired} T={T} />
        ))}
      </div>

    </div>
  );
}
