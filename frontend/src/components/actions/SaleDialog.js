import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Minus, Plus, Trash2, ChevronDown } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { todayIso } from "@/lib/format";
import { showStockWarnings } from "@/lib/invoices";
import { notifyDataChanged } from "@/hooks/useDataChanged";
import { PAYMENT_METHODS } from "@/modules/resourceConfigs";
import { CustomerPicker, ProductPicker } from "@/components/actions/Pickers";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const LAST_PAYMENT = "bmp_sale_payment";
const LAST_METHOD = "bmp_sale_method";
const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

const lineTotal = (l) => (Number(l.quantity) || 0) * (Number(l.unit_price) || 0) - (Number(l.discount) || 0);
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const PAYMENT_CHOICES = [
  { value: "paid", label: "Paid now" },
  { value: "unpaid", label: "Pay later" },
  { value: "partial", label: "Part paid" },
];

/**
 * Make a sale in one step: who, what, how it was paid. The server creates or reuses the customer,
 * issues the invoice, takes the stock off the shelf and records the payment.
 * `mode: "invoice"` starts on "Pay later" (billing a customer); "sale" remembers the last choice.
 */
export function SaleDialog({ open, onOpenChange, prefill }) {
  const { format, currency } = useCurrency();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [org, setOrg] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [lines, setLines] = useState([]);
  const [payment, setPayment] = useState("paid");
  const [method, setMethod] = useState("card");
  const [partAmount, setPartAmount] = useState("");
  const [more, setMore] = useState(false);
  const [issueDate, setIssueDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setErr(""); setLines([]); setPartAmount(""); setMore(false); setDraft(false); setIssueDate(todayIso()); setDueDate("");
    setCustomer(prefill?.customer || null);
    setPayment(prefill?.mode === "invoice" ? "unpaid" : read(LAST_PAYMENT, "paid"));
    setMethod(read(LAST_METHOD, "card"));
    Promise.all([api.get("/customers"), api.get("/products"), api.get("/organizations/current")])
      .then(([c, p, o]) => {
        if (cancelled) return;
        setCustomers(c.data); setProducts(p.data); setOrg(o.data);
        setTaxRate(+((o.data.invoice_tax_rate || 0) * 100).toFixed(4));
        setNotes(o.data.invoice_notes || "");
        if (prefill?.customerId) {
          const found = c.data.find((x) => x.id === prefill.customerId);
          if (found) setCustomer({ id: found.id, name: found.name });
        }
      })
      .catch((e) => !cancelled && setErr(formatApiError(e)));
    return () => { cancelled = true; };
  }, [open, prefill]);

  const addProduct = (p) => {
    setErr("");
    if (p.custom) { setLines((ls) => [...ls, { key: Date.now(), product_id: "", description: p.custom, quantity: 1, unit_price: 0, discount: 0 }]); return; }
    setLines((ls) => {
      const i = ls.findIndex((l) => l.product_id === p.id);
      if (i >= 0) return ls.map((l, x) => (x === i ? { ...l, quantity: Number(l.quantity) + 1 } : l));
      return [...ls, { key: Date.now(), product_id: p.id, description: p.name, quantity: 1, unit_price: p.price, discount: 0, stock: p.stock_quantity, unit: p.unit }];
    });
  };
  const update = (key, field, value) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  const remove = (key) => setLines((ls) => ls.filter((l) => l.key !== key));

  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const tax = subtotal * ((Number(taxRate) || 0) / 100);
  const total = subtotal + tax;
  const terms = Number(org?.invoice_due_days ?? 30);
  const effectiveDue = dueDate || (payment === "paid" ? issueDate : addDays(issueDate, terms));
  const shortages = useMemo(() => lines.filter((l) => l.product_id && Number(l.quantity) > (l.stock ?? Infinity)), [lines]);

  const submitLabel = draft ? "Save as draft" : payment === "paid" ? `Complete sale · ${format(total)}` : payment === "partial" ? `Record sale · ${format(total)}` : `Create invoice · ${format(total)}`;

  const submit = async (e) => {
    e?.preventDefault();
    if (!customer) return setErr("Choose who you're selling to (or type a new name)");
    if (!lines.length) return setErr("Add at least one product or service");
    for (const l of lines) {
      if (!(Number(l.quantity) > 0)) return setErr(`Enter a quantity for ${l.description}`);
      if (Number(l.unit_price) < 0) return setErr(`The price of ${l.description} can't be negative`);
      if (lineTotal(l) < 0) return setErr(`The discount on ${l.description} is more than the line`);
    }
    const part = Number(partAmount);
    if (!draft && payment === "partial" && !(part > 0 && part < total)) return setErr(`Enter how much was paid now (between 0 and ${format(total)})`);
    if (effectiveDue < issueDate) return setErr("The due date can't be before the sale date");
    const body = {
      ...(customer.isNew ? { new_customer: { name: customer.name } } : { customer_id: customer.id }),
      items: lines.map(({ product_id, description, quantity, unit_price, discount }) => ({ product_id, description, quantity: Number(quantity), unit_price: Number(unit_price), discount: Number(discount) || 0 })),
      payment: draft ? "draft" : payment, method, issue_date: issueDate,
      ...(dueDate ? { due_date: dueDate } : {}), tax_rate: (Number(taxRate) || 0) / 100, notes,
      ...(payment === "partial" && !draft ? { amount_paid: part } : {}),
    };
    setSaving(true);
    try {
      const { data } = await api.post("/actions/sale", body);
      if (!draft && prefill?.mode !== "invoice") write(LAST_PAYMENT, payment);
      write(LAST_METHOD, method);
      const inv = data.invoice;
      const what = draft ? `Draft ${inv.invoice_number} saved` : inv.status === "paid" ? `Sale recorded · ${inv.invoice_number} paid` : `${inv.invoice_number} sent · ${format(inv.balance)} to collect`;
      toast.success(what, {
        description: data.customer_created ? `${data.customer.name} was added to your customers.` : undefined,
        action: { label: "Open", onClick: () => navigate(`/invoices/${inv.id}`) },
      });
      showStockWarnings(inv);
      notifyDataChanged();
      onOpenChange(false);
      prefill?.onDone?.(data);
    } catch (e2) { setErr(formatApiError(e2)); }
    finally { setSaving(false); }
  };

  const labelCls = "text-xs font-medium text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl" data-testid="sale-dialog">
        <form onSubmit={submit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle className="text-xl">{prefill?.mode === "invoice" ? "New invoice" : "Make a sale"}</DialogTitle>
            <DialogDescription>Who, what, and how it was paid. The invoice, payment and stock update themselves.</DialogDescription>
          </DialogHeader>

          <div>
            <Label className={labelCls}>Customer</Label>
            <div className="mt-1.5">
              <CustomerPicker customers={customers.filter((c) => c.status !== "inactive" || c.id === customer?.id)} value={customer}
                onChange={(c) => { setCustomer(c); setErr(""); }} disabled={!!prefill?.lockCustomer} testId="sale-customer" />
            </div>
          </div>

          <div>
            <Label className={labelCls}>Items ({currency})</Label>
            <div className="mt-1.5 space-y-2" data-testid="sale-lines">
              {lines.map((l) => (
                <div key={l.key} className="rounded-lg border border-border/70 p-2.5" data-testid="sale-line">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      {l.product_id ? <p className="truncate text-sm font-medium">{l.description}</p> : (
                        <Input value={l.description} onChange={(e) => update(l.key, "description", e.target.value)} className="h-8 text-sm" aria-label="Item description" />
                      )}
                      {l.product_id && Number(l.quantity) > l.stock && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-500">Only {l.stock} in stock</p>
                      )}
                    </div>
                    <span className="shrink-0 pt-1 font-mono text-sm font-semibold">{format(lineTotal(l))}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-rose-500" onClick={() => remove(l.key)} aria-label={`Remove ${l.description}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center rounded-md border border-border/70">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => update(l.key, "quantity", Math.max(1, Number(l.quantity) - 1))} aria-label="Less"><Minus className="h-3 w-3" /></Button>
                      <Input type="number" inputMode="decimal" min={0} value={l.quantity} onChange={(e) => update(l.key, "quantity", e.target.value)}
                        className="h-7 w-14 border-0 px-1 text-center text-sm shadow-none focus-visible:ring-0" aria-label={`Quantity of ${l.description}`} />
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => update(l.key, "quantity", Number(l.quantity) + 1)} aria-label="More"><Plus className="h-3 w-3" /></Button>
                    </div>
                    <span>×</span>
                    <Input type="number" inputMode="decimal" min={0} step="any" value={l.unit_price} onChange={(e) => update(l.key, "unit_price", e.target.value)}
                      className="h-7 w-24 text-sm" aria-label={`Price of ${l.description}`} />
                    {more && (
                      <>
                        <span>discount</span>
                        <Input type="number" inputMode="decimal" min={0} step="any" value={l.discount} onChange={(e) => update(l.key, "discount", e.target.value)}
                          className="h-7 w-20 text-sm" aria-label={`Discount on ${l.description}`} />
                      </>
                    )}
                  </div>
                </div>
              ))}
              <ProductPicker products={products} onPick={addProduct} testId="sale-add-item" placeholder={lines.length ? "Add another item..." : "Add a product or service..."} />
            </div>
          </div>

          {!draft && (
            <div>
              <Label className={labelCls}>Payment</Label>
              <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg border border-border/70 bg-muted/40 p-1" role="radiogroup" aria-label="Payment">
                {PAYMENT_CHOICES.map((c) => (
                  <button key={c.value} type="button" role="radio" aria-checked={payment === c.value} onClick={() => { setPayment(c.value); setErr(""); }}
                    data-testid={`sale-payment-${c.value}`}
                    className={cn("rounded-md px-2 py-1.5 text-sm font-medium transition-colors", payment === c.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {payment === "partial" && (
                  <Input type="number" inputMode="decimal" min={0} step="0.01" value={partAmount} onChange={(e) => setPartAmount(e.target.value)}
                    placeholder="Amount paid now" className="h-9 w-40" aria-label="Amount paid now" data-testid="sale-part-amount" />
                )}
                {payment !== "unpaid" && (
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger className="h-9 w-40" aria-label="Payment method" data-testid="sale-method"><SelectValue /></SelectTrigger>
                    <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {payment !== "paid" && (
                  <span className="text-xs text-muted-foreground">
                    {payment === "partial" && Number(partAmount) > 0 ? `${format(Math.max(0, total - Number(partAmount)))} left to pay, ` : ""}due {effectiveDue === todayIso() ? "today" : new Date(`${effectiveDue}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="font-mono">{format(subtotal)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Tax ({Number(taxRate) || 0}%)</span><span className="font-mono">{format(tax)}</span></div>
            <div className="mt-1 flex justify-between border-t border-border/70 pt-1 text-base font-semibold"><span>Total</span><span className="font-mono" data-testid="sale-total">{format(total)}</span></div>
          </div>

          <div>
            <button type="button" onClick={() => setMore((m) => !m)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground" aria-expanded={more} data-testid="sale-more">
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", more && "rotate-180")} />
              {more ? "Fewer options" : `More options · dated ${issueDate === todayIso() ? "today" : issueDate}, ${Number(taxRate) || 0}% tax`}
            </button>
            {more && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="sale-more-options">
                <div><Label htmlFor="sale-date" className={labelCls}>Sale date</Label>
                  <Input id="sale-date" type="date" value={issueDate} max={todayIso()} onChange={(e) => setIssueDate(e.target.value || todayIso())} className="mt-1 h-9" /></div>
                <div><Label htmlFor="sale-due" className={labelCls}>Due date</Label>
                  <Input id="sale-due" type="date" value={effectiveDue} min={issueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 h-9" /></div>
                <div><Label htmlFor="sale-tax" className={labelCls}>Tax (%)</Label>
                  <Input id="sale-tax" type="number" min={0} max={100} step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="mt-1 h-9" /></div>
                <div className="sm:col-span-3"><Label htmlFor="sale-notes" className={labelCls}>Note on the invoice</Label>
                  <Textarea id="sale-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1" /></div>
                <label className="flex items-center gap-2 text-sm sm:col-span-3">
                  <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} className="h-4 w-4 rounded border-border" data-testid="sale-draft" />
                  Save as a draft to finish later (stock isn't touched yet)
                </label>
              </div>
            )}
          </div>

          {shortages.length > 0 && !draft && (
            <p className="text-xs text-amber-600 dark:text-amber-500">Not enough stock for {shortages.map((l) => l.description).join(", ")}. You can still record the sale; stock stops at zero.</p>
          )}
          {err && <p className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-600 dark:text-rose-400" role="alert" data-testid="sale-error">{err}</p>}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !org} data-testid="sale-submit">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
