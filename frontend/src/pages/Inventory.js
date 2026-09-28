import { useState } from "react";
import { toast } from "sonner";
import { Warehouse, ArrowUpCircle, ArrowDownCircle, Settings2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useResource } from "@/hooks/useResource";
import { formatDate } from "@/lib/format";
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
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [type, setType] = useState("in");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const lowStock = products.filter((p) => p.stock_quantity <= p.reorder_level);
  const totalUnits = products.reduce((s, p) => s + p.stock_quantity, 0);

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
      <PageHeader title="Inventory" subtitle="Monitor stock levels and record movements.">
        <Button onClick={() => setOpen(true)} data-testid="add-stock-movement-button">
          <Settings2 className="mr-2 h-4 w-4" /> Record Movement
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border/70 bg-card/90 p-5" data-testid="inv-total-skus">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total SKUs</p>
          <p className="mt-2 font-mono text-3xl font-extrabold">{products.length}</p>
        </Card>
        <Card className="border-border/70 bg-card/90 p-5" data-testid="inv-total-units">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Units in Stock</p>
          <p className="mt-2 font-mono text-3xl font-extrabold">{totalUnits}</p>
        </Card>
        <Card className="border-border/70 bg-card/90 p-5" data-testid="inv-low-stock">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Low Stock Alerts</p>
          <p className="mt-2 font-mono text-3xl font-extrabold text-rose-500">{lowStock.length}</p>
        </Card>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border/80 bg-card/90"><TableSkeleton /></div>
      ) : error ? (
        <ErrorState message={formatApiError(error)} onRetry={refetch} />
      ) : products.length === 0 ? (
        <EmptyState icon={Warehouse} title="No products to track" description="Add products first to manage inventory." />
      ) : (
        <Card className="overflow-hidden border-border/80 bg-card/90">
          <div className="border-b border-border/70 px-5 py-4"><h3 className="font-heading text-base font-semibold">Stock Levels</h3></div>
          <div className="overflow-x-auto">
            <Table data-testid="inventory-table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {["Product", "SKU", "In Stock", "Reorder At", "Status"].map((h) => (
                    <TableHead key={h} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => {
                  const low = p.stock_quantity <= p.reorder_level;
                  return (
                    <TableRow key={p.id} data-testid={`inventory-row-${p.id}`}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{p.sku}</TableCell>
                      <TableCell className={`font-mono font-semibold ${low ? "text-rose-500" : ""}`}>{p.stock_quantity} {p.unit}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{p.reorder_level}</TableCell>
                      <TableCell>
                        {low ? <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20">Reorder</Badge>
                             : <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">In Stock</Badge>}
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
                {m.type === "in" ? <ArrowUpCircle className="h-5 w-5 text-emerald-500" /> : <ArrowDownCircle className="h-5 w-5 text-rose-500" />}
                <div>
                  <p className="text-sm font-medium">{m.product_name}</p>
                  <p className="text-xs text-muted-foreground">{m.reason || m.type} · {formatDate(m.date)}</p>
                </div>
              </div>
              <span className={`font-mono text-sm font-semibold ${m.type === "in" ? "text-emerald-500" : "text-rose-500"}`}>
                {m.type === "in" ? "+" : "−"}{m.quantity}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="stock-movement-modal">
          <DialogHeader><DialogTitle>Record Stock Movement</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="mt-1.5" data-testid="movement-product"><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.stock_quantity})</SelectItem>)}</SelectContent>
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
