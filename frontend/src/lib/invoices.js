import { toast } from "sonner";
import { todayIso } from "@/lib/format";

// Statuses that still expect money in. "pending" is the legacy spelling of "sent".
export const UNPAID = ["sent", "pending", "partially_paid", "overdue"];

export const balanceOf = (inv) => Math.round(((inv?.total || 0) - (inv?.amount_paid || 0)) * 100) / 100;
export const displayStatus = (s) => (s === "pending" ? "sent" : s);
export const isPastDue = (inv) => UNPAID.includes(inv.status) && inv.due_date && inv.due_date < todayIso();

/** What the user may do with an invoice right now (mirrors the server's rules). */
export function invoiceActions(inv) {
  const paid = (inv.amount_paid || 0) > 0;
  const bal = balanceOf(inv);
  return {
    send: inv.status === "draft",
    pay: inv.status !== "cancelled" && bal > 0,
    markPaid: !["paid", "cancelled"].includes(inv.status) && bal > 0,
    cancel: !["paid", "cancelled"].includes(inv.status) && !paid,
    reopen: inv.status === "cancelled",
    edit: inv.status !== "cancelled",
    remove: !paid,
  };
}

/** Warn when an invoice asked for more stock than was on the shelf. */
export function showStockWarnings(doc) {
  const warnings = doc?.stock_warnings || [];
  if (warnings.length) {
    toast.warning("Not enough stock for everything on this invoice", { description: warnings.join(" · "), duration: 9000 });
  }
}
