import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, CalendarClock, FilePen, PackageX, Receipt, CheckSquare, UserCheck, UserRound, CheckCircle2,
  MoreHorizontal, ShoppingCart, HandCoins, PackagePlus, ReceiptText, Clock, Landmark, FileCheck2, RotateCcw, Sparkles, Loader2,
} from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { useActions } from "@/components/actions/ActionsProvider";
import { useDataChanged, notifyDataChanged } from "@/hooks/useDataChanged";
import { todayIso } from "@/lib/format";
import { RecordPaymentModal } from "@/components/modules/RecordPaymentModal";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const KIND = {
  overdue_invoice: { icon: AlertTriangle, tone: "text-rose-500 bg-rose-500/10" },
  due_soon_invoice: { icon: CalendarClock, tone: "text-blue-500 bg-blue-500/10" },
  draft_invoice: { icon: FilePen, tone: "text-slate-500 bg-slate-500/10" },
  low_stock: { icon: PackageX, tone: "text-amber-600 dark:text-amber-500 bg-amber-500/10" },
  unpaid_expense: { icon: Receipt, tone: "text-slate-500 bg-slate-500/10" },
  task: { icon: CheckSquare, tone: "text-violet-500 bg-violet-500/10" },
  won_lead: { icon: UserCheck, tone: "text-emerald-600 dark:text-emerald-500 bg-emerald-500/10" },
  quiet_customer: { icon: UserRound, tone: "text-sky-600 dark:text-sky-500 bg-sky-500/10" },
  bank_review: { icon: Landmark, tone: "text-emerald-600 dark:text-emerald-500 bg-emerald-500/10" },
  approval: { icon: FileCheck2, tone: "text-blue-500 bg-blue-500/10" },
  automation_failed: { icon: RotateCcw, tone: "text-rose-500 bg-rose-500/10" },
};

/** One line on what the platform did by itself in the last day, and whether it's still busy. */
function DoneForYou({ automation, onOpen }) {
  if (!automation || (!automation.done_count && !automation.processing)) return null;
  const latest = automation.recent[0]?.message;
  return (
    <button type="button" onClick={onOpen} data-testid="today-done-for-you"
      className="flex w-full items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-left text-sm transition-colors hover:border-emerald-500/40">
      {automation.processing ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-emerald-600" /> : <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
      <span className="min-w-0">
        <span className="font-medium">
          {automation.done_count ? `Done for you: ${automation.done_count} thing${automation.done_count === 1 ? "" : "s"} in the last day` : "Working in the background"}
          {automation.processing ? ` · ${automation.processing} still processing` : ""}
        </span>
        {latest && <span className="block truncate text-xs text-muted-foreground">Latest: {latest}</span>}
      </span>
    </button>
  );
}

const tomorrow = () => todayIso(1);

function Stat({ label, value, sub, onClick, testId }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId}
      className="rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:border-primary/40 focus-visible:border-primary/60 focus-visible:outline-none">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </button>
  );
}

