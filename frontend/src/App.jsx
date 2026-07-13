import React, { useState } from "react";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import Sidebar from "./components/Sidebar";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import CalendarPage from "./pages/CalendarPage";
import ScheduleManager from "./pages/ScheduleManager";
import SwapRequests from "./pages/SwapRequests";
import GroupsManager from "./pages/GroupsManager";
import UsersManager from "./pages/UsersManager";
import Reports from "./pages/Reports";
import AbsenceControl from "./pages/AbsenceControlNew";
import MeetingRoom from "./pages/MeetingRoom";
import OccurrencesPage from "./pages/OccurrencesPage";
import HolidaysManager from "./pages/HolidaysManager";
import BirthdaysPage from "./pages/BirthdaysPage";
import PontoPage from "./pages/PontoPage";
import BatidasPage from "./pages/BatidasPage";
import PontoSaldoPage from "./pages/PontoSaldoPage";
import VacationsPage from "./pages/VacationsPage";
import MuralPage from "./pages/MuralPage";
import FormsPage from "./pages/FormsPage";
import DocumentsPage from "./pages/DocumentsPage";
import BIPage from "./pages/BIPage";
import PersonalIndicatorsPage from "./pages/PersonalIndicatorsPage";
import KpiDentistasPage from "./pages/KpiDentistasPage";
import PlataformasPage from "./pages/PlataformasPage";
import FocusGamePage from "./pages/FocusGamePage";
import { GameTimerProvider } from "./context/GameTimerContext";
import AbsenceAlert from "./components/AbsenceAlert";

const S = ["* { box-sizing: border-box; } body { font-family: 'Sora', sans-serif; margin: 0; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; font-variant-numeric: tabular-nums; }",".mono { font-family: 'JetBrains Mono', monospace; }","h1,h2,h3 { text-wrap: balance; }","p { text-wrap: pretty; }","button:not([disabled]) { transition-property: transform; transition-duration: 150ms; transition-timing-function: ease-out; }","button:not([disabled]):active { transform: scale(0.96); }","@keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }","@keyframes spin { to { transform: rotate(360deg); } }",".fade-up { animation: fadeUp 0.35s ease forwards; }",
".wf-in { animation: fadeUp 0.35s cubic-bezier(0.2, 0, 0, 1) both; }",
".wf-card { transition: transform .18s ease, box-shadow .18s ease; } .wf-card:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(0,0,0,.16), 0 2px 10px rgba(0,0,0,.10); }",
"@keyframes wfShimmer { from { background-position: -300px 0; } to { background-position: 300px 0; } } .wf-skel { border-radius: 12px; background: linear-gradient(90deg, rgba(127,127,127,.09) 25%, rgba(127,127,127,.20) 50%, rgba(127,127,127,.09) 75%); background-size: 600px 100%; animation: wfShimmer 1.15s linear infinite; }",
"@keyframes wfRingFill { from { stroke-dashoffset: var(--wfc); } }",
"@keyframes wfBarGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }"].join("\n");

