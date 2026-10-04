import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Users, Target, PhoneCall, TrendingUp, DollarSign, ArrowRight, Plus, ShieldCheck, AlertTriangle } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/States";
import { DetailDrawer } from "@/components/common/DetailDrawer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Customers from "@/pages/Customers";
import Leads from "@/pages/Leads";
import Sales from "@/pages/Sales";

export default function CustomersModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "people";
  const { format } = useCurrency();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drawerCustomer, setDrawerCustomer] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.get("/customers").then(({ data }) => {
      setData(data);
      setError(null);
    }).catch((e) => setError(e)).finally(() => setLoading(false));
  }, []);

  const handleTabChange = (val) => {
    setSearchParams({ tab: val });
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-12 w-64" /><Skeleton className="h-96 rounded-xl" /></div>;
  if (error) return <ErrorState message={formatApiError(error)} onRetry={() => window.location.reload()} />;

  const customersList = data.items || [];
  const atRiskList = customersList.filter((c) => c.status === "at_risk" || c.tier === "At-Risk");
  const vipList = customersList.filter((c) => c.tier === "VIP" || c.total_spent > 50000);

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader
        title="Customers & Sales Hub"
        subtitle="Who do we do business with? People, opportunities, follow-ups, and customer 360 relationships."
      >
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate("/customers?new=1")} data-testid="new-customer-btn">
            <Plus className="mr-1.5 h-4 w-4" /> Add Customer
          </Button>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs px-3 py-1 font-semibold">
            👥 Flagship Module 2
          </Badge>
        </div>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-card border border-border/70 p-1" data-testid="customers-tabs">
          <TabsTrigger value="people" data-testid="tab-cust-people">People & CRM</TabsTrigger>
          <TabsTrigger value="opportunities" data-testid="tab-cust-opportunities">Opportunities & Deals</TabsTrigger>
          <TabsTrigger value="customers" data-testid="tab-cust-existing">Existing Customers ({customersList.length})</TabsTrigger>
          <TabsTrigger value="followups" data-testid="tab-cust-followups">Follow-ups</TabsTrigger>
          <TabsTrigger value="insights" data-testid="tab-cust-insights">Customer Insights</TabsTrigger>
        </TabsList>

        {/* PEOPLE & CRM */}
        <TabsContent value="people" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Customers</p>
              <p className="font-mono text-2xl font-bold mt-1">{customersList.length}</p>
            </Card>
            <Card className="border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">VIP Tier Clients</p>
              <p className="font-mono text-2xl font-bold text-amber-500 mt-1">{vipList.length}</p>
            </Card>
            <Card className="border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">At-Risk Clients</p>
              <p className="font-mono text-2xl font-bold text-red-500 mt-1">{atRiskList.length}</p>
            </Card>
            <Card className="border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Customer Value</p>
              <p className="font-mono text-2xl font-bold text-emerald-500 mt-1">{format(customersList.reduce((acc, c) => acc + (c.total_spent || 0), 0))}</p>
            </Card>
          </div>
          <Customers />
        </TabsContent>

        {/* OPPORTUNITIES & DEALS */}
        <TabsContent value="opportunities" className="space-y-6">
          <div className="space-y-6">
            <Leads />
            <div className="pt-4 border-t border-border">
              <h3 className="text-lg font-bold font-heading mb-4">Pipeline & Deals Performance</h3>
              <Sales />
            </div>
          </div>
        </TabsContent>

        {/* EXISTING CUSTOMERS */}
        <TabsContent value="customers" className="space-y-4">
          <Customers />
        </TabsContent>

        {/* FOLLOW-UPS */}
        <TabsContent value="followups" className="space-y-4">
          <Card className="border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-heading font-bold text-lg">Customer Follow-up Queue</h3>
                <p className="text-xs text-muted-foreground">Clients and leads requiring a touchpoint or meeting today.</p>
              </div>
              <Button size="sm" onClick={() => navigate("/customers?new=1")}>
                <Plus className="mr-1.5 h-4 w-4" /> Schedule Touchpoint
              </Button>
            </div>
            <div className="divide-y divide-border/60">
              {customersList.slice(0, 5).map((c) => (
                <div key={c.id} className="py-3 flex items-center justify-between hover:bg-accent/20 px-2 rounded-lg transition-colors">
                  <div className="flex items-center gap-3">
                    <PhoneCall className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.email || c.phone || "No direct contact"}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => navigate(`/customers/${c.id}`)}>
                    <span>Customer 360</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* CUSTOMER INSIGHTS */}
        <TabsContent value="insights" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-amber-500" />
                <h4 className="font-semibold text-sm">VIP Customer Tiers ({vipList.length})</h4>
              </div>
              <p className="text-xs text-muted-foreground">High-value recurring clients driving key revenue.</p>
              <div className="space-y-2 pt-1">
                {vipList.slice(0, 4).map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-2 rounded bg-card border border-border text-xs">
                    <span className="font-semibold">{c.name}</span>
                    <span className="font-mono text-emerald-600 font-bold">{format(c.total_spent || 0)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="border-red-500/30 bg-red-500/5 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h4 className="font-semibold text-sm">At-Risk Customers ({atRiskList.length})</h4>
              </div>
              <p className="text-xs text-muted-foreground">Clients with overdue balances or long inactivity.</p>
              <div className="space-y-2 pt-1">
                {atRiskList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No customers flagged as high risk!</p>
                ) : (
                  atRiskList.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-2 rounded bg-card border border-border text-xs">
                      <span className="font-semibold">{c.name}</span>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => navigate(`/customers/${c.id}`)}>
                        Inspect
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Side Drawer for Quick Record Inspection */}
      <DetailDrawer
        open={!!drawerCustomer}
        onOpenChange={(open) => !open && setDrawerCustomer(null)}
        title={drawerCustomer?.name || "Customer Details"}
        subtitle={drawerCustomer?.email || drawerCustomer?.phone || "Customer summary"}
        badge={drawerCustomer?.tier || "Customer"}
        fullLink={drawerCustomer ? `/customers/${drawerCustomer.id}` : null}
        actions={
          <Button size="sm" onClick={() => navigate(`/invoices?new=1&customer_id=${drawerCustomer?.id}`)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Create Invoice
          </Button>
        }
      >
        {drawerCustomer && (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded bg-muted/40 border border-border flex items-center justify-between">
              <span>Total Spent:</span>
              <span className="font-mono font-bold text-emerald-600">{format(drawerCustomer.total_spent || 0)}</span>
            </div>
            <div className="p-3 rounded bg-muted/40 border border-border flex items-center justify-between">
              <span>Outstanding Balance:</span>
              <span className="font-mono font-bold text-amber-600">{format(drawerCustomer.outstanding_balance || 0)}</span>
            </div>
            <div className="p-3 rounded bg-card border border-border space-y-1">
              <p className="font-semibold text-muted-foreground uppercase text-[10px]">Contact Information</p>
              <p className="mt-1 font-medium">Email: {drawerCustomer.email || "N/A"}</p>
              <p className="font-medium">Phone: {drawerCustomer.phone || "N/A"}</p>
              <p className="font-medium">Company: {drawerCustomer.company_name || "N/A"}</p>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
