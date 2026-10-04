import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Package, Warehouse, Truck, CheckSquare, AlertTriangle, Plus, ArrowRight, Zap, RefreshCw } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/States";
import { AutomationModal } from "@/components/common/AutomationModal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Products from "@/pages/Products";
import Inventory from "@/pages/Inventory";
import Suppliers from "@/pages/Suppliers";

export default function OperationsModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";
  const { format } = useCurrency();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [automationModalOpen, setAutomationModalOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get("/inventory").then(({ data }) => {
      setData(data);
      setError(null);
    }).catch((e) => setError(e)).finally(() => setLoading(false));
  }, []);

  const handleTabChange = (val) => {
    setSearchParams({ tab: val });
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-12 w-64" /><Skeleton className="h-96 rounded-xl" /></div>;
  if (error) return <ErrorState message={formatApiError(error)} onRetry={() => window.location.reload()} />;

  const items = data.items || [];
  const lowStock = items.filter((i) => i.is_low_stock || (i.stock_quantity <= (i.reorder_level || 5)));

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader
        title="Operations & Execution Hub"
        subtitle="Can the business actually deliver? Stock levels, product catalog, suppliers, and fulfillment."
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAutomationModalOpen(true)} className="gap-1.5 text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
            <Zap className="h-3.5 w-3.5 text-emerald-500" />
            <span>Automate (WHEN → DO)</span>
          </Button>
          <Button size="sm" onClick={() => navigate("/products?new=1")} className="gap-1.5 text-xs font-semibold" data-testid="new-product-ops-btn">
            <Plus className="h-4 w-4" /> Add Product
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/suppliers?new=1")} className="gap-1.5 text-xs font-semibold" data-testid="new-supplier-ops-btn">
            <Plus className="h-4 w-4" /> Add Supplier
          </Button>
        </div>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-card border border-border/70 p-1" data-testid="operations-tabs">
          <TabsTrigger value="overview" data-testid="tab-ops-overview">Overview</TabsTrigger>
          <TabsTrigger value="stock" data-testid="tab-ops-stock">Stock & Inventory ({items.length})</TabsTrigger>
          <TabsTrigger value="products" data-testid="tab-ops-products">Products Catalog</TabsTrigger>
          <TabsTrigger value="suppliers" data-testid="tab-ops-suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="work" data-testid="tab-ops-work">Work & Issues ({lowStock.length})</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Products</p>
              <p className="font-mono text-2xl font-extrabold mt-1">{items.length}</p>
            </Card>
            <Card className="border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Low Stock Warnings</p>
              <p className={`font-mono text-2xl font-extrabold mt-1 ${lowStock.length > 0 ? "text-amber-500" : "text-emerald-500"}`}>{lowStock.length}</p>
            </Card>
            <Card className="border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Stock Value</p>
              <p className="font-mono text-2xl font-extrabold text-emerald-600 mt-1">{format(items.reduce((acc, i) => acc + (i.price * (i.stock_quantity || 0)), 0))}</p>
            </Card>
            <Card className="border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fulfillment Health</p>
              <p className="font-mono text-2xl font-extrabold text-primary mt-1">98.5%</p>
            </Card>
          </div>

          <Inventory />
        </TabsContent>

        {/* STOCK & INVENTORY */}
        <TabsContent value="stock" className="space-y-4">
          <Inventory />
        </TabsContent>

        {/* PRODUCTS CATALOG */}
        <TabsContent value="products" className="space-y-4">
          <Products />
        </TabsContent>

        {/* SUPPLIERS */}
        <TabsContent value="suppliers" className="space-y-4">
          <Suppliers />
        </TabsContent>

        {/* WORK & ISSUES (Reorder Workflow) */}
        <TabsContent value="work" className="space-y-4">
          <Card className="border-amber-500/30 bg-amber-500/5 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <h3 className="font-heading font-bold text-lg text-amber-600 dark:text-amber-400">Low Stock & Reorder Workflows</h3>
              </div>
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                {lowStock.length} Products Low
              </Badge>
            </div>
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">All stock levels are optimal!</p>
            ) : (
              <div className="space-y-3 pt-2">
                {lowStock.map((prod) => (
                  <div key={prod.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border border-border bg-card">
                    <div>
                      <p className="font-semibold text-sm">{prod.name}</p>
                      <p className="text-xs text-muted-foreground">Current Stock: <strong>{prod.stock_quantity || 0}</strong> (Reorder Level: {prod.reorder_level || 5})</p>
                    </div>
                    <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => navigate(`/tasks?new=1&title=Reorder+${encodeURIComponent(prod.name)}`)}>
                      <RefreshCw className="h-3.5 w-3.5" /> Create Purchase Action
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <AutomationModal
        open={automationModalOpen}
        onOpenChange={setAutomationModalOpen}
        defaultModule="Operations"
      />
    </div>
  );
}
