import { createContext, useContext, useEffect, useState } from "react";

const LayoutContext = createContext(null);
export const useLayout = () => useContext(LayoutContext);

export function LayoutProvider({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("bmp_sidebar_collapsed") === "1"
  );
  const [density, setDensityState] = useState(
    () => localStorage.getItem("bmp_density") || "comfortable"
  );

  useEffect(() => {
    localStorage.setItem("bmp_sidebar_collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem("bmp_density", density);
    document.documentElement.dataset.density = density;
  }, [density]);

  const toggleSidebar = () => setSidebarCollapsed((c) => !c);
  const setDensity = (d) => setDensityState(d);

  return (
    <LayoutContext.Provider value={{ sidebarCollapsed, toggleSidebar, density, setDensity }}>
      {children}
    </LayoutContext.Provider>
  );
}
