import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Legend, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { CURRENCIES } from "@/lib/format";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/common/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { AiInsightsPlaceholder } from "@/components/dashboard/AiInsightsPlaceholder";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ArrowDownRight, FileText, CheckSquare } from "lucide-react";

export default function Dashboard() {
  const { format, currency } = useCurrency();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    api.get("/dashboard/stats")
      .then(({ data }) => { setStats(data); setError(null); })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }
  if (error) return <ErrorState message={formatApiError(error)} onRetry={load} />;

  const rate = CURRENCIES[currency].rate;

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader title="Dashboard" subtitle="A live snapshot of your business performance." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Sales" value={format(stats.total_sales)} icon="TrendingUp" tone="emerald" delta={12} sub="paid revenue" testId="kpi-total-sales" />
        <KpiCard label="Outstanding" value={format(stats.outstanding)} icon="FileText" tone="amber" sub={`${stats.outstanding_count} invoices`} testId="kpi-outstanding" />
        <KpiCard label="Total Expenses" value={format(stats.total_expenses)} icon="Receipt" tone="rose" delta={-4} sub="all time" testId="kpi-total-expenses" />
        <KpiCard label="Estimated Profit" value={format(stats.profit)} icon="Wallet" tone={stats.profit >= 0 ? "primary" : "rose"} sub="sales − expenses" testId="kpi-profit" />
        <KpiCard label="Customers" value={stats.customer_count} icon="Users" tone="violet" sub={`${stats.supplier_count} suppliers`} testId="kpi-customers" />
        <KpiCard label="Products" value={stats.product_count} icon="Package" tone="primary" sub={`${stats.low_stock_count} low stock`} testId="kpi-products" />
        <KpiCard label="Invoices" value={stats.invoice_count} icon="FileText" tone="emerald" sub="total issued" testId="kpi-invoices" />
        <KpiCard label="Employees" value={stats.employee_count} icon="Briefcase" tone="amber" sub="active team" testId="kpi-employees" />
        <KpiCard label="Amount Collected" value={format(stats.amount_collected)} icon="CreditCard" tone="emerald" sub="all payments" testId="kpi-collected" />
        <KpiCard label="Overdue" value={format(stats.overdue_amount)} icon="AlertTriangle" tone="rose" sub={`${stats.overdue_count} invoices`} testId="kpi-overdue" />
        <KpiCard label="New Customers" value={stats.new_customers} icon="UserPlus" tone="violet" sub="last 30 days" testId="kpi-new-customers" />
        <KpiCard label="Open Tasks" value={stats.open_tasks} icon="CheckSquare" tone="amber" sub="in progress" testId="kpi-open-tasks" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-border/70 bg-card/90 p-5 lg:col-span-2" data-testid="sales-trend-chart">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-heading text-base font-semibold">Revenue vs Expenses</h3>
              <p className="text-xs text-muted-foreground">Last 6 months</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={stats.sales_trend} margin={{ left: -12, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${CURRENCIES[currency].symbol}${Math.round(v * rate / 1000)}k`} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }}
                formatter={(v, n) => [format(v), n === "sales" ? "Revenue" : "Expenses"]}
              />
              <Area type="monotone" dataKey="sales" stroke="hsl(var(--chart-2))" strokeWidth={2} fill="url(#gSales)" />
              <Area type="monotone" dataKey="expenses" stroke="hsl(var(--chart-5))" strokeWidth={2} fill="url(#gExp)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <AiInsightsPlaceholder />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border/70 bg-card/90 p-5" data-testid="sales-by-category-chart">
          <h3 className="mb-4 font-heading text-base font-semibold">Sales by Category</h3>
          {stats.sales_by_category.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No sales data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.sales_by_category} layout="vertical" margin={{ left: 20, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${CURRENCIES[currency].symbol}${Math.round(v * rate / 1000)}k`} />
                <YAxis type="category" dataKey="category" width={90} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} formatter={(v) => [format(v), "Sales"]} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
                <Bar dataKey="amount" fill="hsl(var(--chart-1))" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="border-border/70 bg-card/90 p-5" data-testid="invoice-status-chart">
          <h3 className="mb-4 font-heading text-base font-semibold">Invoice Status</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={stats.invoice_status_breakdown} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={95} innerRadius={52} paddingAngle={2}>
                {stats.invoice_status_breakdown.map((_, i) => (
                  <Cell key={i} fill={["hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-1))", "hsl(var(--chart-5))", "hsl(var(--chart-4))", "hsl(var(--muted-foreground))", "hsl(var(--border))"][i % 7]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} formatter={(v, n) => [v, String(n).replace(/_/g, " ")]} />
              <Legend wrapperStyle={{ fontSize: 11, textTransform: "capitalize" }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-border/70 bg-card/90 lg:col-span-2" data-testid="recent-invoices">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
            <h3 className="font-heading text-base font-semibold">Recent Invoices</h3>
            <Button variant="ghost" size="sm" onClick={() => navigate("/invoices")} data-testid="view-all-invoices">View all</Button>
          </div>
          <div className="divide-y divide-border/50">
            {stats.recent_invoices.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">No invoices yet.</p>
            ) : stats.recent_invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted"><FileText className="h-4 w-4 text-muted-foreground" /></div>
                  <div>
                    <p className="text-sm font-medium">{inv.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">{inv.customer_name} · {formatDate(inv.issue_date)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold">{format(inv.total)}</span>
                  <StatusBadge status={inv.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-border/70 bg-card/90" data-testid="tasks-attention">
          <div className="border-b border-border/70 px-5 py-4">
            <h3 className="font-heading text-base font-semibold">Tasks Requiring Attention</h3>
          </div>
          <div className="divide-y divide-border/50">
            {stats.tasks_attention.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing urgent. </p>
            ) : stats.tasks_attention.map((t) => (
              <div key={t.id} className="flex items-start gap-3 px-5 py-3">
                <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">Due {formatDate(t.due_date)}</p>
                </div>
                <StatusBadge status={t.priority} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/90" data-testid="recent-transactions">
        <div className="border-b border-border/70 px-5 py-4">
          <h3 className="font-heading text-base font-semibold">Recent Transactions</h3>
        </div>
        <div className="divide-y divide-border/50">
          {stats.recent_transactions.map((t, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${t.type === "income" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                  {t.type === "income" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                </div>
                <div>
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(t.date)} {t.ref && `· ${t.ref}`}</p>
                </div>
              </div>
              <span className={`font-mono text-sm font-semibold ${t.type === "income" ? "text-emerald-500" : "text-foreground"}`}>
                {t.type === "income" ? "+" : "−"}{format(t.amount)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
