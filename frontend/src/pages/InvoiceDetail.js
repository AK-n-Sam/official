import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Send, DollarSign, XCircle, Pencil, Copy, Printer, RotateCcw, Trash2, AlertTriangle } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { usePermissions } from "@/context/AuthContext";
import { useTabTitle } from "@/hooks/useTabTitle";
import { formatDate, todayIso } from "@/lib/format";
import { balanceOf, displayStatus, invoiceActions, isPastDue, showStockWarnings } from "@/lib/invoices";
import { PAYMENT_METHODS } from "@/modules/resourceConfigs";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/States";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { RecordPaymentModal } from "@/components/modules/RecordPaymentModal";
import { InvoiceModal } from "@/components/modules/InvoiceModal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const methodLabel = (v) => PAYMENT_METHODS.find((m) => m.value === v)?.label || String(v || "").replace(/_/g, " ");
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 864e5);

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { format } = useCurrency();
  const { isManager } = usePermissions();
  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [confirm, setConfirm] = useState(null); // { kind: "cancel" | "delete" | "payment", payment? }

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/invoices/${id}`).then(({ data }) => { setInv(data); setError(null); })
      .catch((e) => setError(e)).finally(() => setLoading(false));
  }, [id]);
  useEffect(load, [load]);
  useTabTitle(inv?.invoice_number);

  const setStatus = async (status, message) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/invoices/${id}/status`, { status });
      toast.success(message || `Invoice marked ${displayStatus(data.status).replace(/_/g, " ")}`);
      showStockWarnings(data);
      load();
    } catch (e) { toast.error(formatApiError(e), { duration: 8000 }); }
    finally { setBusy(false); }
  };

  const onConfirm = async () => {
    const c = confirm;
    setConfirm(null);
    if (c.kind === "cancel") return setStatus("cancelled", `${inv.invoice_number} cancelled`);
    setBusy(true);
    try {
      if (c.kind === "delete") {
        await api.delete(`/invoices/${id}`);
        toast.success(`${inv.invoice_number} deleted`);
        navigate("/invoices");
        return;
      }
      await api.delete(`/payments/${c.payment.id}`);
      toast.success(`Payment of ${format(c.payment.amount)} removed`);
      load();
    } catch (e) { toast.error(formatApiError(e), { duration: 8000 }); }
    finally { setBusy(false); }
  };

  if (loading && !inv) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (error && !inv) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/invoices")} className="-ml-2"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoices</Button>
        <ErrorState message={formatApiError(error)} onRetry={load} />
      </div>
    );
  }

  const balance = balanceOf(inv);
  const can = invoiceActions(inv);
  const late = isPastDue(inv) ? daysBetween(inv.due_date, todayIso()) : 0;

  return (
    <div className="space-y-6 animate-in-up">
      <Button variant="ghost" size="sm" onClick={() => navigate("/invoices")} className="-ml-2" data-testid="back-to-invoices">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoices
      </Button>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-bold tracking-tight" data-testid="invoice-detail-number">{inv.invoice_number}</h1>
            <StatusBadge status={displayStatus(inv.status)} />
          </div>
          <button onClick={() => inv.customer_id && navigate(`/customers/${inv.customer_id}`)} className="mt-1 text-sm text-primary hover:underline">
            {inv.customer_name}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">Issued {formatDate(inv.issue_date)} · Due {formatDate(inv.due_date)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`/print/invoices/${id}?autoprint=1`, "_blank", "noopener")} data-testid="invoice-print"><Printer className="mr-1.5 h-4 w-4" /> Print / PDF</Button>
          <Button variant="outline" size="sm" onClick={() => setDuplicateOpen(true)} data-testid="invoice-duplicate"><Copy className="mr-1.5 h-4 w-4" /> Duplicate</Button>
          {can.edit && <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} data-testid="invoice-edit"><Pencil className="mr-1.5 h-4 w-4" /> Edit</Button>}
          {can.send && <Button variant="outline" size="sm" disabled={busy} onClick={() => setStatus("sent")} data-testid="invoice-send"><Send className="mr-1.5 h-4 w-4" /> Mark Sent</Button>}
          {can.reopen && <Button variant="outline" size="sm" disabled={busy} onClick={() => setStatus("draft", `${inv.invoice_number} reopened as a draft`)} data-testid="invoice-reopen"><RotateCcw className="mr-1.5 h-4 w-4" /> Reopen</Button>}
          {can.cancel && <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirm({ kind: "cancel" })} data-testid="invoice-cancel"><XCircle className="mr-1.5 h-4 w-4" /> Cancel</Button>}
          {can.remove && <Button variant="outline" size="sm" disabled={busy} className="text-rose-500 hover:text-rose-600" onClick={() => setConfirm({ kind: "delete" })} data-testid="invoice-delete"><Trash2 className="mr-1.5 h-4 w-4" /> Delete</Button>}
          {can.pay && <Button size="sm" disabled={busy} onClick={() => setPayOpen(true)} data-testid="invoice-record-payment"><DollarSign className="mr-1.5 h-4 w-4" /> Record Payment</Button>}
        </div>
      </div>

      {late > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm" data-testid="invoice-overdue-banner">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
          <span><span className="font-medium">{format(balance)} is {late} day{late === 1 ? "" : "s"} overdue.</span> <span className="text-muted-foreground">Follow up with {inv.customer_name}, or record the payment if it has arrived.</span></span>
        </div>
      )}
      {inv.status === "cancelled" && (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">This invoice is cancelled: it isn't owed and its stock went back to inventory. Reopen it to use it again.</p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-border/70 bg-card/90 lg:col-span-2">
          <div className="border-b border-border/70 px-5 py-3"><h3 className="font-heading text-base font-semibold">Line Items</h3></div>
          <div className="overflow-x-auto">
            <Table data-testid="invoice-items-table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Description</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Qty</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Price</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Discount</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inv.items.map((it, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{it.description}</TableCell>
                    <TableCell className="font-mono">{it.quantity}</TableCell>
                    <TableCell className="font-mono">{format(it.unit_price)}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{it.discount ? format(it.discount) : "—"}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{format(it.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-1 border-t border-border/70 p-5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{format(inv.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax ({+((inv.tax_rate || 0) * 100).toFixed(2)}%)</span><span className="font-mono">{format(inv.tax_amount)}</span></div>
            <div className="flex justify-between border-t border-border/70 pt-1 text-base font-semibold"><span>Total</span><span className="font-mono">{format(inv.total)}</span></div>
            <div className="flex justify-between text-emerald-600 dark:text-emerald-500"><span>Paid</span><span className="font-mono">{format(inv.amount_paid || 0)}</span></div>
            <div className="flex justify-between font-semibold text-amber-600 dark:text-amber-500"><span>Balance Due</span><span className="font-mono" data-testid="invoice-balance">{format(inv.status === "cancelled" ? 0 : balance)}</span></div>
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
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No payments yet.{can.pay && <><br /><button className="mt-1 font-medium text-primary hover:underline" onClick={() => setPayOpen(true)}>Record a payment</button></>}
              </p>
            ) : inv.payments.map((p) => (
              <div key={p.id} className="group px-5 py-3" data-testid={`payment-${p.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-500">{format(p.amount)}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {formatDate(p.date)}
                    {isManager && (
                      <button type="button" onClick={() => setConfirm({ kind: "payment", payment: p })} title="Remove this payment"
                        aria-label={`Remove payment of ${format(p.amount)}`} data-testid={`remove-payment-${p.id}`}
                        className="ml-1 rounded p-1 text-muted-foreground/60 opacity-0 transition hover:bg-rose-500/10 hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{methodLabel(p.method)}{p.notes ? ` · ${p.notes}` : ""}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <RecordPaymentModal open={payOpen} onOpenChange={setPayOpen} invoice={inv} onSaved={load} />
      <InvoiceModal open={editOpen} onOpenChange={setEditOpen} initial={inv} onSaved={() => load()} />
      <InvoiceModal open={duplicateOpen} onOpenChange={setDuplicateOpen} template={inv}
        onSaved={(created) => created?.id && navigate(`/invoices/${created.id}`)} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        confirmLabel={confirm?.kind === "cancel" ? "Cancel invoice" : confirm?.kind === "delete" ? "Delete" : "Remove payment"}
        title={confirm?.kind === "cancel" ? `Cancel ${inv.invoice_number}?` : confirm?.kind === "delete" ? `Delete ${inv.invoice_number}?` : "Remove this payment?"}
        description={
          confirm?.kind === "cancel" ? "The invoice stays on record but no longer counts as owed, and any stock it used goes back into inventory. You can reopen it later."
            : confirm?.kind === "delete" ? "The invoice is removed permanently and any stock it used goes back into inventory. To keep a record instead, cancel it."
              : `Use this only if ${format(confirm?.payment?.amount)} was recorded by mistake. The invoice balance goes back up by that amount.`
        }
        onConfirm={onConfirm}
      />
    </div>
  );
}
