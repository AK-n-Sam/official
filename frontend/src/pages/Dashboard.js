import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Legend, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/common/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ActionCenter } from "@/components/dashboard/ActionCenter";
import { Receivables } from "@/components/dashboard/Receivables";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/States";
import { Icon } from "@/components/common/Icon";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowUpRight, ArrowDownRight, FileText, CheckSquare, Plus } from "lucide-react";

const TAB_KEY = "bmp_dashboard_tab";

function StatChip({ label, value, icon, onClick, testId }) {
  return (
    <button onClick={onClick} data-testid={testId}
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-all duration-200 hover:border-primary/50 hover:bg-muted/30 hover:shadow-md focus-visible:border-primary/60 focus-visible:outline-none">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-lg font-bold leading-none" data-testid={`${testId}-value`}>{value}</span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{label}</span>
      </span>
    </button>
  );
}

function SectionCard({ title, subtitle, action, onAction, children, testId }) {
  return (
    <Card className="border-border bg-card shadow-sm" data-testid={testId}>
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        <div>
          <h3 className="font-heading text-base font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <Button variant="ghost" size="sm" onClick={onAction}>{action}</Button>}
      </div>
      {children}
    </Card>
  );
}

const readTab = () => { try { return localStorage.getItem(TAB_KEY) || "overview"; } catch { return "overview"; } };

