import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { TOKEN_KEY } from "@/lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const DEMO_USER = {
  id: "demo_usr_01",
  name: "Aniruddh Samarth",
  email: "aniruddh@six6fix.com",
  role: "owner",
  job_title: "Founder & Operator",
  phone: "+1 (555) 019-2831",
  organization_name: "Six6Fix Inc.",
  preferences: { currency: "USD", timezone: "America/New_York", theme: "dark" }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      return data;
    } catch {
      setUser(DEMO_USER);
      return DEMO_USER;
    }
  }, []);

  useEffect(() => {
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    (async () => {
      const res = await loadMe();
      if (!res) {
        setUser(DEMO_USER);
      }
      setLoading(false);
    })();
  }, [loadMe]);

  const persist = (data) => {
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
  };

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    persist(data);
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    persist(data);
    return data.user;
  };

  const googleSession = async (session_id) => {
    const { data } = await api.post("/auth/google/session", { session_id });
    persist(data);
    return data.user;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, googleSession, logout, refresh: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}
