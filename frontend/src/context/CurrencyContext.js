import { createContext, useContext, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

const CurrencyContext = createContext(null);
export const useCurrency = () => useContext(CurrencyContext);

export function CurrencyProvider({ children }) {
  const { user } = useAuth();
  const [currency, setCurrencyState] = useState(
    () => localStorage.getItem("bmp_currency") || user?.preferences?.currency || "USD"
  );

  useEffect(() => {
    const stored = localStorage.getItem("bmp_currency");
    if (!stored && user?.preferences?.currency) setCurrencyState(user.preferences.currency);
  }, [user]);

  const setCurrency = (c) => {
    setCurrencyState(c);
    localStorage.setItem("bmp_currency", c);
  };

  const format = (amount) => formatCurrency(amount, currency);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, format }}>
      {children}
    </CurrencyContext.Provider>
  );
}
