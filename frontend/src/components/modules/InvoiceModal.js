import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const emptyItem = () => ({ product_id: "", description: "", quantity: 1, unit_price: 0, discount: 0 });

// Statuses a new invoice can start in; partially paid / overdue / cancelled are reached via actions.
const CREATE_STATUSES = [
  { value: "draft", label: "Draft", hint: "Not sent yet, stock untouched" },
  { value: "sent", label: "Sent", hint: "Awaiting payment" },
  { value: "paid", label: "Paid", hint: "Records the full payment now" },
];

const lineTotal = (it) => (Number(it.quantity) || 0) * (Number(it.unit_price) || 0) - (Number(it.discount) || 0);
const isoDate = (d) => d.toISOString().slice(0, 10);

// `initial` edits an existing invoice; `template` starts a new one from a copy of another invoice
// (customer, items, tax and notes; fresh dates and number). `onSaved` receives the saved invoice.
export function InvoiceModal({ open, onOpenChange, initial, template, defaultCustomerId, onSaved }) {
  const { format } = useCurrency();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
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
    api.get("/customers").then(({ data }) => setCustomers(data)).catch(() => {});
    api.get("/products").then(({ data }) => setProducts(data)).catch(() => {});
    setErr("");
    if (initial) {
      setCustomerId(initial.customer_id || "");
      setIssueDate(initial.issue_date || isoDate(new Date()));
      setDueDate(initial.due_date || isoDate(new Date()));
      setTaxRate(+((initial.tax_rate || 0) * 100).toFixed(4));
      setNotes(initial.notes || "");
      setItems(initial.items?.length ? initial.items.map((i) => ({ ...emptyItem(), ...i })) : [emptyItem()]);
      return;
    }
    // New invoice: start from the workspace's invoicing defaults (Settings > Invoicing),
    // or from the invoice being duplicated.
    const today = new Date();
    setCustomerId(template?.customer_id || defaultCustomerId || "");
    setIssueDate(isoDate(today));
    setDueDate(isoDate(new Date(today.getTime() + 30 * 864e5)));
    setStatusVal("sent");
    setTaxRate(template ? +((template.tax_rate || 0) * 100).toFixed(4) : 8);
    setNotes(template?.notes || "");
    setItems(template?.items?.length
      ? template.items.map(({ product_id, description, quantity, unit_price, discount }) => ({ ...emptyItem(), product_id, description, quantity, unit_price, discount: discount || 0 }))
      : [emptyItem()]);
    let cancelled = false;
    api.get("/organizations/current").then(({ data: org }) => {
      if (cancelled) return;
      const dueDays = Number(org.invoice_due_days) || 30;
      setDueDate(isoDate(new Date(today.getTime() + dueDays * 864e5)));
      if (template) return;
      setTaxRate(+((org.invoice_tax_rate || 0) * 100).toFixed(4));
      setNotes(org.invoice_notes || "");
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, initial, template, defaultCustomerId]);

  const updateItem = (idx, field, value) => {
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
  const taxAmount = subtotal * (Number(taxRate) / 100);
  const total = subtotal + taxAmount;

  const save = async () => {
    if (!customerId) { setErr("Please select a customer"); return; }
    if (!items.some((it) => it.description && Number(it.quantity) > 0)) { setErr("Add at least one line item"); return; }
    const customer = customers.find((c) => c.id === customerId);
    const payload = {
      customer_id: customerId, customer_name: customer?.name || initial?.customer_name || "",
      issue_date: issueDate, due_date: dueDate, tax_rate: Number(taxRate) / 100, notes,
      items: items.filter((it) => it.description).map((it) => ({
        product_id: it.product_id || "", description: it.description,
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
      toast.success(initial ? "Invoice updated" : saved?.invoice_number ? `Invoice ${saved.invoice_number} created` : "Invoice created");
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const labelCls = "text-xs font-medium text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" data-testid="invoice-modal">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {initial ? `Edit ${initial.invoice_number || "Invoice"}` : template ? `Duplicate ${template.invoice_number}` : "New Invoice"}
          </DialogTitle>
          <DialogDescription>Select a customer, add line items, and totals calculate automatically.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className={labelCls}>Customer *</Label>
            <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setErr(""); }}>
              <SelectTrigger className="mt-1.5" data-testid="invoice-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.company && c.company !== c.name ? ` · ${c.company}` : ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className={labelCls}>Issue Date</Label>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="mt-1.5" data-testid="invoice-issue-date" /></div>
          <div><Label className={labelCls}>Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1.5" data-testid="invoice-due-date" /></div>
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
          <div><Label className={labelCls}>Tax Rate (%)</Label>
            <Input type="number" min={0} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="mt-1.5" data-testid="invoice-tax-rate" /></div>
        </div>

        <div className="mt-2">
          <div className="mb-2 flex items-center justify-between">
            <Label className={labelCls}>Line Items</Label>
            <Button variant="outline" size="sm" onClick={() => setItems((i) => [...i, emptyItem()])} data-testid="add-line-item">
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
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 items-start gap-2" data-testid={`invoice-item-${idx}`}>
                <div className="col-span-12 sm:col-span-3">
                  <Select value={it.product_id || ""} onValueChange={(v) => updateItem(idx, "product_id", v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Choose product..." /></SelectTrigger>
                    <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {!it.product_id && <Input value={it.description} onChange={(e) => updateItem(idx, "description", e.target.value)} placeholder="...or type a custom item" className="mt-1 h-8 text-xs" data-testid={`invoice-item-${idx}-description`} />}
                </div>
                <div className="col-span-12 -mb-1 grid grid-cols-12 gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:hidden">
                  <span className="col-span-3">Qty</span><span className="col-span-3">Price</span><span className="col-span-3">Discount</span><span className="col-span-2 text-right">Amount</span>
                </div>
                <Input type="number" min={0} aria-label="Quantity" value={it.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className="col-span-3 h-9 sm:col-span-2" placeholder="Qty" />
                <Input type="number" min={0} aria-label="Unit price" value={it.unit_price} onChange={(e) => updateItem(idx, "unit_price", e.target.value)} className="col-span-3 h-9 sm:col-span-2" placeholder="Price" />
                <Input type="number" min={0} aria-label="Discount" value={it.discount} onChange={(e) => updateItem(idx, "discount", e.target.value)} className="col-span-3 h-9 sm:col-span-2" placeholder="0" data-testid={`invoice-item-${idx}-discount`} />
                <span className="col-span-2 flex h-9 items-center justify-end truncate font-mono text-sm">{format(lineTotal(it))}</span>
                <Button variant="ghost" size="icon" aria-label="Remove line" className="col-span-1 h-9 w-9 text-rose-500" onClick={() => setItems((i) => i.filter((_, x) => x !== idx))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label className={labelCls}>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1.5" placeholder="Payment terms, thank-you note..." data-testid="invoice-notes" />
          </div>
          <div className="space-y-1 self-end rounded-lg border border-border/70 bg-muted/30 p-4 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{format(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax ({Number(taxRate) || 0}%)</span><span className="font-mono">{format(taxAmount)}</span></div>
            <div className="flex justify-between border-t border-border/70 pt-1 text-base font-semibold"><span>Total</span><span className="font-mono" data-testid="invoice-total">{format(total)}</span></div>
          </div>
        </div>

        {err && <p className="text-sm text-rose-500" data-testid="invoice-error">{err}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} data-testid="invoice-save">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{initial ? "Save changes" : "Create Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