function AppContent() {
  const { user, loading } = useAuth();
  const { theme: T, isDark } = useTheme();
  const [active, setActive] = useState("dashboard");
  const [focusGame, setFocusGame] = useState(null);

  React.useEffect(() => {
    if (user?.role==="employee") setActive(a=>["dashboard","calendar","absences","meeting","holidays","birthdays","batidas","vacations","ponto","saldo_horas","mural","forms","documents","bi","indicadores"].includes(a)?a:"calendar");
  }, [user?.role]);

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bgApp}}>
      <div style={{textAlign:"center"}}>
        <div style={{width:40,height:40,border:"3px solid "+T.border,borderTopColor:T.accent,borderRadius:"50%",animation:"spin 0.7s linear infinite",margin:"0 auto 16px"}}/>
        <div style={{color:T.t9,fontSize:13}}>Carregando...</div>
      </div>
    </div>
  );

  if (!user) return <LoginPage/>;

  const EMPLOYEE_PAGES = new Set(["dashboard","calendar","absences","meeting","holidays","birthdays","batidas","vacations","ponto","saldo_horas","mural","forms","documents","bi","plataformas","focus-game","indicadores","kpi_dentistas"]);

  function openGame(url, title) {
    setFocusGame({ url, title });
    setActive("focus-game");
  }

  const renderPage = () => {
    const isEmployee = user?.role === "employee";
    const safePage = isEmployee && !EMPLOYEE_PAGES.has(active) ? "calendar" : active;
    switch(safePage) {
      case "dashboard":   return <Dashboard/>;
      case "calendar":    return <CalendarPage/>;
      case "schedule":    return <ScheduleManager/>;
      case "swaps":       return <SwapRequests/>;
      case "groups":      return <GroupsManager/>;
      case "users":       return <UsersManager/>;
      case "reports":     return <Reports/>;
      case "absences":    return <AbsenceControl/>;
      case "meeting":     return <MeetingRoom/>;
      case "occurrences": return <OccurrencesPage/>;
      case "holidays":    return <HolidaysManager/>;
      case "birthdays":   return <BirthdaysPage/>;
      case "ponto":       return <PontoPage/>;
      case "vacations":   return <VacationsPage/>;
      case "batidas":     return <BatidasPage/>;
      case "saldo_horas": return <PontoSaldoPage/>;
      case "mural":       return <MuralPage/>;
      case "forms":       return <FormsPage/>;
      case "documents":   return <DocumentsPage/>;
      case "bi":          return <BIPage/>;
      case "indicadores": return <PersonalIndicatorsPage/>;
      case "kpi_dentistas": return <KpiDentistasPage/>;
      case "plataformas": return <PlataformasPage onOpenGame={openGame}/>;
      case "focus-game":  return <FocusGamePage url={focusGame?.url} title={focusGame?.title} onBack={() => setActive("plataformas")}/>;
      default:            return <CalendarPage/>;
    }
  };

  const scrollbarCss = isDark
    ? `
      ::-webkit-scrollbar { width: 7px; height: 7px; }
      ::-webkit-scrollbar-track { background: #111219; }
      ::-webkit-scrollbar-thumb { background: ${T.accent}55; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: ${T.accent}99; }
    `
    : `
      ::-webkit-scrollbar { width: 7px; height: 7px; }
      ::-webkit-scrollbar-track { background: #ECEDF8; }
      ::-webkit-scrollbar-thumb { background: ${T.accent}66; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: ${T.accent}aa; }
    `;

  return (
    <GameTimerProvider userId={user?.id}>
    <>
    <style>{scrollbarCss}
      {`@keyframes logoShine {
        0% { transform: translateX(-160%) skewX(-12deg); }
        18% { transform: translateX(240%) skewX(-12deg); }
        100% { transform: translateX(240%) skewX(-12deg); }
      }
      .ss-collapsed .ss-label,
      .ss-collapsed .ss-hide,
      .ss-collapsed .ss-group-header { display: none !important; }
      .ss-collapsed .ss-group-children { display: block !important; padding-left: 0 !important; }
      .ss-collapsed .ss-navitem {
        justify-content: center !important;
        gap: 0 !important;
        padding-left: 10px !important; padding-right: 10px !important;
        border-left-color: transparent !important;
      }
      .ss-collapsed .ss-logo { height: auto !important; max-width: 46px; }`}
      {`::selection { background: ${T.accent}55; color: #fff; }
      @keyframes prideFlow { 0% { background-position: 0% 50%; } 100% { background-position: 220% 50%; } }
      @keyframes swatchRipple { 0% { transform: scale(0.5); opacity: 0.85; } 100% { transform: scale(2.05); opacity: 0; } }`}
    </style>
    <div style={{display:"flex",height:"100vh",overflow:"hidden",background:T.bgApp,color:T.t1,transition:"background 0.25s"}}>
      <AbsenceAlert onNavigate={setActive}/>
      <Sidebar active={active} setActive={setActive}/>
      <main className={active === "focus-game" ? undefined : "fade-up"} key={active} style={{flex:1,overflow:active==="focus-game"?"hidden":"auto",background:T.bgApp,display:"flex",flexDirection:"column"}}>
        {renderPage()}
      </main>
    </div>
    </>
    </GameTimerProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <style>{S}</style>
        <AppContent/>
      </AuthProvider>
    </ThemeProvider>
  );
}
