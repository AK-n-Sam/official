import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Warehouse, ArrowUpCircle, ArrowDownCircle, Settings2, Package, Layers, Wallet, AlertTriangle, PackagePlus, Search, Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useResource } from "@/hooks/useResource";
import { formatDate } from "@/lib/format";
import { useCurrency } from "@/context/CurrencyContext";
import { SummaryCard } from "@/components/common/SummaryCard";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionSwitch } from "@/components/layout/SectionSwitch";
import { useActions } from "@/components/actions/ActionsProvider";
import { useDataChanged } from "@/hooks/useDataChanged";
import { TableSkeleton, ErrorState } from "@/components/common/States";
import { EmptyState } from "@/components/common/EmptyState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Inventory() {
  const { data: allProducts, loading, error, refetch } = useResource("/products", {});
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { data: movements, refetch: refetchMoves } = useResource("/stock-movements", {});
  const actions = useActions();
  useDataChanged(() => { refetch(); refetchMoves(); });
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [type, setType] = useState("adjustment");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [lowOnly, setLowOnly] = useState(() => params.get("low") === "1");
  const [formErr, setFormErr] = useState("");
  const lowParam = params.get("low");
  useEffect(() => { if (lowParam === "1") setLowOnly(true); }, [lowParam]);
  // Inactive products are no longer sold, so they don't need stock tracking.
  const products = allProducts.filter((p) => p.status !== "inactive");
  const { format } = useCurrency();

  const isLow = (p) => p.stock_quantity <= p.reorder_level;
  const lowStock = products.filter(isLow);
  const totalUnits = products.reduce((s, p) => s + p.stock_quantity, 0);
  const stockValue = products.reduce((s, p) => s + p.stock_quantity * (p.cost || 0), 0);
  const q = search.trim().toLowerCase();
  const shown = (lowOnly ? lowStock : products).filter((p) => !q || [p.name, p.sku, p.category, p.supplier_name].some((v) => (v || "").toLowerCase().includes(q)));

  const openMovement = (prefill = {}) => {
    setProductId(prefill.productId || "");
    setType(prefill.type || "adjustment");
    setQuantity(prefill.quantity ?? 1);
    setReason(prefill.reason || "");
    setFormErr("");
    setOpen(true);
  };
  // Restocking is a purchase: stock goes up and the cost is recorded, in one step. The suggested
  // quantity tops up to twice the minimum level so the product doesn't land straight back on the list.
  const openRestock = (p) => actions.buyStock({ items: [{ product_id: p.id, quantity: Math.max(1, p.reorder_level * 2 - p.stock_quantity) }] });

  const selected = products.find((p) => p.id === productId);
  const submit = async (e) => {
    e?.preventDefault();
    const qty = Number(quantity);
    if (!productId) { setFormErr("Choose a product"); return; }
    if (!Number.isInteger(qty) || qty < 0 || (type !== "adjustment" && qty === 0)) { setFormErr(type === "adjustment" ? "Enter the counted quantity (0 or more)" : "Enter a whole number above zero"); return; }
    if (type === "out" && selected && qty > selected.stock_quantity) { setFormErr(`Only ${selected.stock_quantity} ${selected.unit || "unit"}(s) in stock`); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/stock-movements", { product_id: productId, type, quantity: qty, reason });
      toast.success(`${selected?.name || "Stock"}: now ${data.new_stock} in stock`);
      setOpen(false); setProductId(""); setQuantity(1); setReason(""); setType("adjustment");
      refetch(); refetchMoves();
    } catch (e2) { setFormErr(formatApiError(e2)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 animate-in-up">
      <SectionSwitch section="products" />
      <PageHeader title="Stock" subtitle="What's on the shelf. Sales take stock off automatically; buying stock puts it back and records the cost.">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openMovement()} data-testid="add-stock-movement-button">
            <Settings2 className="mr-2 h-4 w-4" /> Adjust stock
          </Button>
          <Button onClick={() => actions.buyStock()} data-testid="buy-stock-button">
            <PackagePlus className="mr-2 h-4 w-4" /> Buy stock
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Products" value={products.length} sub="SKUs tracked" icon={Package} testId="inv-total-skus" />
        <SummaryCard label="Units in stock" value={totalUnits.toLocaleString()} sub="across all products" icon={Layers} testId="inv-total-units" />
        <SummaryCard label="Stock value" value={format(stockValue)} sub="at purchase price" icon={Wallet} tone="text-primary" testId="inv-stock-value" />
        <SummaryCard label="Low stock" value={lowStock.length} sub={lowStock.length ? (lowOnly ? "Showing low stock only" : "Click to show only these") : "All stocked"}
          icon={AlertTriangle} tone={lowStock.length ? "text-rose-500" : undefined} active={lowOnly}
          onClick={lowStock.length ? () => setLowOnly((v) => !v) : undefined} testId="inv-low-stock" />
      </div>

      {loading ? (
        <div className="rounded-xl border border-border/80 bg-card/90"><TableSkeleton /></div>
      ) : error ? (
        <ErrorState message={formatApiError(error)} onRetry={refetch} />
      ) : products.length === 0 ? (
        <EmptyState icon={Warehouse} title="No products to track" description="Add products first to manage inventory." actionLabel="Add a product" onAction={() => navigate("/products?new=1")} />
      ) : (
        <Card className="overflow-hidden border-border/80 bg-card/90">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
            <h3 className="font-heading text-base font-semibold">Stock Levels</h3>
            <div className="relative order-last w-full sm:order-none sm:ml-auto sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a product..." className="h-8 pl-9" aria-label="Find a product" data-testid="inventory-search" />
            </div>
            {lowStock.length > 0 && (
              <Button variant={lowOnly ? "secondary" : "ghost"} size="sm" className="h-8 text-xs" onClick={() => setLowOnly((v) => !v)} data-testid="inv-low-only">
                {lowOnly ? "Show all products" : `Low stock only (${lowStock.length})`}
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <Table data-testid="inventory-table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {["Product", "SKU", "In Stock", "Reorder At", "Value", "Status"].map((h) => (
                    <TableHead key={h} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No products match "{search}".</TableCell></TableRow>
                )}
                {shown.map((p) => {
                  const low = isLow(p);
                  return (
                    <TableRow key={p.id} data-testid={`inventory-row-${p.id}`}>
                      <TableCell className="font-medium"><button type="button" className="hover:underline" onClick={() => navigate(`/products?q=${encodeURIComponent(p.name)}`)}>{p.name}</button></TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{p.sku}</TableCell>
                      <TableCell className={`font-mono font-semibold ${low ? "text-rose-500" : ""}`}>{p.stock_quantity} {p.unit}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{p.reorder_level}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{format(p.stock_quantity * (p.cost || 0))}</TableCell>
                      <TableCell>
                        {low ? (
                          <div className="flex items-center gap-2">
                            <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20">Reorder</Badge>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => openRestock(p)} data-testid={`restock-${p.id}`}>
                              <PackagePlus className="mr-1 h-3.5 w-3.5" /> Restock
                            </Button>
                          </div>
                        ) : <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">In Stock</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden border-border/80 bg-card/90" data-testid="stock-movements-card">
        <div className="border-b border-border/70 px-5 py-4"><h3 className="font-heading text-base font-semibold">Recent Stock Movements</h3></div>
        <div className="divide-y divide-border/50">
          {movements.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No movements recorded yet.</p>
          ) : movements.slice(0, 12).map((m) => (
            <div key={m.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                {m.type === "in" ? <ArrowUpCircle className="h-5 w-5 text-emerald-500" />
                  : m.type === "out" ? <ArrowDownCircle className="h-5 w-5 text-rose-500" />
                  : <Settings2 className="h-5 w-5 text-blue-500" />}
                <div>
                  <p className="text-sm font-medium">{m.product_name}</p>
                  <p className="text-xs text-muted-foreground">{m.reason || m.type} · {formatDate(m.date)}</p>
                </div>
              </div>
              {/* An adjustment sets stock to an exact count rather than adding or removing. */}
              <span className={`font-mono text-sm font-semibold ${m.type === "in" ? "text-emerald-500" : m.type === "out" ? "text-rose-500" : "text-blue-500"}`}
                title={m.type === "adjustment" ? "Stock set to this count" : undefined}>
                {m.type === "in" ? "+" : m.type === "out" ? "−" : "= "}{m.quantity}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="stock-movement-modal">
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
            <DialogDescription>For counts, damage and other changes. Bought new stock? Use Buy stock, which also records the cost.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Product</Label>
              <Select value={productId} onValueChange={(v) => { setProductId(v); setFormErr(""); }}>
                <SelectTrigger className="mt-1.5" data-testid="movement-product"><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.stock_quantity})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="mt-1.5" data-testid="movement-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adjustment">Counted (set to)</SelectItem>
                    <SelectItem value="out">Removed (damaged, lost, used)</SelectItem>
                    <SelectItem value="in">Added (returned, no cost)</SelectItem>
                  </SelectContent>
                </Select></div>
              <div><Label className="text-xs text-muted-foreground">Quantity</Label>
                <Input type="number" inputMode="numeric" min={0} step={1} value={quantity} onChange={(e) => { setQuantity(e.target.value); setFormErr(""); }} className="mt-1.5" data-testid="movement-quantity" /></div>
            </div>
            <div><Label className="text-xs text-muted-foreground">Reason</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Purchase order received" className="mt-1.5" data-testid="movement-reason" /></div>
            {selected && (
              <p className="text-xs text-muted-foreground" data-testid="movement-preview">
                {selected.name}: {selected.stock_quantity} in stock now
                {Number.isInteger(Number(quantity)) && quantity !== "" && ` → ${type === "in" ? selected.stock_quantity + Number(quantity) : type === "out" ? Math.max(0, selected.stock_quantity - Number(quantity)) : Number(quantity)} after this`}
              </p>
            )}
            {formErr && <p className="text-sm text-rose-500" role="alert" data-testid="movement-error">{formErr}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving} data-testid="movement-save">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
