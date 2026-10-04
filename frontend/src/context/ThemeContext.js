import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

const getSystemTheme = () =>
  window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export function ThemeProvider({ children }) {
  // pref: "system" | "light" | "dark". Default is dark theme for high-contrast SaaS aesthetic.
  const [pref, setPref] = useState(() => localStorage.getItem("bmp_theme") || "dark");
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const theme = pref === "system" ? systemTheme : pref;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    localStorage.setItem("bmp_theme", pref);
  }, [theme, pref]);

  const toggleTheme = () => setPref(theme === "dark" ? "light" : "dark");
  const setThemePref = (p) => setPref(p);

  return (
    <ThemeContext.Provider value={{ theme, pref, toggleTheme, setThemePref }}>
      {children}
    </ThemeContext.Provider>
  );
}
