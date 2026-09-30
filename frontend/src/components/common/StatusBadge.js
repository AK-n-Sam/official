import { cn } from "@/lib/utils";

const STYLES = {
  paid: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  completed: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  done: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  won: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  active: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  sent: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  qualified: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  pending: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  unpaid: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  in_progress: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  partially_paid: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  proposal: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  overdue: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  failed: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  inactive: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  lost: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  cancelled: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  draft: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  todo: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  lead: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  high: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  low: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export function StatusBadge({ status, className }) {
  const key = String(status || "").toLowerCase();
  const label = String(status || "—").replace(/_/g, " ");
  return (
    <span
      data-testid={`status-badge-${key}`}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize tracking-wide",
        STYLES[key] || STYLES.draft,
        className
      )}
    >
      {label}
    </span>
  );
}
