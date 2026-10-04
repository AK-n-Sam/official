import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Send, DollarSign, XCircle, Clock, Pencil, Copy, Printer, Bell, AlertCircle, CheckCircle2, Zap, Star } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { usePersonalization } from "@/context/PersonalizationContext";
import { useTabTitle } from "@/hooks/useTabTitle";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/States";
import { RecordPaymentModal } from "@/components/modules/RecordPaymentModal";
import { InvoiceModal } from "@/components/modules/InvoiceModal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CollaborationSection } from "@/components/common/CollaborationSection";

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { format } = useCurrency();
  const { isFavorite, toggleFavorite, logRecent } = usePersonalization();
  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/invoices/${id}`).then(({ data }) => {
      setInv(data);
      setError(null);
      if (data?.invoice_number) {
        logRecent({ type: "invoice", id, title: data.invoice_number, path: `/invoices/${id}` });
      }
    })
      .catch((e) => setError(e)).finally(() => setLoading(false));
  }, [id, logRecent]);
  useEffect(load, [load]);
  useTabTitle(inv?.invoice_number);

  const setStatus = async (status) => {
    try { await api.post(`/invoices/${id}/status`, { status }); toast.success(`Invoice marked ${status.replace(/_/g, " ")}`); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const handleSendReminder = async () => {
    setSendingReminder(true);
    try {
      const res = await api.post(`/invoices/${id}/remind`);
      toast.success(res.data.message || "Payment reminder sent!");
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSendingReminder(false);
    }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (error) return <ErrorState message={formatApiError(error)} onRetry={load} />;

  const balance = inv.balance != null ? inv.balance : inv.total - (inv.amount_paid || 0);

  return (
    <div className="space-y-6 animate-in-up">
      <Button variant="ghost" size="sm" onClick={() => navigate("/invoices")} className="-ml-2" data-testid="back-to-invoices">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoices
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-bold tracking-tight" data-testid="invoice-detail-number">{inv.invoice_number}</h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toggleFavorite({ type: "invoice", id, title: inv.invoice_number, path: `/invoices/${id}` })}
              title={isFavorite("invoice", id) ? "Remove from starred" : "Star this invoice"}
              className="h-8 w-8"
              data-testid="star-invoice-button"
            >
              <Star className={`h-4 w-4 ${isFavorite("invoice", id) ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`} />
            </Button>
            <StatusBadge status={inv.status} />
            {inv.reminder_count > 0 && (
              <Badge variant="secondary" className="text-xs font-medium flex items-center gap-1">
                <Bell className="h-3 w-3" /> Reminded {inv.reminder_count}x
              </Badge>
            )}
          </div>
          <button onClick={() => inv.customer_id && navigate(`/customers/${inv.customer_id}`)} className="mt-1 text-sm text-primary hover:underline">
            {inv.customer_name}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">Issued {formatDate(inv.issue_date)} · Due {formatDate(inv.due_date)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`/print/invoices/${id}?autoprint=1`, "_blank", "noopener")} data-testid="invoice-print"><Printer className="mr-1.5 h-4 w-4" /> Print / PDF</Button>
          <Button variant="outline" size="sm" onClick={() => setDuplicateOpen(true)} data-testid="invoice-duplicate"><Copy className="mr-1.5 h-4 w-4" /> Duplicate</Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} data-testid="invoice-edit"><Pencil className="mr-1.5 h-4 w-4" /> Edit</Button>
          {inv.status === "draft" && <Button variant="outline" size="sm" onClick={() => setStatus("sent")} data-testid="invoice-send"><Send className="mr-1.5 h-4 w-4" /> Mark Sent</Button>}
          {["sent", "overdue", "partially_paid"].includes(inv.status) && (
            <Button variant="outline" size="sm" onClick={handleSendReminder} disabled={sendingReminder} data-testid="invoice-reminder">
              <Bell className="mr-1.5 h-4 w-4 text-amber-500" /> {sendingReminder ? "Sending..." : "Send Reminder"}
            </Button>
          )}
          {!["paid", "cancelled"].includes(inv.status) && <Button variant="outline" size="sm" onClick={() => setStatus("overdue")} data-testid="invoice-overdue"><Clock className="mr-1.5 h-4 w-4" /> Overdue</Button>}
          {!["paid", "cancelled"].includes(inv.status) && <Button variant="outline" size="sm" onClick={() => setStatus("cancelled")} data-testid="invoice-cancel"><XCircle className="mr-1.5 h-4 w-4" /> Cancel</Button>}
          {balance > 0 && inv.status !== "cancelled" && <Button size="sm" onClick={() => setPayOpen(true)} data-testid="invoice-record-payment"><DollarSign className="mr-1.5 h-4 w-4" /> Record Payment</Button>}
        </div>
      </div>

      {/* Decision Support & Smart Status Banner */}
      <Card className="border-border/70 bg-card/90 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Zap className="h-4 w-4 text-amber-500" /> Context & Next Action
          </span>
          {inv.last_reminder_sent && (
            <span className="text-xs text-muted-foreground">Last reminder: {formatDate(inv.last_reminder_sent)}</span>
          )}
        </div>
        
        {inv.credit_warning && (
          <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-md p-2 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>{inv.credit_warning}</span>
          </div>
        )}

        {inv.status === "overdue" && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-red-600 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Overdue Invoice: Balance of {format(balance)} was due on {formatDate(inv.due_date)}.</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSendReminder} disabled={sendingReminder}>
                <Bell className="mr-1 h-3 w-3" /> Send Reminder
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={() => setPayOpen(true)}>
                Record Payment
              </Button>
            </div>
          </div>
        )}

        {inv.status === "paid" && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
            <CheckCircle2 className="h-4 w-4" /> Paid in full. Balance is zero.
          </div>
        )}

        {["sent", "partially_paid", "pending"].includes(inv.status) && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4 text-amber-500 shrink-0" />
              <span>Awaiting payment: Balance of {format(balance)} due on {formatDate(inv.due_date)}.</span>
            </div>
            <Button size="sm" className="h-7 text-xs" onClick={() => setPayOpen(true)}>
              Record Payment
            </Button>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-border/70 bg-card/90 lg:col-span-2">
          <div className="border-b border-border/70 px-5 py-3"><h3 className="font-heading text-base font-semibold">Line Items</h3></div>
          <Table data-testid="invoice-items-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Description</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Qty</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Price</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Disc</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inv.items.map((it, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{it.description}</TableCell>
                  <TableCell className="font-mono">{it.quantity}</TableCell>
                  <TableCell className="font-mono">{format(it.unit_price)}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{format(it.discount || 0)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{format(it.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="space-y-1 border-t border-border/70 p-5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{format(inv.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax ({Math.round((inv.tax_rate || 0) * 100)}%)</span><span className="font-mono">{format(inv.tax_amount)}</span></div>
            <div className="flex justify-between border-t border-border/70 pt-1 text-base font-semibold"><span>Total</span><span className="font-mono">{format(inv.total)}</span></div>
            <div className="flex justify-between text-emerald-500"><span>Paid</span><span className="font-mono">{format(inv.amount_paid || 0)}</span></div>
            <div className="flex justify-between font-semibold text-amber-500"><span>Balance Due</span><span className="font-mono" data-testid="invoice-balance">{format(balance)}</span></div>
          </div>
          {inv.notes && (
            <div className="border-t border-border/70 px-5 py-4" data-testid="invoice-notes-view">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
              <p className="mt-1 whitespace-pre-line text-sm">{inv.notes}</p>
            </div>
          )}
        </Card>

        <Card className="border-border/70 bg-card/90">
          <div className="border-b border-border/70 px-5 py-3"><h3 className="font-heading text-base font-semibold">Payment History</h3></div>
          <div className="divide-y divide-border/50" data-testid="invoice-payments">
            {(!inv.payments || inv.payments.length === 0) ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">No payments yet.</p>
            ) : inv.payments.map((p) => (
              <div key={p.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold text-emerald-500">{format(p.amount)}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(p.date)}</span>
                </div>
                <p className="text-xs capitalize text-muted-foreground">{String(p.method).replace(/_/g, " ")}{p.notes ? ` · ${p.notes}` : ""}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Team Handoffs & Collaboration Notes */}
      <CollaborationSection targetType="invoice" targetId={id} title="Invoice Handoffs & Team Notes" />

      <RecordPaymentModal open={payOpen} onOpenChange={setPayOpen} invoice={inv} onSaved={load} />
      <InvoiceModal open={editOpen} onOpenChange={setEditOpen} initial={inv} onSaved={() => load()} />
      <InvoiceModal open={duplicateOpen} onOpenChange={setDuplicateOpen} template={inv}
        onSaved={(created) => created?.id && navigate(`/invoices/${created.id}`)} />
    </div>
  );
}
