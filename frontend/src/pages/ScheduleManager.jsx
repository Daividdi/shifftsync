import React, { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Zap, Check, X } from "lucide-react";
import { Card, Badge, Btn } from "../components/UI";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function getSaturdays(year, month) {
  const sats = [];
  const d = new Date(year, month, 1);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  while (d.getMonth() === month) { sats.push(new Date(d)); d.setDate(d.getDate() + 7); }
  return sats;
}

export default function ScheduleManager() {
  const { user } = useAuth();
  const { theme: T } = useTheme();
  const now = new Date();
  const [viewDate, setViewDate]       = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [schedule, setSchedule]       = useState({});
  const [groups, setGroups]           = useState([]);
  const [users, setUsers]             = useState([]);
  const [swaps, setSwaps]             = useState([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [flash, setFlash]             = useState("");
  const [showOff, setShowOff]         = useState(false); // toggle para mostrar grupos de folga

  const fetchAll = useCallback(async () => {
    const [sc, gr, us, sw] = await Promise.all([
      api.get(`/schedule?year=${viewDate.year}&month=${viewDate.month}`),
      api.get("/groups"),
      api.get("/users?includeInactive=1"),
      api.get("/swaps"),
    ]);
    setSchedule(sc.data || {});
    setGroups(gr.data || []);
    setUsers(us.data || []);
    setSwaps(sw.data || []);
  }, [viewDate]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const visibleGroups = user.role === "leader"
    ? groups.filter((g) => g.leaderId === user.id)
    : groups;

  const handleAutoSchedule = async () => {
    setAutoLoading(true);
    try {
      const groupIds = visibleGroups.map((g) => g.id);
      await api.post("/schedule/auto", { year: viewDate.year, month: viewDate.month, groupIds });
      setFlash("Escala gerada automaticamente!");
      fetchAll();
    } catch (e) {
      setFlash("Erro: " + (e.response?.data?.error || e.message));
    } finally {
      setAutoLoading(false);
      setTimeout(() => setFlash(""), 3000);
    }
  };

  const handleSwapAction = async (swapId, action) => {
    try {
      await api.patch(`/swaps/${swapId}`, { action });
      setFlash(`Pedido ${action === "approved" ? "aprovado" : "rejeitado"}!`);
      setTimeout(() => setFlash(""), 2500);
      fetchAll();
    } catch (e) {
      setFlash("Erro: " + (e.response?.data?.error || e.message));
    }
  };

  const sats = getSaturdays(viewDate.year, viewDate.month);
  const getUserById = (id) => users.find((u) => u.id === id);
  const pendingSwaps = swaps.filter((s) => s.status === "pending");

  return (
    <div style={{ padding: 28, overflowY: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: T.t1 }}>Gerenciar Escalas</h1>
          <p style={{ color: T.t8, fontSize: 13 }}>Monte os turnos mensais de sábado</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {flash && <Badge color={flash.startsWith("Erro") ? T.red : T.green}>{flash}</Badge>}

          {/* Toggle mostrar folgas */}
          <button
            onClick={() => setShowOff(v => !v)}
            style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${T.border}`, background: showOff ? T.red + "18" : T.bgDeep, color: showOff ? T.red : T.t8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}
          >
            {showOff ? "Ocultar Folgas" : "Mostrar Folgas"}
          </button>

          <Btn variant="ghost" small icon={<ChevronLeft size={14} />}
            onClick={() => setViewDate((v) => { const d = new Date(v.year, v.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}>
            Anterior
          </Btn>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.t1, padding: "6px 14px", background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 8 }}>
            {MONTH_NAMES[viewDate.month]} {viewDate.year}
          </span>
          <Btn variant="ghost" small icon={<ChevronRight size={14} />}
            onClick={() => setViewDate((v) => { const d = new Date(v.year, v.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}>
            Próximo
          </Btn>
          <Btn icon={<Zap size={14} />} onClick={handleAutoSchedule} disabled={autoLoading}>
            {autoLoading ? "Gerando..." : "Auto-Escalar"}
          </Btn>
        </div>
      </div>

      {/* Sábados */}
      <div style={{ marginBottom: 28 }}>
        {sats.length === 0 && (
          <Card style={{ textAlign: "center", padding: 40, color: T.t9 }}>Nenhum sábado neste mês</Card>
        )}
        {sats.map((sat, si) => {
          const key     = sat.toDateString();
          const dayData = schedule[key] || {};

          // Separa grupos escalados (têm working > 0) dos de folga (só off)
          const workingGroups = visibleGroups.filter((g) => (dayData[g.id]?.working?.length ?? 0) > 0);
          const offGroups     = visibleGroups.filter((g) => (dayData[g.id]?.working?.length ?? 0) === 0 && (dayData[g.id]?.off?.length ?? 0) > 0);
          const unscheduled   = visibleGroups.filter((g) => !dayData[g.id]);

          const hasAnyData = workingGroups.length > 0 || offGroups.length > 0;

          return (
            <Card key={si} style={{ marginBottom: 14 }}>
              {/* Cabeçalho do sábado */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ padding: "4px 12px", background: T.accent + "18", border: `1px solid ${T.accent}44`, borderRadius: 6, fontSize: 13, fontWeight: 700, color: T.accent }}>
                  {sat.toLocaleDateString("pt-BR", { month: "short", day: "numeric" })}
                </div>
                <div className="mono" style={{ fontSize: 11, color: T.t10 }}>SÁBADO #{si + 1}</div>
                {hasAnyData && (
                  <>
                    <Badge color={T.green} small>{workingGroups.length} grupos trabalhando</Badge>
                    {offGroups.length > 0 && <Badge color={T.t9} small>{offGroups.length} de folga</Badge>}
                  </>
                )}
              </div>

              {/* Grupos não escalados */}
              {unscheduled.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: T.amber, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>
                    NÃO ESCALADOS ({unscheduled.length})
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 8 }}>
                    {unscheduled.map((g) => (
                      <div key={g.id} style={{ background: T.bgDeep, borderRadius: 8, padding: "10px 14px", border: `1px solid ${T.amber}33`, display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: g.color }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: T.t4 }}>{g.name}</span>
                        <Badge color={T.amber} small>Pendente</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grupos TRABALHANDO */}
              {workingGroups.length > 0 && (
                <div style={{ marginBottom: showOff && offGroups.length > 0 ? 16 : 0 }}>
                  <div style={{ fontSize: 10, color: T.green, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>
                    TRABALHANDO NESTE SÁBADO
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 12 }}>
                    {workingGroups.map((g) => {
                      const gData = dayData[g.id];
                      return (
                        <div key={g.id} style={{ background: T.bgDeep, borderRadius: 10, padding: 14, border: `1px solid ${g.color}33` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: g.color }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: T.t2 }}>{g.name}</span>
                            <span style={{ fontSize: 10, color: T.green, marginLeft: "auto", fontWeight: 600 }}>
                              {gData.working.length} pessoas
                            </span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {gData.working.map((uid) => {
                              const u = getUserById(uid);
                              return (
                                <div key={uid} style={{ fontSize: 11, color: T.t4, padding: "2px 0" }}>
                                  {u?.fullName || uid}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Grupos DE FOLGA — só mostra se toggle ativo */}
              {showOff && offGroups.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: T.t9, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10, marginTop: workingGroups.length > 0 ? 4 : 0 }}>
                    DE FOLGA NESTE SÁBADO
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 12 }}>
                    {offGroups.map((g) => {
                      const gData = dayData[g.id];
                      return (
                        <div key={g.id} style={{ background: T.bgDeep, borderRadius: 10, padding: 14, border: `1px solid ${T.border}`, opacity: 0.7 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: g.color }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: T.t5 }}>{g.name}</span>
                            <span style={{ fontSize: 10, color: T.t9, marginLeft: "auto" }}>folga</span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {(gData.off || []).map((uid) => {
                              const u = getUserById(uid);
                              return (
                                <div key={uid} style={{ fontSize: 11, color: T.t8 }}>
                                  {u?.fullName || uid}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Se não há dado nenhum */}
              {!hasAnyData && unscheduled.length === 0 && (
                <div style={{ fontSize: 12, color: T.t9, textAlign: "center", padding: 16 }}>
                  Nenhum dado para este sábado
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Trocas pendentes — só HR aprova */}
      {user.role === "hr" && pendingSwaps.length > 0 && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: T.t1 }}>Pedidos de Troca Pendentes</h3>
            <Badge color={T.amber}>{pendingSwaps.length} aguardando</Badge>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
            {pendingSwaps.map((sw) => {
              const req   = getUserById(sw.requesterId);
              const cover = getUserById(sw.covererId);
              return (
                <div key={sw.id} style={{ background: T.bgDeep, borderRadius: 10, padding: 14, border: `1px solid ${T.amber}44` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <Badge color={T.amber} small>Pendente</Badge>
                    <span className="mono" style={{ fontSize: 10, color: T.t10 }}>
                      {new Date(sw.date + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: T.t2, marginBottom: 6 }}>
                    <strong>{req?.fullName || sw.requesterId}</strong>
                    <span style={{ color: T.t8 }}> → coberto por </span>
                    <strong>{cover?.fullName || sw.covererId}</strong>
                  </div>
                  {sw.coverCompDate && (
                    <div style={{ fontSize: 11, color: T.t9, marginBottom: 8 }}>
                      Compensação: {new Date(sw.coverCompDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}
                    </div>
                  )}
                  {sw.reason && (
                    <div style={{ fontSize: 11, color: T.t8, marginBottom: 10, fontStyle: "italic" }}>"{sw.reason}"</div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn variant="success" small icon={<Check size={12} />} onClick={() => handleSwapAction(sw.id, "approved")} style={{ flex: 1, justifyContent: "center" }}>Aprovar</Btn>
                    <Btn variant="danger"  small icon={<X size={12} />}     onClick={() => handleSwapAction(sw.id, "rejected")} style={{ flex: 1, justifyContent: "center" }}>Rejeitar</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
