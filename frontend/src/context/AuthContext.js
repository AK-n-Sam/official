import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import api, { TOKEN_KEY } from "@/lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

/** What the signed-in user may do in the active workspace (mirrors the server's checks). */
export function usePermissions() {
  const { user } = useAuth();
  const role = user?.role || "member";
  return {
    role,
    isOwner: role === "owner",
    // Owners and admins manage the team, business settings and shared records.
    isManager: role === "owner" || role === "admin",
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      return data;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    (async () => {
      if (localStorage.getItem(TOKEN_KEY)) await loadMe();
      setLoading(false);
    })();
  }, [loadMe]);

  // Raised by the API client when the server says the session is over.
  useEffect(() => {
    const onEnded = (e) => {
      setUser((current) => {
        if (current) toast.error(e.detail || "Your session has ended. Please sign in again.");
        return null;
      });
    };
    window.addEventListener("bmp:session-ended", onEnded);
    return () => window.removeEventListener("bmp:session-ended", onEnded);
  }, []);

  // The login response carries the stored user; /auth/me adds the workspace role and currency.
  const persist = async (data) => {
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    return (await loadMe()) || data.user;
  };

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    return persist(data);
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    return persist(data);
  };

  const googleSession = async (session_id) => {
    const { data } = await api.post("/auth/google/session", { session_id });
    return persist(data);
  };

  const changePassword = async (current_password, new_password) => {
    const { data } = await api.post("/auth/change-password", { current_password, new_password });
    localStorage.setItem(TOKEN_KEY, data.token);
    await loadMe();
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, googleSession, changePassword, logout, refresh: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}
