import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Legend, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { usePersonalization } from "@/context/PersonalizationContext";
import { CURRENCIES, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/common/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { AiInsightsPlaceholder } from "@/components/dashboard/AiInsightsPlaceholder";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/States";
import { Icon } from "@/components/common/Icon";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowUpRight, ArrowDownRight, FileText, CheckSquare, Plus, Zap, ArrowRight, ShieldCheck, Activity } from "lucide-react";

function StatChip({ label, value, icon, onClick, testId }) {
  return (
    <button onClick={onClick} data-testid={testId}
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-all duration-200 hover:border-primary/50 hover:bg-muted/30 hover:shadow-md">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-foreground">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-lg font-bold leading-none" data-testid={`${testId}-value`}>{value}</span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{label}</span>
      </span>
    </button>
  );
}

function SectionCard({ title, action, onAction, children, testId }) {
  return (
    <Card className="border-border bg-card shadow-sm" data-testid={testId}>
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        <h3 className="font-heading text-base font-semibold">{title}</h3>
        {action && <Button variant="ghost" size="sm" onClick={onAction}>{action}</Button>}
      </div>
      {children}
    </Card>
  );
}

export default function Dashboard() {
  const { format, currency } = useCurrency();
  const { getTerm } = usePersonalization();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    api.get("/dashboard/stats").then(({ data }) => { setStats(data); setError(null); })
      .catch((e) => setError(e)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }
  if (error) return <ErrorState message={formatApiError(error)} onRetry={load} />;

  const rate = CURRENCIES[currency].rate;
  const chartTooltip = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.2)" };
  const yFmt = (v) => `${CURRENCIES[currency].symbol}${Math.round(v * rate / 1000)}k`;
  const hour = new Date().getHours();
  const greetWord = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (user?.name || "there").split(" ")[0];
  const health = stats.business_health || { score: 90, status: "Good" };

  return (
    <div className="space-y-8 animate-in-up">
      <PageHeader title={`${greetWord}, ${firstName} 👋`} subtitle="Here's how your business is doing today.">
        <Button variant="outline" onClick={() => navigate("/invoices?new=1")} data-testid="dash-new-invoice"><Plus className="mr-2 h-4 w-4" /> New Invoice</Button>
      </PageHeader>

      <WelcomeBanner />

      {/* Fresh Account Onboarding Card */}
      {stats.invoice_count === 0 && stats.customer_count === 0 && (
        <Card className="border-primary/30 bg-primary/5 p-5 shadow-sm space-y-3" data-testid="fresh-workspace-banner">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <h3 className="font-heading font-bold text-base">Welcome to your new workspace!</h3>
            </div>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
              Fresh Account
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">Your account is clean and ready. Add your first customer, product, or invoice to start tracking your business revenue and cashflow.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={() => navigate("/customers?new=1")}>
              <Plus className="mr-1.5 h-4 w-4" /> Add First Customer
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/products?new=1")}>
              <Plus className="mr-1.5 h-4 w-4" /> Add First Product
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/invoices?new=1")}>
              <Plus className="mr-1.5 h-4 w-4" /> Create First Invoice
            </Button>
          </div>
        </Card>
      )}

      {/* Decision Support: Priority Attention Card */}
      {stats.decision_support?.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              <h3 className="font-heading font-bold text-base">Business Attention & Next Actions</h3>
            </div>
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
              {stats.decision_support.length} Action Needed
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {stats.decision_support.map((item) => (
              <div key={item.id} className="rounded-lg border border-border bg-card p-4 space-y-2 flex flex-col justify-between">
                <div>
                  <h4 className="font-semibold text-sm">{item.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{item.why}</p>
                </div>
                <Button size="sm" variant="outline" className="w-full text-xs mt-2 justify-between" onClick={() => navigate(item.action_link)}>
                  <span>{item.next_action}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Primary money KPIs — the four numbers that matter most */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={getTerm("revenue")} value={format(stats.total_sales)} icon="TrendingUp" tone="emerald" sub="paid revenue" testId="kpi-total-sales" />
        <KpiCard label={getTerm("margin")} value={format(stats.profit)} icon="Wallet" tone={stats.profit >= 0 ? "primary" : "rose"} sub="sales − expenses" testId="kpi-profit" />
        <KpiCard label={getTerm("accounts_receivable")} value={format(stats.outstanding)} icon="FileText" tone="amber" sub={`${stats.outstanding_count} invoices`} testId="kpi-outstanding" />
        <KpiCard label="Amount Collected" value={format(stats.amount_collected)} icon="CreditCard" tone="emerald" sub="all payments" testId="kpi-collected" />
      </div>

      <Tabs defaultValue="overview">
        <TabsList data-testid="dashboard-tabs">
          <TabsTrigger value="overview" data-testid="dash-tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="finance" data-testid="dash-tab-finance">Finance</TabsTrigger>
          <TabsTrigger value="operations" data-testid="dash-tab-operations">Operations</TabsTrigger>
        </TabsList>

        {/* OVERVIEW: trend + activity + a compact secondary stat strip */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="border-border bg-card p-5 shadow-sm lg:col-span-2" data-testid="sales-trend-chart">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-heading text-base font-semibold">Revenue vs Expenses</h3>
                  <p className="text-xs text-muted-foreground">Last 6 months</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Activity className="h-4 w-4 text-emerald-500" />
                  <span>Health Index: <strong>{health.score}/100 ({health.status})</strong></span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={stats.sales_trend} margin={{ left: -12, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.35} /><stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFmt} />
                  <Tooltip contentStyle={chartTooltip} formatter={(v, n) => [format(v), n === "sales" ? "Revenue" : "Expenses"]} />
                  <Area type="monotone" dataKey="sales" stroke="hsl(var(--chart-2))" strokeWidth={2} fill="url(#gSales)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="expenses" stroke="hsl(var(--chart-5))" strokeWidth={2} fill="url(#gExp)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
            <AiInsightsPlaceholder />
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Business at a glance</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatChip label="Customers" value={stats.customer_count} icon="Users" onClick={() => navigate("/customers")} testId="kpi-customers" />
              <StatChip label="Products" value={stats.product_count} icon="Package" onClick={() => navigate("/products")} testId="kpi-products" />
              <StatChip label="Invoices" value={stats.invoice_count} icon="FileText" onClick={() => navigate("/invoices")} testId="kpi-invoices" />
              <StatChip label="Employees" value={stats.employee_count} icon="Briefcase" onClick={() => navigate("/employees")} testId="kpi-employees" />
              <StatChip label="New (30d)" value={stats.new_customers} icon="UserPlus" onClick={() => navigate("/customers")} testId="kpi-new-customers" />
              <StatChip label="Open Tasks" value={stats.open_tasks} icon="CheckSquare" onClick={() => navigate("/tasks")} testId="kpi-open-tasks" />
            </div>
          </div>

          <ActivityFeed />
        </TabsContent>

        {/* FINANCE: category + status charts, recent invoices */}
        <TabsContent value="finance" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-border bg-card p-5 shadow-sm" data-testid="sales-by-category-chart">
              <h3 className="mb-4 font-heading text-base font-semibold">Sales by Category</h3>
              {stats.sales_by_category.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">No sales data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stats.sales_by_category} layout="vertical" margin={{ left: 20, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFmt} />
                    <YAxis type="category" dataKey="category" width={90} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTooltip} formatter={(v) => [format(v), "Sales"]} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
                    <Bar dataKey="amount" fill="hsl(var(--chart-1))" radius={[0, 6, 6, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card className="border-border bg-card p-5 shadow-sm" data-testid="invoice-status-chart">
              <h3 className="mb-4 font-heading text-base font-semibold">Invoice Status</h3>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={stats.invoice_status_breakdown} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={95} innerRadius={52} paddingAngle={2} isAnimationActive={false}>
                    {stats.invoice_status_breakdown.map((_, i) => (
                      <Cell key={i} stroke="hsl(var(--card))" strokeWidth={2} fill={["hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-1))", "hsl(var(--chart-5))", "hsl(var(--chart-4))", "hsl(var(--muted-foreground))", "hsl(var(--border))"][i % 7]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltip} formatter={(v, n) => [v, String(n).replace(/_/g, " ")]} />
                  <Legend wrapperStyle={{ fontSize: 11, textTransform: "capitalize" }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <SectionCard title="Recent Invoices" action="View all" onAction={() => navigate("/invoices")} testId="recent-invoices">
                <div className="divide-y divide-border/50">
                  {stats.recent_invoices.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-muted-foreground">No invoices yet.</p>
                  ) : stats.recent_invoices.map((inv) => (
                    <button key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-accent/40">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted"><FileText className="h-4 w-4 text-muted-foreground" /></div>
                        <div><p className="text-sm font-medium">{inv.invoice_number}</p><p className="text-xs text-muted-foreground">{inv.customer_name} · {formatDate(inv.issue_date)}</p></div>
                      </div>
                      <div className="flex items-center gap-3"><span className="font-mono text-sm font-semibold">{format(inv.total)}</span><StatusBadge status={inv.status} /></div>
                    </button>
                  ))}
                </div>
              </SectionCard>
            </div>
            <SectionCard title="Recent Transactions" testId="recent-transactions">
              <div className="divide-y divide-border/50">
                {stats.recent_transactions.map((t, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${t.type === "income" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                        {t.type === "income" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                      </div>
                      <div><p className="text-sm font-medium">{t.label}</p><p className="text-xs text-muted-foreground">{formatDate(t.date)} {t.ref && `· ${t.ref}`}</p></div>
                    </div>
                    <span className={`font-mono text-sm font-semibold ${t.type === "income" ? "text-emerald-500" : "text-foreground"}`}>{t.type === "income" ? "+" : "−"}{format(t.amount)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        {/* OPERATIONS: expenses/counts + tasks needing attention */}
        <TabsContent value="operations" className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Total Expenses" value={format(stats.total_expenses)} icon="Receipt" tone="rose" sub="all time" testId="kpi-total-expenses" />
            <KpiCard label="Overdue" value={format(stats.overdue_amount)} icon="AlertTriangle" tone="rose" sub={`${stats.overdue_count} invoices`} testId="kpi-overdue" />
            <KpiCard label="Low Stock" value={stats.low_stock_count} icon="PackageX" tone="amber" sub="products to reorder" testId="kpi-low-stock" />
            <KpiCard label="Suppliers" value={stats.supplier_count} icon="Truck" tone="violet" sub="active vendors" testId="kpi-suppliers" />
          </div>

          <SectionCard title="Tasks Requiring Attention" action="View all" onAction={() => navigate("/tasks")} testId="tasks-attention">
            <div className="divide-y divide-border/50">
              {stats.tasks_attention.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing urgent — you're all caught up.</p>
              ) : stats.tasks_attention.map((t) => (
                <button key={t.id} onClick={() => navigate("/tasks")} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-accent/40">
                  <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{t.title}</p><p className="text-xs text-muted-foreground">Due {formatDate(t.due_date)}{t.customer_name ? ` · ${t.customer_name}` : ""}</p></div>
                  <StatusBadge status={t.priority} />
                </button>
              ))}
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
