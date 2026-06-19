import React, { useState, useEffect, useCallback } from "react";
import { Plus, Edit2, Trash2, Star, Check, Search, Users } from "lucide-react";
import { Card, Badge, Avatar, Btn, Modal, Input } from "../components/UI";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../hooks/useAuth";
import api from "../api/client";

const COLORS = ["#00C2FF","#A78BFA","#34D399","#FB923C","#F472B6","#FBBF24","#60A5FA"];
const EMPTY_FORM = { id: null, name: "", color: "#00C2FF", dept: "", leaderId: "", memberIds: [], coLeaderIds: [], team: "", noSchedule: false };

export default function GroupsManager() {
  const { user } = useAuth();
  const { theme: T } = useTheme();
  const [groups, setGroups]             = useState([]);
  const [users, setUsers]               = useState([]);
  const [modal, setModal]               = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [flash, setFlash]               = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [leaderSearch, setLeaderSearch] = useState("");
  const [coLeaderSearch, setCoLeaderSearch] = useState("");
  const [swapModal,    setSwapModal]    = useState(false);
  const [swapForm,     setSwapForm]     = useState({ groupId1:"", groupId2:"", fromDate: new Date().toISOString().slice(0,10) });
  const [swapFlash,    setSwapFlash]    = useState("");

  const fetchAll = useCallback(async () => {
    const [gr, us] = await Promise.all([api.get("/groups"), api.get("/users")]);
    setGroups(gr.data || []);
    setUsers(us.data || []);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => { setForm(EMPTY_FORM); setMemberSearch(""); setLeaderSearch(""); setCoLeaderSearch(""); setModal("create"); };
  const openEdit   = (g) => {
    setForm({ id: g.id, name: g.name, color: g.color, dept: g.dept || "", leaderId: g.leaderId || "", memberIds: [...(g.memberIds || [])], coLeaderIds: [...(g.coLeaderIds || [])], team: g.team || "", noSchedule: !!g.noSchedule });
    setMemberSearch(""); setLeaderSearch(""); setCoLeaderSearch(""); setModal("edit");
  };

  const isAdmin = user?.role === "hr" || user?.role === "ti" || user?.role === "gerencia";

  const handleSwapTeams = async () => {
    if (!swapForm.groupId1 || !swapForm.groupId2) {
      setSwapFlash("Selecione os dois grupos"); setTimeout(()=>setSwapFlash(""),3000); return;
    }
    if (swapForm.groupId1 === swapForm.groupId2) {
      setSwapFlash("Selecione grupos diferentes"); setTimeout(()=>setSwapFlash(""),3000); return;
    }
    try {
      const r = await api.post("/groups/swap-teams", swapForm);
      setSwapFlash(`✅ Turmas trocadas em ${r.data.datesAffected} sábado(s) a partir de ${swapForm.fromDate}`);
      setSwapModal(false);
      setTimeout(()=>setSwapFlash(""),5000);
    } catch(e) {
      setSwapFlash("Erro: "+(e.response?.data?.error||e.message));
      setTimeout(()=>setSwapFlash(""),4000);
    }
  };

  const saveGroup = async () => {
    try {
      if (modal === "create") await api.post("/groups", form);
      else await api.put(`/groups/${form.id}`, form);
      setFlash(modal === "create" ? "Grupo criado!" : "Grupo atualizado!");
      setModal(null);
      fetchAll();
    } catch (e) {
      setFlash("Erro: " + (e.response?.data?.error || e.message));
    }
    setTimeout(() => setFlash(""), 2500);
  };

  const deleteGroup = async (id) => {
    if (!window.confirm("Remover este grupo?")) return;
    await api.delete(`/groups/${id}`);
    fetchAll();
  };

  const toggleMember = (uid) => {
    setForm((f) => ({
      ...f,
      memberIds: f.memberIds.includes(uid)
        ? f.memberIds.filter((id) => id !== uid)
        : [...f.memberIds, uid],
    }));
  };

  const toggleCoLeader = (uid) => {
    setForm((f) => ({
      ...f,
      coLeaderIds: f.coLeaderIds.includes(uid)
        ? f.coLeaderIds.filter((id) => id !== uid)
        : [...f.coLeaderIds, uid],
    }));
  };

  const getUserById = (id) => users.find((u) => u.id === id);

  const filteredMembers = users.filter((u) =>
    u.fullName?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    u.dept?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    u.username?.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const filteredLeaders = users.filter((u) =>
    u.fullName?.toLowerCase().includes(leaderSearch.toLowerCase()) ||
    u.dept?.toLowerCase().includes(leaderSearch.toLowerCase()) ||
    u.username?.toLowerCase().includes(leaderSearch.toLowerCase())
  );

  const filteredCoLeaders = users.filter((u) =>
    u.id !== form.leaderId &&
    (u.fullName?.toLowerCase().includes(coLeaderSearch.toLowerCase()) ||
     u.dept?.toLowerCase().includes(coLeaderSearch.toLowerCase()) ||
     u.username?.toLowerCase().includes(coLeaderSearch.toLowerCase()))
  );

  const selectedMembers   = filteredMembers.filter((u) => form.memberIds.includes(u.id));
  const unselectedMembers = filteredMembers.filter((u) => !form.memberIds.includes(u.id));
  const sortedMembers     = [...selectedMembers, ...unselectedMembers];

  // Badge do time para exibir no card
  const teamBadge = (team) => {
    if (!team) return null;
    const color = team === "A" ? T.green : T.purple;
    return <Badge color={color} small>Turma {team}</Badge>;
  };

  return (
    <div style={{ padding: 28, overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: T.t1, display: "flex", alignItems: "center", gap: 11 }}><span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", background: T.accent + "1f", color: T.accent, flexShrink: 0 }}><Users size={18} /></span>Grupos & Times</h1>
          <p style={{ color: T.t8, fontSize: 13 }}>Gerencie grupos, membros e turmas</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {flash && <Badge color={flash.startsWith("Erro") ? T.red : T.green}>{flash}</Badge>}
          <Btn icon={<Plus size={14} />} onClick={openCreate}>Novo Grupo</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
        {groups.map((g) => {
          const leader = getUserById(g.leaderId);
          const coLeaders = (g.coLeaders || []);
          return (
            <Card key={g.id} style={{ borderTop: `3px solid ${g.color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: T.t1 }}>{g.name}</h3>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {g.dept && <Badge color={g.color} small>{g.dept}</Badge>}
                    {teamBadge(g.team)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => openEdit(g)} style={{ background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 7, color: T.t3, cursor: "pointer", padding: "6px 8px", display: "flex", alignItems: "center", transition: "background 0.1s" }} title="Editar grupo" onMouseEnter={e=>e.currentTarget.style.background=T.bgSelected} onMouseLeave={e=>e.currentTarget.style.background=T.bgDeep}><Edit2 size={14} /></button>
                  <button onClick={() => deleteGroup(g.id)} style={{ background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 7, color: T.red, cursor: "pointer", padding: "6px 8px", display: "flex", alignItems: "center", transition: "background 0.1s" }} title="Remover grupo" onMouseEnter={e=>e.currentTarget.style.background=T.red+"15"} onMouseLeave={e=>e.currentTarget.style.background=T.bgDeep}><Trash2 size={14} /></button>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: coLeaders.length > 0 ? 8 : 14, padding: "8px 10px", background: T.bgDeep, borderRadius: 8, border: `1px solid ${T.border}` }}>
                <Star size={12} style={{ color: T.amber }} />
                <Avatar name={leader?.fullName} size={22} color={T.amber} />
                <div>
                  <div style={{ fontSize: 11, color: T.amber, fontWeight: 600 }}>{leader?.fullName || "Sem líder"}</div>
                  <div style={{ fontSize: 10, color: T.t9 }}>Líder do Time</div>
                </div>
              </div>

              {coLeaders.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14, padding: "6px 10px", background: T.bgDeep, borderRadius: 8, border: `1px solid ${T.border}` }}>
                  <Users size={11} style={{ color: T.accent, marginTop: 3, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: T.accent, fontWeight: 600, marginBottom: 4 }}>CO-LÍDERES</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {coLeaders.map(cl => (
                        <div key={cl.id} style={{ display: "flex", alignItems: "center", gap: 4, background: T.accent + "18", border: `1px solid ${T.accent}33`, borderRadius: 6, padding: "2px 7px" }}>
                          <Avatar name={cl.fullName} size={14} color={T.accent} />
                          <span style={{ fontSize: 10, color: T.accent, fontWeight: 600 }}>{cl.fullName?.split(" ")[0]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div style={{ fontSize: 10, color: T.t9, letterSpacing: "0.1em", fontWeight: 600, marginBottom: 8 }}>
                  MEMBROS ({g.memberIds?.length ?? 0})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(g.members || []).slice(0, 8).map((m) => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 4, background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 6, padding: "3px 8px" }}>
                      <Avatar name={m.fullName} size={16} color={g.color} />
                      <span style={{ fontSize: 11, color: T.t6 }}>{m.fullName?.split(" ")[0]}</span>
                    </div>
                  ))}
                  {(g.members || []).length > 8 && (
                    <div style={{ fontSize: 11, color: T.t9, padding: "3px 8px" }}>+{g.members.length - 8} mais</div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === "create" ? "Criar Novo Grupo" : "Editar Grupo"} width={580}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Nome e Departamento */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: T.t7, display: "block", marginBottom: 6 }}>Nome *</label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="BR 1 - Turma A" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: T.t7, display: "block", marginBottom: 6 }}>Departamento</label>
              <Input value={form.dept} onChange={(e) => setForm((f) => ({ ...f, dept: e.target.value }))} placeholder="Produção" />
            </div>
          </div>

          {/* Cor + Turma lado a lado */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "end" }}>
            <div>
              <label style={{ fontSize: 12, color: T.t7, display: "block", marginBottom: 8 }}>Cor</label>
              <div style={{ display: "flex", gap: 8 }}>
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setForm((f) => ({ ...f, color: c }))}
                    style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: form.color === c ? "3px solid #fff" : "3px solid transparent", cursor: "pointer", boxShadow: form.color === c ? `0 0 10px ${c}` : "none" }} />
                ))}
              </div>
            </div>

            {/* Selector Turma A / B / Nenhum */}
            <div>
              <label style={{ fontSize: 12, color: T.t7, display: "block", marginBottom: 8 }}>Turma</label>
              <div style={{ display: "flex", gap: 6 }}>
                {["", "A", "B"].map((v) => (
                  <button key={v} onClick={() => setForm((f) => ({ ...f, team: v }))}
                    style={{
                      padding: "5px 14px", borderRadius: 8, cursor: "pointer",
                      fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 700,
                      border: `2px solid ${form.team === v
                        ? v === "A" ? T.green : v === "B" ? T.purple : T.border
                        : T.border}`,
                      background: form.team === v
                        ? v === "A" ? T.green + "22" : v === "B" ? T.purple + "22" : T.bgDeep
                        : "transparent",
                      color: form.team === v
                        ? v === "A" ? T.green : v === "B" ? T.purple : T.t6
                        : T.t9,
                    }}>
                    {v === "" ? "—" : `T. ${v}`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Líder com busca */}
          <div>
            <label style={{ fontSize: 12, color: T.t7, display: "block", marginBottom: 6 }}>
              Líder {form.leaderId && <span style={{ color: T.accent }}>— {getUserById(form.leaderId)?.fullName}</span>}
            </label>
            <Input
              value={leaderSearch}
              onChange={(e) => setLeaderSearch(e.target.value)}
              placeholder="Buscar líder por nome, departamento..."
              icon={<Search size={13} />}
            />
            {leaderSearch && (
              <div style={{ marginTop: 6, border: `1px solid ${T.border}`, borderRadius: 8, maxHeight: 180, overflowY: "auto", background: T.bgCard }}>
                {filteredLeaders.length === 0 ? (
                  <div style={{ padding: "10px 14px", fontSize: 12, color: T.t9 }}>Nenhum usuário encontrado</div>
                ) : filteredLeaders.map((u) => {
                  const isSelected = form.leaderId === u.id;
                  return (
                    <div key={u.id}
                      onClick={() => { setForm((f) => ({ ...f, leaderId: u.id })); setLeaderSearch(""); }}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", background: isSelected ? T.accent + "15" : "transparent", borderBottom: `1px solid ${T.borderRow}` }}
                      onMouseEnter={(e) => e.currentTarget.style.background = T.bgDeep}
                      onMouseLeave={(e) => e.currentTarget.style.background = isSelected ? T.accent + "15" : "transparent"}
                    >
                      <Avatar name={u.fullName} size={24} color={T.amber} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.t2 }}>{u.fullName}</div>
                        <div style={{ fontSize: 10, color: T.t9 }}>{u.dept || u.username}</div>
                      </div>
                      {isSelected && <Check size={13} style={{ color: T.accent }} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Co-líderes com busca */}
          <div style={{ padding: "12px 14px", background: T.bgDeep, borderRadius: 10, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Users size={13} style={{ color: T.accent }} />
              <label style={{ fontSize: 12, color: T.t7, fontWeight: 600 }}>
                Co-líderes
                {form.coLeaderIds.length > 0 && (
                  <span style={{ color: T.accent, marginLeft: 6 }}>— {form.coLeaderIds.length} selecionado(s)</span>
                )}
              </label>
              {form.coLeaderIds.length > 0 && (
                <button onClick={() => setForm(f => ({ ...f, coLeaderIds: [] }))}
                  style={{ marginLeft: "auto", background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 11, fontFamily: "'Sora',sans-serif" }}>
                  Limpar
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: T.t9, marginBottom: 10, lineHeight: 1.5 }}>
              Co-líderes têm acesso às ausências e ocorrências deste grupo, mesmo sendo líderes de outro grupo da mesma BR.
            </div>

            {/* Selected co-leaders pills */}
            {form.coLeaderIds.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {form.coLeaderIds.map(uid => {
                  const u = getUserById(uid);
                  if (!u) return null;
                  return (
                    <div key={uid} onClick={() => toggleCoLeader(uid)}
                      style={{ display: "flex", alignItems: "center", gap: 5, background: T.accent + "20", border: `1px solid ${T.accent}44`, borderRadius: 20, padding: "3px 10px 3px 6px", cursor: "pointer" }}>
                      <Avatar name={u.fullName} size={18} color={T.accent} />
                      <span style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>{u.fullName?.split(" ")[0]}</span>
                      <span style={{ fontSize: 13, color: T.accent, lineHeight: 1 }}>×</span>
                    </div>
                  );
                })}
              </div>
            )}

            <Input
              value={coLeaderSearch}
              onChange={(e) => setCoLeaderSearch(e.target.value)}
              placeholder="Buscar co-líder por nome, departamento..."
              icon={<Search size={13} />}
            />
            {coLeaderSearch && (
              <div style={{ marginTop: 6, border: `1px solid ${T.border}`, borderRadius: 8, maxHeight: 160, overflowY: "auto", background: T.bgCard }}>
                {filteredCoLeaders.length === 0 ? (
                  <div style={{ padding: "10px 14px", fontSize: 12, color: T.t9 }}>Nenhum usuário encontrado</div>
                ) : filteredCoLeaders.map((u) => {
                  const isSelected = form.coLeaderIds.includes(u.id);
                  return (
                    <div key={u.id}
                      onClick={() => { toggleCoLeader(u.id); setCoLeaderSearch(""); }}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", background: isSelected ? T.accent + "15" : "transparent", borderBottom: `1px solid ${T.borderRow}` }}
                      onMouseEnter={(e) => e.currentTarget.style.background = T.bgDeep}
                      onMouseLeave={(e) => e.currentTarget.style.background = isSelected ? T.accent + "15" : "transparent"}
                    >
                      <Avatar name={u.fullName} size={24} color={T.accent} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.t2 }}>{u.fullName}</div>
                        <div style={{ fontSize: 10, color: T.t9 }}>{u.dept || u.username}</div>
                      </div>
                      {isSelected && <Check size={13} style={{ color: T.accent }} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Membros com busca */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ fontSize: 12, color: T.t7 }}>
                Membros <span style={{ color: T.accent, fontWeight: 700 }}>{form.memberIds.length} selecionados</span>
              </label>
              {form.memberIds.length > 0 && (
                <button onClick={() => setForm((f) => ({ ...f, memberIds: [] }))}
                  style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 11, fontFamily: "'Sora',sans-serif" }}>
                  Limpar seleção
                </button>
              )}
            </div>

            <Input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Buscar por nome, departamento, username..."
              icon={<Search size={13} />}
            />

            <div style={{ marginTop: 8, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "6px 12px", background: T.bgDeep, borderBottom: `1px solid ${T.border}`, fontSize: 10, color: T.t9, fontWeight: 700, letterSpacing: "0.08em" }}>
                {memberSearch ? `${filteredMembers.length} resultado(s)` : `${users.length} usuários disponíveis`}
              </div>
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {sortedMembers.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 12, color: T.t9, textAlign: "center" }}>Nenhum usuário encontrado</div>
                ) : sortedMembers.map((u) => {
                  const selected = form.memberIds.includes(u.id);
                  return (
                    <div key={u.id} onClick={() => toggleMember(u.id)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", background: selected ? T.accent + "12" : "transparent", borderBottom: `1px solid ${T.borderRow}`, transition: "background 0.1s" }}
                      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = T.bgDeep; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = selected ? T.accent + "12" : "transparent"; }}
                    >
                      <Avatar name={u.fullName} size={26} color={selected ? T.accent : T.t10} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: selected ? 700 : 500, color: selected ? T.t1 : T.t4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.fullName}</div>
                        <div style={{ fontSize: 10, color: T.t9 }}>{u.dept || u.username}</div>
                      </div>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${selected ? T.accent : T.border}`, background: selected ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {selected && <Check size={11} color="#fff" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:T.bgDeep,borderRadius:8,border:`1px solid ${T.border}`,marginTop:4}}>
            <input type="checkbox" id="noSched" checked={form.noSchedule||false}
              onChange={e=>setForm(f=>({...f,noSchedule:e.target.checked}))}
              style={{width:16,height:16,cursor:"pointer"}}/>
            <label htmlFor="noSched" style={{fontSize:13,color:T.t2,cursor:"pointer"}}>
              <strong>Grupo sem escala de sábado</strong>
              <div style={{fontSize:11,color:T.t9,marginTop:2}}>ADM, novatos e outros que não fazem escala</div>
            </label>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn icon={<Check size={14} />} onClick={saveGroup} disabled={!form.name}>
              {modal === "create" ? "Criar Grupo" : "Salvar Alterações"}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Modal Swap Turmas */}
      {swapModal&&(
        <Modal open={swapModal} onClose={()=>setSwapModal(false)} title="Trocar Turmas nos Sábados">
          <div style={{display:"flex",flexDirection:"column",gap:16,padding:"4px 0"}}>
            <div style={{fontSize:13,color:T.t8,padding:"10px 14px",background:T.bgDeep,borderRadius:8,border:`1px solid ${T.border}`}}>
              Esta operação troca os registros de escala entre dois grupos em todos os sábados a partir da data selecionada. Use quando duas turmas estão invertidas.
            </div>
            <div>
              <div style={{fontSize:11,color:T.t8,fontWeight:600,marginBottom:5}}>GRUPO 1 (será trocado com Grupo 2)</div>
              <select value={swapForm.groupId1} onChange={e=>setSwapForm(f=>({...f,groupId1:e.target.value}))}
                style={{width:"100%",fontSize:12,color:T.t1,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",fontFamily:"'Sora',sans-serif"}}>
                <option value="">Selecione o grupo...</option>
                {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:T.t8,fontWeight:600,marginBottom:5}}>GRUPO 2 (será trocado com Grupo 1)</div>
              <select value={swapForm.groupId2} onChange={e=>setSwapForm(f=>({...f,groupId2:e.target.value}))}
                style={{width:"100%",fontSize:12,color:T.t1,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",fontFamily:"'Sora',sans-serif"}}>
                <option value="">Selecione o grupo...</option>
                {groups.filter(g=>g.id!==swapForm.groupId1).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:T.t8,fontWeight:600,marginBottom:5}}>A PARTIR DE</div>
              <input type="date" value={swapForm.fromDate} onChange={e=>setSwapForm(f=>({...f,fromDate:e.target.value}))}
                style={{fontSize:12,color:T.t1,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px"}}/>
            </div>
            {swapFlash&&<div style={{padding:"8px 12px",background:swapFlash.startsWith("Erro")?T.red+"18":T.green+"18",border:`1px solid ${swapFlash.startsWith("Erro")?T.red:T.green}33`,borderRadius:8,fontSize:12,color:swapFlash.startsWith("Erro")?T.red:T.green}}>{swapFlash}</div>}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <Btn variant="ghost" onClick={()=>setSwapModal(false)}>Cancelar</Btn>
              <Btn onClick={handleSwapTeams} style={{background:T.accent,color:"#fff",border:"none"}}>Confirmar Troca</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
