import React, { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Heart, Trash2, BarChart2, Image, Link, X, Check, Newspaper, Pencil } from "lucide-react";
import { Card, Btn, Modal, Avatar } from "../components/UI";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";

const CAN_POST_ROLES = ["leader", "hr", "ti", "gerencia"];

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "-03:00")).getTime()) / 1000;
  if (diff < 60)   return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
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

function PollBlock({ post, onVote, T }) {
  const total = post.pollVotes ? post.pollVotes.reduce((a, b) => a + b, 0) : 0;
  const voted = post.userVote !== null && post.userVote !== undefined;

  return (
    <div style={{ background: T.bgDeep, borderRadius: 10, padding: "14px 16px", marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.t2, marginBottom: 12 }}>{post.pollQuestion}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(post.pollOptions || []).map((opt, i) => {
          const votes = post.pollVotes?.[i] ?? 0;
          const pct   = total > 0 ? Math.round((votes / total) * 100) : 0;
          const isChosen = post.userVote === i;
          return (
            <div key={i}
              onClick={() => !voted && onVote(i)}
              style={{
                position: "relative", overflow: "hidden", borderRadius: 8,
                border: `1px solid ${isChosen ? T.accent + "88" : T.border}`,
                background: isChosen ? T.accent + "14" : T.bgCard,
                padding: "9px 14px", cursor: voted ? "default" : "pointer",
                transition: "border-color 0.15s",
              }}>
              {voted && (
                <div style={{ position: "absolute", inset: 0, background: T.accent + "18", width: pct + "%", transition: "width 0.4s ease" }} />
              )}
              <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {isChosen && <Check size={13} style={{ color: T.accent, flexShrink: 0 }} />}
                  <span style={{ fontSize: 13, color: T.t2, fontWeight: isChosen ? 700 : 400 }}>{opt}</span>
                </div>
                {voted && <span style={{ fontSize: 12, color: T.t7, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>}
              </div>
            </div>
          );
        })}
      </div>
      {voted && <div style={{ fontSize: 11, color: T.t9, marginTop: 8, textAlign: "right" }}>{total} voto{total !== 1 ? "s" : ""}</div>}
    </div>
  );
}

function PostCard({ post, currentUser, onReact, onVote, onDelete, onEdit, T }) {
  const canManage = post.author?.id === currentUser.id || ["hr", "ti", "gerencia"].includes(currentUser.role);
  const canEdit   = post.author?.id === currentUser.id || ["hr", "ti", "gerencia"].includes(currentUser.role);
  const embed     = extractVideoEmbed(post.mediaUrl);
  const [editing, setEditing]   = useState(false);
  const [editText, setEditText] = useState(post.content);
  const [saving, setSaving]     = useState(false);
  const textareaRef = useRef(null);

  const startEdit = () => { setEditText(post.content); setEditing(true); setTimeout(() => textareaRef.current?.focus(), 50); };
  const cancelEdit = () => setEditing(false);
  const saveEdit = async () => {
    if (!editText.trim()) return;
    setSaving(true);
    try { await onEdit(post.id, editText.trim()); setEditing(false); } catch {}
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
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: T.accent + "22", color: T.accent }}>
                {roleBadge(post.author?.role)}
              </span>
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
            {canEdit && (
              <button onClick={startEdit} style={{ background: "none", border: "none", cursor: "pointer", color: T.t10, padding: 4, borderRadius: 6, display: "flex", alignItems: "center" }}>
                <Pencil size={14} />
              </button>
            )}
            <button onClick={() => onDelete(post.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.t10, padding: 4, borderRadius: 6, display: "flex", alignItems: "center" }}>
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Content / Edit area */}
      <div style={{ padding: "12px 18px 0" }}>
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              ref={textareaRef}
              value={editText}
              onChange={e => setEditText(e.target.value)}
              rows={4}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                border: `1px solid ${T.accent}66`, background: T.bgDeep,
                color: T.t1, fontSize: 14, fontFamily: "inherit",
                resize: "vertical", outline: "none", lineHeight: 1.6,
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={cancelEdit} style={{
                padding: "6px 14px", borderRadius: 7, border: `1px solid ${T.border}`,
                background: "transparent", color: T.t7, fontSize: 12, fontWeight: 600,
                fontFamily: "inherit", cursor: "pointer",
              }}>Cancelar</button>
              <button onClick={saveEdit} disabled={saving || !editText.trim()} style={{
                padding: "6px 14px", borderRadius: 7, border: "none",
                background: T.accent, color: "#fff", fontSize: 12, fontWeight: 700,
                fontFamily: "inherit", cursor: "pointer", opacity: saving ? 0.7 : 1,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                {saving ? "Salvando..." : <><Check size={13} /> Salvar</>}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 14, color: T.t3, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {post.content}
          </div>
        )}
      </div>

      {/* Image */}
      {post.mediaType === "image" && post.mediaUrl && (
        <div style={{ marginTop: 12, maxHeight: 420, overflow: "hidden" }}>
          <img src={post.mediaUrl} alt=""
            style={{ width: "100%", maxHeight: 420, objectFit: "cover", display: "block" }}
            onError={e => { e.target.style.display = "none"; }} />
        </div>
      )}

      {/* Video */}
      {post.mediaType === "video" && embed && (
        <div style={{ marginTop: 12, position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden" }}>
          <iframe src={embed}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen title="video" />
        </div>
      )}

      {/* Poll */}
      {post.pollQuestion && (
        <div style={{ padding: "0 18px" }}>
          <PollBlock post={post} onVote={(i) => onVote(post.id, i)} T={T} />
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px 14px", marginTop: 4, borderTop: `1px solid ${T.borderSubtle}` }}>
        <button onClick={() => onReact(post.id)} style={{
          display: "flex", alignItems: "center", gap: 6, border: "none",
          cursor: "pointer", padding: "5px 10px", borderRadius: 20,
          background: post.userReacted ? "#E24B4A14" : T.bgDeep, transition: "background 0.15s",
        }}>
          <Heart size={16} style={{ color: post.userReacted ? "#E24B4A" : T.t8, fill: post.userReacted ? "#E24B4A" : "none", transition: "all 0.15s" }} />
          <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", color: post.userReacted ? "#E24B4A" : T.t8, fontWeight: post.userReacted ? 700 : 400 }}>
            {post.reactionCount > 0 ? post.reactionCount : "Curtir"}
          </span>
        </button>
        {post.viewCount > 0 && (
          <span style={{ fontSize: 11, color: T.t10, fontVariantNumeric: "tabular-nums" }}>
            {post.viewCount} {post.viewCount === 1 ? "pessoa viu" : "pessoas viram"}
          </span>
        )}
      </div>
    </Card>
  );
}

export default function MuralPage() {
  const { user }    = useAuth();
  const { theme: T } = useTheme();
  const [posts, setPosts]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [flash, setFlash]         = useState("");

  const EMPTY_FORM = { content: "", mediaMode: "none", imageFile: null, videoUrl: "", pollOn: false, pollQuestion: "", pollOptions: ["", ""] };
  const [form, setForm] = useState(EMPTY_FORM);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef(null);

  const canPost = CAN_POST_ROLES.includes(user.role);

  const fetchPosts = useCallback(async () => {
    try {
      const r = await api.get("/mural");
      setPosts(r.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const showFlash = (msg) => { setFlash(msg); setTimeout(() => setFlash(""), 4000); };

  const handleReact = async (postId) => {
    const r = await api.post(`/mural/${postId}/react`);
    setPosts(prev => prev.map(p => p.id === postId
      ? { ...p, userReacted: r.data.reacted, reactionCount: r.data.count }
      : p
    ));
  };

  const handleVote = async (postId, optionIndex) => {
    const r = await api.post(`/mural/${postId}/vote`, { optionIndex });
    setPosts(prev => prev.map(p => p.id === postId
      ? { ...p, userVote: r.data.optionIndex, pollVotes: r.data.votes }
      : p
    ));
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

  const handleSubmit = async () => {
    if (!form.content.trim()) return;
    setPosting(true);
    try {
      const fd = new FormData();
      fd.append("content", form.content.trim());
      if (form.mediaMode === "image" && form.imageFile) {
        fd.append("image", form.imageFile);
      } else if (form.mediaMode === "video" && form.videoUrl.trim()) {
        fd.append("videoUrl", form.videoUrl.trim());
      }
      if (form.pollOn && form.pollQuestion.trim()) {
        const opts = form.pollOptions.filter(o => o.trim());
        if (opts.length >= 2) {
          fd.append("pollQuestion", form.pollQuestion.trim());
          fd.append("pollOptions", JSON.stringify(opts));
        }
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

  const addPollOption  = () => setForm(f => ({ ...f, pollOptions: [...f.pollOptions, ""] }));
  const removePollOption = (i) => setForm(f => ({ ...f, pollOptions: f.pollOptions.filter((_, idx) => idx !== i) }));
  const setPollOption  = (i, v) => setForm(f => { const o = [...f.pollOptions]; o[i] = v; return { ...f, pollOptions: o }; });

  const formValid = form.content.trim().length > 0 && (
    !form.pollOn || (form.pollQuestion.trim() && form.pollOptions.filter(o => o.trim()).length >= 2)
  );

  return (
    <div style={{ padding: 28, overflowY: "auto", maxWidth: 720, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: T.t1, margin: 0 }}>Mural de Avisos</h1>
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

      {/* Feed */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: T.t9 }}>Carregando...</div>
      ) : posts.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 60 }}>
          <Newspaper size={40} style={{ color: T.t9, marginBottom: 12 }} />
          <div style={{ fontSize: 14, color: T.t8 }}>Nenhuma publicação ainda</div>
          {canPost && <div style={{ fontSize: 12, color: T.t10, marginTop: 6 }}>Clique em "Publicar" para criar o primeiro aviso</div>}
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {posts.map(p => (
            <PostCard key={p.id} post={p} currentUser={user} onReact={handleReact} onVote={handleVote} onDelete={handleDelete} onEdit={handleEdit} T={T} />
          ))}
        </div>
      )}

      {/* Modal de publicação */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nova Publicação" width={560}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Texto */}
          <textarea
            value={form.content}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            placeholder="O que você quer comunicar?"
            autoFocus
            style={{ width: "100%", minHeight: 120, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", color: T.t1, fontSize: 14, resize: "vertical", fontFamily: "'Sora',sans-serif", outline: "none", lineHeight: 1.6 }}
          />

          {/* Tipo de mídia */}
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { mode: "none",  label: "Sem mídia" },
              { mode: "image", label: "Imagem",   icon: <Image size={13} /> },
              { mode: "video", label: "Vídeo URL", icon: <Link  size={13} /> },
            ].map(({ mode, label, icon }) => (
              <button key={mode}
                onClick={() => setForm(f => ({ ...f, mediaMode: mode, imageFile: null, videoUrl: "" }))}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                  borderRadius: 8, border: `1px solid ${form.mediaMode === mode ? T.accent : T.border}`,
                  background: form.mediaMode === mode ? T.accent + "18" : T.bgCard,
                  color: form.mediaMode === mode ? T.accent : T.t7,
                  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Sora',sans-serif",
                }}>
                {icon}{label}
              </button>
            ))}
          </div>

          {/* Upload de imagem */}
          {form.mediaMode === "image" && (
            <div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => setForm(f => ({ ...f, imageFile: e.target.files[0] || null }))}
              />
              <div onClick={() => fileRef.current.click()}
                style={{ border: `2px dashed ${T.border}`, borderRadius: 10, padding: "24px 16px", textAlign: "center", cursor: "pointer" }}>
                {form.imageFile ? (
                  <div style={{ fontSize: 13, color: T.green, fontWeight: 600 }}>
                    ✓ {form.imageFile.name}
                    <span style={{ color: T.t9, fontWeight: 400, marginLeft: 8 }}>({(form.imageFile.size / 1024 / 1024).toFixed(1)} MB)</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: T.t8 }}><Image size={20} style={{ marginBottom: 6, display: "block", margin: "0 auto 6px" }} />Clique para selecionar uma imagem</div>
                )}
              </div>
            </div>
          )}

          {/* URL de vídeo */}
          {form.mediaMode === "video" && (
            <input
              value={form.videoUrl}
              onChange={e => setForm(f => ({ ...f, videoUrl: e.target.value }))}
              placeholder="https://www.youtube.com/watch?v=..."
              style={{ width: "100%", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 14px", color: T.t1, fontSize: 13, fontFamily: "'Sora',sans-serif", outline: "none" }}
            />
          )}

          {/* Enquete */}
          <div style={{ background: T.bgDeep, borderRadius: 10, padding: "12px 14px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={form.pollOn} onChange={e => setForm(f => ({ ...f, pollOn: e.target.checked }))} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: T.t4 }}>
                <BarChart2 size={14} />Adicionar enquete
              </div>
            </label>

            {form.pollOn && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  value={form.pollQuestion}
                  onChange={e => setForm(f => ({ ...f, pollQuestion: e.target.value }))}
                  placeholder="Pergunta da enquete *"
                  style={{ width: "100%", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", color: T.t1, fontSize: 13, fontFamily: "'Sora',sans-serif", outline: "none" }}
                />
                {form.pollOptions.map((opt, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      value={opt}
                      onChange={e => setPollOption(i, e.target.value)}
                      placeholder={`Opção ${i + 1}${i < 2 ? " *" : ""}`}
                      style={{ flex: 1, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 12px", color: T.t1, fontSize: 13, fontFamily: "'Sora',sans-serif", outline: "none" }}
                    />
                    {i >= 2 && (
                      <button onClick={() => removePollOption(i)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: T.t9, padding: 4 }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
                {form.pollOptions.length < 5 && (
                  <button onClick={addPollOption}
                    style={{ background: "none", border: `1px dashed ${T.border}`, borderRadius: 8, padding: "7px 12px", color: T.t9, fontSize: 12, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}>
                    + Adicionar opção
                  </button>
                )}
              </div>
            )}
          </div>

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
