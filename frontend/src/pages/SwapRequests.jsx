import React, { useState, useEffect, useCallback } from "react";
import { Plus, ArrowLeftRight, Check, ChevronDown, ChevronUp, Calendar } from "lucide-react";
import { Card, Badge, Avatar, Btn, Modal, Select } from "../components/UI";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";

const STATUS_COLOR_KEY = { pending: "amber", approved: "green", rejected: "red" };
const STATUS_LABEL     = { pending: "PENDENTE", approved: "APROVADO", rejected: "REJEITADO" };

function toISODate(dateString) {
  const d = new Date(dateString);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function formatDatePtBR(iso) {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function formatDateShort(iso) {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function findPairGroup(groups, myGroup) {
  if (!myGroup || !myGroup.team) return null;
  const partnerTeam = myGroup.team === "A" ? "B" : "A";
  const prefix = myGroup.name.replace(/\s*-?\s*turma\s*[ab]\s*$/i, "").trim().toLowerCase();
  return groups.find((g) => {
    const gPrefix = g.name.replace(/\s*-?\s*turma\s*[ab]\s*$/i, "").trim().toLowerCase();
    return g.team === partnerTeam && gPrefix === prefix && g.id !== myGroup.id;
  }) || null;
}

function mergeSchedules(s1, s2) {
  const merged = { ...s1 };
  for (const [dateKey, dayData] of Object.entries(s2)) {
    if (!merged[dateKey]) {
      merged[dateKey] = dayData;
    } else {
      merged[dateKey] = { ...merged[dateKey], ...dayData };
    }
  }
  return merged;
}

export default function SwapRequests() {
  const { user } = useAuth();
  const { theme: T } = useTheme();
  const [swaps, setSwaps]         = useState([]);
  const [groups, setGroups]       = useState([]);
  const [users, setUsers]         = useState([]);
  const [schedule, setSchedule]   = useState({});
  const [showModal, setShowModal] = useState(false);
  const [flash, setFlash]         = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const EMPTY_FORM = { collab1Id: "", collab2Id: "", swapDate: "", compDate1: "", reason: "" };
  const [form, setForm] = useState(EMPTY_FORM);

  const handleSwapAction = async (swapId, action) => {
    try {
      await api.patch(`/swaps/${swapId}`, { action });
      fetchAll();
    } catch(e) {
      console.error(e);
    }
  };

  const fetchAll = useCallback(async () => {
    const now  = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [sw, gr, us, sc1, sc2] = await Promise.all([
      api.get("/swaps"),
      api.get("/groups"),
      api.get("/users"),
      api.get(`/schedule?year=${now.getFullYear()}&month=${now.getMonth()}`),
      api.get(`/schedule?year=${next.getFullYear()}&month=${next.getMonth()}`),
    ]);
    setSwaps(sw.data || []);
    setGroups(gr.data || []);
    setUsers(us.data || []);
    setSchedule(mergeSchedules(sc1.data || {}, sc2.data || {}));
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const isHR     = user.role === "hr" || user.role === "ti" || user.role === "gerencia";
  const isLeader = user.role === "leader" || user.role === "gerencia";

  // All groups where this user is primary leader OR co-leader
  const myGroups = groups.filter((g) => g.leaderId === user.id || (g.coLeaderIds || []).includes(user.id));

  // All managed groups: myGroups + their pair groups (deduped)
  const allManagedGroups = (() => {
    const seen = new Set(myGroups.map((g) => g.id));
    const result = [...myGroups];
    for (const g of myGroups) {
      const pair = findPairGroup(groups, g);
      if (pair && !seen.has(pair.id)) { seen.add(pair.id); result.push(pair); }
    }
    return result;
  })();

  const allManagedMemberIds = new Set(
    allManagedGroups.flatMap((g) => g.memberIds || [])
  );

  // All leaders and co-leaders across all groups (deduplicated)
  const allLeadersCoLeaders = (() => {
    const seen = new Set();
    const result = [];
    for (const g of groups) {
      const candidates = [
        g.leaderId ? users.find((u) => u.id === g.leaderId) : null,
        ...(g.coLeaderIds || []).map((id) => users.find((u) => u.id === id)),
      ].filter(Boolean);
      for (const u of candidates) {
        if (!seen.has(u.id)) { seen.add(u.id); result.push(u); }
      }
    }
    return result.sort((a, b) => a.fullName.localeCompare(b.fullName));
  })();

  const getUserById = (id) => users.find((u) => u.id === id);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const collab1WorkDates = form.collab1Id
    ? Object.entries(schedule).flatMap(([dateKey, dayData]) =>
        Object.entries(dayData).flatMap(([gid, gData]) => {
          const dateStr = toISODate(dateKey);
          return (gData.working || []).includes(form.collab1Id) && new Date(dateStr + "T12:00:00") >= today
            ? [{ dateStr, groupId: gid }]
            : [];
        })
      ).sort((a, b) => a.dateStr.localeCompare(b.dateStr))
    : [];

  const collab1OffDates = form.collab1Id && form.swapDate
    ? Object.entries(schedule).flatMap(([dateKey, dayData]) =>
        Object.entries(dayData).flatMap(([gid, gData]) => {
          const dateStr = toISODate(dateKey);
          return (gData.off || []).includes(form.collab1Id) &&
            dateStr !== form.swapDate &&
            new Date(dateStr + "T12:00:00") >= today
            ? [{ dateStr, groupId: gid }]
            : [];
        })
      ).sort((a, b) => a.dateStr.localeCompare(b.dateStr))
    : [];

  const openModal = () => { setForm(EMPTY_FORM); setShowModal(true); };

  const submitSwap = async () => {
    if (!form.collab1Id || !form.collab2Id || !form.swapDate) return;
    try {
      const selected = collab1WorkDates.find((d) => d.dateStr === form.swapDate);
      await api.post("/swaps", {
        requesterId:   form.collab1Id,
        covererId:     form.collab2Id,
        date:          form.swapDate,
        groupId:       selected?.groupId || myGroups[0]?.id,
        coverCompDate: form.compDate1 || undefined,
        reason:        form.reason || undefined,
      });
      setFlash("Solicitação enviada com sucesso!");
      setShowModal(false);
      fetchAll();
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setFlash("Erro: " + msg);
    }
    setTimeout(() => setFlash(""), 5000);
  };

  const displaySwaps = swaps;
  const sc = (key) => T[STATUS_COLOR_KEY[key]];
  const formValid = form.collab1Id && form.collab2Id && form.swapDate && form.collab1Id !== form.collab2Id;

  const memberOptions = (excludeId) => {
    const opts = [{ value: "", label: "Selecionar colaborador..." }];

    for (const g of allManagedGroups) {
      const members = (g.memberIds || [])
        .map((id) => users.find((u) => u.id === id))
        .filter((u) => u && u.id !== excludeId);
      const isPair = !myGroups.find((mg) => mg.id === g.id);
      opts.push({ value: `__g_${g.id}__`, label: `── ${g.name}${isPair ? " (par)" : ""} ──`, disabled: true });
      members.forEach((m) => opts.push({ value: m.id, label: m.fullName }));
    }

    // Leaders/co-leaders from groups outside the managed set
    if (isLeader) {
      const crossLeaders = allLeadersCoLeaders.filter(
        (u) => u.id !== excludeId && !allManagedMemberIds.has(u.id)
      );
      if (crossLeaders.length > 0) {
        opts.push({ value: "__leaders__", label: "── Líderes / Co-líderes ──", disabled: true });
        crossLeaders.forEach((u) => opts.push({ value: u.id, label: u.fullName }));
      }
    }

    return opts;
  };

  // Check if selected collab1 is a cross-group leader (schedule data unavailable)
  const collab1IsCrossGroupLeader =
    form.collab1Id &&
    !allManagedMemberIds.has(form.collab1Id) &&
    allLeadersCoLeaders.some((u) => u.id === form.collab1Id);

  return (
    <div style={{ padding: 28, overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: T.t1 }}>Trocas de Turno</h1>
          <p style={{ color: T.t8, fontSize: 13 }}>
            {myGroups.length > 0
              ? `Gerenciando trocas de ${allManagedGroups.length} grupo${allManagedGroups.length !== 1 ? "s" : ""}`
              : "Solicite ou acompanhe trocas de escala"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {flash && (
            <div style={{ padding: "8px 14px", background: flash.startsWith("Erro") ? T.red + "18" : T.green + "18", border: `1px solid ${flash.startsWith("Erro") ? T.red : T.green}44`, borderRadius: 8, fontSize: 12, color: flash.startsWith("Erro") ? T.red : T.green, fontWeight: 600, maxWidth: 400 }}>
              {flash}
            </div>
          )}
          {isLeader && <Btn icon={<Plus size={14} />} onClick={openModal}>Nova Solicitação</Btn>}
        </div>
      </div>

      {/* Grupos gerenciados */}
      {isLeader && allManagedGroups.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {allManagedGroups.map((g) => {
            const isPair = !myGroups.find((mg) => mg.id === g.id);
            const memberCount = (g.memberIds || []).length;
            return (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", background: T.bgCard, border: `1px solid ${g.color}44`, borderRadius: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: g.color }} />
                <span style={{ fontSize: 12, color: T.t6, fontWeight: 600 }}>{g.name}</span>
                <span style={{ fontSize: 11, color: T.t9 }}>{memberCount} membros</span>
                {isPair && <Badge color={T.accent} small>Par</Badge>}
              </div>
            );
          })}
        </div>
      )}

      {/* Resumo status */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {["pending","approved","rejected"].map((s) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", background: T.bgCard, border: `1px solid ${sc(s)}44`, borderRadius: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc(s) }} />
            <span style={{ fontSize: 12, color: T.t6 }}>{STATUS_LABEL[s]}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: sc(s) }}>{displaySwaps.filter((r) => r.status === s).length}</span>
          </div>
        ))}
      </div>

      {/* Lista de trocas */}
      {displaySwaps.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 60 }}>
          <ArrowLeftRight size={40} style={{ color: T.t9, marginBottom: 12 }} />
          <div style={{ fontSize: 14, color: T.t8 }}>Nenhum pedido de troca ainda</div>
          {isLeader && <div style={{ fontSize: 12, color: T.t10, marginTop: 6 }}>Clique em "Nova Solicitação" para começar</div>}
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {displaySwaps.map((sw) => {
            const req   = getUserById(sw.requesterId);
            const cover = getUserById(sw.covererId);
            const createdByUser = getUserById(sw.createdBy);
            const swGroup = groups.find((g) => g.id === sw.groupId);
            const isExpanded = expandedId === sw.id;

            return (
              <Card key={sw.id} style={{ padding: 0, overflow: "hidden" }}>
                <div onClick={() => setExpandedId(isExpanded ? null : sw.id)}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: "pointer", background: isExpanded ? T.bgDeep : "transparent" }}>
                  <Badge color={sc(sw.status)}>{STATUS_LABEL[sw.status]}</Badge>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                    <Avatar name={req?.fullName} size={26} color={T.amber} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.t2 }}>{req?.fullName || sw.requesterId}</span>
                    <ArrowLeftRight size={13} style={{ color: T.t10 }} />
                    <Avatar name={cover?.fullName} size={26} color={T.green} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.t2 }}>{cover?.fullName || sw.covererId}</span>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: T.t7, fontWeight: 600 }}>
                      <Calendar size={11} style={{ marginRight: 4, verticalAlign: "middle" }} />
                      {formatDateShort(sw.date)}
                    </div>
                    {sw.coverCompDate && <div style={{ fontSize: 10, color: T.t10, marginTop: 2 }}>Comp: {formatDateShort(sw.coverCompDate)}</div>}
                  </div>
                  {isExpanded ? <ChevronUp size={15} style={{ color: T.t9 }} /> : <ChevronDown size={15} style={{ color: T.t9 }} />}
                </div>

                {isExpanded && (
                  <div style={{ padding: "16px 18px", borderTop: `1px solid ${T.borderSubtle}` }}>
                    <div style={{ background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: T.t1, marginBottom: 8, letterSpacing: "0.04em" }}>
                        FORMULÁRIO DE TROCA DE ESCALA
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12 }}>
                        <div><span style={{ color: T.t8 }}>Grupo: </span><span style={{ fontWeight: 700, color: T.t2 }}>{swGroup?.name || "—"}</span></div>
                        <div><span style={{ color: T.t8 }}>Líder Solicitante: </span><span style={{ fontWeight: 700, color: T.t2 }}>{createdByUser?.fullName || "—"}</span></div>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                      <div style={{ background: T.amber + "10", border: `1px solid ${T.amber}33`, borderRadius: 10, padding: 14 }}>
                        <div style={{ fontSize: 10, color: T.amber, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>COLABORADOR 1 — SOLICITA A TROCA</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                          <Avatar name={req?.fullName} size={32} color={T.amber} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: T.t1 }}>{req?.fullName}</div>
                            <div style={{ fontSize: 11, color: T.t8 }}>{req?.dept}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: T.t6 }}>Sábado originalmente escalado:
                          <div style={{ fontWeight: 700, color: T.t2, marginTop: 2 }}>{formatDateShort(sw.date)}</div>
                        </div>
                        {sw.coverCompDate && (
                          <div style={{ fontSize: 11, color: T.t6, marginTop: 8 }}>Nova data que trabalhará:
                            <div style={{ fontWeight: 700, color: T.t2, marginTop: 2 }}>{formatDateShort(sw.coverCompDate)}</div>
                          </div>
                        )}
                      </div>

                      <div style={{ background: T.green + "10", border: `1px solid ${T.green}33`, borderRadius: 10, padding: 14 }}>
                        <div style={{ fontSize: 10, color: T.green, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>COLABORADOR 2 — ASSUME A TROCA</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                          <Avatar name={cover?.fullName} size={32} color={T.green} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: T.t1 }}>{cover?.fullName}</div>
                            <div style={{ fontSize: 11, color: T.t8 }}>{cover?.dept}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: T.t6 }}>Data que assumirá:
                          <div style={{ fontWeight: 700, color: T.t2, marginTop: 2 }}>{formatDateShort(sw.date)}</div>
                        </div>
                      </div>
                    </div>

                    {sw.reason && (
                      <div style={{ background: T.bgDeep, borderRadius: 8, padding: "10px 14px", border: `1px solid ${T.border}`, fontSize: 12, color: T.t7, fontStyle: "italic" }}>
                        Motivo: "{sw.reason}"
                      </div>
                    )}
                    {isHR && sw.status === "pending" && (
                      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                        <button onClick={(e)=>{ e.stopPropagation(); handleSwapAction(sw.id,"approved"); }}
                          style={{ flex:1, padding:"8px 0", background:T.green+"18", border:`1px solid ${T.green}44`, borderRadius:8, color:T.green, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'Sora',sans-serif" }}>
                          ✓ Aprovar
                        </button>
                        <button onClick={(e)=>{ e.stopPropagation(); handleSwapAction(sw.id,"rejected"); }}
                          style={{ flex:1, padding:"8px 0", background:T.red+"18", border:`1px solid ${T.red}44`, borderRadius:8, color:T.red, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'Sora',sans-serif" }}>
                          ✕ Rejeitar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Formulário de Troca de Escala" width={560}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Identificação */}
          <div style={{ background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ fontSize: 11, color: T.t9, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>IDENTIFICAÇÃO</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: T.t8, marginBottom: 2 }}>Grupos</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.t1, lineHeight: 1.5 }}>
                  {allManagedGroups.map((g) => g.name).join(" · ")}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: T.t8, marginBottom: 2 }}>Líder Solicitante</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.t1 }}>{user.fullName}</div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: T.t9, fontWeight: 700, letterSpacing: "0.1em" }}>DADOS DOS COLABORADORES</div>

          {/* Colaborador 1 */}
          <div style={{ background: T.amber + "10", border: `1px solid ${T.amber}33`, borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ fontSize: 11, color: T.amber, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>
              COLABORADOR 1 — SOLICITA A TROCA (QUER FOLGAR)
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: T.t6, display: "block", marginBottom: 6, fontWeight: 600 }}>Nome completo *</label>
              <Select
                value={form.collab1Id}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.startsWith("__")) return;
                  setForm((f) => ({ ...f, collab1Id: v, swapDate: "", compDate1: "", collab2Id: f.collab2Id === v ? "" : f.collab2Id }));
                }}
                options={memberOptions("")}
                style={{ width: "100%" }}
              />
            </div>

            {form.collab1Id && (
              <div>
                <label style={{ fontSize: 12, color: T.t6, display: "block", marginBottom: 6, fontWeight: 600 }}>
                  Data originalmente escalada (quer folgar) *
                </label>
                {collab1IsCrossGroupLeader ? (
                  <div style={{ padding: "10px 14px", background: T.bgDeep, border: `1px solid ${T.amber}44`, borderRadius: 8, fontSize: 12, color: T.amber }}>
                    Selecione você mesmo como Colaborador 1 para visualizar suas datas escaladas. Para trocar com este líder, ele deve iniciar a solicitação a partir da conta dele.
                  </div>
                ) : collab1WorkDates.length === 0 ? (
                  <div style={{ padding: "10px 14px", background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.t9, fontStyle: "italic" }}>
                    Nenhuma data de trabalho escalada encontrada para este colaborador
                  </div>
                ) : (
                  <Select
                    value={form.swapDate}
                    onChange={(e) => setForm((f) => ({ ...f, swapDate: e.target.value, compDate1: "" }))}
                    options={[
                      { value: "", label: "Selecione uma data..." },
                      ...collab1WorkDates.map((d) => ({ value: d.dateStr, label: formatDatePtBR(d.dateStr) })),
                    ]}
                    style={{ width: "100%" }}
                  />
                )}
              </div>
            )}
          </div>

          {/* Colaborador 2 */}
          <div style={{ background: T.green + "10", border: `1px solid ${T.green}33`, borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ fontSize: 11, color: T.green, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>
              COLABORADOR 2 — ASSUME A TROCA
            </div>
            <div style={{ marginBottom: form.collab2Id && form.swapDate ? 10 : 0 }}>
              <label style={{ fontSize: 12, color: T.t6, display: "block", marginBottom: 6, fontWeight: 600 }}>Nome completo *</label>
              <Select
                value={form.collab2Id}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.startsWith("__")) return;
                  setForm((f) => ({ ...f, collab2Id: v }));
                }}
                options={memberOptions(form.collab1Id)}
                style={{ width: "100%" }}
              />
            </div>
            {form.collab2Id && form.swapDate && (
              <div style={{ padding: "8px 12px", background: T.green + "18", borderRadius: 8, fontSize: 12, color: T.t6 }}>
                Data que assumirá: <span style={{ fontWeight: 700, color: T.t2 }}>{formatDatePtBR(form.swapDate)}</span>
              </div>
            )}
          </div>

          {/* Compensação */}
          {form.collab1Id && form.swapDate && (
            <div style={{ background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: 11, color: T.t9, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>COMPENSAÇÃO (OPCIONAL)</div>
              <label style={{ fontSize: 12, color: T.t6, display: "block", marginBottom: 6, fontWeight: 600 }}>
                Nova data que o Colaborador 1 trabalhará em compensação
              </label>
              {collab1OffDates.length === 0 ? (
                <div style={{ padding: "10px 14px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.t9, fontStyle: "italic" }}>
                  Nenhuma data de folga disponível para compensação
                </div>
              ) : (
                <Select
                  value={form.compDate1}
                  onChange={(e) => setForm((f) => ({ ...f, compDate1: e.target.value }))}
                  options={[
                    { value: "", label: "Deixar em aberto..." },
                    ...collab1OffDates.map((d) => ({ value: d.dateStr, label: formatDatePtBR(d.dateStr) })),
                  ]}
                  style={{ width: "100%" }}
                />
              )}
            </div>
          )}

          {/* Motivo */}
          <div>
            <label style={{ fontSize: 12, color: T.t6, display: "block", marginBottom: 6, fontWeight: 600 }}>Motivo (opcional)</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Consulta médica, compromisso pessoal..."
              style={{ width: "100%", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", color: T.t1, fontSize: 13, resize: "vertical", minHeight: 72, fontFamily: "'Sora',sans-serif", outline: "none" }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Btn>
            <Btn icon={<Check size={14} />} onClick={submitSwap} disabled={!formValid}>
              Enviar Solicitação
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
