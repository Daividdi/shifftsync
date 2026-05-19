import React, { useState, useEffect, useRef, useCallback } from "react";
import { FolderOpen, Upload, X, FileText, Trash2, ChevronDown, ChevronRight, Eye, Search, Plus, Loader, Pencil, Users } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";

const CATEGORIES = ["Geral", "RH", "Operacional", "Qualidade", "Segurança", "TI", "Outros"];

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function inputStyle(T) {
  return {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    border: `1px solid ${T.border}`, background: T.bgDeep,
    color: T.t1, fontSize: 13, fontFamily: "inherit", outline: "none",
  };
}

function DocFormModal({ T, onClose, onSaved, existing }) {
  const isEdit = !!existing;
  const [title, setTitle] = useState(existing?.title || "");
  const [category, setCategory] = useState(existing?.category || "Geral");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef();

  const submit = async () => {
    if (!title.trim()) return setError("Título é obrigatório");
    if (!isEdit && !file) return setError("Selecione um arquivo PDF");
    setError("");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("category", category);
      if (file) fd.append("file", file);

      const { data } = isEdit
        ? await api.put(`/documents/${existing.id}`, fd)
        : await api.post("/documents", fd);
      onSaved(data, isEdit);
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#00000088", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16,
        padding: 28, width: 420, display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.t1 }}>
            {isEdit ? "Editar Documento" : "Novo Documento"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.t7, padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: T.t7, fontWeight: 600, marginBottom: 6, display: "block" }}>TÍTULO</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Ex: Código de Conduta 2025" style={inputStyle(T)} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: T.t7, fontWeight: 600, marginBottom: 6, display: "block" }}>CATEGORIA</label>
            <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputStyle(T), cursor: "pointer" }}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: T.t7, fontWeight: 600, marginBottom: 6, display: "block" }}>
              {isEdit ? "SUBSTITUIR PDF (opcional)" : "ARQUIVO PDF"}
            </label>
            <input type="file" accept="application/pdf" ref={fileRef} style={{ display: "none" }}
              onChange={e => setFile(e.target.files[0] || null)} />
            <button onClick={() => fileRef.current?.click()} style={{
              width: "100%", padding: "9px 12px", borderRadius: 8,
              border: `1px dashed ${file ? T.accent : T.border}`, background: T.bgDeep,
              color: file ? T.accent : T.t7, fontSize: 13, fontFamily: "inherit",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
              justifyContent: "center", transition: "border-color 0.15s, color 0.15s",
            }}>
              <FileText size={14} />
              {file ? file.name : isEdit ? "Clique para substituir o PDF" : "Selecionar arquivo PDF (máx. 50 MB)"}
            </button>
          </div>
        </div>

        {error && <div style={{ fontSize: 12, color: "#F87171", background: "#F8717118", padding: "8px 12px", borderRadius: 8 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${T.border}`,
            background: "transparent", color: T.t7, fontSize: 13, fontWeight: 600,
            fontFamily: "inherit", cursor: "pointer",
          }}>Cancelar</button>
          <button onClick={submit} disabled={loading} style={{
            flex: 2, padding: "9px 0", borderRadius: 8, border: "none",
            background: loading ? T.bgSelected : T.accent, color: "#fff", fontSize: 13,
            fontWeight: 700, fontFamily: "inherit", cursor: loading ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {loading
              ? <><Loader size={14} style={{ animation: "spin 0.7s linear infinite" }} /> Salvando...</>
              : isEdit ? <><Pencil size={14} /> Salvar alterações</> : <><Upload size={14} /> Enviar</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

function PdfViewer({ doc, T, onClose }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pdfDoc, setPdfDoc] = useState(null);
  const renderTaskRef = useRef(null);

  const renderPage = useCallback(async (pdf, pageNum, sc) => {
    if (!pdf || !canvasRef.current) return;
    if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: sc });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;
    } catch (e) {
      if (e?.name !== "RenderingCancelledException") setError("Erro ao renderizar página");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    const load = async () => {
      try {
        if (!window.pdfjsLib) {
          await new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "/pdfjs/pdf.min.js"; s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
          });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.js";
        }
        const token = localStorage.getItem("shiftsync_token");
        const pdf = await window.pdfjsLib.getDocument({
          url: `/api/documents/${doc.id}/view`,
          httpHeaders: { Authorization: `Bearer ${token}` },
        }).promise;
        if (cancelled) return;
        setNumPages(pdf.numPages); setPdfDoc(pdf); setLoading(false);
      } catch (e) {
        if (!cancelled) setError("Não foi possível carregar o documento");
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [doc.id]);

  useEffect(() => { if (pdfDoc) renderPage(pdfDoc, currentPage, scale); }, [pdfDoc, currentPage, scale, renderPage]);

  const blockContext = e => e.preventDefault();

  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000099", zIndex: 1000, display: "flex", flexDirection: "column" }} onContextMenu={blockContext}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", background: T.bgCard, borderBottom: `1px solid ${T.border}`, flexShrink: 0, userSelect: "none" }}>
        <FileText size={16} style={{ color: T.accent, flexShrink: 0 }} />
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setScale(s => Math.max(0.6, +(s - 0.2).toFixed(1)))} style={{ background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 6, color: T.t3, width: 30, height: 30, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
          <span style={{ fontSize: 12, color: T.t7, minWidth: 38, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, +(s + 0.2).toFixed(1)))} style={{ background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 6, color: T.t3, width: 30, height: 30, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} style={{ background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 6, color: T.t3, width: 30, height: 30, cursor: currentPage <= 1 ? "default" : "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", opacity: currentPage <= 1 ? 0.4 : 1 }}>‹</button>
          <span style={{ fontSize: 12, color: T.t7, fontVariantNumeric: "tabular-nums", minWidth: 60, textAlign: "center" }}>{currentPage} / {numPages || "…"}</span>
          <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages} style={{ background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 6, color: T.t3, width: 30, height: 30, cursor: currentPage >= numPages ? "default" : "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", opacity: currentPage >= numPages ? 0.4 : 1 }}>›</button>
        </div>
        <button onClick={onClose} style={{ background: "#FF445518", border: "1px solid #FF445530", borderRadius: 8, color: "#FF7A7A", padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>Fechar</button>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflow: "auto", background: "#1a1a24" }} onContextMenu={blockContext}>
        <div style={{ display: "flex", justifyContent: "center", padding: "24px 16px", minWidth: "fit-content" }}>
          {loading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#aaa", minHeight: 200 }}>
              <div style={{ width: 36, height: 36, border: "3px solid #444", borderTopColor: "#7c6cf0", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              <span style={{ fontSize: 13 }}>Carregando documento...</span>
            </div>
          )}
          {error && <div style={{ color: "#F87171", fontSize: 14, marginTop: 40 }}>{error}</div>}
          {!loading && !error && (
            <canvas ref={canvasRef} style={{ display: "block", boxShadow: "0 4px 32px #0008", borderRadius: 4, userSelect: "none", WebkitUserSelect: "none", pointerEvents: "none" }} onContextMenu={blockContext} />
          )}
        </div>
      </div>
    </div>
  );
}

function DocCard({ doc, T, onDelete, onEdit, isHR, onView }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? T.bgSelected : T.bgCard,
        border: `1px solid ${hovered ? T.accent + "44" : T.border}`,
        borderRadius: 12, padding: "14px 16px",
        display: "flex", alignItems: "center", gap: 14,
        transition: "background 0.12s, border-color 0.12s", cursor: "pointer",
      }}
      onClick={() => onView(doc)}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: T.accent + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <FileText size={18} style={{ color: T.accent }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</div>
        <div style={{ fontSize: 11, color: T.t9, marginTop: 2, display: "flex", alignItems: "center", gap: 8 }}>
          <span>{formatSize(doc.fileSize)}{doc.fileSize ? " · " : ""}{new Date(doc.createdAt).toLocaleDateString("pt-BR")}</span>
          {doc.viewCount > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, color: T.t9, fontVariantNumeric: "tabular-nums" }}>
              <Users size={10} />
              {doc.viewCount} {doc.viewCount === 1 ? "visualização" : "visualizações"}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={e => { e.stopPropagation(); onView(doc); }} style={{
          background: T.accent + "18", border: `1px solid ${T.accent}33`, borderRadius: 7, padding: "5px 10px",
          color: T.accent, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 5,
        }}>
          <Eye size={12} /> Ver
        </button>
        {isHR && (
          <>
            <button onClick={e => { e.stopPropagation(); onEdit(doc); }} style={{
              background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 7, padding: "5px 8px",
              color: T.t5, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center",
            }}>
              <Pencil size={12} />
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete(doc); }} style={{
              background: "#F8717118", border: "1px solid #F8717130", borderRadius: 7, padding: "5px 8px",
              color: "#F87171", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center",
            }}>
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CategorySection({ name, docs, T, onDelete, onEdit, isHR, onView, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 20 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        background: "transparent", border: "none", cursor: "pointer",
        padding: "6px 0 10px", color: T.t5, fontSize: 11,
        fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
        fontFamily: "inherit", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <FolderOpen size={13} style={{ opacity: 0.7 }} />
          {name}
          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8, background: T.accent + "20", color: T.accent }}>{docs.length}</span>
        </div>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {docs.map(d => (
            <DocCard key={d.id} doc={d} T={T} onDelete={onDelete} onEdit={onEdit} isHR={isHR} onView={onView} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const { theme: T } = useTheme();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formDoc, setFormDoc] = useState(null); // null=closed, false=new, doc=edit
  const [viewingDoc, setViewingDoc] = useState(null);

  const isHR = ["hr", "ti", "leader", "gerencia"].includes(user?.role);

  const load = async () => {
    try { const r = await api.get("/documents"); setDocs(r.data || []); } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (doc) => {
    if (!window.confirm(`Remover "${doc.title}"?`)) return;
    try { await api.delete(`/documents/${doc.id}`); setDocs(prev => prev.filter(d => d.id !== doc.id)); } catch {}
  };

  const handleSaved = (doc, isEdit) => {
    if (isEdit) setDocs(prev => prev.map(d => d.id === doc.id ? doc : d));
    else setDocs(prev => [...prev, doc]);
  };

  const filtered = search.trim()
    ? docs.filter(d => d.title.toLowerCase().includes(search.toLowerCase()) || d.category.toLowerCase().includes(search.toLowerCase()))
    : docs;

  const grouped = {};
  for (const d of filtered) { if (!grouped[d.category]) grouped[d.category] = []; grouped[d.category].push(d); }
  const categories = Object.keys(grouped).sort();

  return (
    <div style={{ padding: "28px 32px", maxWidth: 860, margin: "0 auto", fontFamily: "'Sora', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <FolderOpen size={22} style={{ color: T.accent }} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: T.t1, textWrap: "balance" }}>Documentos</h1>
          </div>
          <div style={{ fontSize: 13, color: T.t7 }}>Políticas, procedimentos e documentos da empresa</div>
        </div>
        {isHR && (
          <button onClick={() => setFormDoc(false)} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "9px 18px",
            background: T.accent, border: "none", borderRadius: 10, color: "#fff",
            fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
          }}
            onMouseDown={e => e.currentTarget.style.transform = "scale(0.96)"}
            onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
          >
            <Plus size={15} /> Novo Documento
          </button>
        )}
      </div>

      <div style={{ position: "relative", marginBottom: 24 }}>
        <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.t9, pointerEvents: "none" }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar documentos..."
          style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.bgCard, color: T.t1, fontSize: 13, fontFamily: "inherit", outline: "none" }}
          onFocus={e => e.target.style.borderColor = T.accent} onBlur={e => e.target.style.borderColor = T.border} />
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        </div>
      ) : categories.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: T.t9 }}>
          <FolderOpen size={40} style={{ opacity: 0.3, display: "block", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>{search ? "Nenhum documento encontrado" : "Nenhum documento disponível"}</div>
          {isHR && !search && <div style={{ fontSize: 12, marginTop: 4 }}>Clique em "Novo Documento" para adicionar</div>}
        </div>
      ) : (
        categories.map(cat => (
          <CategorySection key={cat} name={cat} docs={grouped[cat]} T={T}
            onDelete={handleDelete} onEdit={doc => setFormDoc(doc)} isHR={isHR} onView={setViewingDoc} />
        ))
      )}

      {formDoc !== null && (
        <DocFormModal T={T} onClose={() => setFormDoc(null)} onSaved={handleSaved} existing={formDoc || null} />
      )}

      {viewingDoc && (
        <PdfViewer doc={viewingDoc} T={T} onClose={() => setViewingDoc(null)} />
      )}
    </div>
  );
}
