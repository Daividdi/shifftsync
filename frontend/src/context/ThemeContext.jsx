import { createContext, useContext, useState, useEffect } from "react";
const ThemeCtx = createContext(null);
export const THEMES = {
  dark: { bgApp:"#0E0F14",bgSidebar:"#13141A",bgCard:"#1A1B23",bgDeep:"#111219",bgRowAlt:"#16171F",bgSelected:"#1E2030",t1:"#F0F0F8",t2:"#D8D8E8",t3:"#B8B8CC",t4:"#9898AA",t5:"#787888",t6:"#686878",t7:"#686878",t8:"#686878",t9:"#787888",t10:"#585868",t11:"#303040",t12:"#282830",border:"#2A2B38",borderSubtle:"#1E1F2A",borderRow:"#1C1D28",accent:"#00C2FF",accentDark:"#0090CC",purple:"#A78BFA",green:"#34D399",emerald:"#10B981",amber:"#F59E0B",red:"#F87171",blue:"#60A5FA",chartGrid:"#1E1F2A",tooltipBg:"#1A1B23" },
  light: { bgApp:"#F4F5F9",bgSidebar:"#FFFFFF",bgCard:"#FFFFFF",bgDeep:"#F0F1F6",bgRowAlt:"#F8F9FC",bgSelected:"#EEF0FA",t1:"#0E0F14",t2:"#1E1F2A",t3:"#2E2F3E",t4:"#3E3F52",t5:"#4E4F62",t6:"#5E5F72",t7:"#6E6F82",t8:"#8E8FA2",t9:"#9E9FB2",t10:"#AEAFC2",t11:"#BEBFD2",t12:"#CECFE2",border:"#E2E3EE",borderSubtle:"#ECEDF8",borderRow:"#F0F1FA",accent:"#0099CC",accentDark:"#006699",purple:"#7C3AED",green:"#059669",emerald:"#047857",amber:"#D97706",red:"#DC2626",blue:"#2563EB",chartGrid:"#E8E9F4",tooltipBg:"#FFFFFF" },
};

// Selectable accent colors layered on top of the dark/light base. Only the
// accent (buttons, links, highlights, focus rings, chart series) changes —
// backgrounds, text and borders stay from the base theme, so nothing else
// shifts. `gradient` is optional and used for the Pride rainbow.
export const ACCENTS = {
  blue:    { label: "Azul",      accent: "#00C2FF", accentDark: "#0090CC" },
  emerald: { label: "Esmeralda", accent: "#10B981", accentDark: "#0E8F66" },
  violet:  { label: "Violeta",   accent: "#A78BFA", accentDark: "#7C5CE6" },
  amber:   { label: "Âmbar",     accent: "#F59E0B", accentDark: "#C77D08" },
  rose:    { label: "Rosa",      accent: "#FB7185", accentDark: "#E11D48" },
  pride:   { label: "Pride",     accent: "#E0249A", accentDark: "#A21CAF",
             gradient: "linear-gradient(90deg,#E40303,#FF8C00,#FFED00,#008026,#004DFF,#750787)" },
};

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    try { const s = localStorage.getItem("shiftsync_theme"); if (s) return s === "dark"; } catch {}
    return true;
  });
  const [accentKey, setAccentKey] = useState(() => {
    try { const a = localStorage.getItem("shiftsync_accent"); if (a && ACCENTS[a]) return a; } catch {}
    return "blue";
  });
  useEffect(() => { try { localStorage.setItem("shiftsync_theme", isDark ? "dark" : "light"); } catch {} }, [isDark]);
  useEffect(() => { try { localStorage.setItem("shiftsync_accent", accentKey); } catch {} }, [accentKey]);

  const base = isDark ? THEMES.dark : THEMES.light;
  const ac   = ACCENTS[accentKey] || ACCENTS.blue;
  // Neutral base surfaces (no tint film). The theme restyles crisply through
  // the accent — text, buttons, active states, focus rings, scrollbar, chart
  // series — never as a translucent wash over the backgrounds.
  const theme = {
    ...base,
    accent: ac.accent,
    accentDark: ac.accentDark,
    accentGradient: ac.gradient || `linear-gradient(135deg, ${ac.accent}, ${ac.accentDark})`,
  };
  const setAccent = (k) => { if (ACCENTS[k]) setAccentKey(k); };

  return (
    <ThemeCtx.Provider value={{ theme, isDark, toggleTheme: () => setIsDark(v => !v), accentKey, setAccent, ACCENTS }}>
      {children}
    </ThemeCtx.Provider>
  );
}
export const useTheme = () => useContext(ThemeCtx);
