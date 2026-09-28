export const CURRENCIES = {
  USD: { symbol: "$", name: "US Dollar", rate: 1.0, locale: "en-US" },
  EUR: { symbol: "€", name: "Euro", rate: 0.92, locale: "de-DE" },
  GBP: { symbol: "£", name: "British Pound", rate: 0.79, locale: "en-GB" },
  INR: { symbol: "₹", name: "Indian Rupee", rate: 83.5, locale: "en-IN" },
};

export function formatCurrency(amountUsd, code = "USD") {
  const c = CURRENCIES[code] || CURRENCIES.USD;
  const converted = (Number(amountUsd) || 0) * c.rate;
  try {
    return new Intl.NumberFormat(c.locale, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(converted);
  } catch {
    return `${c.symbol}${converted.toFixed(2)}`;
  }
}

export function formatNumber(n) {
  return new Intl.NumberFormat("en-US").format(Number(n) || 0);
}

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d)) return value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
