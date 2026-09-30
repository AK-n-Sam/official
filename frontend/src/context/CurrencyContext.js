import { createContext, useContext, useMemo } from "react";
import { formatCurrency, formatCompactCurrency, CURRENCIES } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

const CurrencyContext = createContext(null);
export const useCurrency = () => useContext(CurrencyContext);

/** Money is always shown in the active workspace's currency (set in Settings > Business). */
export function CurrencyProvider({ children }) {
  const { user } = useAuth();
  const currency = CURRENCIES[user?.org_currency] ? user.org_currency : "USD";

  const value = useMemo(() => ({
    currency,
    symbol: CURRENCIES[currency].symbol,
    format: (amount) => formatCurrency(amount, currency),
    formatCompact: (amount) => formatCompactCurrency(amount, currency),
  }), [currency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}