export default function Dashboard() {
  const { format, formatCompact } = useCurrency();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(readTab);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/dashboard/stats").then(({ data }) => { setStats(data); setError(null); })
      .catch((e) => setError(e)).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  const changeTab = (t) => { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* ignore */ } };

  if (loading && !stats) {
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
  if (error && !stats) return <ErrorState message={formatApiError(error)} onRetry={load} />;

  const p = stats.period;
  const chartTooltip = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.2)" };
  const hour = new Date().getHours();
  const greetWord = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (user?.name || "there").split(" ")[0];
  const SERIES = { sales: "Revenue", expenses: "Expenses", collected: "Collected" };

  return (
    <div className="space-y-8 animate-in-up">
      <PageHeader title={`${greetWord}, ${firstName}`} subtitle={`Here's how ${user?.org_name || "your business"} is doing.`}>
        <Button variant="outline" onClick={() => navigate("/invoices?new=1")} data-testid="dash-new-invoice"><Plus className="mr-2 h-4 w-4" /> New Invoice</Button>
      </PageHeader>

      <WelcomeBanner />

      {/* Last 30 days vs the 30 before: what came in, what went out, what's still owed. */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Last 30 days</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Revenue" value={format(p.revenue)} icon="TrendingUp" tone="emerald" delta={p.revenue_change} sub="invoiced" testId="kpi-total-sales" onClick={() => navigate("/reports")} />
          <KpiCard label="Collected" value={format(p.collected)} icon="CreditCard" tone="primary" delta={p.collected_change} sub="payments received" testId="kpi-collected" onClick={() => navigate("/sales")} />
          <KpiCard label="Expenses" value={format(p.expenses)} icon="Receipt" tone="rose" delta={p.expenses_change} invert sub="recorded costs" testId="kpi-total-expenses" onClick={() => navigate("/expenses")} />
          <KpiCard label="Outstanding" value={format(stats.outstanding)} icon="FileText" tone="amber"
            sub={stats.overdue_count ? `${format(stats.overdue_amount)} overdue` : `${stats.outstanding_count} unpaid invoice${stats.outstanding_count === 1 ? "" : "s"}`}
            testId="kpi-outstanding" onClick={() => navigate("/invoices?status=unpaid")} />
        </div>
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList data-testid="dashboard-tabs">
          <TabsTrigger value="overview" data-testid="dash-tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="finance" data-testid="dash-tab-finance">Finance</TabsTrigger>
          <TabsTrigger value="operations" data-testid="dash-tab-operations">Operations</TabsTrigger>
        </TabsList>

        {/* OVERVIEW: what needs doing + the trend + activity */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <ActionCenter actions={stats.actions} netCash={p.net_cash} format={format} />
            <Card className="border-border bg-card p-5 shadow-sm lg:col-span-2" data-testid="sales-trend-chart">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-heading text-base font-semibold">Revenue vs Expenses</h3>
                  <p className="text-xs text-muted-foreground">Last 6 months · revenue by invoice date, collected by payment date</p>
                </div>
                <p className="text-right text-xs text-muted-foreground">Profit (30 days)<br />
                  <span className={`font-mono text-sm font-semibold ${p.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`} data-testid="kpi-profit-value">{format(p.profit)}</span>
                </p>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={stats.sales_trend} margin={{ left: -4, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.35} /><stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={formatCompact} width={56} />
                  <Tooltip contentStyle={chartTooltip} formatter={(v, n) => [format(v), SERIES[n] || n]} />
                  <Legend formatter={(n) => SERIES[n] || n} wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="sales" stroke="hsl(var(--chart-2))" strokeWidth={2} fill="url(#gSales)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="collected" stroke="hsl(var(--chart-1))" strokeWidth={2} strokeDasharray="4 3" fill="none" isAnimationActive={false} />
                  <Area type="monotone" dataKey="expenses" stroke="hsl(var(--chart-5))" strokeWidth={2} fill="url(#gExp)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Business at a glance</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatChip label="Customers" value={stats.customer_count} icon="Users" onClick={() => navigate("/customers")} testId="kpi-customers" />
              <StatChip label="New customers (30d)" value={stats.new_customers} icon="UserPlus" onClick={() => navigate("/customers")} testId="kpi-new-customers" />
              <StatChip label="Open deals" value={stats.pipeline.open_count} icon="Target" onClick={() => navigate("/leads")} testId="kpi-open-deals" />
              <StatChip label="Products" value={stats.product_count} icon="Package" onClick={() => navigate("/products")} testId="kpi-products" />
              <StatChip label="Invoices" value={stats.invoice_count} icon="FileText" onClick={() => navigate("/invoices")} testId="kpi-invoices" />
              <StatChip label="Open tasks" value={stats.open_tasks} icon="CheckSquare" onClick={() => navigate("/tasks")} testId="kpi-open-tasks" />
            </div>
          </div>

          <ActivityFeed />
        </TabsContent>

        {/* FINANCE: who owes what, where revenue comes from, recent money movements */}
        <TabsContent value="finance" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Receivables aging={stats.receivables_aging} debtors={stats.top_debtors} outstanding={stats.outstanding} format={format} />
            <Card className="border-border bg-card p-5 shadow-sm" data-testid="sales-by-category-chart">
              <h3 className="font-heading text-base font-semibold">Sales by Category</h3>
              <p className="mb-4 text-xs text-muted-foreground">All invoiced sales, by product category</p>
              {stats.sales_by_category.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">No sales yet. Invoices you send will show up here.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stats.sales_by_category} layout="vertical" margin={{ left: 20, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={formatCompact} />
                    <YAxis type="category" dataKey="category" width={100} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTooltip} formatter={(v) => [format(v), "Sales"]} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
                    <Bar dataKey="amount" fill="hsl(var(--chart-1))" radius={[0, 6, 6, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
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
                      <div className="flex items-center gap-3"><span className="font-mono text-sm font-semibold">{format(inv.total)}</span><StatusBadge status={inv.status === "pending" ? "sent" : inv.status} /></div>
                    </button>
                  ))}
                </div>
              </SectionCard>
            </div>
            <SectionCard title="Recent Transactions" testId="recent-transactions">
              <div className="divide-y divide-border/50">
                {stats.recent_transactions.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">No payments or expenses yet.</p>
                ) : stats.recent_transactions.map((t, i) => (
                  <button key={i} type="button" disabled={!t.link} onClick={() => t.link && navigate(t.link)} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-accent/40 disabled:cursor-default disabled:hover:bg-transparent">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.type === "income" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                        {t.type === "income" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{t.label}</p><p className="truncate text-xs text-muted-foreground">{formatDate(t.date)} {t.ref && `· ${t.ref}`}</p></div>
                    </div>
                    <span className={`shrink-0 font-mono text-sm font-semibold ${t.type === "income" ? "text-emerald-500" : "text-foreground"}`}>{t.type === "income" ? "+" : "−"}{format(t.amount)}</span>
                  </button>
                ))}
              </div>
            </SectionCard>
          </div>

          <Card className="border-border bg-card p-5 shadow-sm" data-testid="invoice-status-chart">
            <h3 className="mb-4 font-heading text-base font-semibold">Invoices by Status</h3>
            {stats.invoice_status_breakdown.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={stats.invoice_status_breakdown} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2} isAnimationActive={false}>
                    {stats.invoice_status_breakdown.map((_, i) => (
                      <Cell key={i} stroke="hsl(var(--card))" strokeWidth={2} fill={["hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-1))", "hsl(var(--chart-5))", "hsl(var(--chart-4))", "hsl(var(--muted-foreground))", "hsl(var(--border))"][i % 7]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltip} formatter={(v, n) => [v, String(n).replace(/_/g, " ")]} />
                  <Legend formatter={(n) => String(n).replace(/_/g, " ")} wrapperStyle={{ fontSize: 11, textTransform: "capitalize" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </TabsContent>

        {/* OPERATIONS: work, stock and pipeline */}
        <TabsContent value="operations" className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Open Tasks" value={stats.open_tasks} icon="CheckSquare" tone="primary" sub={stats.overdue_task_count ? `${stats.overdue_task_count} overdue` : "none overdue"} testId="kpi-tasks" onClick={() => navigate(stats.overdue_task_count ? "/tasks?status=overdue" : "/tasks")} />
            <KpiCard label="Low Stock" value={stats.low_stock_count} icon="PackageX" tone="amber" sub="products at or below minimum" testId="kpi-low-stock" onClick={() => navigate("/inventory?low=1")} />
            <KpiCard label="Open Pipeline" value={format(stats.pipeline.open_value)} icon="Target" tone="violet" sub={`${stats.pipeline.open_count} open deal${stats.pipeline.open_count === 1 ? "" : "s"}`} testId="kpi-pipeline" onClick={() => navigate("/leads")} />
            <KpiCard label="Active Suppliers" value={stats.supplier_count} icon="Truck" tone="emerald" sub={`${stats.employee_count} active employee${stats.employee_count === 1 ? "" : "s"}`} testId="kpi-suppliers" onClick={() => navigate("/suppliers")} />
          </div>

          <SectionCard title="Tasks Requiring Attention" subtitle="High priority, or due today or earlier" action="View all" onAction={() => navigate("/tasks")} testId="tasks-attention">
            <div className="divide-y divide-border/50">
              {stats.tasks_attention.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing urgent — you're all caught up.</p>
              ) : stats.tasks_attention.map((t) => (
                <button key={t.id} onClick={() => navigate(`/tasks?q=${encodeURIComponent(t.title)}`)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-accent/40">
                  <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{t.title}</p><p className="text-xs text-muted-foreground">{t.due_date ? `Due ${formatDate(t.due_date)}` : "No due date"}{t.assignee ? ` · ${t.assignee}` : ""}{t.customer_name ? ` · ${t.customer_name}` : ""}</p></div>
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
