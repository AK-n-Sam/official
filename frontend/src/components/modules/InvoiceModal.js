import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const emptyItem = () => ({ product_id: "", description: "", quantity: 1, unit_price: 0 });

export function InvoiceModal({ open, onOpenChange, initial, onSaved }) {
  const { format } = useCurrency();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [statusVal, setStatusVal] = useState("pending");
  const [taxRate, setTaxRate] = useState(8);
  const [items, setItems] = useState([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      api.get("/customers").then(({ data }) => setCustomers(data)).catch(() => {});
      api.get("/products").then(({ data }) => setProducts(data)).catch(() => {});
      const today = new Date().toISOString().slice(0, 10);
      const due = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
      if (initial) {
        setCustomerId(initial.customer_id || "");
        setIssueDate(initial.issue_date || today);
        setDueDate(initial.due_date || due);
        setStatusVal(initial.status || "pending");
        setTaxRate((initial.tax_rate || 0) * 100);
        setItems(initial.items?.length ? initial.items.map((i) => ({ ...i })) : [emptyItem()]);
      } else {
        setCustomerId(""); setIssueDate(today); setDueDate(due); setStatusVal("pending"); setTaxRate(8); setItems([emptyItem()]);
      }
      setErr("");
    }
  }, [open, initial]);

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

  const subtotal = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  const taxAmount = subtotal * (Number(taxRate) / 100);
  const total = subtotal + taxAmount;

  const save = async () => {
    if (!customerId) { setErr("Please select a customer"); return; }
    if (!items.some((it) => it.description && Number(it.quantity) > 0)) { setErr("Add at least one line item"); return; }
    const customer = customers.find((c) => c.id === customerId);
    const payload = {
      customer_id: customerId, customer_name: customer?.name || "",
      issue_date: issueDate, due_date: dueDate, status: statusVal, tax_rate: Number(taxRate) / 100,
      items: items.filter((it) => it.description).map((it) => ({
        product_id: it.product_id || "", description: it.description,
        quantity: Number(it.quantity) || 0, unit_price: Number(it.unit_price) || 0,
      })),
    };
    setSaving(true);
    try {
      if (initial) { await api.put(`/invoices/${initial.id}`, payload); toast.success("Invoice updated"); }
      else { await api.post("/invoices", payload); toast.success("Invoice created"); }
      onSaved?.();
      onOpenChange(false);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" data-testid="invoice-modal">
        <DialogHeader>
          <DialogTitle className="text-xl">{initial ? "Edit Invoice" : "New Invoice"}</DialogTitle>
          <DialogDescription>Select a customer, add line items, and totals calculate automatically.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs font-medium text-muted-foreground">Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="mt-1.5" data-testid="invoice-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs font-medium text-muted-foreground">Issue Date</Label>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="mt-1.5" data-testid="invoice-issue-date" /></div>
          <div><Label className="text-xs font-medium text-muted-foreground">Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1.5" data-testid="invoice-due-date" /></div>
          <div><Label className="text-xs font-medium text-muted-foreground">Status</Label>
            <Select value={statusVal} onValueChange={setStatusVal}>
              <SelectTrigger className="mt-1.5" data-testid="invoice-status"><SelectValue /></SelectTrigger>
              <SelectContent>{["draft", "pending", "paid", "overdue"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label className="text-xs font-medium text-muted-foreground">Tax Rate (%)</Label>
            <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="mt-1.5" data-testid="invoice-tax-rate" /></div>
        </div>

        <div className="mt-2">
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-xs font-medium text-muted-foreground">Line Items</Label>
            <Button variant="outline" size="sm" onClick={() => setItems((i) => [...i, emptyItem()])} data-testid="add-line-item">
              <Plus className="mr-1 h-3.5 w-3.5" /> Add item
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 items-center gap-2" data-testid={`invoice-item-${idx}`}>
                <div className="col-span-5">
                  <Select value={it.product_id || ""} onValueChange={(v) => updateItem(idx, "product_id", v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Product / description" /></SelectTrigger>
                    <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {!it.product_id && <Input value={it.description} onChange={(e) => updateItem(idx, "description", e.target.value)} placeholder="Custom description" className="mt-1 h-8 text-xs" />}
                </div>
                <Input type="number" value={it.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className="col-span-2 h-9" placeholder="Qty" />
                <Input type="number" value={it.unit_price} onChange={(e) => updateItem(idx, "unit_price", e.target.value)} className="col-span-2 h-9" placeholder="Price" />
                <span className="col-span-2 text-right font-mono text-sm">{format((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}</span>
                <Button variant="ghost" size="icon" className="col-span-1 h-8 w-8 text-rose-500" onClick={() => setItems((i) => i.filter((_, x) => x !== idx))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-2 space-y-1 rounded-lg border border-border/70 bg-muted/30 p-4 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{format(subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Tax ({taxRate}%)</span><span className="font-mono">{format(taxAmount)}</span></div>
          <div className="flex justify-between border-t border-border/70 pt-1 text-base font-semibold"><span>Total</span><span className="font-mono" data-testid="invoice-total">{format(total)}</span></div>
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
