import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { todayIso } from "@/lib/format";
import { notifyDataChanged } from "@/hooks/useDataChanged";
import { PAYMENT_METHODS } from "@/modules/resourceConfigs";
import { ProductPicker } from "@/components/actions/Pickers";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NO_SUPPLIER = "__none__";

/**
 * Bought stock: what arrived, what it cost, and whether it's paid. Stock goes up and the cost is
 * recorded as an expense in the same step (no second form with the same numbers).
 * `prefill.items`: [{ product_id, quantity }].
 */
export function BuyStockDialog({ open, onOpenChange, prefill }) {
  const { format, currency } = useCurrency();
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [lines, setLines] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [paid, setPaid] = useState(true);
  const [method, setMethod] = useState("bank_transfer");
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setErr(""); setLines([]); setPaid(true); setDate(todayIso()); setSupplierId("");
    Promise.all([api.get("/products"), api.get("/suppliers")]).then(([p, s]) => {
      if (cancelled) return;
      setProducts(p.data); setSuppliers(s.data);
      const pre = (prefill?.items || []).map((it) => {
        const prod = p.data.find((x) => x.id === it.product_id);
        return prod && { key: prod.id, product_id: prod.id, name: prod.name, unit: prod.unit, stock: prod.stock_quantity, quantity: it.quantity || 1, unit_cost: prod.cost || 0 };
      }).filter(Boolean);
      setLines(pre);
      const fromProduct = pre.length && p.data.find((x) => x.id === pre[0].product_id)?.supplier_id;
      setSupplierId(prefill?.supplierId || fromProduct || "");
    }).catch((e) => !cancelled && setErr(formatApiError(e)));
    return () => { cancelled = true; };
  }, [open, prefill]);

  const addProduct = (p) => {
    setErr("");
    if (lines.some((l) => l.product_id === p.id)) return;
    setLines((ls) => [...ls, { key: p.id, product_id: p.id, name: p.name, unit: p.unit, stock: p.stock_quantity, quantity: Math.max(1, (p.reorder_level || 0) * 2 - p.stock_quantity), unit_cost: p.cost || 0 }]);
    if (!supplierId && p.supplier_id) setSupplierId(p.supplier_id);
  };
  const update = (key, field, value) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0);
  const supplierName = suppliers.find((s) => s.id === supplierId)?.name;

  const submit = async (e) => {
    e?.preventDefault();
    if (!lines.length) return setErr("Add the products you bought");
    for (const l of lines) {
      if (!Number.isInteger(Number(l.quantity)) || Number(l.quantity) <= 0) return setErr(`Enter a whole quantity for ${l.name}`);
      if (Number(l.unit_cost) < 0) return setErr(`The cost of ${l.name} can't be negative`);
    }
    setSaving(true);
    try {
      const { data } = await api.post("/actions/purchase", {
        items: lines.map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity), unit_cost: Number(l.unit_cost) || 0 })),
        supplier_id: supplierId, paid, method, date,
      });
      toast.success(data.items.length === 1 ? `${data.items[0].name}: now ${data.items[0].new_stock} in stock` : `Stock updated for ${data.items.length} products`, {
        description: data.expense ? `${format(data.total)} recorded as ${paid ? "a paid" : "an unpaid"} expense${data.supplier_name ? ` to ${data.supplier_name}` : ""}.` : "No cost entered, so no expense was recorded.",
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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg" data-testid="buy-stock-dialog">
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-xl">Buy stock</DialogTitle>
            <DialogDescription>What arrived and what it cost. Stock goes up and the cost is recorded as an expense.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2" data-testid="buy-lines">
            {lines.length > 0 && (
              <div className="grid grid-cols-12 gap-2 px-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <span className="col-span-6">Product</span><span className="col-span-2">Qty</span><span className="col-span-3">Unit cost ({currency})</span>
              </div>
            )}
            {lines.map((l) => (
              <div key={l.key} className="grid grid-cols-12 items-center gap-2" data-testid="buy-line">
                <div className="col-span-6 min-w-0">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  <p className="text-[11px] text-muted-foreground">{l.stock} in stock → {l.stock + (Number(l.quantity) || 0)}</p>
                </div>
                <Input type="number" inputMode="numeric" min={1} step={1} value={l.quantity} onChange={(e) => update(l.key, "quantity", e.target.value)} className="col-span-2 h-9" aria-label={`Quantity of ${l.name}`} />
                <Input type="number" inputMode="decimal" min={0} step="any" value={l.unit_cost} onChange={(e) => update(l.key, "unit_cost", e.target.value)} className="col-span-3 h-9" aria-label={`Unit cost of ${l.name}`} />
                <Button type="button" variant="ghost" size="icon" className="col-span-1 h-8 w-8 text-muted-foreground hover:text-rose-500" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Remove ${l.name}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <ProductPicker products={products} onPick={(p) => !p.custom && addProduct(p)} allowCustom={false} placeholder={lines.length ? "Add another product..." : "Choose a product..."} testId="buy-add-item" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className={labelCls}>Bought from</Label>
              <Select value={supplierId || NO_SUPPLIER} onValueChange={(v) => setSupplierId(v === NO_SUPPLIER ? "" : v)}>
                <SelectTrigger className="mt-1.5" aria-label="Supplier" data-testid="buy-supplier"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SUPPLIER}>No supplier</SelectItem>
                  {suppliers.filter((s) => s.status !== "inactive" || s.id === supplierId).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="buy-date" className={labelCls}>Date</Label>
              <Input id="buy-date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value || todayIso())} className="mt-1.5" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4 rounded border-border" data-testid="buy-paid" />
              Already paid
            </label>
            {paid && (
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-8 w-40" aria-label="Payment method"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
          {lines.length > 0 && (
            <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm" data-testid="buy-summary">
              Adds stock for {lines.length} product{lines.length === 1 ? "" : "s"}
              {total > 0 ? <> and records a <span className="font-semibold">{format(total)}</span> {paid ? "paid" : "unpaid"} expense{supplierName ? ` to ${supplierName}` : ""}.</> : ". No cost entered, so no expense."}
            </p>
          )}
          {err && <p className="text-sm text-rose-500" role="alert" data-testid="buy-error">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="buy-submit">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add to stock{total > 0 ? ` · ${format(total)}` : ""}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
