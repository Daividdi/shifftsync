import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Trash2, BarChart2, Image, Link, X, Check, Newspaper, Pencil,
  MessageCircle, Send, Lock, LockOpen, Users,
  AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Eraser,
} from "lucide-react";
import { Card, Btn, Modal, Avatar } from "../components/UI";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";

const CAN_POST_ROLES = ["leader", "hr", "ti", "gerencia"];

const REACTIONS = [
  { id: "like",      emoji: "👍", label: "Curtir",    color: "#1877F2" },
  { id: "love",      emoji: "❤️",  label: "Amei",      color: "#E24B4A" },
  { id: "haha",      emoji: "😂", label: "Haha",      color: "#F7B928" },
  { id: "wow",       emoji: "😮", label: "Uau",       color: "#F7B928" },
  { id: "sad",       emoji: "😢", label: "Triste",    color: "#6B9FD4" },
  { id: "angry",     emoji: "😡", label: "Grr",       color: "#E9710F" },
  { id: "celebrate", emoji: "🎉", label: "Parabéns!", color: "#FF6B35" },
];
const REACTION_MAP = Object.fromEntries(REACTIONS.map(r => [r.id, r]));

const TEXT_COLORS = [
  "#111111", "#555555", "#E24B4A", "#1877F2",
  "#34A853", "#FF8C00", "#9B59B6", "#F7B928",
];

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "-03:00")).getTime()) / 1000;
  if (diff < 60)    return "agora";
  if (diff < 3600)  return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

function roleBadge(role) {
  const map = { hr: "RH", ti: "TI", gerencia: "Gestão", leader: "Líder" };
  return map[role] || null;
}

function extractVideoEmbed(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

function htmlToText(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function renderContent(content) {
  if (!content) return "";
  // Plain text (no HTML tags) — convert newlines to <br> for display
  if (!/<[a-z][\s\S]*>/i.test(content)) {
    return content.replace(/\n/g, "<br>");
  }
  return content;
}

// ── Toolbar button ────────────────────────────────────────────────────────────
function TBtn({ children, title, onMouseDown, T }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={title}
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? T.bgCard : "none", border: "none", cursor: "pointer",
        width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 5, padding: 0, transition: "background 0.1s", flexShrink: 0,
      }}>
      {children}
    </button>
  );
}

