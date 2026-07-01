import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Bell, Umbrella, ArrowLeftRight, CheckCheck, X, Newspaper, FileText, ClipboardList, Cake } from "lucide-react";
import { useNotifications } from "../hooks/useNotifications";

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "agora";
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

const TYPE_META = {
  mural_post:   { Icon: Newspaper,      color: "#10B981", label: "Mural",        page: "mural"  },
  mural_comment: { Icon: Newspaper,      color: "#06B6D4", label: "Comentário",    page: "mural"  },
  form_new:      { Icon: ClipboardList,  color: "#6366F1", label: "Formulário",    page: "forms"  },
  document_new: { Icon: FileText,  color: "#3B82F6", label: "Documento", page: "documents" },
  vacation_reminder: { Icon: Umbrella,       color: "#A78BFA", label: "Lembrete Férias", page: "vacations" },
  vacation_pending:  { Icon: Umbrella,       color: "#F59E0B", label: "Férias Pendente",  page: "vacations" },
  swap_pending:      { Icon: ArrowLeftRight, color: "#3B82F6", label: "Troca Pendente",   page: "swaps"     },
  birthday:          { Icon: Cake,           color: "#EC4899", label: "Aniversário",      page: "birthdays" },
};
function getMeta(type) {
  return TYPE_META[type] || { Icon: Bell, color: "#94a3b8", label: "Notificação", page: null };
}

