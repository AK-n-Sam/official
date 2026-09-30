// Each workspace records its amounts in one currency (Settings > Business). Amounts are shown in
// that currency as entered; nothing is converted.
export const CURRENCIES = {
  USD: { symbol: "$", name: "US Dollar", locale: "en-US" },
  EUR: { symbol: "€", name: "Euro", locale: "de-DE" },
  GBP: { symbol: "£", name: "British Pound", locale: "en-GB" },
  INR: { symbol: "₹", name: "Indian Rupee", locale: "en-IN" },
};

export function formatCurrency(amount, code = "USD") {
  const c = CURRENCIES[code] || CURRENCIES.USD;
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(c.locale, { style: "currency", currency: code, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${c.symbol}${value.toFixed(2)}`;
  }
}

/** Short form for chart axes: $12k, €1.2M. */
export function formatCompactCurrency(amount, code = "USD") {
  const c = CURRENCIES[code] || CURRENCIES.USD;
  try {
    return new Intl.NumberFormat(c.locale, { style: "currency", currency: code, notation: "compact", maximumFractionDigits: 1 }).format(Number(amount) || 0);
  } catch {
    return `${c.symbol}${Math.round((Number(amount) || 0) / 1000)}k`;
  }
}

export function formatNumber(n) {
  return new Intl.NumberFormat("en-US").format(Number(n) || 0);
}

export function formatDate(value) {
  if (!value) return "—";
  // Plain YYYY-MM-DD dates are calendar days: parse them as local dates so they don't shift a day.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (isNaN(d)) return value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Today's date as YYYY-MM-DD in the user's own timezone (not UTC). */
export function todayIso(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
