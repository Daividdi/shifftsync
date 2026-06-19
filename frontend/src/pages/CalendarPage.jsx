import React, { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Edit2, ArrowLeftRight, Calendar, Layers, List, Umbrella, AlertTriangle } from "lucide-react";
import { Card, Badge, Avatar, Btn } from "../components/UI";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import api from "../api/client";

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export default function CalendarPage() {
  const { user } = useAuth();
  const { theme: T } = useTheme();
  const now = new Date();
  const [viewDate, setViewDate]         = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [schedule, setSchedule]         = useState({});
  const [groups, setGroups]             = useState([]);
  const [users, setUsers]               = useState([]);
  const [selectedDay, setSelectedDay]   = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [editingGroup, setEditingGroup] = useState(null);
  const [saveFlash, setSaveFlash]       = useState(false);
  const [grouped, setGrouped]           = useState(true);
  const groupCardRefs = useRef({});

  const isHR     = ["hr","ti","gerencia"].includes(user?.role);
  const isLeader = user?.role === "leader" || isHR;
  const canEdit  = isHR || isLeader;

  const fetchData = useCallback(async () => {
      api.get(`/holidays?year=${viewDate.year}`).then(r=>setHolidays(r.data||[])).catch(()=>{});
    const [sc, gr, us] = await Promise.all([
      api.get(`/schedule?year=${viewDate.year}&month=${viewDate.month}`),
      api.get("/groups"),
      api.get("/users?includeInactive=1"),
    ]);
    setSchedule(sc.data || {});
    setGroups(gr.data || []);
    setUsers(us.data || []);
  }, [viewDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (editingGroup && groupCardRefs.current[editingGroup]) {
      groupCardRefs.current[editingGroup].scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [editingGroup]);

  const { year, month } = viewDate;
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const toDateStr = (day) => {
    const m = String(month + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${year}-${m}-${d}`;
  };

  const toggleUserStatus = async (dateStr, groupId, userId, current) => {
    const newStatus = current === "working" ? "off" : "working";
    await api.put("/schedule/entry", { groupId, date: dateStr, userId, status: newStatus });
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 2000);
    fetchData();
  };

  // HR/gerencia/ti vê todos os grupos
  // Líder vê apenas os grupos que lidera/co-lidera/é membro
  // Employee vê todos (só para ver status próprio)
  const visibleGroups = isHR
    ? groups
    : user?.role === "leader"
      ? groups.filter((g) => g.leaderId === user.id || g.coLeaderIds?.includes(user.id) || g.memberIds?.includes(user.id))
      : groups;

  const selectedDate    = selectedDay ? new Date(year, month, selectedDay) : null;
  const selectedKey     = selectedDate?.toDateString();
  const selectedData    = selectedKey ? schedule[selectedKey] : null;
  const selectedDateStr = selectedDay ? toDateStr(selectedDay) : null;

  const getUserById = (id) => users.find((u) => u.id === id);

  // Extract vacation overlay from schedule response
  const vacationsByDay = schedule.__vacations || {};
  const selectedDayVacations = selectedKey ? (vacationsByDay[selectedKey] || []) : [];

  // Só grupos com dados escalados neste sábado
  const groupsWithData = selectedData
    ? visibleGroups.filter((g) =>
        selectedData[g.id] &&
        ((selectedData[g.id].working?.length > 0) || (selectedData[g.id].off?.length > 0))
      )
    : [];

  // Lista flat para visão desagrupada
  const allWorking = groupsWithData.flatMap((g) =>
    (selectedData[g.id]?.working || []).map((uid) => ({
      uid, group: g, user: getUserById(uid),
    }))
  ).sort((a, b) => (a.user?.fullName || "").localeCompare(b.user?.fullName || ""));

  const allOff = groupsWithData.flatMap((g) =>
    (selectedData[g.id]?.off || []).map((uid) => ({
      uid, group: g, user: getUserById(uid),
    }))
  ).sort((a, b) => (a.user?.fullName || "").localeCompare(b.user?.fullName || ""));

  const dayTotalWorking = (satData) => satData
    ? visibleGroups.reduce((acc, g) => acc + (satData[g.id]?.working?.length ?? 0), 0)
    : 0;

  const CustomYTick = ({ x, y, payload }) => (
    <text x={x} y={y} dy={4} textAnchor="end" fill={T.t5} fontSize={11}>{payload.value}</text>
  );

  return (
    <div style={{ padding: 28, overflowY: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: T.t1, display: "flex", alignItems: "center", gap: 11 }}><span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", background: T.accent + "1f", color: T.accent, flexShrink: 0 }}><Calendar size={18} /></span>Calendário de Escalas</h1>
          <p style={{ color: T.t8, fontSize: 13 }}>
            {canEdit ? "Clique em um sábado para visualizar ou editar" : "Visualize os turnos do mês"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {saveFlash && <Badge color={T.green}>✓ Salvo</Badge>}
          <Btn variant="ghost" small icon={<ChevronLeft size={14} />}
            onClick={() => { setSelectedDay(null); setViewDate((v) => { const d = new Date(v.year, v.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; }); }}>
            Anterior
          </Btn>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.t1, minWidth: 160, textAlign: "center" }}>
            {MONTH_NAMES[month]} {year}
          </span>
          <Btn variant="ghost" small icon={<ChevronRight size={14} />}
            onClick={() => { setSelectedDay(null); setViewDate((v) => { const d = new Date(v.year, v.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; }); }}>
            Próximo
          </Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
        {/* Grade do mês */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: `1px solid ${T.borderSubtle}` }}>
            {["DOM","SEG","TER","QUA","QUI","SEX","SÁB"].map((d) => (
              <div key={d} style={{ padding: "12px 0", textAlign: "center", fontSize: 10, fontWeight: 700, color: d === "SÁB" ? T.accent : T.t10, letterSpacing: "0.1em" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
            {cells.map((day, idx) => {
              if (!day) return <div key={idx} style={{ minHeight: 108, borderBottom: `1px solid ${T.borderRow}`, borderRight: idx % 7 !== 6 ? `1px solid ${T.borderRow}` : "none" }} />;
              const d          = new Date(year, month, day);
              const isSat      = d.getDay() === 6;
              const isToday    = d.toDateString() === now.toDateString();
              const isSelected = day === selectedDay;
              const satData    = isSat ? schedule[d.toDateString()] : null;
              const totalW     = isSat ? dayTotalWorking(satData) : 0;

              // Feriados do dia
              const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
              const dayHolidays = holidays.filter(h=>h.date===dateStr);
              const isHoliday = dayHolidays.length>0;
              const hasVacation = (vacationsByDay[d.toDateString()] || []).length > 0;

              // Status do employee/líder neste sábado
              let myStatus = null;
              if (isSat) {
                for (const g of groups) {
                  const gd = satData?.[g.id];
                  if (gd?.working?.includes(user.id)) { myStatus = "working"; break; }
                  if (gd?.off?.includes(user.id))     { myStatus = "off";     break; }
                }
              }

              return (
                <div key={idx}
                  onClick={() => (isSat || hasVacation) && setSelectedDay(day === selectedDay ? null : day)}
                  style={{
                    minHeight: 108, padding: 8, position: "relative",
                    borderBottom: `1px solid ${T.borderRow}`,
                    borderRight: idx % 7 !== 6 ? `1px solid ${T.borderRow}` : "none",
                    background: isSelected ? T.bgSelected : isHoliday ? "#BA751708" : (isSat && (user?.role !== "employee" || myStatus)) ? T.bgSaturday : hasVacation ? "#FBBF2408" : "transparent",
                    cursor: ((isSat && (user?.role !== "employee" || myStatus)) || hasVacation) ? "pointer" : "default",
                    transition: "background 0.15s",
                    outline: isSelected ? `2px solid ${T.accent}44` : "none",
                  }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4,
                    background: isToday ? T.accent : isSelected ? T.accent + "22" : "transparent",
                    color: isToday ? "#fff" : isSat ? T.accent : T.t9,
                    fontSize: 12, fontWeight: isToday || isSat ? 700 : 400,
                  }}>{day}</div>

                  {isHoliday&&(
                    <div style={{fontSize:8,fontWeight:700,color:"#BA7517",background:"#BA751718",padding:"1px 4px",borderRadius:3,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}} title={dayHolidays.map(h=>h.name).join(", ")}>
                      {dayHolidays[0].name}{dayHolidays.length>1?` +${dayHolidays.length-1}`:""}
                    </div>
                  )}
                  {isSat && satData && totalW > 0 && (
                    <div style={{ fontSize: 9, color: T.green, fontWeight: 700, marginBottom: 3 }}>
                      {totalW} trabalhando
                    </div>
                  )}

                  {satData && visibleGroups.filter(g => satData[g.id]?.working?.length > 0).slice(0, 3).map((g) => (
                    <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 2 }}>
                      <div style={{ width: 5, height: 5, borderRadius: 1, background: g.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 8, color: T.t8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 60 }}>
                        {g.name.replace(/turma\s*/i, "T.")}
                      </span>
                    </div>
                  ))}

                  {myStatus && (
                    <div style={{ position: "absolute", bottom: 4, right: 4, padding: "2px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: myStatus === "working" ? T.green + "22" : T.red + "22", color: myStatus === "working" ? T.green : T.red }}>
                      {myStatus === "working" ? "TRABALHO" : "FOLGA"}
                    </div>
                  )}
                  {(() => {
                    const vacCount = (vacationsByDay[d.toDateString()] || []).length;
                    return vacCount > 0 ? (
                      <div style={{ position: "absolute", top: 4, right: 4, display: "flex", alignItems: "center", gap: 2, padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: "#FBBF2420", color: "#FBBF24" }}
                        title={`${vacCount} pessoa${vacCount>1?"s":""} de férias`}>
                        🏖️ {vacCount}
                      </div>
                    ) : null;
                  })()}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Painel lateral */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {selectedDay && (selectedData || selectedDayVacations.length > 0) ? (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {/* Cabeçalho */}
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.borderSubtle}`, background: T.bgDeep }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div className="mono" style={{ fontSize: 9, color: T.t10, letterSpacing: "0.12em", marginBottom: 3 }}>DATA SELECIONADA</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: T.t1 }}>
                      {new Date(year, month, selectedDay).toLocaleDateString("pt-BR", { weekday: "short", month: "long", day: "numeric" })}
                    </div>
                  </div>
                  <button onClick={() => setSelectedDay(null)} style={{ background: "none", border: "none", cursor: "pointer", color: T.t9, padding: "2px 6px", borderRadius: 5, fontSize: 14, lineHeight: 1 }}>✕</button>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ fontSize: 11, color: T.green, fontWeight: 700 }}>{allWorking.length} trabalhando</span>
                    <span style={{ fontSize: 11, color: T.t9 }}>{allOff.length} de folga</span>
                    {selectedDayVacations.length > 0 && (
                      <span style={{ fontSize: 11, color: "#FBBF24", fontWeight: 700 }}>🏖️ {selectedDayVacations.length} em férias</span>
                    )}
                  </div>
                  <button
                    onClick={() => { setGrouped(v => !v); setEditingGroup(null); }}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: grouped ? T.accent + "18" : T.bgCard, color: grouped ? T.accent : T.t8, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'Sora',sans-serif" }}>
                    {grouped ? <><Layers size={11} /> Agrupado</> : <><List size={11} /> Lista</>}
                  </button>
                </div>
              </div>

              <div style={{ maxHeight: 520, overflowY: "auto" }}>
                {/* ── Visão Agrupada ── */}
                {grouped && (
                  <div style={{ padding: "10px 14px" }}>
                    {/* Vacation banner */}
                    {selectedDayVacations.length > 0 && (
                      <div style={{ marginBottom: 12, padding: "10px 12px", background: "#FBBF2412", border: "1px solid #FBBF2440", borderRadius: 10 }}>
                        <div style={{ fontSize: 10, color: "#FBBF24", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                          <Umbrella size={11} /> EM FÉRIAS HOJE ({selectedDayVacations.length})
                        </div>
                        {selectedDayVacations.map((v, i) => (
                          <div key={v.userId + i} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                            <div style={{ width: 20, height: 20, borderRadius: "50%", background: (v.groupColor||"#FBBF24")+"33", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: v.groupColor||"#FBBF24", flexShrink: 0 }}>
                              {(v.fullName||"?")[0]}
                            </div>
                            <span style={{ fontSize: 11, color: "#FBBF24", fontWeight: 600, flex: 1 }}>{v.fullName}</span>
                            <span style={{ fontSize: 9, color: "#FBBF2499" }}>
                              até {new Date(v.vacEnd+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {groupsWithData.length === 0 && selectedDayVacations.length === 0 && (
                      <div style={{ fontSize: 12, color: T.t9, padding: 16, textAlign: "center" }}>Sem escala para este dia</div>
                    )}
                    {groupsWithData.length === 0 && selectedDayVacations.length > 0 && null}
                    {groupsWithData.map((g) => {
                      const gData = selectedData[g.id];
                      const isEditingThis = editingGroup === g.id && canEdit;
                      // Admins editam qualquer grupo; líderes só o seu próprio
                      const canEditThis = isHR || (user?.role === "leader" && (g.leaderId === user.id || g.coLeaderIds?.includes(user.id)));

                      return (
                        <div key={g.id} ref={el => { if (el) groupCardRefs.current[g.id] = el; }} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${T.borderRow}` }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                              <div style={{ width: 10, height: 10, borderRadius: 3, background: g.color }} />
                              <span style={{ fontSize: 12, fontWeight: 700, color: T.t2 }}>{g.name}</span>
                            </div>
                            {canEditThis && (
                              <button onClick={() => setEditingGroup(isEditingThis ? null : g.id)}
                                style={{ background: isEditingThis ? T.accent + "22" : "transparent", border: `1px solid ${isEditingThis ? T.accent + "55" : T.border}`, borderRadius: 6, padding: "2px 8px", cursor: "pointer", color: isEditingThis ? T.accent : T.t8, fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, fontFamily: "'Sora',sans-serif" }}>
                                <Edit2 size={10} />{isEditingThis ? "Concluir" : "Editar"}
                              </button>
                            )}
                          </div>

                          {(gData.working || []).length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 9, color: T.green, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 5 }}>
                                TRABALHO ({gData.working.length})
                              </div>
                              {gData.working.map((uid) => {
                                const u = getUserById(uid);
                                const isOnVac = selectedDayVacations.some(v => v.userId === uid);
                                return (
                                  <div key={uid} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, padding: isEditingThis ? "4px 7px" : "2px 0", borderRadius: 7, background: isOnVac ? "#FBBF2410" : isEditingThis ? T.green + "10" : "transparent", border: isEditingThis ? `1px solid ${T.green}33` : "none" }}>
                                    <Avatar name={u?.fullName} size={20} color={isOnVac ? "#FBBF24" : T.green} />
                                    <span style={{ fontSize: 11, color: isOnVac ? "#FBBF24" : T.t3, flex: 1 }}>{u?.fullName || uid}{isOnVac ? " 🏖️" : ""}</span>
                                    {isEditingThis && (
                                      <button onClick={() => toggleUserStatus(selectedDateStr, g.id, uid, "working")}
                                        style={{ background: T.red + "18", border: `1px solid ${T.red}44`, borderRadius: 5, color: T.red, cursor: "pointer", padding: "2px 6px", fontSize: 9, fontWeight: 600, fontFamily: "'Sora',sans-serif", display: "flex", alignItems: "center", gap: 3 }}>
                                        <ArrowLeftRight size={9} /> Folga
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {(gData.off || []).length > 0 && (
                            <div>
                              <div style={{ fontSize: 9, color: T.red, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 5 }}>
                                FOLGA ({gData.off.length})
                              </div>
                              {gData.off.map((uid) => {
                                const u = getUserById(uid);
                                return (
                                  <div key={uid} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, padding: isEditingThis ? "4px 7px" : "2px 0", borderRadius: 7, background: isEditingThis ? T.red + "10" : "transparent", border: isEditingThis ? `1px solid ${T.red}33` : "none" }}>
                                    <Avatar name={u?.fullName} size={20} color={T.t10} />
                                    <span style={{ fontSize: 11, color: T.t7, flex: 1 }}>{u?.fullName || uid}</span>
                                    {isEditingThis && (
                                      <button onClick={() => toggleUserStatus(selectedDateStr, g.id, uid, "off")}
                                        style={{ background: T.green + "18", border: `1px solid ${T.green}44`, borderRadius: 5, color: T.green, cursor: "pointer", padding: "2px 6px", fontSize: 9, fontWeight: 600, fontFamily: "'Sora',sans-serif", display: "flex", alignItems: "center", gap: 3 }}>
                                        <ArrowLeftRight size={9} /> Trabalho
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Visão Lista ── */}
                {!grouped && (
                  <div style={{ padding: "10px 14px" }}>
                    {allWorking.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10, color: T.green, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>
                          TRABALHANDO — {allWorking.length} pessoas
                        </div>
                        {allWorking.map(({ uid, group: g, user: u }) => (
                          <div key={uid + g.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, padding: "5px 8px", borderRadius: 8, background: T.bgDeep, border: `1px solid ${T.border}` }}>
                            <Avatar name={u?.fullName} size={24} color={T.green} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, color: T.t2, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u?.fullName || uid}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                                <div style={{ width: 6, height: 6, borderRadius: 1, background: g.color }} />
                                <span style={{ fontSize: 10, color: T.t9 }}>{g.name}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {allWorking.length > 0 && allOff.length > 0 && (
                      <div style={{ height: 1, background: T.borderSubtle, margin: "8px 0 14px" }} />
                    )}

                    {allOff.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, color: T.red, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>
                          FOLGA — {allOff.length} pessoas
                        </div>
                        {allOff.map(({ uid, group: g, user: u }) => (
                          <div key={uid + g.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, padding: "5px 8px", borderRadius: 8, background: T.bgDeep, border: `1px solid ${T.border}`, opacity: 0.8 }}>
                            <Avatar name={u?.fullName} size={24} color={T.t10} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, color: T.t5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u?.fullName || uid}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                                <div style={{ width: 6, height: 6, borderRadius: 1, background: g.color }} />
                                <span style={{ fontSize: 10, color: T.t10 }}>{g.name}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {allWorking.length === 0 && allOff.length === 0 && (
                      <div style={{ fontSize: 12, color: T.t9, padding: 16, textAlign: "center" }}>Sem escala para este dia</div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card style={{ textAlign: "center", padding: 40 }}>
              <Calendar size={36} style={{ color: T.t9, marginBottom: 12 }} />
              <div style={{ fontSize: 13, color: T.t9 }}>Clique em um sábado ou num dia com 🏖️ para ver detalhes</div>
              {canEdit && <div style={{ fontSize: 11, color: T.t10, marginTop: 6 }}>Clique em Editar para reorganizar membros</div>}
            </Card>
          )}

          {/* Legenda de grupos */}
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: T.t9, fontWeight: 700, marginBottom: 10, letterSpacing: "0.1em" }}>GRUPOS</div>
            {visibleGroups.map((g) => (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: g.color }} />
                <span style={{ fontSize: 12, color: T.t6 }}>{g.name}</span>
                <span style={{ fontSize: 11, color: T.t9, marginLeft: "auto" }}>{g.memberIds?.length ?? 0} membros</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
