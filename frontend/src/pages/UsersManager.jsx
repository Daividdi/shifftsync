import React, { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, Cake, Shield, ShieldOff, AlertTriangle, Clock } from "lucide-react";
import { Card, Badge, Avatar, Btn, Input, Select } from "../components/UI";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";

const ROLE_LABELS = { hr: "HR Admin", ti: "TI", leader: "Líder", gerencia: "Gerência", employee: "Funcionário" };

function formatBirthDate(isoDate) {
  if (!isoDate) return null;
  const [, m, d] = isoDate.split("-");
  return `${d}/${m}`;
}

export default function UsersManager() {
  const { theme: T } = useTheme();
  const [users, setUsers]         = useState([]);
  const [search, setSearch]       = useState("");
  const [syncing, setSyncing]     = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [flash, setFlash]         = useState("");
  const [editBirthday, setEditBirthday] = useState(null);
  const [bdValue, setBdValue]     = useState("");
  const [bdSaving, setBdSaving]   = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);
  const [inlineEdit, setInlineEdit]   = useState(null);
  const [filterDept, setFilterDept]   = useState("");

  const fetchUsers = useCallback(async () => {
    const { data } = await api.get("/users");
    setUsers(data || []);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const showFlash = (msg, ms = 4000) => {
    setFlash(msg);
    setTimeout(() => setFlash(""), ms);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data } = await api.post("/users/sync");
      setSyncResult(data);
      showFlash(
        data.deactivated > 0
          ? `Sincronizado! ${data.synced} ativos, ${data.deactivated} desativados do AD.`
          : `LDAP sincronizado! ${data.synced} usuários.`,
        5000
      );
      fetchUsers();
    } catch (e) {
      showFlash("Erro: " + (e.response?.data?.error || e.message));
    } finally {
      setSyncing(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.patch(`/users/${userId}/role`, { role: newRole });
      fetchUsers();
    } catch (e) {
      showFlash("Erro ao alterar role: " + (e.response?.data?.error || e.message));
    }
  };

  const handleToggleActive = async (userId, isActive) => {
    if (isActive) {
      const u = users.find(u => u.id === userId);
      setConfirmDeactivate(u);
    } else {
      try {
        await api.patch(`/users/${userId}/active`, { active: true });
        showFlash("Usuário reativado.");
        fetchUsers();
      } catch (e) {
        showFlash("Erro: " + (e.response?.data?.error || e.message));
      }
    }
  };

  const confirmDoDeactivate = async () => {
    if (!confirmDeactivate) return;
    try {
      await api.patch(`/users/${confirmDeactivate.id}/active`, { active: false });
      showFlash(`${confirmDeactivate.fullName} desativado — removido de grupos e escalas futuras.`, 5000);
      fetchUsers();
    } catch (e) {
      showFlash("Erro: " + (e.response?.data?.error || e.message));
    } finally {
      setConfirmDeactivate(null);
    }
  };

  const handleToggleExempt = async (userId, currentExempt) => {
    try {
      await api.patch(`/users/${userId}/exempt`, { exempt: !currentExempt });
      fetchUsers();
    } catch (e) {
      showFlash("Erro: " + (e.response?.data?.error || e.message));
    }
  };

  const handleToggleMeioPeriodo = async (userId, current) => {
    try {
      await api.patch(`/users/${userId}/meio-periodo`, { meioperiodo: !current });
      fetchUsers();
    } catch (e) {
      showFlash("Erro: " + (e.response?.data?.error || e.message));
    }
  };

  const saveProfile = async (userId, field, value) => {
    try {
      await api.patch(`/users/${userId}/profile`, { [field]: value.trim() || null });
      fetchUsers();
      showFlash(`${field === "dept" ? "Departamento" : "Cargo"} atualizado!`);
    } catch (e) {
      showFlash("Erro: " + (e.response?.data?.error || e.message));
    }
    setInlineEdit(null);
  };

  const openBirthdayEdit = (u) => {
    setEditBirthday({ userId: u.id, name: u.fullName });
    setBdValue(u.birthDate || "");
  };

  const saveBirthday = async () => {
    if (!editBirthday) return;
    setBdSaving(true);
    try {
      await api.patch(`/users/${editBirthday.userId}/birthdate`, { birthDate: bdValue || null });
      showFlash("Aniversário salvo!");
      setEditBirthday(null);
      fetchUsers();
    } catch (e) {
      showFlash("Erro: " + (e.response?.data?.error || e.message));
    } finally {
      setBdSaving(false);
    }
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.fullName?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.dept?.toLowerCase().includes(q) || u.title?.toLowerCase().includes(q);
    const matchDept = !filterDept || u.dept === filterDept;
    return matchSearch && matchDept;
  });

  const depts = [...new Set(users.map((u) => u.dept).filter(Boolean))];
  const withBirthday = users.filter(u => u.birthDate).length;
  const exemptCount = users.filter(u => u.syncExempt).length;
  const meioPeriodoCount = users.filter(u => u.meioPeriodo).length;

  return (
    <div style={{ padding: 28, overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: T.t1 }}>Usuários (LDAP)</h1>
          <p style={{ color: T.t8, fontSize: 13 }}>
            Sincronizado do OU Medical Design Center · Active Directory
            {withBirthday > 0 && <span style={{ marginLeft: 10, color: "#EC4899" }}>· 🎂 {withBirthday} com aniversário</span>}
            {exemptCount > 0 && <span style={{ marginLeft: 10, color: T.amber }}>· 🛡 {exemptCount} protegidos do sync</span>}
            {meioPeriodoCount > 0 && <span style={{ marginLeft: 10, color: T.accent }}>· ½ {meioPeriodoCount} meio período</span>}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {flash && (
            <div style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8,
              background: flash.startsWith("Erro") ? T.red+"18" : T.green+"18",
              border: `1px solid ${flash.startsWith("Erro") ? T.red+"44" : T.green+"44"}`,
              color: flash.startsWith("Erro") ? T.red : T.green, fontWeight: 600,
            }}>{flash}</div>
          )}
          <Btn variant="outline" icon={<RefreshCw size={14} style={{ animation: syncing ? "spin 0.7s linear infinite" : "none" }} />} onClick={handleSync} disabled={syncing}>
            {syncing ? "Sincronizando..." : "Sincronizar LDAP"}
          </Btn>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, usuário ou departamento..." icon={<Search size={14} />} />
      </div>

      {depts.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
          <button onClick={() => setFilterDept("")}
            style={{ padding: "4px 12px", background: !filterDept ? T.accent + "18" : T.bgDeep, border: `1px solid ${!filterDept ? T.accent + "55" : T.border}`, borderRadius: 20, fontSize: 12, color: !filterDept ? T.accent : T.t7, cursor: "pointer", fontFamily: "'Sora',sans-serif", fontWeight: !filterDept ? 700 : 400 }}>
            Todos ({users.length})
          </button>
          {depts.sort().map((d) => (
            <button key={d} onClick={() => setFilterDept(d === filterDept ? "" : d)}
              style={{ padding: "4px 12px", background: filterDept === d ? T.accent + "18" : T.bgDeep, border: `1px solid ${filterDept === d ? T.accent + "55" : T.border}`, borderRadius: 20, fontSize: 12, color: filterDept === d ? T.accent : T.t7, cursor: "pointer", fontFamily: "'Sora',sans-serif", fontWeight: filterDept === d ? 700 : 400 }}>
              {d}: <strong style={{ color: filterDept === d ? T.accent : T.t3 }}>{users.filter((u) => u.dept === d).length}</strong>
            </button>
          ))}
        </div>
      )}

      {/* Deactivation confirmation modal */}
      {confirmDeactivate && (
        <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onMouseDown={e => { if (e.target === e.currentTarget) setConfirmDeactivate(null); }}>
          <div style={{ background: T.bgCard, borderRadius: 14, padding: 24, width: 380, border: `1px solid ${T.border}`, boxShadow: "0 20px 60px #0008" }}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: T.red+"18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle size={20} color={T.red} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.t1 }}>Desativar usuário?</div>
                <div style={{ fontSize: 12, color: T.t8 }}>{confirmDeactivate.fullName}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: T.t7, marginBottom: 20, lineHeight: 1.7, padding: "10px 12px", background: T.bgDeep, borderRadius: 8, border: `1px solid ${T.border}` }}>
              Esta ação irá:
              <br/>• Remover o usuário de todos os grupos
              <br/>• Excluir suas escalas futuras
              <br/>• Cancelar trocas de turno pendentes
              <br/>• Fechar ausências em aberto
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDeactivate(null)} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 16px", color: T.t7, cursor: "pointer", fontSize: 12, fontFamily: "'Sora',sans-serif" }}>
                Cancelar
              </button>
              <button onClick={confirmDoDeactivate} style={{ background: T.red, border: "none", borderRadius: 8, padding: "8px 18px", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Sora',sans-serif" }}>
                Desativar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Birthday edit modal */}
      {editBirthday && (
        <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onMouseDown={e => { if (e.target === e.currentTarget) setEditBirthday(null); }}>
          <div style={{ background: T.bgCard, borderRadius: 14, padding: 24, width: 340, border: `1px solid ${T.border}`, boxShadow: "0 20px 60px #0008" }}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EC489920", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Cake size={18} color="#EC4899" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.t1 }}>Data de Nascimento</div>
                <div style={{ fontSize: 12, color: T.t8 }}>{editBirthday.name}</div>
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 12, color: T.t7, display: "block", marginBottom: 6 }}>Data (somente dia/mês é exibido)</label>
              <input
                key={editBirthday.userId}
                type="date"
                value={bdValue}
                onChange={e => setBdValue(e.target.value)}
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                style={{ width: "100%", fontSize: 13, color: T.t1, background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", fontFamily: "'Sora', sans-serif", boxSizing: "border-box" }}
              />
            </div>
            {bdValue && <div style={{ fontSize: 11, color: "#EC4899", marginBottom: 12 }}>🎂 Aniversário: {bdValue.slice(8,10)}/{bdValue.slice(5,7)}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {bdValue && <button onClick={() => setBdValue("")} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 14px", color: T.t7, cursor: "pointer", fontSize: 12, fontFamily: "'Sora',sans-serif" }}>Limpar</button>}
              <button onClick={() => setEditBirthday(null)} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 14px", color: T.t7, cursor: "pointer", fontSize: 12, fontFamily: "'Sora',sans-serif" }}>Cancelar</button>
              <button onClick={saveBirthday} disabled={bdSaving} style={{ background: "#EC4899", border: "none", borderRadius: 8, padding: "7px 16px", color: "#fff", cursor: bdSaving ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Sora',sans-serif", opacity: bdSaving ? 0.7 : 1 }}>
                {bdSaving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Card style={{ padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.borderSubtle}`, background: T.bgDeep }}>
                {["FUNCIONÁRIO","USUÁRIO","DEPARTAMENTO","CARGO","ANIVERSÁRIO","MEIO PERÍODO","ROLE","PROTEÇÃO","AÇÕES"].map((h) => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: T.t8, fontWeight: 700, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => {
                const isActive = u.active !== false;
                const bdDisplay = formatBirthDate(u.birthDate);
                const today = new Date();
                const todayMMDD = `${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
                const isBdToday = u.birthDate && u.birthDate.slice(5) === todayMMDD;
                const isMeio = !!u.meioPeriodo;
                return (
                  <tr key={u.id} style={{ borderBottom: `1px solid ${T.borderRow}`, background: i % 2 === 0 ? "transparent" : T.bgRowAlt, opacity: isActive ? 1 : 0.45 }}>
                    <td style={{ padding: "11px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar name={u.fullName} size={28} color={isActive ? T.accent : T.t10} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.t2 }}>{u.fullName}</div>
                          {!isActive && <div style={{ fontSize: 10, color: T.red, fontWeight: 600 }}>INATIVO</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <span className="mono" style={{ fontSize: 12, color: T.t7 }}>{u.username}</span>
                    </td>
                    <td style={{ padding: "11px 16px", minWidth: 130 }}>
                      {inlineEdit?.userId === u.id && inlineEdit?.field === "dept" ? (
                        <input autoFocus
                          value={inlineEdit.value}
                          onChange={e => setInlineEdit(s => ({ ...s, value: e.target.value }))}
                          onBlur={() => saveProfile(u.id, "dept", inlineEdit.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveProfile(u.id, "dept", inlineEdit.value); if (e.key === "Escape") setInlineEdit(null); }}
                          style={{ width: "100%", background: T.bgDeep, border: `1px solid ${T.accent}`, borderRadius: 6, padding: "4px 8px", color: T.t1, fontSize: 12, fontFamily: "'Sora',sans-serif", outline: "none", boxSizing: "border-box" }}
                        />
                      ) : (
                        <button onClick={() => setInlineEdit({ userId: u.id, field: "dept", value: u.dept || "" })}
                          title="Clique para editar departamento"
                          style={{ background: u.dept ? T.bgDeep : "transparent", border: `1px solid ${u.dept ? T.border : T.borderSubtle}`, borderRadius: 6, padding: "4px 10px", color: u.dept ? T.t4 : T.t9, cursor: "pointer", fontSize: 12, fontFamily: "'Sora',sans-serif", textAlign: "left", width: "100%" }}>
                          {u.dept || <span style={{ color: T.t9, fontStyle: "italic", fontSize: 11 }}>— editar</span>}
                        </button>
                      )}
                    </td>
                    <td style={{ padding: "11px 16px", minWidth: 130 }}>
                      {inlineEdit?.userId === u.id && inlineEdit?.field === "title" ? (
                        <input autoFocus
                          value={inlineEdit.value}
                          onChange={e => setInlineEdit(s => ({ ...s, value: e.target.value }))}
                          onBlur={() => saveProfile(u.id, "title", inlineEdit.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveProfile(u.id, "title", inlineEdit.value); if (e.key === "Escape") setInlineEdit(null); }}
                          style={{ width: "100%", background: T.bgDeep, border: `1px solid ${T.accent}`, borderRadius: 6, padding: "4px 8px", color: T.t1, fontSize: 12, fontFamily: "'Sora',sans-serif", outline: "none", boxSizing: "border-box" }}
                        />
                      ) : (
                        <button onClick={() => setInlineEdit({ userId: u.id, field: "title", value: u.title || "" })}
                          title="Clique para editar cargo"
                          style={{ background: u.title ? T.bgDeep : "transparent", border: `1px solid ${u.title ? T.border : T.borderSubtle}`, borderRadius: 6, padding: "4px 10px", color: u.title ? T.t4 : T.t9, cursor: "pointer", fontSize: 12, fontFamily: "'Sora',sans-serif", textAlign: "left", width: "100%" }}>
                          {u.title || <span style={{ color: T.t9, fontStyle: "italic", fontSize: 11 }}>— editar</span>}
                        </button>
                      )}
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <button onClick={() => openBirthdayEdit(u)} title="Editar data de nascimento" style={{
                        display: "flex", alignItems: "center", gap: 5,
                        background: isBdToday ? "#EC489920" : bdDisplay ? T.bgDeep : "transparent",
                        border: `1px solid ${isBdToday ? "#EC489966" : bdDisplay ? T.border : T.borderSubtle}`,
                        borderRadius: 6, padding: "4px 10px",
                        color: isBdToday ? "#EC4899" : bdDisplay ? T.t4 : T.t9,
                        cursor: "pointer", fontSize: 12, fontWeight: bdDisplay ? 600 : 400, fontFamily: "'Sora',sans-serif",
                      }}>
                        <Cake size={11} />
                        {isBdToday ? "🎉 Hoje!" : bdDisplay || "—"}
                      </button>
                    </td>
                    {/* Meio Período toggle */}
                    <td style={{ padding: "11px 16px" }}>
                      <button
                        onClick={() => handleToggleMeioPeriodo(u.id, isMeio)}
                        title={isMeio ? "Meio período ativo — 2 batidas = dia completo. Clique para desativar" : "Clique para marcar como meio período"}
                        style={{
                          display: "flex", alignItems: "center", gap: 5,
                          background: isMeio ? T.accent+"18" : T.bgDeep,
                          border: `1px solid ${isMeio ? T.accent+"55" : T.border}`,
                          borderRadius: 6, padding: "4px 10px",
                          color: isMeio ? T.accent : T.t9,
                          cursor: "pointer", fontSize: 11, fontWeight: isMeio ? 700 : 400,
                          fontFamily: "'Sora',sans-serif",
                        }}
                      >
                        <Clock size={11} />
                        {isMeio ? "½ Período" : "Integral"}
                      </button>
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <Select
                        value={u.role || "employee"}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        options={[
                          { value: "employee", label: "Funcionário" },
                          { value: "leader",   label: "Líder" },
                          { value: "gerencia", label: "Gerência" },
                          { value: "hr",       label: "HR Admin" },
                        ]}
                        style={{ fontSize: 11, padding: "4px 8px" }}
                      />
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <button
                        onClick={() => handleToggleExempt(u.id, u.syncExempt)}
                        title={u.syncExempt ? "Protegido do sync LDAP — clique para remover proteção" : "Clique para proteger do sync LDAP"}
                        style={{
                          display: "flex", alignItems: "center", gap: 5,
                          background: u.syncExempt ? T.amber+"18" : T.bgDeep,
                          border: `1px solid ${u.syncExempt ? T.amber+"55" : T.border}`,
                          borderRadius: 6, padding: "4px 10px",
                          color: u.syncExempt ? T.amber : T.t9,
                          cursor: "pointer", fontSize: 11, fontWeight: u.syncExempt ? 600 : 400,
                          fontFamily: "'Sora',sans-serif",
                        }}
                      >
                        {u.syncExempt ? <Shield size={11}/> : <ShieldOff size={11}/>}
                        {u.syncExempt ? "Protegido" : "Normal"}
                      </button>
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <button
                        onClick={() => handleToggleActive(u.id, isActive)}
                        style={{
                          background: isActive ? T.red+"18" : T.green+"18",
                          border: `1px solid ${isActive ? T.red+"44" : T.green+"44"}`,
                          borderRadius: 6, padding: "4px 10px",
                          color: isActive ? T.red : T.green,
                          cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'Sora',sans-serif",
                        }}
                      >
                        {isActive ? "Desativar" : "Ativar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.borderSubtle}`, fontSize: 12, color: T.t9 }}>
          {filtered.length} de {users.length} usuários ativos
        </div>
      </Card>
    </div>
  );
}
