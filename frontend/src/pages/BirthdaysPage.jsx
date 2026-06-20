import React, { useState, useEffect, useCallback } from "react";
import { Cake, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Card, Avatar, Input } from "../components/UI";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../hooks/useAuth";
import api from "../api/client";

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const MONTH_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function firstDayOfMonth(year, month) { return new Date(year, month, 1).getDay(); }

export default function BirthdaysPage() {
  const { theme: T } = useTheme();
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear]  = useState(now.getFullYear());
  const [birthdays, setBirthdays] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedDay, setSelectedDay] = useState(null);

  const fetchBirthdays = useCallback(async () => {
    try { const { data } = await api.get("/users/birthdays"); setBirthdays(data || []); } catch (_) {}
  }, []);

  useEffect(() => { fetchBirthdays(); }, [fetchBirthdays]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMMDD = `${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  const inMonth = birthdays.filter(b => b.month === viewMonth + 1);
  const byDay = {};
  for (const b of inMonth) { (byDay[b.day] = byDay[b.day] || []).push(b); }
  const todayBirthdays = birthdays.filter(b => b.isToday);

  const searchLower = search.toLowerCase();
  const searchResults = search
    ? birthdays.filter(b => b.fullName?.toLowerCase().includes(searchLower) || b.dept?.toLowerCase().includes(searchLower))
        .sort((a, b2) => a.daysUntil - b2.daysUntil)
    : null;

  const prevMonth = () => { setSelectedDay(null); setViewMonth(m => m === 0 ? 11 : m - 1); };
  const nextMonth = () => { setSelectedDay(null); setViewMonth(m => m === 11 ? 0 : m + 1); };

  const cells = [
    ...Array.from({ length: firstDayOfMonth(viewYear, viewMonth) }, () => null),
    ...Array.from({ length: daysInMonth(viewYear, viewMonth) }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const isToday = (day) =>
    day && viewMonth === today.getMonth() && viewYear === today.getFullYear() && day === today.getDate();

  const selectedPeople = selectedDay ? (byDay[selectedDay] || []) : [];

  return (
    <div style={{ padding: "18px 24px", overflowY: "auto", maxWidth: 940, margin: "0 auto", width: "100%" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: "linear-gradient(135deg, #F472B6, #EC4899)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            boxShadow: "0 4px 16px #EC489930",
          }}>
            <Cake size={19} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 800, color: T.t1, margin: 0 }}>Aniversários</h1>
            <p style={{ color: T.t8, fontSize: 13, margin: 0 }}>
              {birthdays.length} colegas com data de nascimento cadastrada
            </p>
          </div>
        </div>
        <div style={{ width: 240 }}>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar colega..." icon={<Search size={13} />} />
        </div>
      </div>

      {/* ── Banner hoje ── */}
      {todayBirthdays.length > 0 && !search && (
        <div style={{
          marginBottom: 14, padding: "11px 18px",
          background: "linear-gradient(135deg, #EC4899 0%, #F472B6 50%, #FB7185 100%)",
          borderRadius: 14, display: "flex", alignItems: "center", gap: 16,
          boxShadow: "0 4px 28px #EC489940",
        }}>
          <span style={{ fontSize: 36 }}>🎂</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", opacity: 0.85, letterSpacing: "0.1em", marginBottom: 6 }}>
              ANIVERSÁRIO HOJE!
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {todayBirthdays.map(b => (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.22)", borderRadius: 20, padding: "5px 14px 5px 6px" }}>
                  <Avatar name={b.fullName} size={26} color="#fff" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{b.fullName}</span>
                  {b.dept && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>· {b.dept}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Busca ── */}
      {searchResults && (
        <Card style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: T.t9, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 14 }}>
            {searchResults.length} RESULTADO{searchResults.length !== 1 ? "S" : ""}
          </div>
          {searchResults.length === 0
            ? <div style={{ color: T.t9, fontSize: 13, textAlign: "center", padding: "20px 0" }}>Nenhum resultado encontrado</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {searchResults.map(b => <BirthdayRow key={b.id} b={b} T={T} todayMMDD={todayMMDD} />)}
              </div>
          }
        </Card>
      )}

      {/* ── Layout principal ── */}
      {!search && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── Calendário (largura total) ── */}
          <Card style={{ padding: 0, overflow: "hidden" }}>
            {/* Nav do mês */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 18px", borderBottom: `1px solid ${T.borderSubtle}` }}>
              <button onClick={prevMonth} style={{ background: "none", border: "none", color: T.t6, cursor: "pointer", padding: 6, borderRadius: 8, display: "flex", transition: "background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background = T.bgDeep}
                onMouseLeave={e => e.currentTarget.style.background = "none"}>
                <ChevronLeft size={18} />
              </button>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.t1 }}>{MONTH_NAMES[viewMonth]} {viewYear}</div>
                {inMonth.length > 0 && (
                  <div style={{ fontSize: 11, color: "#EC4899", fontWeight: 600, marginTop: 2 }}>
                    🎂 {inMonth.length} aniversário{inMonth.length > 1 ? "s" : ""} este mês
                  </div>
                )}
              </div>
              <button onClick={nextMonth} style={{ background: "none", border: "none", color: T.t6, cursor: "pointer", padding: 6, borderRadius: 8, display: "flex", transition: "background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background = T.bgDeep}
                onMouseLeave={e => e.currentTarget.style.background = "none"}>
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Cabeçalho dias */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: `1px solid ${T.borderSubtle}`, background: T.bgDeep }}>
              {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d => (
                <div key={d} style={{ padding: "6px 0", textAlign: "center", fontSize: 11, fontWeight: 700, color: T.t9, letterSpacing: "0.06em" }}>{d}</div>
              ))}
            </div>

            {/* Grade */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
              {cells.map((day, idx) => {
                const hasBday = day && byDay[day];
                const isSelected = day === selectedDay;
                const isTod = isToday(day);
                return (
                  <div key={idx}
                    onClick={() => day && hasBday && setSelectedDay(isSelected ? null : day)}
                    style={{
                      minHeight: 82, padding: "6px 8px",
                      borderBottom: `1px solid ${T.borderRow}`,
                      borderRight: idx % 7 !== 6 ? `1px solid ${T.borderRow}` : "none",
                      background: isSelected ? "#EC489918" : isTod ? T.accent + "0D" : "transparent",
                      cursor: hasBday ? "pointer" : "default",
                      transition: "background 0.12s",
                      outline: isSelected ? `2px solid #EC489950` : "none",
                      outlineOffset: -2,
                    }}
                    onMouseEnter={e => { if (hasBday && !isSelected) e.currentTarget.style.background = T.bgDeep; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isSelected ? "#EC489918" : isTod ? T.accent + "0D" : "transparent"; }}
                  >
                    {day && (
                      <>
                        <div style={{
                          width: 21, height: 21, borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: isTod ? 800 : 400,
                          color: isTod ? "#fff" : T.t5,
                          background: isTod ? T.accent : "transparent",
                          marginBottom: 3,
                        }}>{day}</div>
                        {hasBday && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {byDay[day].slice(0, 2).map(b => (
                              <div key={b.id} style={{
                                display: "flex", alignItems: "center", gap: 4,
                                background: b.isToday ? "#EC4899" : "#EC489922",
                                borderRadius: 5, padding: "1px 6px",
                              }}>
                                <span style={{ fontSize: 9 }}>🎂</span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: b.isToday ? "#fff" : "#EC4899", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
                                  {b.fullName?.split(" ")[0]}
                                </span>
                              </div>
                            ))}
                            {byDay[day].length > 2 && (
                              <div style={{ fontSize: 9.5, color: "#EC4899", paddingLeft: 4, fontWeight: 600 }}>+{byDay[day].length - 2}</div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* ── Detalhes do dia selecionado (abaixo do calendário) ── */}
          {selectedDay && (
            <div>
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", background: "#EC489912", borderBottom: `1px solid #EC489928`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#EC4899", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 2 }}>DIA SELECIONADO</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#EC4899" }}>
                      {selectedDay} de {MONTH_NAMES[viewMonth]}
                      <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 6 }}>· {selectedPeople.length} aniversariante{selectedPeople.length > 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <button onClick={() => setSelectedDay(null)} style={{ background: "#EC489918", border: "none", cursor: "pointer", color: "#EC4899", display: "flex", padding: 6, borderRadius: 8 }}>
                    <X size={14} />
                  </button>
                </div>
                <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                  {selectedPeople.map(b => <BirthdayRow key={b.id} b={b} T={T} todayMMDD={todayMMDD} />)}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BirthdayRow({ b, T, todayMMDD, compact }) {
  const isT = b.isToday;
  const [mm, dd] = b.mmdd.split("-");
  const dateLabel = `${dd}/${mm}`;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: compact ? 10 : 14,
      padding: compact ? "8px 10px" : "10px 14px",
      background: isT ? "#EC489912" : T.bgDeep,
      borderRadius: 10,
      border: `1px solid ${isT ? "#EC489938" : T.border}`,
    }}>
      <Avatar name={b.fullName} size={compact ? 30 : 34} color={isT ? "#EC4899" : T.accent} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: compact ? 12 : 13, fontWeight: 600, color: isT ? "#EC4899" : T.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isT && "🎂 "}{b.fullName}
        </div>
        {b.dept && <div style={{ fontSize: 11, color: T.t9, marginTop: 1 }}>{b.dept}</div>}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: isT ? "#EC4899" : T.t3, fontVariantNumeric: "tabular-nums" }}>{dateLabel}</div>
        <div style={{ fontSize: 10, color: isT ? "#EC4899" : T.t9, fontWeight: isT ? 700 : 400, marginTop: 1 }}>
          {isT ? "Hoje! 🎉" : b.daysUntil === 1 ? "amanhã" : `em ${b.daysUntil}d`}
        </div>
      </div>
    </div>
  );
}
