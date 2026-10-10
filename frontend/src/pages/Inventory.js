import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Warehouse, ArrowUpCircle, ArrowDownCircle, Settings2, Package, Layers, Wallet, AlertTriangle, PackagePlus, Zap, TrendingUp, Truck } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useResource } from "@/hooks/useResource";
import { formatDate } from "@/lib/format";
import { useCurrency } from "@/context/CurrencyContext";
import { SummaryCard } from "@/components/common/SummaryCard";
import { PageHeader } from "@/components/common/PageHeader";
import { TableSkeleton, ErrorState } from "@/components/common/States";
import { EmptyState } from "@/components/common/EmptyState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Inventory() {
  const { data: products, loading, error, refetch } = useResource("/products", {});
  const { data: movements, refetch: refetchMoves } = useResource("/stock-movements", {});
  const [intel, setIntel] = useState(null);
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [type, setType] = useState("in");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [lowOnly, setLowOnly] = useState(false);
  const { format } = useCurrency();

  useEffect(() => {
    api.get("/products/intelligence")
      .then(({ data }) => setIntel(data))
      .catch(() => {});
  }, [products]);

  const safeProducts = Array.isArray(products) ? products : [];
  const isLow = (p) => p.stock_quantity <= p.reorder_level;
  const lowStock = safeProducts.filter(isLow);
  const totalUnits = safeProducts.reduce((s, p) => s + (p.stock_quantity || 0), 0);
  const stockValue = intel?.total_cost_valuation || safeProducts.reduce((s, p) => s + (p.stock_quantity || 0) * (p.cost || 0), 0);
  const retailValue = intel?.total_retail_valuation || safeProducts.reduce((s, p) => s + (p.stock_quantity || 0) * (p.price || 0), 0);
  const potentialProfit = intel?.potential_gross_profit || (retailValue - stockValue);

  const shown = lowOnly ? lowStock : safeProducts;

  const openMovement = (prefill = {}) => {
    setProductId(prefill.productId || "");
    setType(prefill.type || "in");
    setQuantity(prefill.quantity ?? 1);
    setReason(prefill.reason || "");
    setOpen(true);
  };

  const openRestock = (p) => openMovement({
    productId: p.id, type: "in", reason: `Restock via ${p.supplier_name || "Supplier"}`,
    quantity: Math.max(1, p.reorder_level * 2 - p.stock_quantity),
  });

  const submit = async () => {
    if (!productId) { toast.error("Select a product"); return; }
    setSaving(true);
    try {
      await api.post("/stock-movements", { product_id: productId, type, quantity: Number(quantity), reason });
      toast.success("Stock movement recorded");
      setOpen(false); setProductId(""); setQuantity(1); setReason(""); setType("in");
      refetch(); refetchMoves();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader title="Inventory" subtitle="Monitor stock levels, valuation, and reorder intelligence.">
        <Button onClick={() => openMovement()} data-testid="add-stock-movement-button">
          <Settings2 className="mr-2 h-4 w-4" /> Record Movement
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Products" value={products.length} sub="SKUs tracked" icon={Package} testId="inv-total-skus" />
        <SummaryCard label="Units in stock" value={totalUnits.toLocaleString()} sub="across all products" icon={Layers} testId="inv-total-units" />
        <SummaryCard label="Stock Value (Cost)" value={format(stockValue)} sub={`Retail Val: ${format(retailValue)}`} icon={Wallet} tone="text-primary" testId="inv-stock-value" />
        <SummaryCard label="Low Stock" value={lowStock.length} sub={lowStock.length ? (lowOnly ? "Showing low stock only" : "Click to filter low stock") : "All stocked"}
          icon={AlertTriangle} tone={lowStock.length ? "text-rose-500" : undefined} active={lowOnly}
          onClick={lowStock.length ? () => setLowOnly((v) => !v) : undefined} testId="inv-low-stock" />
      </div>

      {/* Inventory Intelligence Summary Banner */}
      <Card className="border-border/70 bg-card/90 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Zap className="h-4 w-4 text-amber-500" /> Valuation & Reorder Intelligence
          </span>
          <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" /> Potential Margin: {format(potentialProfit)}
          </span>
        </div>
        {lowStock.length > 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg text-sm">
            <div className="flex items-center gap-2 text-amber-600 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{lowStock.length} product(s) have fallen below their minimum reorder threshold.</span>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs border-amber-500/30 text-amber-700 bg-amber-500/5 hover:bg-amber-500/15" onClick={() => openRestock(lowStock[0])}>
              <Truck className="mr-1 h-3.5 w-3.5" /> Quick Reorder ({lowStock[0]?.name})
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">All inventory levels are healthy. Automated burn rate calculations update as sales are recorded.</p>
        )}
      </Card>

      {loading ? (
        <div className="rounded-xl border border-border/80 bg-card/90"><TableSkeleton /></div>
      ) : error ? (
        <ErrorState message={formatApiError(error)} onRetry={refetch} />
      ) : products.length === 0 ? (
        <EmptyState icon={Warehouse} title="No products to track" description="Add products first to manage inventory." />
      ) : (
        <Card className="overflow-hidden border-border/80 bg-card/90">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
            <h3 className="font-heading text-base font-semibold">Stock Levels & Supplier Info</h3>
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
                  {["Product", "SKU / Supplier", "In Stock", "Reorder At", "Cost / Retail", "Status"].map((h) => (
                    <TableHead key={h} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((p) => {
                  const low = isLow(p);
                  return (
                    <TableRow key={p.id} data-testid={`inventory-row-${p.id}`}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="font-mono">{p.sku || "—"}</span>
                        {p.supplier_name && <span className="block text-[11px] text-muted-foreground/80">{p.supplier_name}</span>}
                      </TableCell>
                      <TableCell className={`font-mono font-semibold ${low ? "text-rose-500" : ""}`}>{p.stock_quantity} {p.unit}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{p.reorder_level}</TableCell>
                      <TableCell className="font-mono text-xs">
                        <span>{format(p.stock_quantity * (p.cost || 0))}</span>
                        <span className="block text-muted-foreground font-normal">Val: {format(p.stock_quantity * (p.price || 0))}</span>
                      </TableCell>
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
          <DialogHeader><DialogTitle>{reason?.includes("Restock") ? "Restock Product" : "Record Stock Movement"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="mt-1.5" data-testid="movement-product"><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{safeProducts.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.stock_quantity})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="mt-1.5" data-testid="movement-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Stock In</SelectItem>
                    <SelectItem value="out">Stock Out</SelectItem>
                    <SelectItem value="adjustment">Adjustment (set to)</SelectItem>
                  </SelectContent>
                </Select></div>
              <div><Label className="text-xs text-muted-foreground">Quantity</Label>
                <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-1.5" data-testid="movement-quantity" /></div>
            </div>
            <div><Label className="text-xs text-muted-foreground">Reason</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Purchase order received" className="mt-1.5" data-testid="movement-reason" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving} data-testid="movement-save">Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
