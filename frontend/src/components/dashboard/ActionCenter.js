import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckSquare, PackageX, CalendarClock, FilePen, Receipt, UserCheck, CheckCircle2, ChevronRight, ListChecks } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// How each server-computed action item reads, where it leads, and how urgent it looks.
const ACTIONS = {
  overdue_invoices: { icon: AlertTriangle, tone: "text-rose-500 bg-rose-500/10", link: "/invoices?status=overdue",
    title: (a) => `Chase ${plural(a.count, "overdue invoice")}`, detail: (a, f) => `${f(a.amount)} is past due` },
  overdue_tasks: { icon: CheckSquare, tone: "text-rose-500 bg-rose-500/10", link: "/tasks?status=overdue",
    title: (a) => `${plural(a.count, "task")} past the due date`, detail: () => "Reschedule or finish them" },
  low_stock: { icon: PackageX, tone: "text-amber-600 dark:text-amber-500 bg-amber-500/10", link: "/inventory?low=1",
    title: (a) => `Restock ${plural(a.count, "product")}`, detail: (a) => `${a.names.join(", ")}${a.count > a.names.length ? "…" : ""}` },
  due_soon: { icon: CalendarClock, tone: "text-blue-500 bg-blue-500/10", link: "/invoices?status=unpaid",
    title: (a) => `${plural(a.count, "invoice")} due this week`, detail: (a, f) => `${f(a.amount)} expected` },
  drafts: { icon: FilePen, tone: "text-slate-500 bg-slate-500/10", link: "/invoices?status=draft",
    title: (a) => `Send ${plural(a.count, "draft invoice")}`, detail: (a, f) => `${f(a.amount)} not billed yet` },
  unpaid_expenses: { icon: Receipt, tone: "text-slate-500 bg-slate-500/10", link: "/expenses?status=pending",
    title: (a) => `${plural(a.count, "unpaid bill")}`, detail: (a, f) => `${f(a.amount)} still to pay` },
  won_unconverted: { icon: UserCheck, tone: "text-emerald-600 dark:text-emerald-500 bg-emerald-500/10", link: "/leads",
    title: (a) => `Turn ${plural(a.count, "won deal")} into customers`, detail: () => "So you can invoice them" },
};

/** "What should I do next?" — the dashboard's list of things that need attention, most urgent first. */
export function ActionCenter({ actions, netCash, format }) {
  const navigate = useNavigate();
  const items = actions.filter((a) => ACTIONS[a.id]);
  return (
    <Card className="flex h-full flex-col border-border bg-card shadow-sm" data-testid="action-center">
      <div className="flex items-center gap-2 border-b border-border/70 px-5 py-4">
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-heading text-base font-semibold">Needs your attention</h3>
        {items.length > 0 && <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{items.length}</span>}
      </div>
      <div className="flex-1 divide-y divide-border/50">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-10 text-center" data-testid="action-center-empty">
            <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium">You're all caught up</p>
            <p className="mt-0.5 text-xs text-muted-foreground">No overdue invoices, low stock or late tasks.</p>
          </div>
        ) : items.map((a) => {
          const cfg = ACTIONS[a.id];
          return (
            <button key={a.id} type="button" onClick={() => navigate(cfg.link)} data-testid={`action-${a.id}`}
              className="group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:bg-accent/60 focus-visible:outline-none">
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", cfg.tone)}><cfg.icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{cfg.title(a)}</span>
                <span className="block truncate text-xs text-muted-foreground">{cfg.detail(a, format)}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
            </button>
          );
        })}
      </div>
      {netCash != null && (
        <div className="flex items-center justify-between border-t border-border/70 px-5 py-3 text-xs" title="Payments received minus expenses paid, last 30 days">
          <span className="text-muted-foreground">Net cash flow · last 30 days</span>
          <span className={cn("font-mono font-semibold", netCash >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500")} data-testid="net-cash">
            {netCash >= 0 ? "+" : "−"}{format(Math.abs(netCash))}
          </span>
        </div>
      )}
    </Card>
  );
}
