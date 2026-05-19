import { createContext, useContext, useState, useEffect } from "react";
const ThemeCtx = createContext(null);
export const THEMES = {
  dark: { bgApp:"#0E0F14",bgSidebar:"#13141A",bgCard:"#1A1B23",bgDeep:"#111219",bgRowAlt:"#16171F",bgSelected:"#1E2030",t1:"#F0F0F8",t2:"#D8D8E8",t3:"#B8B8CC",t4:"#9898AA",t5:"#787888",t6:"#686878",t7:"#686878",t8:"#484858",t9:"#606070",t10:"#404050",t11:"#303040",t12:"#282830",border:"#2A2B38",borderSubtle:"#1E1F2A",borderRow:"#1C1D28",accent:"#00C2FF",accentDark:"#0090CC",purple:"#A78BFA",green:"#34D399",emerald:"#10B981",amber:"#F59E0B",red:"#F87171",blue:"#60A5FA",chartGrid:"#1E1F2A",tooltipBg:"#1A1B23" },
  light: { bgApp:"#F4F5F9",bgSidebar:"#FFFFFF",bgCard:"#FFFFFF",bgDeep:"#F0F1F6",bgRowAlt:"#F8F9FC",bgSelected:"#EEF0FA",t1:"#0E0F14",t2:"#1E1F2A",t3:"#2E2F3E",t4:"#3E3F52",t5:"#4E4F62",t6:"#5E5F72",t7:"#6E6F82",t8:"#8E8FA2",t9:"#9E9FB2",t10:"#AEAFC2",t11:"#BEBFD2",t12:"#CECFE2",border:"#E2E3EE",borderSubtle:"#ECEDF8",borderRow:"#F0F1FA",accent:"#0099CC",accentDark:"#006699",purple:"#7C3AED",green:"#059669",emerald:"#047857",amber:"#D97706",red:"#DC2626",blue:"#2563EB",chartGrid:"#E8E9F4",tooltipBg:"#FFFFFF" },
};
export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    try { const s = localStorage.getItem("shiftsync_theme"); if (s) return s === "dark"; } catch {}
    return true;
  });
  useEffect(() => { try { localStorage.setItem("shiftsync_theme", isDark ? "dark" : "light"); } catch {} }, [isDark]);
  return <ThemeCtx.Provider value={{ theme: isDark ? THEMES.dark : THEMES.light, isDark, toggleTheme: () => setIsDark(v => !v) }}>{children}</ThemeCtx.Provider>;
}
export const useTheme = () => useContext(ThemeCtx);