// ── Color palette dropdown ────────────────────────────────────────────────────
function ColorPalette({ onColor, T }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <TBtn title="Cor do texto" onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }} T={T}>
        <span style={{ fontSize: 12, fontWeight: 800, color: T.t2, lineHeight: 1, borderBottom: "2px solid #E24B4A", paddingBottom: 1 }}>A</span>
      </TBtn>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0,
          background: T.bgSidebar, border: `1px solid ${T.borderSubtle}`,
          borderRadius: 8, padding: 6, display: "flex", gap: 4, flexWrap: "wrap",
          width: 116, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 50,
        }}>
          {TEXT_COLORS.map(c => (
            <button key={c} title={c}
              onMouseDown={e => { e.preventDefault(); onColor(c); setOpen(false); }}
              style={{ width: 20, height: 20, background: c, border: `1px solid ${T.borderSubtle}`, borderRadius: 4, cursor: "pointer", padding: 0 }}
            />
          ))}
          <button title="Cor padrão"
            onMouseDown={e => { e.preventDefault(); onColor("inherit"); setOpen(false); }}
            style={{ width: 20, height: 20, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4, cursor: "pointer", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", color: T.t7 }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ── Rich text editor ──────────────────────────────────────────────────────────
function RichEditor({ onChange, initialValue, T }) {
  const ref        = useRef(null);
  const [empty, setEmpty] = useState(!initialValue);

  useEffect(() => {
    if (ref.current && initialValue) {
      ref.current.innerHTML = initialValue;
      onChange(initialValue);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const exec = (cmd, val) => {
    ref.current?.focus();
    document.execCommand(cmd, false, val !== undefined ? val : null);
    sync();
  };

  const sync = () => {
    const html = ref.current?.innerHTML || "";
    onChange(html);
    setEmpty((ref.current?.textContent || "").trim().length === 0);
  };

  const sep = <div style={{ width: 1, background: T.borderSubtle, margin: "0 2px", alignSelf: "stretch" }} />;

  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 1, padding: "5px 8px", borderBottom: `1px solid ${T.borderSubtle}`, background: T.bgDeep, flexWrap: "wrap", minHeight: 38 }}>
        <TBtn title="Negrito (Ctrl+B)" onMouseDown={e => { e.preventDefault(); exec("bold"); }} T={T}>
          <strong style={{ fontSize: 13, color: T.t2 }}>B</strong>
        </TBtn>
        <TBtn title="Itálico (Ctrl+I)" onMouseDown={e => { e.preventDefault(); exec("italic"); }} T={T}>
          <em style={{ fontSize: 13, color: T.t2 }}>I</em>
        </TBtn>
        <TBtn title="Sublinhado (Ctrl+U)" onMouseDown={e => { e.preventDefault(); exec("underline"); }} T={T}>
          <u style={{ fontSize: 13, color: T.t2 }}>U</u>
        </TBtn>
        <TBtn title="Tachado" onMouseDown={e => { e.preventDefault(); exec("strikeThrough"); }} T={T}>
          <s style={{ fontSize: 13, color: T.t2 }}>S</s>
        </TBtn>
        {sep}
        <ColorPalette onColor={c => exec("foreColor", c)} T={T} />
        {sep}
        <TBtn title="Lista com marcadores" onMouseDown={e => { e.preventDefault(); exec("insertUnorderedList"); }} T={T}>
          <List size={14} style={{ color: T.t3 }} />
        </TBtn>
        <TBtn title="Lista numerada" onMouseDown={e => { e.preventDefault(); exec("insertOrderedList"); }} T={T}>
          <ListOrdered size={14} style={{ color: T.t3 }} />
        </TBtn>
        {sep}
        <TBtn title="Alinhar à esquerda" onMouseDown={e => { e.preventDefault(); exec("justifyLeft"); }} T={T}>
          <AlignLeft size={14} style={{ color: T.t3 }} />
        </TBtn>
        <TBtn title="Centralizar" onMouseDown={e => { e.preventDefault(); exec("justifyCenter"); }} T={T}>
          <AlignCenter size={14} style={{ color: T.t3 }} />
        </TBtn>
        <TBtn title="Alinhar à direita" onMouseDown={e => { e.preventDefault(); exec("justifyRight"); }} T={T}>
          <AlignRight size={14} style={{ color: T.t3 }} />
        </TBtn>
        {sep}
        <TBtn title="Limpar formatação" onMouseDown={e => { e.preventDefault(); exec("removeFormat"); }} T={T}>
          <Eraser size={14} style={{ color: T.t7 }} />
        </TBtn>
      </div>

      {/* Editable area */}
      <div style={{ position: "relative" }}>
        {empty && (
          <div style={{ position: "absolute", top: 12, left: 14, color: T.t9, fontSize: 14, pointerEvents: "none", fontFamily: "'Sora',sans-serif", lineHeight: 1.6 }}>
            O que você quer comunicar?
          </div>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={sync}
          style={{ minHeight: 120, padding: "12px 14px", color: T.t1, fontSize: 14, lineHeight: 1.6, outline: "none", background: T.bgCard, fontFamily: "'Sora',sans-serif", wordBreak: "break-word" }}
        />
      </div>
    </div>
  );
}

// ── Reaction Picker ── position:fixed escapes card overflow:hidden ─────────────
function ReactionPicker({ userReaction, onReact, T }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState({ bottom: 0, left: 0 });
  const hideTimer       = useRef(null);
  const btnRef          = useRef(null);
  const current         = userReaction ? REACTION_MAP[userReaction] : null;

  const computePos = () => {
    if (!btnRef.current) return;
    // Use getBoundingClientRect for exact viewport coords,
    // then portal to document.body so transforms on ancestors can't shift it
    const r = btnRef.current.getBoundingClientRect();
    setPos({ bottom: window.innerHeight - r.top + 8, left: Math.round(r.left + r.width / 2) });
  };

  const show = () => { clearTimeout(hideTimer.current); computePos(); setOpen(true); };
  const hide = () => { hideTimer.current = setTimeout(() => setOpen(false), 350); };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);

  const popup = open && (
    <div
      onMouseEnter={show} onMouseLeave={hide}
      style={{ position: "fixed", bottom: pos.bottom, left: pos.left, transform: "translateX(-50%)", display: "flex", alignItems: "flex-end", gap: 2, background: T.bgSidebar, border: `1px solid ${T.borderSubtle}`, borderRadius: 40, padding: "8px 10px", boxShadow: "0 4px 20px rgba(0,0,0,0.18)", zIndex: 99999 }}>
      {REACTIONS.map(r => (
        <button
          key={r.id}
          onClick={() => { onReact(r.id); setOpen(false); }}
          onMouseEnter={e => { e.currentTarget.style.fontSize = "34px"; }}
          onMouseLeave={e => { e.currentTarget.style.fontSize = "26px"; }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 3px", outline: "none", fontSize: 26, lineHeight: 1, transition: "font-size 0.12s cubic-bezier(0.34,1.56,0.64,1)", filter: userReaction === r.id ? `drop-shadow(0 0 4px ${r.color}88)` : "none", transform: userReaction === r.id ? "scale(1.15)" : "scale(1)" }}>
          {r.emoji}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div ref={btnRef} onMouseEnter={show} onMouseLeave={hide} style={{ display: "inline-flex" }}>
        <button
          onClick={() => onReact(current ? current.id : "like")}
          style={{ display: "flex", alignItems: "center", gap: 6, border: "none", cursor: "pointer", padding: "5px 10px", borderRadius: 20, fontFamily: "inherit", background: current ? current.color + "14" : T.bgDeep, transition: "background 0.15s" }}>
          <span style={{ fontSize: 15, lineHeight: 1 }}>{current ? current.emoji : "👍"}</span>
          <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", color: current ? current.color : T.t8, fontWeight: current ? 700 : 400 }}>
            {current ? current.label : "Curtir"}
          </span>
        </button>
      </div>
      {typeof document !== "undefined" && createPortal(popup, document.body)}
    </>
  );
}

// ── Reaction Summary ──────────────────────────────────────────────────────────
function ReactionSummary({ byEmoji, reactionCount, T }) {
  const [showPanel, setShowPanel] = useState(false);
  const [panelPos, setPanelPos]   = useState({ bottom: 0, left: 0 });
  const btnRef                    = useRef(null);

  const openPanel = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPanelPos({ bottom: window.innerHeight - r.top + 8, left: r.left });
    setShowPanel(true);
  };

  useEffect(() => {
    if (!showPanel) return;
    const close = (e) => { if (btnRef.current && !btnRef.current.contains(e.target)) setShowPanel(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showPanel]);

  if (reactionCount === 0) return null;

  const sorted    = Object.entries(byEmoji).sort((a, b) => b[1].length - a[1].length);
  const topEmojis = sorted.slice(0, 3);

  return (
    <>
      <button ref={btnRef} onClick={() => showPanel ? setShowPanel(false) : openPanel()}
        style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", padding: "3px 6px", borderRadius: 12, color: T.t7, fontSize: 13, fontVariantNumeric: "tabular-nums", fontFamily: "inherit" }}>
        <span style={{ display: "flex" }}>
          {topEmojis.map(([id]) => (
            <span key={id} style={{ fontSize: 14, lineHeight: 1, marginRight: -2 }}>{REACTION_MAP[id]?.emoji}</span>
          ))}
        </span>
        <span style={{ marginLeft: 4 }}>{reactionCount}</span>
      </button>
      {typeof document !== "undefined" && createPortal(
        showPanel ? (
          <div style={{ position: "fixed", bottom: panelPos.bottom, left: panelPos.left, background: T.bgSidebar, border: `1px solid ${T.borderSubtle}`, borderRadius: 12, padding: "10px 14px", minWidth: 180, maxWidth: 260, boxShadow: "0 4px 20px rgba(0,0,0,0.18)", zIndex: 99999 }}>
            {sorted.map(([id, users]) => (
              <div key={id} style={{ marginBottom: 8, display: "flex", alignItems: "flex-start", gap: 6 }}>
                <span style={{ fontSize: 16, flexShrink: 0, lineHeight: "18px" }}>{REACTION_MAP[id]?.emoji}</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.t5, marginBottom: 2 }}>{REACTION_MAP[id]?.label} · {users.length}</div>
                  <div style={{ fontSize: 11, color: T.t7, lineHeight: 1.5 }}>{users.map(u => u.fullName).join(", ")}</div>
                </div>
              </div>
            ))}
          </div>
        ) : null,
        document.body
      )}
    </>
  );
}

// ── Comment Section ───────────────────────────────────────────────────────────
function CommentSection({ postId, commentCount, setCommentCount, currentUser, T }) {
  const [comments, setComments] = useState([]);
  const [loaded, setLoaded]     = useState(false);
  const [text, setText]         = useState("");
  const [sending, setSending]   = useState(false);
  const inputRef                = useRef(null);

  useEffect(() => {
    api.get(`/mural/${postId}/comments`)
      .then(r => { setComments(r.data || []); setLoaded(true); })
      .catch(() => setLoaded(true));
    setTimeout(() => inputRef.current?.focus(), 150);
  }, [postId]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const r = await api.post(`/mural/${postId}/comments`, { content: text.trim() });
      setComments(prev => [...prev, r.data]);
      setCommentCount(c => c + 1);
      setText("");
    } catch {}
    setSending(false);
  };

  const handleDelete = async (commentId) => {
    await api.delete(`/mural/${postId}/comments/${commentId}`);
    setComments(prev => prev.filter(c => c.id !== commentId));
    setCommentCount(c => Math.max(0, c - 1));
  };

  const canManage = (c) => c.author?.id === currentUser.id || ["hr", "ti", "gerencia"].includes(currentUser.role);

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: comments.length > 0 ? 14 : 0 }}>
        {!loaded && <div style={{ fontSize: 12, color: T.t9, padding: "4px 0" }}>Carregando...</div>}
        {comments.map(c => (
          <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Avatar name={c.author?.fullName} size={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ background: T.bgDeep, borderRadius: 12, borderTopLeftRadius: 4, padding: "8px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.t2 }}>{c.author?.fullName}</span>
                  {roleBadge(c.author?.role) && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 10, background: T.accent + "22", color: T.accent }}>{roleBadge(c.author?.role)}</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: T.t3, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.content}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, paddingLeft: 4 }}>
                <span style={{ fontSize: 10, color: T.t10 }}>{timeAgo(c.createdAt)}</span>
                {c.editedAt && <span style={{ fontSize: 10, color: T.t10 }}>· editado</span>}
                {canManage(c) && (
                  <button onClick={() => handleDelete(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.t10, padding: "1px 4px", borderRadius: 4, fontSize: 10, fontFamily: "inherit" }}>excluir</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <Avatar name={currentUser.full_name || currentUser.fullName} size={28} />
        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 6, background: T.bgDeep, borderRadius: 20, padding: "6px 6px 6px 14px", border: `1px solid ${T.borderSubtle}` }}>
          <textarea ref={inputRef} value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Escreva um comentário..." rows={1}
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: T.t1, fontSize: 13, fontFamily: "inherit", resize: "none", lineHeight: 1.5, maxHeight: 80, overflowY: "auto", padding: 0, margin: 0 }}
          />
          <button onClick={handleSend} disabled={!text.trim() || sending}
            style={{ background: text.trim() ? T.accent : "transparent", border: "none", cursor: text.trim() ? "pointer" : "default", borderRadius: 20, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}>
            <Send size={13} style={{ color: text.trim() ? "#fff" : T.t9 }} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Poll Block ────────────────────────────────────────────────────────────────
function PollBlock({ post, onVote, T }) {
  const [openVoters, setOpenVoters] = useState(null);
  const total        = post.pollVotes ? post.pollVotes.reduce((a, b) => a + b, 0) : 0;
  const voted        = post.userVote !== null && post.userVote !== undefined;
  const hasVoterData = Array.isArray(post.pollVoters);

  function toggleVoters(i, e) {
    e.stopPropagation();
    setOpenVoters(prev => prev === i ? null : i);
  }

  return (
    <div style={{ background: T.bgDeep, borderRadius: 10, padding: "14px 16px", marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.t2, marginBottom: 12 }}>{post.pollQuestion}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(post.pollOptions || []).map((opt, i) => {
          const votes      = post.pollVotes?.[i] ?? 0;
          const pct        = total > 0 ? Math.round((votes / total) * 100) : 0;
          const isChosen   = post.userVote === i;
          const voters     = post.pollVoters?.[i] || [];
          const votersOpen = openVoters === i;
          return (
            <div key={i}>
              <div onClick={() => !voted && onVote(i)}
                style={{ position: "relative", overflow: "hidden", borderRadius: 8, border: `1px solid ${isChosen ? T.accent + "88" : T.border}`, background: isChosen ? T.accent + "14" : T.bgCard, padding: "9px 14px", cursor: voted ? "default" : "pointer", transition: "border-color 0.15s" }}>
                {voted && <div style={{ position: "absolute", inset: 0, background: T.accent + "18", width: pct + "%", transition: "width 0.4s ease" }} />}
                <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {isChosen && <Check size={13} style={{ color: T.accent, flexShrink: 0 }} />}
                    <span style={{ fontSize: 13, color: T.t2, fontWeight: isChosen ? 700 : 400 }}>{opt}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {voted && <span style={{ fontSize: 12, color: T.t7, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>}
                    {hasVoterData && voted && (
                      <button onClick={e => toggleVoters(i, e)} style={{ display: "flex", alignItems: "center", gap: 4, background: votersOpen ? T.accent + "22" : T.bgControl, border: "none", borderRadius: 20, padding: "2px 8px 2px 6px", cursor: "pointer", color: votersOpen ? T.accent : T.t7, fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
                        <Users size={11} />&nbsp;{votes}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {hasVoterData && votersOpen && (
                <div style={{ marginTop: 4, padding: "10px 12px", background: T.bgCard, borderRadius: 8, border: `1px solid ${T.border}` }}>
                  {voters.length === 0 ? (
                    <span style={{ fontSize: 12, color: T.t9 }}>Nenhum voto ainda</span>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
                      {voters.map((v, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: T.t3 }}>
                          <div style={{ width: 20, height: 20, borderRadius: "50%", background: T.accent + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: T.accent, flexShrink: 0 }}>
                            {(v.fullName || "?").charAt(0).toUpperCase()}
                          </div>
                          <span>{v.fullName}</span>
                          {v.dept && <span style={{ color: T.t9, fontSize: 10 }}>&nbsp;· {v.dept}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {voted && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <span style={{ fontSize: 11, color: T.t9 }}>{hasVoterData ? "Clique em 👥 para ver os votos" : ""}</span>
          <span style={{ fontSize: 11, color: T.t9 }}>{total} voto{total !== 1 ? "s" : ""}</span>
        </div>
      )}
    </div>
  );
}

// ── Post Card ─────────────────────────────────────────────────────────────────
function PostCard({ post, currentUser, onReact, onVote, onDelete, onEdit, onToggleComments, T }) {
  const canManage      = post.author?.id === currentUser.id || ["hr", "ti", "gerencia"].includes(currentUser.role);
  const embed          = extractVideoEmbed(post.mediaUrl);
  const [editing, setEditing]           = useState(false);
  const [editHtml, setEditHtml]         = useState(post.content);
  const [saving, setSaving]             = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount || 0);
  const commentsOn                      = post.commentsEnabled !== false;

  useEffect(() => { setCommentCount(post.commentCount || 0); }, [post.commentCount]);

  const startEdit  = () => { setEditHtml(post.content); setEditing(true); };
  const cancelEdit = () => setEditing(false);
  const saveEdit   = async () => {
    const text = htmlToText(editHtml);
    if (!text) return;
    setSaving(true);
    try { await onEdit(post.id, editHtml); setEditing(false); } catch {}
    setSaving(false);
  };

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 18px 0" }}>
        <Avatar name={post.author?.fullName} size={38} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: T.t1 }}>{post.author?.fullName || "—"}</span>
            {roleBadge(post.author?.role) && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: T.accent + "22", color: T.accent }}>{roleBadge(post.author?.role)}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: T.t9, marginTop: 1, display: "flex", alignItems: "center", gap: 6 }}>
            {post.author?.dept && <span>{post.author.dept} · </span>}
            {timeAgo(post.createdAt)}
            {post.editedAt && <span style={{ color: T.t10 }}>· editado</span>}
          </div>
        </div>
        {canManage && !editing && (
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={startEdit} style={{ background: "none", border: "none", cursor: "pointer", color: T.t10, padding: 4, borderRadius: 6, display: "flex", alignItems: "center" }}><Pencil size={14} /></button>
            <button onClick={() => onDelete(post.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.t10, padding: 4, borderRadius: 6, display: "flex", alignItems: "center" }}><Trash2 size={14} /></button>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: "12px 18px 0" }}>
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <RichEditor
              key={post.id + "_edit"}
              initialValue={post.content}
              onChange={setEditHtml}
              T={T}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={cancelEdit} style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent", color: T.t7, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>Cancelar</button>
              <button onClick={saveEdit} disabled={saving || !htmlToText(editHtml)} style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: T.accent, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6 }}>
                {saving ? "Salvando..." : <><Check size={13} /> Salvar</>}
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{ fontSize: 14, color: T.t3, lineHeight: 1.6, wordBreak: "break-word" }}
            dangerouslySetInnerHTML={{ __html: renderContent(post.content) }}
          />
        )}
      </div>

      {post.mediaType === "image" && post.mediaUrl && (
        <div style={{ marginTop: 12 }}>
          <img src={post.mediaUrl} alt="" style={{ width: "100%", height: "auto", display: "block" }} onError={e => { e.target.style.display = "none"; }} />
        </div>
      )}

      {post.mediaType === "video" && embed && (
        <div style={{ marginTop: 12, position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden" }}>
          <iframe src={embed} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="video" />
        </div>
      )}

      {post.pollQuestion && (
        <div style={{ padding: "0 18px" }}>
          <PollBlock post={post} onVote={(i) => onVote(post.id, i)} T={T} />
        </div>
      )}

      {post.reactionCount > 0 && (
        <div style={{ padding: "8px 18px 0" }}>
          <ReactionSummary byEmoji={post.byEmoji || {}} reactionCount={post.reactionCount} T={T} />
        </div>
      )}

      {/* Footer row */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "10px 18px 14px", marginTop: 6, borderTop: `1px solid ${T.borderSubtle}` }}>
        <ReactionPicker userReaction={post.userReaction} onReact={(emoji) => onReact(post.id, emoji)} T={T} />

        {commentsOn ? (
          <button onClick={() => setCommentsOpen(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, border: "none", cursor: "pointer", padding: "5px 10px", borderRadius: 20, fontFamily: "inherit", background: commentsOpen ? T.accent + "14" : T.bgDeep, transition: "background 0.15s" }}>
            <MessageCircle size={15} style={{ color: commentsOpen ? T.accent : T.t8 }} />
            <span style={{ fontSize: 13, color: commentsOpen ? T.accent : T.t8, fontVariantNumeric: "tabular-nums" }}>
              {commentCount > 0 ? commentCount : "Comentar"}
            </span>
          </button>
        ) : (
          <span style={{ fontSize: 12, color: T.t10, display: "flex", alignItems: "center", gap: 4, padding: "5px 10px" }}>
            <Lock size={12} style={{ color: T.t10 }} />Comentários desativados
          </span>
        )}

        <div style={{ flex: 1 }} />

        {canManage && (
          <button onClick={() => onToggleComments(post.id, !commentsOn)} title={commentsOn ? "Desativar comentários" : "Ativar comentários"}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6, display: "flex", alignItems: "center", color: commentsOn ? T.t10 : T.accent }}>
            {commentsOn ? <LockOpen size={14} /> : <Lock size={14} />}
          </button>
        )}

        {post.viewCount > 0 && (
          <span style={{ fontSize: 11, color: T.t10, fontVariantNumeric: "tabular-nums" }}>
            {post.viewCount} {post.viewCount === 1 ? "pessoa viu" : "pessoas viram"}
          </span>
        )}
      </div>

      {/* Comment thread — full width below footer */}
      {commentsOn && commentsOpen && (
        <div style={{ borderTop: `1px solid ${T.borderSubtle}`, padding: "12px 18px 16px" }}>
          <CommentSection postId={post.id} commentCount={commentCount} setCommentCount={setCommentCount} currentUser={currentUser} T={T} />
        </div>
      )}
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MuralPage() {
  const { user }     = useAuth();
  const { theme: T } = useTheme();
  const [posts, setPosts]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [flash, setFlash]         = useState("");

  const EMPTY_FORM = { content: "", mediaMode: "none", imageFile: null, videoUrl: "", pollOn: false, pollQuestion: "", pollOptions: ["", ""], commentsEnabled: true };
  const [form, setForm]       = useState(EMPTY_FORM);
  const [posting, setPosting] = useState(false);
  const fileRef               = useRef(null);

  const canPost = CAN_POST_ROLES.includes(user.role);

  const fetchPosts = useCallback(async () => {
    try { const r = await api.get("/mural"); setPosts(r.data || []); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const showFlash = (msg) => { setFlash(msg); setTimeout(() => setFlash(""), 4000); };

  const handleReact = async (postId, emoji) => {
    const r = await api.post(`/mural/${postId}/react`, { emoji });
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, userReaction: r.data.userReaction, reactionCount: r.data.reactionCount, byEmoji: r.data.byEmoji } : p));
  };

  const handleVote = async (postId, optionIndex) => {
    const r = await api.post(`/mural/${postId}/vote`, { optionIndex });
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, userVote: r.data.optionIndex, pollVotes: r.data.votes } : p));
  };

  const handleDelete = async (postId) => {
    if (!window.confirm("Excluir esta publicação?")) return;
    await api.delete(`/mural/${postId}`);
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const handleEdit = async (postId, content) => {
    const r = await api.patch(`/mural/${postId}`, { content });
    setPosts(prev => prev.map(p => p.id === postId ? r.data : p));
  };

  const handleToggleComments = async (postId, enabled) => {
    const r = await api.patch(`/mural/${postId}`, { commentsEnabled: enabled });
    setPosts(prev => prev.map(p => p.id === postId ? r.data : p));
  };

  const handleSubmit = async () => {
    if (!htmlToText(form.content)) return;
    setPosting(true);
    try {
      const fd = new FormData();
      fd.append("content", form.content);
      fd.append("commentsEnabled", form.commentsEnabled ? "true" : "false");
      if (form.mediaMode === "image" && form.imageFile) fd.append("image", form.imageFile);
      else if (form.mediaMode === "video" && form.videoUrl.trim()) fd.append("videoUrl", form.videoUrl.trim());
      if (form.pollOn && form.pollQuestion.trim()) {
        const opts = form.pollOptions.filter(o => o.trim());
        if (opts.length >= 2) { fd.append("pollQuestion", form.pollQuestion.trim()); fd.append("pollOptions", JSON.stringify(opts)); }
      }
      const r = await api.post("/mural", fd);
      setPosts(prev => [r.data, ...prev]);
      setShowModal(false);
      setForm(EMPTY_FORM);
      showFlash("Publicação criada!");
    } catch (e) {
      showFlash("Erro: " + (e.response?.data?.error || e.message));
    } finally {
      setPosting(false);
    }
  };

  const addPollOption    = () => setForm(f => ({ ...f, pollOptions: [...f.pollOptions, ""] }));
  const removePollOption = (i) => setForm(f => ({ ...f, pollOptions: f.pollOptions.filter((_, idx) => idx !== i) }));
  const setPollOption    = (i, v) => setForm(f => { const o = [...f.pollOptions]; o[i] = v; return { ...f, pollOptions: o }; });
  const formValid = htmlToText(form.content).length > 0 &&
    (!form.pollOn || (form.pollQuestion.trim() && form.pollOptions.filter(o => o.trim()).length >= 2));

  return (
    <div style={{ padding: 28, overflowY: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}>
      <style>{`.mural-scroller::-webkit-scrollbar{display:none}`}</style>

      {/* Header — full width, left-aligned */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: T.t1, margin: 0, display: "flex", alignItems: "center", gap: 11 }}><span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", background: T.accent + "1f", color: T.accent, flexShrink: 0 }}><Newspaper size={18} /></span>Mural de Avisos</h1>
          <p style={{ color: T.t8, fontSize: 13, margin: "4px 0 0" }}>Comunicados e atualizações da empresa</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {flash && (
            <div style={{ padding: "8px 14px", background: flash.startsWith("Erro") ? T.red + "18" : T.green + "18", border: `1px solid ${flash.startsWith("Erro") ? T.red : T.green}44`, borderRadius: 8, fontSize: 12, color: flash.startsWith("Erro") ? T.red : T.green, fontWeight: 600 }}>
              {flash}
            </div>
          )}
          {canPost && <Btn icon={<Plus size={14} />} onClick={() => { setForm(EMPTY_FORM); setShowModal(true); }}>Publicar</Btn>}
        </div>
      </div>

      {/* Posts — centered */}
      {loading ? (
        <div style={{ padding: 60, color: T.t9 }}>Carregando...</div>
      ) : posts.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 60, maxWidth: 760, margin: "0 auto" }}>
          <Newspaper size={40} style={{ color: T.t9, marginBottom: 12 }} />
          <div style={{ fontSize: 14, color: T.t8 }}>Nenhuma publicação ainda</div>
          {canPost && <div style={{ fontSize: 12, color: T.t10, marginTop: 6 }}>Clique em "Publicar" para criar o primeiro aviso</div>}
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760, margin: "0 auto" }}>
          {posts.map(p => (
            <PostCard key={p.id} post={p} currentUser={user} onReact={handleReact} onVote={handleVote} onDelete={handleDelete} onEdit={handleEdit} onToggleComments={handleToggleComments} T={T} />
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nova Publicação" width={580}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Rich text editor — key=showModal forces remount each time modal opens */}
          <RichEditor
            key={String(showModal)}
            onChange={html => setForm(f => ({ ...f, content: html }))}
            T={T}
          />

          <div style={{ display: "flex", gap: 8 }}>
            {[{ mode: "none", label: "Sem mídia" }, { mode: "image", label: "Imagem", icon: <Image size={13} /> }, { mode: "video", label: "Vídeo URL", icon: <Link size={13} /> }].map(({ mode, label, icon }) => (
              <button key={mode} onClick={() => setForm(f => ({ ...f, mediaMode: mode, imageFile: null, videoUrl: "" }))}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: `1px solid ${form.mediaMode === mode ? T.accent : T.border}`, background: form.mediaMode === mode ? T.accent + "18" : T.bgCard, color: form.mediaMode === mode ? T.accent : T.t7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}>
                {icon}{label}
              </button>
            ))}
          </div>

          {form.mediaMode === "image" && (
            <div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => setForm(f => ({ ...f, imageFile: e.target.files[0] || null }))} />
              <div onClick={() => fileRef.current.click()} style={{ border: `2px dashed ${T.border}`, borderRadius: 10, padding: "24px 16px", textAlign: "center", cursor: "pointer" }}>
                {form.imageFile ? (
                  <div style={{ fontSize: 13, color: T.green, fontWeight: 600 }}>✓ {form.imageFile.name} <span style={{ color: T.t9, fontWeight: 400 }}>({(form.imageFile.size / 1024 / 1024).toFixed(1)} MB)</span></div>
                ) : (
                  <div style={{ fontSize: 13, color: T.t8 }}><Image size={20} style={{ marginBottom: 6, display: "block", margin: "0 auto 6px" }} />Clique para selecionar uma imagem</div>
                )}
              </div>
            </div>
          )}

          {form.mediaMode === "video" && (
            <input value={form.videoUrl} onChange={e => setForm(f => ({ ...f, videoUrl: e.target.value }))} placeholder="https://www.youtube.com/watch?v=..."
              style={{ width: "100%", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 14px", color: T.t1, fontSize: 13, fontFamily: "'Sora',sans-serif", outline: "none" }} />
          )}

          <div style={{ background: T.bgDeep, borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 0 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={form.pollOn} onChange={e => setForm(f => ({ ...f, pollOn: e.target.checked }))} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: T.t4 }}><BarChart2 size={14} />Adicionar enquete</div>
            </label>
            {form.pollOn && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={form.pollQuestion} onChange={e => setForm(f => ({ ...f, pollQuestion: e.target.value }))} placeholder="Pergunta da enquete *"
                  style={{ width: "100%", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", color: T.t1, fontSize: 13, fontFamily: "'Sora',sans-serif", outline: "none" }} />
                {form.pollOptions.map((opt, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input value={opt} onChange={e => setPollOption(i, e.target.value)} placeholder={`Opção ${i + 1}${i < 2 ? " *" : ""}`}
                      style={{ flex: 1, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 12px", color: T.t1, fontSize: 13, fontFamily: "'Sora',sans-serif", outline: "none" }} />
                    {i >= 2 && <button onClick={() => removePollOption(i)} style={{ background: "none", border: "none", cursor: "pointer", color: T.t9, padding: 4 }}><X size={14} /></button>}
                  </div>
                ))}
                {form.pollOptions.length < 5 && (
                  <button onClick={addPollOption} style={{ background: "none", border: `1px dashed ${T.border}`, borderRadius: 8, padding: "7px 12px", color: T.t9, fontSize: 12, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}>+ Adicionar opção</button>
                )}
              </div>
            )}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={form.commentsEnabled} onChange={e => setForm(f => ({ ...f, commentsEnabled: e.target.checked }))} />
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: T.t4 }}>
              <MessageCircle size={14} />Permitir comentários
            </div>
          </label>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Btn>
            <Btn icon={<Plus size={14} />} onClick={handleSubmit} disabled={!formValid || posting}>
              {posting ? "Publicando..." : "Publicar"}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
