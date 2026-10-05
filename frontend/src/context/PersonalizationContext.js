import { createContext, useContext, useState, useEffect } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const LAYMAN_TERMS = {
  simple: {
    accounts_receivable: "Money customers still owe you",
    accounts_payable: "Money you owe suppliers",
    stale_leads: "People who may need a follow-up",
    revenue: "Money coming in",
    expenses: "Money going out",
    action_queue: "Needs your attention today",
    margin: "Profit margin after costs",
    reorder_level: "Low stock warning point",
  },
  standard: {
    accounts_receivable: "Outstanding customer balance",
    accounts_payable: "Vendor bills unpaid",
    stale_leads: "Inactive leads (>7 days)",
    revenue: "Total sales revenue",
    expenses: "Total operating expenses",
    action_queue: "Action items & alerts",
    margin: "Gross margin %",
    reorder_level: "Reorder threshold",
  },
  advanced: {
    accounts_receivable: "Accounts Receivable (AR)",
    accounts_payable: "Accounts Payable (AP)",
    stale_leads: "Pipeline Lead Aging",
    revenue: "Revenue Inflow",
    expenses: "Operational Expenditure (OpEx)",
    action_queue: "Exception Queue",
    margin: "EBITDA Gross Margin",
    reorder_level: "Safety Stock Trigger",
  }
};

const PersonalizationContext = createContext({});

export function PersonalizationProvider({ children }) {
  const { user } = useAuth();
  const [personalization, setPersonalization] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadPersonalization = () => {
    if (!user) { setLoading(false); return; }
    api.get("/personalization/me")
      .then(({ data }) => setPersonalization(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadPersonalization, [user?.id, user?.active_org_id]);

  const preferences = personalization?.preferences || {
    language_mode: "simple",
    priority_mode: "balanced",
    start_page: "/dashboard",
    density: "comfortable",
    business_goals: ["reduce_overdue", "increase_revenue", "reorder_inventory"]
  };

  const favorites = personalization?.favorites || [];
  const recentHistory = personalization?.recent_history || [];

  const updatePreferences = async (newPrefs) => {
    try {
      const { data } = await api.put("/personalization/me", newPrefs);
      setPersonalization(data);
      toast.success("Personalization preferences saved!");
    } catch (e) {
      toast.error("Failed to save preferences");
    }
  };

  const toggleFavorite = async (item) => {
    try {
      const { data } = await api.post("/personalization/favorites", item);
      setPersonalization((prev) => ({
        ...prev,
        favorites: data.favorites
      }));
      toast.success(data.is_favorite ? `Added "${item.title}" to Favorites` : `Removed "${item.title}" from Favorites`);
    } catch (e) {
      toast.error("Failed to update favorites");
    }
  };

  const logRecent = async (item) => {
    try {
      await api.post("/personalization/recent", item);
    } catch (e) {
      // Non-blocking background call
    }
  };

  const isFavorite = (type, id) => {
    return favorites.some((f) => f.type === type && f.id === id);
  };

  const getTerm = (key) => {
    const mode = preferences.language_mode || "simple";
    return LAYMAN_TERMS[mode]?.[key] || LAYMAN_TERMS.simple[key] || key;
  };

  return (
    <PersonalizationContext.Provider
      value={{
        personalization,
        preferences,
        favorites,
        recentHistory,
        loading,
        updatePreferences,
        toggleFavorite,
        logRecent,
        isFavorite,
        getTerm,
        reloadPersonalization: loadPersonalization
      }}
    >
      {children}
    </PersonalizationContext.Provider>
  );
}

export const usePersonalization = () => useContext(PersonalizationContext);
