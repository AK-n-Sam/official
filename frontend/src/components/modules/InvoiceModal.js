import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Trash2, Plus, Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { todayIso } from "@/lib/format";
import { showStockWarnings } from "@/lib/invoices";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const emptyItem = () => ({ product_id: "", description: "", quantity: 1, unit_price: 0, discount: 0 });

// Statuses a new invoice can start in; partially paid / overdue / cancelled are reached via actions.
const CREATE_STATUSES = [
  { value: "draft", label: "Draft", hint: "Not sent yet, stock untouched" },
  { value: "sent", label: "Sent", hint: "Awaiting payment" },
  { value: "paid", label: "Paid", hint: "Records the full payment now" },
];

const lineTotal = (it) => (Number(it.quantity) || 0) * (Number(it.unit_price) || 0) - (Number(it.discount) || 0);
const addDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// `initial` edits an existing invoice; `template` starts a new one from a copy of another invoice
// (customer, items, tax and notes; fresh dates and number). `onSaved` receives the saved invoice.
export function InvoiceModal({ open, onOpenChange, initial, template, defaultCustomerId, onSaved }) {
  const { format, currency } = useCurrency();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [statusVal, setStatusVal] = useState("sent");
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingLists(true);
    Promise.all([
      api.get("/customers").then(({ data }) => !cancelled && setCustomers(data)),
      api.get("/products").then(({ data }) => !cancelled && setProducts(data)),
    ]).catch((e) => !cancelled && setErr(formatApiError(e))).finally(() => !cancelled && setLoadingLists(false));
    setErr("");
    if (initial) {
      setCustomerId(initial.customer_id || "");
      setIssueDate(initial.issue_date || todayIso());
      setDueDate(initial.due_date || todayIso());
      setTaxRate(+((initial.tax_rate || 0) * 100).toFixed(4));
      setNotes(initial.notes || "");
      setItems(initial.items?.length ? initial.items.map((i) => ({ ...emptyItem(), ...i })) : [emptyItem()]);
      return () => { cancelled = true; };
    }
    // New invoice: start from the workspace's invoicing defaults (Settings > Invoicing),
    // or from the invoice being duplicated.
    const today = todayIso();
    setCustomerId(template?.customer_id || defaultCustomerId || "");
    setIssueDate(today);
    setDueDate(addDays(today, 30));
    setStatusVal("sent");
    setTaxRate(template ? +((template.tax_rate || 0) * 100).toFixed(4) : 0);
    setNotes(template?.notes || "");
    setItems(template?.items?.length
      ? template.items.map(({ product_id, description, quantity, unit_price, discount }) => ({ ...emptyItem(), product_id, description, quantity, unit_price, discount: discount || 0 }))
      : [emptyItem()]);
    api.get("/organizations/current").then(({ data: org }) => {
      if (cancelled) return;
      setDueDate(addDays(today, Number.isFinite(Number(org.invoice_due_days)) ? Number(org.invoice_due_days) : 30));
      if (template) return;
      setTaxRate(+((org.invoice_tax_rate || 0) * 100).toFixed(4));
      setNotes(org.invoice_notes || "");
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, initial, template, defaultCustomerId]);

  const updateItem = (idx, field, value) => {
    setErr("");
    setItems((its) => its.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, [field]: value };
      if (field === "product_id") {
        const p = products.find((pr) => pr.id === value);
        if (p) { next.description = p.name; next.unit_price = p.price; }
      }
      return next;
    }));
  };

  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const taxAmount = subtotal * ((Number(taxRate) || 0) / 100);
  const total = subtotal + taxAmount;
  // Inactive customers/products stay pickable only when this invoice already uses them.
  const customerOptions = customers.filter((c) => c.status !== "inactive" || c.id === customerId);
  const usedProducts = new Set(items.map((i) => i.product_id));
  const productOptions = products.filter((p) => p.status !== "inactive" || usedProducts.has(p.id));

  const validate = () => {
    if (!customerId) return "Choose a customer";
    if (!issueDate || !dueDate) return "Both dates are required";
    if (dueDate < issueDate) return "The due date can't be before the issue date";
    const filled = items.filter((it) => it.description?.trim() || it.product_id);
    if (!filled.length) return "Add at least one line item";
    for (const it of filled) {
      const name = it.description || "a line";
      if (!(Number(it.quantity) > 0)) return `Enter a quantity above zero for ${name}`;
      if (Number(it.unit_price) < 0 || Number(it.discount) < 0) return `Prices and discounts can't be negative (${name})`;
      if (lineTotal(it) < 0) return `The discount on ${name} is larger than the line amount`;
    }
    const rate = Number(taxRate);
    if (isNaN(rate) || rate < 0 || rate > 100) return "Tax rate must be between 0 and 100%";
    return "";
  };

  const save = async (e) => {
    e?.preventDefault();
    const problem = validate();
    if (problem) { setErr(problem); return; }
    const payload = {
      customer_id: customerId, issue_date: issueDate, due_date: dueDate, tax_rate: Number(taxRate) / 100, notes,
      items: items.filter((it) => it.description?.trim() || it.product_id).map((it) => ({
        product_id: it.product_id || "", description: it.description.trim(),
        quantity: Number(it.quantity) || 0, unit_price: Number(it.unit_price) || 0, discount: Number(it.discount) || 0,
      })),
    };
    // Status is only chosen at creation; afterwards it moves through the invoice actions
    // (record payment, mark sent, cancel...) so payments and stock stay consistent.
    if (!initial) payload.status = statusVal;
    setSaving(true);
    try {
      const { data: saved } = initial
        ? await api.put(`/invoices/${initial.id}`, payload)
        : await api.post("/invoices", payload);
      toast.success(initial ? `${saved.invoice_number} updated` : `Invoice ${saved.invoice_number} created`);
      showStockWarnings(saved);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e2) { setErr(formatApiError(e2)); }
    finally { setSaving(false); }
  };

  const labelCls = "text-xs font-medium text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" data-testid="invoice-modal">
        <form onSubmit={save} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {initial ? `Edit ${initial.invoice_number || "Invoice"}` : template ? `Duplicate ${template.invoice_number}` : "New Invoice"}
            </DialogTitle>
            <DialogDescription>
              {initial && (initial.amount_paid || 0) > 0
                ? `${format(initial.amount_paid)} has been paid on this invoice, so the total can't go below that.`
                : "Pick a customer and add line items; totals calculate automatically."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="invoice-customer" className={labelCls}>Customer *</Label>
              <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setErr(""); }}>
                <SelectTrigger id="invoice-customer" className="mt-1.5" data-testid="invoice-customer">
                  <SelectValue placeholder={loadingLists ? "Loading customers..." : customerOptions.length ? "Select customer" : "No customers yet: add one first"} />
                </SelectTrigger>
                <SelectContent>{customerOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.company && c.company !== c.name ? ` · ${c.company}` : ""}{c.status === "inactive" ? " (inactive)" : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label htmlFor="invoice-issue-date" className={labelCls}>Issue Date *</Label>
              <Input id="invoice-issue-date" type="date" value={issueDate} onChange={(e) => { setIssueDate(e.target.value); setErr(""); }} className="mt-1.5" data-testid="invoice-issue-date" /></div>
            <div><Label htmlFor="invoice-due-date" className={labelCls}>Due Date *</Label>
              <Input id="invoice-due-date" type="date" value={dueDate} min={issueDate || undefined} onChange={(e) => { setDueDate(e.target.value); setErr(""); }} className="mt-1.5" data-testid="invoice-due-date" /></div>
            {!initial && (
              <div><Label className={labelCls}>Status</Label>
                <Select value={statusVal} onValueChange={setStatusVal}>
                  <SelectTrigger className="mt-1.5" data-testid="invoice-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CREATE_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value} data-testid={`invoice-status-opt-${s.value}`}>
                        {s.label} <span className="text-muted-foreground">— {s.hint}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select></div>
            )}
            <div><Label htmlFor="invoice-tax-rate" className={labelCls}>Tax Rate (%)</Label>
              <Input id="invoice-tax-rate" type="number" inputMode="decimal" min={0} max={100} step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="mt-1.5" data-testid="invoice-tax-rate" /></div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className={labelCls}>Line Items ({currency})</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setItems((i) => [...i, emptyItem()])} data-testid="add-line-item">
                <Plus className="mr-1 h-3.5 w-3.5" /> Add item
              </Button>
            </div>
            <div className="hidden grid-cols-12 gap-2 px-0.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:grid">
              <span className="col-span-3">Item</span>
              <span className="col-span-2">Qty</span>
              <span className="col-span-2">Unit price</span>
              <span className="col-span-2">Discount</span>
              <span className="col-span-2 text-right">Amount</span>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => {
                const product = products.find((p) => p.id === it.product_id);
                const short = product && Number(it.quantity) > product.stock_quantity;
                return (
                  <div key={idx} className="grid grid-cols-12 items-start gap-2" data-testid={`invoice-item-${idx}`}>
                    <div className="col-span-12 sm:col-span-3">
                      <Select value={it.product_id || ""} onValueChange={(v) => updateItem(idx, "product_id", v)}>
                        <SelectTrigger className="h-9" aria-label={`Line ${idx + 1} product`}><SelectValue placeholder="Choose product..." /></SelectTrigger>
                        <SelectContent>{productOptions.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} <span className="text-muted-foreground">· {format(p.price)} · {p.stock_quantity} in stock</span>
                          </SelectItem>
                        ))}</SelectContent>
                      </Select>
                      {!it.product_id && <Input value={it.description} onChange={(e) => updateItem(idx, "description", e.target.value)} placeholder="...or type a service / custom item" aria-label={`Line ${idx + 1} description`} className="mt-1 h-8 text-xs" data-testid={`invoice-item-${idx}-description`} />}
                      {short && <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-500">Only {product.stock_quantity} in stock</p>}
                    </div>
                    <div className="col-span-12 -mb-1 grid grid-cols-12 gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:hidden">
                      <span className="col-span-3">Qty</span><span className="col-span-3">Price</span><span className="col-span-3">Discount</span><span className="col-span-2 text-right">Amount</span>
                    </div>
                    <Input type="number" inputMode="decimal" min={0} step="any" aria-label={`Line ${idx + 1} quantity`} value={it.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className="col-span-3 h-9 sm:col-span-2" placeholder="Qty" />
                    <Input type="number" inputMode="decimal" min={0} step="any" aria-label={`Line ${idx + 1} unit price`} value={it.unit_price} onChange={(e) => updateItem(idx, "unit_price", e.target.value)} className="col-span-3 h-9 sm:col-span-2" placeholder="Price" />
                    <Input type="number" inputMode="decimal" min={0} step="any" aria-label={`Line ${idx + 1} discount`} value={it.discount} onChange={(e) => updateItem(idx, "discount", e.target.value)} className="col-span-3 h-9 sm:col-span-2" placeholder="0" data-testid={`invoice-item-${idx}-discount`} />
                    <span className={`col-span-2 flex h-9 items-center justify-end truncate font-mono text-sm ${lineTotal(it) < 0 ? "text-rose-500" : ""}`}>{format(lineTotal(it))}</span>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${idx + 1}`} disabled={items.length === 1} className="col-span-1 h-9 w-9 text-rose-500" onClick={() => setItems((i) => i.filter((_, x) => x !== idx))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="invoice-notes" className={labelCls}>Notes</Label>
              <Textarea id="invoice-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1.5" placeholder="Payment terms, bank details, thank-you note..." data-testid="invoice-notes" />
            </div>
            <div className="space-y-1 self-end rounded-lg border border-border/70 bg-muted/30 p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{format(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax ({Number(taxRate) || 0}%)</span><span className="font-mono">{format(taxAmount)}</span></div>
              <div className="flex justify-between border-t border-border/70 pt-1 text-base font-semibold"><span>Total</span><span className="font-mono" data-testid="invoice-total">{format(total)}</span></div>
            </div>
          </div>

          {err && <p className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-600 dark:text-rose-400" role="alert" data-testid="invoice-error">{err}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="invoice-save">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{initial ? "Save changes" : "Create Invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
