import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { todayIso } from "@/lib/format";
import { balanceOf } from "@/lib/invoices";
import { PAYMENT_METHODS } from "@/modules/resourceConfigs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function RecordPaymentModal({ open, onOpenChange, invoice, onSaved }) {
  const { format, currency } = useCurrency();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const balance = invoice ? Math.max(0, balanceOf(invoice)) : 0;

  useEffect(() => {
    if (open && invoice) {
      setAmount(balance.toFixed(2));
      setMethod("bank_transfer");
      setDate(todayIso());
      setNotes("");
      setErr("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice]);

  const save = async (e) => {
    e?.preventDefault();
    const amt = Math.round(Number(amount) * 100) / 100;
    if (!amt || amt <= 0) { setErr("Enter an amount above zero"); return; }
    if (amt > balance + 0.005) { setErr(`That's more than the balance due (${format(balance)})`); return; }
    if (!date) { setErr("Choose the date the payment was received"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/payments", { invoice_id: invoice.id, amount: amt, method, date, notes });
      toast.success(data.balance > 0 ? `${format(amt)} recorded · ${format(data.balance)} still due` : `${invoice.invoice_number} is now paid in full`);
      onSaved?.();
      onOpenChange(false);
    } catch (e2) { setErr(formatApiError(e2)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent data-testid="record-payment-modal">
        <form onSubmit={save} noValidate>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {invoice ? `${invoice.invoice_number} · ${invoice.customer_name} · Balance due ${format(balance)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="payment-amount" className="text-xs text-muted-foreground">Amount ({currency})</Label>
                {Number(amount) !== balance && balance > 0 && (
                  <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setAmount(balance.toFixed(2))}>Full balance</button>
                )}
              </div>
              <Input id="payment-amount" type="number" inputMode="decimal" min={0} max={balance} step="0.01" value={amount}
                onChange={(e) => { setAmount(e.target.value); setErr(""); }} className="mt-1.5" data-testid="payment-amount" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="mt-1.5" data-testid="payment-method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="payment-date" className="text-xs text-muted-foreground">Date received</Label>
                <Input id="payment-date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className="mt-1.5" data-testid="payment-date" />
              </div>
            </div>
            <div>
              <Label htmlFor="payment-notes" className="text-xs text-muted-foreground">Notes</Label>
              <Textarea id="payment-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1.5" placeholder="Reference number, cheque no..." data-testid="payment-notes" />
            </div>
            {err && <p className="text-sm text-rose-500" role="alert" data-testid="payment-error">{err}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="payment-save">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record Payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