export default function Today() {
  const { user } = useAuth();
  const { format } = useCurrency();
  const actions = useActions();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busyKey, setBusyKey] = useState("");
  const [payFor, setPayFor] = useState(null);

  const load = useCallback(() => {
    api.get("/today").then(({ data: d }) => { setData(d); setError(null); }).catch((e) => setError(e));
  }, []);
  useEffect(load, [load, user?.active_org_id]);
  useDataChanged(load);

  // Hide an item straight away; the next refresh confirms it.
  const drop = (key) => setData((d) => d && { ...d, items: d.items.filter((i) => i.key !== key), total: d.total - 1 });

  // One-click resolutions, each with an Undo instead of an "are you sure?" dialog.
  const run = async (item, doIt, message, undo) => {
    setBusyKey(item.key);
    try {
      await doIt();
      drop(item.key);
      toast.success(message, undo ? { action: { label: "Undo", onClick: async () => { try { await undo(); notifyDataChanged(); } catch (e) { toast.error(formatApiError(e)); } } } } : undefined);
      notifyDataChanged();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusyKey(""); }
  };

  const snooze = (item, days) => run(item, () => api.post("/today/snooze", { key: item.key, days }),
    `Hidden until ${days === 1 ? "tomorrow" : `${days} days from now`}`, () => api.delete(`/today/snooze/${encodeURIComponent(item.key)}`));

  const invoiceFor = (c) => ({ id: c.invoice_id, invoice_number: c.invoice_number, customer_name: c.customer_name, total: c.total, amount_paid: c.total - c.balance });

  // What each kind of item offers: the main resolution first.
  const buttonsFor = (item) => {
    const c = item.context;
    switch (item.kind) {
      case "overdue_invoice":
      case "due_soon_invoice":
        return [
          { label: "Record payment", primary: item.kind === "overdue_invoice", onClick: () => setPayFor(invoiceFor(c)) },
          { label: c.reminder_count ? "Remind again" : "Send reminder", primary: item.kind === "due_soon_invoice", onClick: () => actions.remind({ invoiceId: c.invoice_id }) },
        ];
      case "draft_invoice":
        return [{ label: "Mark sent", primary: true, onClick: () => run(item, () => api.post(`/invoices/${c.invoice_id}/status`, { status: "sent" }),
          `${c.invoice_number} marked sent`, () => api.post(`/invoices/${c.invoice_id}/status`, { status: "draft" })) }];
      case "low_stock":
        return [{ label: `Restock ${c.suggested_qty}`, primary: true, onClick: () => actions.buyStock({ items: [{ product_id: c.product_id, quantity: c.suggested_qty }], supplierId: c.supplier_id }) }];
      case "unpaid_expense":
        return [{ label: "Mark paid", primary: true, onClick: () => run(item, () => api.put(`/expenses/${c.expense_id}`, { status: "paid" }),
          `${c.vendor || c.category} marked paid`, () => api.put(`/expenses/${c.expense_id}`, { status: "pending" })) }];
      case "task":
        return [
          { label: "Done", primary: true, onClick: () => run(item, () => api.put(`/tasks/${c.task_id}`, { status: "completed" }), "Task done", () => api.put(`/tasks/${c.task_id}`, { status: "todo" })) },
          { label: "Tomorrow", onClick: () => run(item, () => api.put(`/tasks/${c.task_id}`, { due_date: tomorrow() }), "Moved to tomorrow", () => api.put(`/tasks/${c.task_id}`, { due_date: c.due_date })) },
        ];
      case "won_lead":
        return [{ label: "Make customer", primary: true, onClick: () => run(item, async () => {
          const { data: cust } = await api.post(`/leads/${c.lead_id}/convert`);
          toast(`${cust.name} is a customer now`, { action: { label: "Make a sale", onClick: () => actions.sell({ customer: { id: cust.id, name: cust.name } }) } });
        }, "Converted") }];
      case "bank_review":
        return [{ label: "Confirm", primary: true, onClick: () => navigate("/bank") }];
      case "quiet_customer":
        return [{ label: "Follow up", primary: true, onClick: () => actions.followUp({ customerId: c.customer_id, customerName: c.name, title: `Check in with ${c.name}` }) }];
      case "approval":
        return [
          { label: c.failed ? "Try again" : "Approve", primary: true, onClick: async () => {
            setBusyKey(item.key);
            try {
              const { data: res } = await api.post(`/automation/approvals/${c.approval_id}/approve`);
              drop(item.key);
              const invId = res.result?.invoice_id;
              toast.success(res.result?.message || "Done", invId ? { action: { label: "Open", onClick: () => navigate(`/invoices/${invId}`) } } : undefined);
              notifyDataChanged();
            } catch (e) { toast.error(formatApiError(e)); load(); } finally { setBusyKey(""); }
          } },
          { label: "Skip", onClick: () => run(item, () => api.post(`/automation/approvals/${c.approval_id}/reject`), "Skipped") },
        ];
      case "automation_failed":
        return [{ label: "Retry", primary: true, onClick: () => run(item, () => api.post(`/automation/jobs/${c.job_id}/retry`), "Queued to run again") }];
      default:
        return [];
    }
  };

  const openRecord = (item) => {
    const c = item.context;
    if (c.invoice_id) return navigate(`/invoices/${c.invoice_id}`);
    if (c.customer_id) return navigate(`/customers/${c.customer_id}`);
    if (c.product_id) return navigate(`/products?q=${encodeURIComponent(c.name)}`);
    if (c.expense_id) return navigate(`/expenses?q=${encodeURIComponent(c.category)}`);
    if (c.lead_id) return navigate(`/leads?q=${encodeURIComponent(c.name)}`);
    if (c.task_id) return navigate(`/tasks?q=${encodeURIComponent(item.title)}`);
    if (item.kind === "bank_review") return navigate("/bank");
    if (item.kind === "approval" || item.kind === "automation_failed") return navigate("/settings?tab=automation");
  };

  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (user?.name || "").split(" ")[0];

  const QUICK = [
    { label: "Make a sale", icon: ShoppingCart, onClick: () => actions.sell(), primary: true, testId: "today-sell" },
    { label: "Get paid", icon: HandCoins, onClick: () => actions.getPaid(), testId: "today-get-paid" },
    { label: "Record an expense", icon: ReceiptText, onClick: () => navigate("/expenses?new=1"), testId: "today-expense" },
    { label: "Buy stock", icon: PackagePlus, onClick: () => actions.buyStock(), testId: "today-buy" },
  ];

  return (
    <div className="space-y-6 animate-in-up">
      <div>
        <p className="text-sm text-muted-foreground">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl" data-testid="today-title">{greet}{firstName ? `, ${firstName}` : ""}</h1>
      </div>

      <WelcomeBanner />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="today-actions">
        {QUICK.map((q) => (
          <Button key={q.label} variant={q.primary ? "default" : "outline"} onClick={q.onClick} className="h-12 justify-start gap-2 text-sm" data-testid={q.testId}>
            <q.icon className="h-4 w-4" /> {q.label}
          </Button>
        ))}
      </div>

      {error && !data ? <ErrorState message={formatApiError(error)} onRetry={load} /> : !data ? (
        <div className="space-y-3"><div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div><Skeleton className="h-72 rounded-xl" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Money in this week" value={format(data.summary.money_in_week)} sub="payments received" onClick={() => navigate("/payments")} testId="today-money-in" />
            <Stat label="Sold this week" value={format(data.summary.sales_week)} sub={`${data.summary.sales_week_count} sale${data.summary.sales_week_count === 1 ? "" : "s"}`} onClick={() => navigate("/invoices")} testId="today-sold" />
            <Stat label="Owed to you" value={format(data.summary.outstanding)} sub={data.summary.overdue > 0 ? `${format(data.summary.overdue)} of it overdue` : "nothing overdue"} onClick={() => navigate("/invoices?status=unpaid")} testId="today-owed" />
          </div>

          <DoneForYou automation={data.automation} onOpen={() => navigate("/settings?tab=automation")} />

          <Card className="border-border bg-card shadow-sm" data-testid="today-queue">
            <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
              <div>
                <h2 className="font-heading text-base font-semibold">Needs you</h2>
                <p className="text-xs text-muted-foreground">Resolve each one here. Snoozed items come back on their own.</p>
              </div>
              {data.total > 0 && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold tabular-nums" data-testid="today-count">{data.total}</span>}
            </div>
            {data.items.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-12 text-center" data-testid="today-empty">
                <CheckCircle2 className="mb-2 h-9 w-9 text-emerald-500" />
                <p className="font-medium">All clear</p>
                <p className="mt-0.5 max-w-sm text-sm text-muted-foreground">
                  Nothing overdue, low or late right now.{data.snoozed ? ` ${data.snoozed} snoozed item${data.snoozed === 1 ? "" : "s"} will come back when due.` : ""}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/50">
                {data.items.map((item) => {
                  const cfg = KIND[item.kind] || KIND.task;
                  const buttons = buttonsFor(item);
                  return (
                    <li key={item.key} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center" data-testid={`today-item-${item.kind}`}>
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", cfg.tone)}><cfg.icon className="h-4 w-4" /></span>
                        <div className="min-w-0">
                          <button type="button" onClick={() => openRecord(item)} className="block max-w-full truncate text-left text-sm font-medium hover:underline">{item.title}</button>
                          <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 pl-11 sm:pl-0">
                        {buttons.map((b) => (
                          <Button key={b.label} size="sm" variant={b.primary ? "default" : "outline"} className="h-8" disabled={busyKey === item.key} onClick={b.onClick}
                            data-testid={`today-action-${b.label.toLowerCase().replace(/\s+\d+$/, "").replace(/\s+/g, "-")}`}>
                            {b.label}
                          </Button>
                        ))}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`More for ${item.title}`} data-testid="today-item-more"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => openRecord(item)}>Open</DropdownMenuItem>
                            {item.context.followup_task_id && (
                              <DropdownMenuItem onClick={() => api.put(`/tasks/${item.context.followup_task_id}`, { status: "completed" })
                                .then(() => { toast.success("Follow-up marked done"); notifyDataChanged(); }).catch((e) => toast.error(formatApiError(e)))}>
                                <CheckSquare className="mr-2 h-4 w-4" /> I've called them
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => snooze(item, 1)} data-testid="today-snooze-1"><Clock className="mr-2 h-4 w-4" /> Snooze until tomorrow</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => snooze(item, 7)}><Clock className="mr-2 h-4 w-4" /> Snooze a week</DropdownMenuItem>
                            {item.kind === "quiet_customer" && <DropdownMenuItem onClick={() => snooze(item, 30)}><Clock className="mr-2 h-4 w-4" /> Snooze a month</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <ActivityFeed />
        </>
      )}

      <RecordPaymentModal open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} invoice={payFor} onSaved={() => { notifyDataChanged(); }} />
    </div>
  );
}