export default function NotificationBell({ T, setActive }) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open,    setOpen]    = useState(false);
  const [tab,     setTab]     = useState("unread");
  const [pos,     setPos]     = useState({ top: 0, left: 0 });
  const [hovered, setHovered] = useState(false);
  const buttonRef = useRef(null);
  const panelRef  = useRef(null);

  const handleToggle = useCallback(() => {
    if (!open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      const panelH = 480;
      const rawTop = r.top;
      const top    = rawTop + panelH > window.innerHeight - 8
        ? window.innerHeight - panelH - 8
        : rawTop;
      setPos({ top: Math.max(8, top), left: r.right + 10 });
    }
    setOpen(o => !o);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        panelRef.current  && !panelRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Switch to "all" tab when inbox empties
  useEffect(() => {
    if (unreadCount === 0 && tab === "unread") setTab("all");
  }, [unreadCount, tab]);

  const handleItem = useCallback((n) => {
    if (!n.read) markRead(n.id);
    const { page } = getMeta(n.type);
    if (page && setActive) { setActive(page); setOpen(false); }
  }, [markRead, setActive]);

  const displayed = tab === "unread"
    ? notifications.filter(n => !n.read)
    : notifications;

  // ── Panel markup ──────────────────────────────────────────────────────────
  const panel = open ? (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top:  pos.top,
        left: pos.left,
        width: 380,
        maxHeight: 480,
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        boxShadow: "0 16px 48px rgba(0,0,0,0.36), 0 2px 8px rgba(0,0,0,0.18)",
        zIndex: 99999,          // highest possible — portal renders at body
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Bell size={14} color={T.accent} />
          <span style={{ fontSize: 14, fontWeight: 700, color: T.t1 }}>Notificações</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {unreadCount > 0 && (
            <button onClick={markAllRead} style={{
              display: "flex", alignItems: "center", gap: 4,
              fontSize: 11, color: T.t7, background: "none", border: "none",
              cursor: "pointer", fontFamily: "'Sora',sans-serif", fontWeight: 500,
              padding: "3px 6px", borderRadius: 5,
            }}>
              <CheckCheck size={12} /> Marcar lidas
            </button>
          )}
          <button onClick={() => setOpen(false)} style={{
            background: "none", border: "none", cursor: "pointer",
            color: T.t8, display: "flex", alignItems: "center", padding: 3, borderRadius: 5,
          }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", margin: "10px 16px 0", borderBottom: `1px solid ${T.borderSubtle}` }}>
        {[
          ["unread", `Não lidas${unreadCount > 0 ? ` (${unreadCount})` : ""}`],
          ["all",    `Todas (${notifications.length})`],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: "6px 14px", border: "none", background: "none",
            cursor: "pointer", fontSize: 12, fontFamily: "'Sora',sans-serif",
            color: tab === id ? T.accent : T.t7,
            fontWeight: tab === id ? 700 : 400,
            borderBottom: tab === id ? `2px solid ${T.accent}` : "2px solid transparent",
            marginBottom: -1, transition: "color 0.12s, border-color 0.12s",
          }}>{label}</button>
        ))}
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {displayed.length === 0 ? (
          <div style={{
            padding: "36px 20px", textAlign: "center",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: T.bgDeep, border: `1px solid ${T.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Bell size={20} color={T.t5} style={{ opacity: 0.3 }} />
            </div>
            <span style={{ fontSize: 13, color: T.t8 }}>
              {tab === "unread" ? "Nenhuma notificação não lida" : "Sem notificações"}
            </span>
          </div>
        ) : (
          displayed.map(n => {
            const { Icon, color, label, page } = getMeta(n.type);
            return (
              <div
                key={n.id}
                onClick={() => handleItem(n)}
                style={{
                  display: "flex", gap: 12, padding: "12px 16px",
                  borderBottom: `1px solid ${T.borderSubtle}`,
                  background: !n.read ? T.accent + "0a" : "transparent",
                  cursor: page ? "pointer" : "default",
                  transition: "background 0.1s",
                  alignItems: "flex-start",
                }}
                onMouseEnter={e => { if (page) e.currentTarget.style.background = T.accent + "14"; }}
                onMouseLeave={e => { e.currentTarget.style.background = !n.read ? T.accent + "0a" : "transparent"; }}
              >
                {/* Icon */}
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: color + "18", border: `1px solid ${color}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginTop: 2,
                }}>
                  <Icon size={14} color={color} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, justifyContent: "space-between" }}>
                    <span style={{
                      fontSize: 12.5, fontWeight: n.read ? 500 : 700,
                      color: T.t1, lineHeight: 1.4, flex: 1,
                    }}>
                      {n.title}
                    </span>
                    {!n.read && (
                      <span style={{ width: 7, height: 7, borderRadius: 99, background: T.accent, flexShrink: 0, marginTop: 5 }} />
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.t6, marginTop: 3, lineHeight: 1.5 }}>
                    {n.body}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em",
                      color: color, background: color + "18",
                      padding: "1px 6px", borderRadius: 4,
                    }}>{label}</span>
                    <span style={{ fontSize: 10, color: T.t10, fontVariantNumeric: "tabular-nums" }}>
                      {timeAgo(n.created_at)}
                    </span>
                    {page && (
                      <span style={{ fontSize: 10, color: T.accent, marginLeft: "auto" }}>
                        Ver →
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${T.borderSubtle}`, textAlign: "center" }}>
          <span style={{ fontSize: 11, color: T.t10 }}>
            {notifications.length} notificações · {unreadCount} não lidas
          </span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Bell button */}
      <button
        className="ss-navitem"
        ref={buttonRef}
        onClick={handleToggle}
        title="Notificações"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex", alignItems: "center", gap: 9, width: "100%",
          padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer",
          background: open
            ? `linear-gradient(90deg, ${T.accent}22 0%, ${T.accent}08 100%)`
            : hovered ? T.bgSelected : "transparent",
          color: open ? T.accent : hovered ? T.t3 : T.t7,
          fontSize: 12.5, fontWeight: open ? 700 : 400,
          marginBottom: 1, textAlign: "left", transition: "background 0.12s, color 0.12s, border-color 0.12s",
          fontFamily: "'Sora', sans-serif",
          borderLeft: open ? `3px solid ${T.accent}` : "3px solid transparent",
          paddingLeft: open ? 8 : 10,
        }}
      >
        <span style={{
          position: "relative", flexShrink: 0, display: "flex", alignItems: "center",
          opacity: open ? 1 : hovered ? 0.9 : 0.65, transition: "opacity 0.12s",
        }}>
          <Bell size={15} />
          {unreadCount > 0 && (
            <span style={{
              position: "absolute", top: -5, right: -6,
              background: "#E24B4A", color: "#fff",
              borderRadius: 99, fontSize: 8, fontWeight: 800,
              minWidth: 14, height: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 3px", lineHeight: 1,
              boxShadow: "0 0 0 2px " + T.bgSidebar,
            }}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </span>
        <span className="ss-label" style={{ flex: 1 }}>Notificações</span>
      </button>

      {/* Portal — renders at document.body, always on top */}
      {createPortal(panel, document.body)}
    </div>
  );
}
