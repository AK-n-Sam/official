import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, Mail, Phone, Building2, MapPin, FileText, CreditCard, CheckSquare, Pencil, Target, ShoppingCart,
  HandCoins, CalendarPlus, StickyNote, Send, UserPlus, Trash2, Loader2,
} from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { useAuth, usePermissions } from "@/context/AuthContext";
import { useTabTitle } from "@/hooks/useTabTitle";
import { useDataChanged } from "@/hooks/useDataChanged";
import { formatDate } from "@/lib/format";
import { balanceOf, displayStatus, isPastDue, UNPAID } from "@/lib/invoices";
import { customersConfig } from "@/modules/resourceConfigs";
import { useActions } from "@/components/actions/ActionsProvider";
import { CrudModal } from "@/components/common/CrudModal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function Kpi({ label, value, tone, sub }) {
  return (
    <Card className="border-border/70 bg-card/90 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1.5 font-mono text-2xl font-extrabold ${tone || ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

const EVENT_ICON = { note: StickyNote, invoice: FileText, payment: CreditCard, reminder: Send, task: CheckSquare, task_done: CheckSquare, lead: Target, created: UserPlus };
const EVENT_TONE = { note: "text-amber-600 dark:text-amber-500", payment: "text-emerald-600 dark:text-emerald-500", reminder: "text-blue-500", task_done: "text-emerald-600 dark:text-emerald-500" };

/** Everything that happened with this customer, newest first, in one list. */
function buildTimeline(data, format) {
  const c = data.customer;
  const ev = [];
  data.notes.forEach((n) => ev.push({ kind: "note", at: n.created_at, title: n.text, sub: `Note by ${n.created_by_name || "a teammate"}`, note: n }));
  data.invoices.forEach((i) => ev.push({ kind: "invoice", at: i.created_at, title: `${i.status === "draft" ? "Draft" : "Invoice"} ${i.invoice_number} · ${format(i.total)}`, sub: displayStatus(i.status).replace(/_/g, " "), link: `/invoices/${i.id}` }));
  data.payments.forEach((p) => ev.push({ kind: "payment", at: p.created_at || p.date, title: `Paid ${format(p.amount)}`, sub: `${p.invoice_number} · ${String(p.method).replace(/_/g, " ")}`, link: p.invoice_id ? `/invoices/${p.invoice_id}` : undefined }));
  data.reminders.forEach((r) => ev.push({ kind: "reminder", at: r.at, title: `Reminded about ${r.invoice_number}`, sub: r.by_name ? `by ${r.by_name}` : "", link: `/invoices/${r.invoice_id}` }));
  data.tasks.forEach((t) => {
    const done = t.status === "completed" || t.status === "done";
    ev.push({ kind: done ? "task_done" : "task", at: done ? t.updated_at : t.created_at, title: done ? `Done: ${t.title}` : t.title, sub: done ? "" : t.due_date ? `Due ${formatDate(t.due_date)}` : "To do", link: `/tasks?q=${encodeURIComponent(t.title)}` });
  });
  if (data.lead) ev.push({ kind: "lead", at: data.lead.created_at || c.created_at, title: "Came in as a lead", sub: data.lead.source ? `via ${data.lead.source}` : "" });
  ev.push({ kind: "created", at: c.created_at, title: "Became a customer", sub: "" });
  return ev.filter((e) => e.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { format, currency } = useCurrency();
  const { user } = useAuth();
  const { isManager } = usePermissions();
  const actions = useActions();
  const [editOpen, setEditOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/customers/${id}/history`)
      .then(({ data: d }) => { setData(d); setError(null); })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(load, [load]);
  useDataChanged(load);
  useTabTitle(data?.customer?.name);
  const timeline = useMemo(() => (data ? buildTimeline(data, format) : []), [data, format]);

  if (loading && !data) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-40 rounded-xl" /></div>;
  if (error && !data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/customers")} className="-ml-2"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Customers</Button>
        <ErrorState message={formatApiError(error)} onRetry={load} />
      </div>
    );
  }
  const saveCustomer = async (payload) => {
    try { await api.put(`/customers/${id}`, payload); toast.success("Customer updated"); load(); }
    catch (e) { toast.error(formatApiError(e)); throw e; }
  };
  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setSavingNote(true);
    try { await api.post(`/customers/${id}/notes`, { text: note.trim() }); setNote(""); load(); }
    catch (e2) { toast.error(formatApiError(e2)); }
    finally { setSavingNote(false); }
  };
  const deleteNote = async (n) => {
    try {
      await api.delete(`/customers/${id}/notes/${n.id}`);
      load();
      toast.success("Note deleted", { action: { label: "Undo", onClick: async () => { await api.post(`/customers/${id}/notes`, { text: n.text }); load(); } } });
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const c = data.customer;
  const initials = (c.name || "C").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const unpaid = data.invoices.filter((i) => UNPAID.includes(i.status) && balanceOf(i) > 0);
  const sell = () => actions.sell({ customer: { id: c.id, name: c.name } });
  const getPaid = () => actions.getPaid({ customerId: c.id, customerName: c.name });
  const followUp = () => actions.followUp({ customerId: c.id, customerName: c.name });

  return (
    <div className="space-y-6 animate-in-up">
      <Button variant="ghost" size="sm" onClick={() => navigate("/customers")} data-testid="back-to-customers" className="-ml-2">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Customers
      </Button>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 border border-border/60">
            <AvatarFallback className="bg-primary/15 text-lg font-bold text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight" data-testid="customer-detail-name">{c.name}</h1>
              {c.status === "inactive" && <StatusBadge status="inactive" />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {c.company && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{c.company}</span>}
              {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-foreground"><Mail className="h-3.5 w-3.5" />{c.email}</a>}
              {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-foreground"><Phone className="h-3.5 w-3.5" />{c.phone}</a>}
            </div>
          </div>
        </div>
        {/* Everything you do with a customer, from here. */}
        <div className="flex flex-wrap items-center gap-2" data-testid="customer-actions">
          <Button size="sm" onClick={sell} data-testid="customer-sell"><ShoppingCart className="mr-1.5 h-4 w-4" /> Make a sale</Button>
          {unpaid.length > 0 && <Button size="sm" variant="outline" onClick={getPaid} data-testid="customer-get-paid"><HandCoins className="mr-1.5 h-4 w-4" /> Get paid</Button>}
          <Button size="sm" variant="outline" onClick={followUp} data-testid="customer-follow-up"><CalendarPlus className="mr-1.5 h-4 w-4" /> Follow up</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)} data-testid="customer-edit"><Pencil className="mr-1.5 h-4 w-4" /> Edit</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total Sales" value={format(data.total_sales)} tone="text-emerald-600 dark:text-emerald-500" sub="invoiced, excl. drafts" />
        <Kpi label="Owes you" value={format(data.outstanding)} tone={data.outstanding > 0 ? "text-amber-600 dark:text-amber-500" : ""} sub={data.overdue > 0 ? `${format(data.overdue)} overdue` : "nothing overdue"} />
        <Kpi label="Total Paid" value={format(data.total_paid)} sub={`${data.payments.length} payment${data.payments.length === 1 ? "" : "s"}`} />
        <Kpi label="Invoices" value={data.invoice_count} sub={data.invoices[0] ? `last ${formatDate(data.invoices[0].issue_date)}` : "none yet"} />
      </div>

      <Tabs defaultValue="activity">
        <TabsList data-testid="customer-tabs" className="h-auto flex-wrap">
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({data.invoices.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({data.payments.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({data.tasks.length})</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        <TabsContent value="activity">
          <Card className="border-border/70 bg-card/90" data-testid="customer-timeline">
            <form onSubmit={addNote} className="flex flex-col gap-2 border-b border-border/70 p-4 sm:flex-row sm:items-start">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={1} placeholder="Add a note, e.g. “Called, will pay on Friday”"
                className="min-h-9 flex-1 resize-y" aria-label="New note" data-testid="customer-note-input"
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addNote(e); }} />
              <Button type="submit" size="sm" variant="outline" className="h-9" disabled={savingNote || !note.trim()} data-testid="customer-note-save">
                {savingNote && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Add note
              </Button>
            </form>
            <ul className="divide-y divide-border/50">
              {timeline.map((e, n) => {
                const Icon = EVENT_ICON[e.kind] || FileText;
                return (
                  <li key={`${e.kind}-${n}`} className="group flex items-start gap-3 px-5 py-3" data-testid={`timeline-${e.kind}`}>
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${EVENT_TONE[e.kind] || "text-muted-foreground"}`} />
                    <div className="min-w-0 flex-1">
                      {e.link ? <button type="button" onClick={() => navigate(e.link)} className="text-left text-sm font-medium hover:underline">{e.title}</button>
                        : <p className={`text-sm ${e.kind === "note" ? "whitespace-pre-line" : "font-medium"}`}>{e.title}</p>}
                      {e.sub && <p className="text-xs text-muted-foreground">{e.sub}</p>}
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(e.at)}</span>
                    {e.note && (e.note.created_by === user?.id || isManager) && (
                      <button type="button" onClick={() => deleteNote(e.note)} aria-label="Delete note"
                        className="rounded p-1 text-muted-foreground/60 opacity-0 transition hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card className="border-border/70 bg-card/90">
            {data.invoices.length === 0 ? <div className="px-5 py-8 text-center text-sm text-muted-foreground">No invoices yet. <button className="font-medium text-primary hover:underline" onClick={sell}>Make the first sale</button></div> :
              <div className="divide-y divide-border/50">
                {data.invoices.map((inv) => {
                  const owed = UNPAID.includes(inv.status) && balanceOf(inv) > 0;
                  return (
                    <div key={inv.id} className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-accent/40" onClick={() => navigate(`/invoices/${inv.id}`)} data-testid={`customer-invoice-${inv.id}`}>
                      <div className="flex items-center gap-3"><FileText className="h-4 w-4 text-muted-foreground" />
                        <div><p className="font-mono text-sm font-medium">{inv.invoice_number}</p><p className="text-xs text-muted-foreground">{formatDate(inv.issue_date)}</p></div></div>
                      <div className="flex items-center gap-3">
                        {owed && <span className={`hidden font-mono text-xs sm:inline ${isPastDue(inv) ? "text-rose-500" : "text-muted-foreground"}`}>{format(balanceOf(inv))} due</span>}
                        {owed && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); actions.remind({ invoiceId: inv.id }); }} data-testid={`customer-remind-${inv.id}`}>
                            <Send className="mr-1 h-3.5 w-3.5" /> Remind
                          </Button>
                        )}
                        <span className="font-mono text-sm font-semibold">{format(inv.total)}</span><StatusBadge status={displayStatus(inv.status)} />
                      </div>
                    </div>
                  );
                })}
              </div>}
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card className="border-border/70 bg-card/90">
            {data.payments.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted-foreground">No payments yet.</p> :
              <div className="divide-y divide-border/50">
                {data.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3"><CreditCard className="h-4 w-4 text-emerald-500" />
                      <div><p className="text-sm font-medium">{p.invoice_number}</p><p className="text-xs text-muted-foreground capitalize">{String(p.method).replace(/_/g, " ")} · {formatDate(p.date)}</p></div></div>
                    <span className="font-mono text-sm font-semibold text-emerald-500">{format(p.amount)}</span>
                  </div>
                ))}
              </div>}
          </Card>
        </TabsContent>

        <TabsContent value="tasks">
          <Card className="border-border/70 bg-card/90">
            {data.tasks.length === 0 ? <div className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing planned. <button className="font-medium text-primary hover:underline" onClick={followUp}>Add a follow-up</button></div> :
              <div className="divide-y divide-border/50">
                {data.tasks.map((t) => (
                  <div key={t.id} role="button" tabIndex={0} onClick={() => navigate(`/tasks?q=${encodeURIComponent(t.title)}`)} onKeyDown={(e) => e.key === "Enter" && navigate(`/tasks?q=${encodeURIComponent(t.title)}`)} className="flex cursor-pointer items-center justify-between px-5 py-3 hover:bg-accent/40">
                    <div className="flex items-center gap-3"><CheckSquare className="h-4 w-4 text-muted-foreground" />
                      <div><p className="text-sm font-medium">{t.title}</p><p className="text-xs text-muted-foreground">{t.due_date ? `Due ${formatDate(t.due_date)}` : "No due date"}{t.assignee ? ` · ${t.assignee}` : ""}</p></div></div>
                    <StatusBadge status={t.status} />
                  </div>
                ))}
              </div>}
          </Card>
        </TabsContent>

        <TabsContent value="about">
          <Card className="space-y-3 border-border/70 bg-card/90 p-6 text-sm">
            <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{[c.address, c.city, c.country].filter(Boolean).join(", ") || "No address on file"}</p>
            {data.lead && <p className="flex items-center gap-2"><Target className="h-4 w-4 text-muted-foreground" />Came in as a lead{data.lead.source ? ` via ${data.lead.source}` : ""}</p>}
            <p className="text-xs text-muted-foreground">Customer since {formatDate(c.created_at)}</p>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Details</p><p className="mt-1 whitespace-pre-line text-muted-foreground">{c.notes || "Nothing recorded. Use Edit to add details, or add a note on the Activity tab."}</p></div>
          </Card>
        </TabsContent>
      </Tabs>

      <CrudModal open={editOpen} onOpenChange={setEditOpen} title={`Edit ${c.name}`} fields={customersConfig(format, { currency }).fields}
        initial={c} onSubmit={saveCustomer} submitLabel="Save changes" />
    </div>
  );
}
