import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Loader2, ArrowRight } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { formatDate, todayIso } from "@/lib/format";
import { balanceOf, UNPAID } from "@/lib/invoices";
import { notifyDataChanged } from "@/hooks/useDataChanged";
import { PAYMENT_METHODS } from "@/modules/resourceConfigs";
import { CustomerPicker } from "@/components/actions/Pickers";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Oldest due first (named invoices first), the same order the server applies the money in. */
function allocate(invoices, amount, firstIds = []) {
  const rank = (i) => (firstIds.includes(i.id) ? firstIds.indexOf(i.id) : firstIds.length);
  const ordered = [...invoices].sort((a, b) => rank(a) - rank(b) || (a.due_date || a.issue_date || "").localeCompare(b.due_date || b.issue_date || ""));
  let left = Math.round(amount * 100) / 100;
  return ordered.map((i) => {
    const part = Math.max(0, Math.min(left, balanceOf(i)));
    left = Math.round((left - part) * 100) / 100;
    return { ...i, applied: part };
  });
}

/**
 * A customer paid: enter the amount once and it is spread over their unpaid invoices, oldest
 * first, so a lump sum covering several invoices doesn't have to be split by hand.
 */
export function GetPaidDialog({ open, onOpenChange, prefill }) {
  const { format, currency } = useCurrency();
  const [customers, setCustomers] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr(""); setDate(todayIso()); setMethod("bank_transfer"); setInvoices([]); setAmount("");
    setCustomer(prefill?.customerId ? { id: prefill.customerId, name: prefill.customerName || "" } : null);
    api.get("/customers").then(({ data }) => setCustomers(data)).catch((e) => setErr(formatApiError(e)));
  }, [open, prefill]);

  // Load the chosen customer's unpaid invoices and suggest paying them all.
  useEffect(() => {
    if (!open || !customer?.id) return;
    let cancelled = false;
    setLoadingInv(true);
    api.get("/invoices", { params: { customer_id: customer.id } })
      .then(({ data }) => {
        if (cancelled) return;
        const unpaid = data.filter((i) => UNPAID.includes(i.status) && balanceOf(i) > 0);
        setInvoices(unpaid);
        const owed = unpaid.reduce((s, i) => s + balanceOf(i), 0);
        setAmount(String(prefill?.amount && prefill?.customerId === customer.id ? prefill.amount : Math.round(owed * 100) / 100));
      })
      .catch((e) => !cancelled && setErr(formatApiError(e)))
      .finally(() => !cancelled && setLoadingInv(false));
    return () => { cancelled = true; };
  }, [open, customer?.id, prefill]);

  const owed = invoices.reduce((s, i) => s + balanceOf(i), 0);
  const amt = Number(amount) || 0;
  const plan = useMemo(() => allocate(invoices, amt, prefill?.invoiceIds || []), [invoices, amt, prefill]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!customer?.id) return setErr("Choose who paid you");
    if (!(amt > 0)) return setErr("Enter the amount you received");
    if (amt > owed + 0.005) return setErr(`${customer.name} only owes ${format(owed)}`);
    setSaving(true);
    try {
      const { data } = await api.post(`/customers/${customer.id}/payments`, { amount: amt, method, date, invoice_ids: prefill?.invoiceIds || [] });
      const paidOff = data.allocations.filter((a) => a.status === "paid").map((a) => a.invoice_number);
      toast.success(`${format(amt)} received from ${customer.name}`, {
        description: [paidOff.length ? `Paid in full: ${paidOff.join(", ")}` : "", data.outstanding > 0 ? `${format(data.outstanding)} still owed` : "Nothing left owing"].filter(Boolean).join(" · "),
      });
      notifyDataChanged();
      onOpenChange(false);
      prefill?.onDone?.(data);
    } catch (e2) { setErr(formatApiError(e2)); }
    finally { setSaving(false); }
  };

  const labelCls = "text-xs font-medium text-muted-foreground";
  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg" data-testid="get-paid-dialog">
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-xl">Get paid</DialogTitle>
            <DialogDescription>Enter what the customer paid. It's applied to their oldest invoices first.</DialogDescription>
          </DialogHeader>
          <div>
            <Label className={labelCls}>From</Label>
            <div className="mt-1.5">
              <CustomerPicker customers={customers.filter((c) => (c.outstanding || 0) > 0 || c.id === customer?.id)} value={customer}
                onChange={(c) => { setCustomer(c); setErr(""); }} allowNew={false} showBalance testId="getpaid-customer" />
            </div>
          </div>
          {customer?.id && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <Label htmlFor="getpaid-amount" className={labelCls}>Amount ({currency})</Label>
                  <Input id="getpaid-amount" type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => { setAmount(e.target.value); setErr(""); }} className="mt-1.5" data-testid="getpaid-amount" />
                </div>
                <div>
                  <Label className={labelCls}>Method</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger className="mt-1.5" aria-label="Payment method"><SelectValue /></SelectTrigger>
                    <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="getpaid-date" className={labelCls}>Received on</Label>
                  <Input id="getpaid-date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value || todayIso())} className="mt-1.5" />
                </div>
              </div>
              <div className="rounded-lg border border-border/70" data-testid="getpaid-plan">
                <p className="border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground">
                  {loadingInv ? "Loading unpaid invoices..." : invoices.length ? `Owes ${format(owed)} on ${invoices.length} invoice${invoices.length === 1 ? "" : "s"}. This payment will go to:` : "No unpaid invoices."}
                </p>
                <ul className="divide-y divide-border/50 text-sm">
                  {plan.map((i) => (
                    <li key={i.id} className={`flex items-center justify-between gap-2 px-3 py-2 ${i.applied ? "" : "text-muted-foreground"}`}>
                      <span className="min-w-0 truncate"><span className="font-mono">{i.invoice_number}</span> · due {formatDate(i.due_date)}</span>
                      <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs">
                        {format(balanceOf(i))} <ArrowRight className="h-3 w-3" />
                        {i.applied >= balanceOf(i) - 0.005 && i.applied > 0 ? <span className="font-sans font-medium text-emerald-600 dark:text-emerald-500">paid</span>
                          : i.applied > 0 ? <span>{format(balanceOf(i) - i.applied)} left</span> : <span>unchanged</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
          {err && <p className="text-sm text-rose-500" role="alert" data-testid="getpaid-error">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !customer?.id || !invoices.length} data-testid="getpaid-submit">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record {amt > 0 ? format(amt) : "payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
