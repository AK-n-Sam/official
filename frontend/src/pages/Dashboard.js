import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Legend, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ArrowRight } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { useAuth, usePermissions } from "@/context/AuthContext";
import { useDataChanged } from "@/hooks/useDataChanged";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionSwitch } from "@/components/layout/SectionSwitch";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Receivables } from "@/components/dashboard/Receivables";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { WeeklySummary } from "@/components/automation/WeeklySummary";

const SERIES = { sales: "Revenue", expenses: "Expenses", collected: "Collected" };
const TOOLTIP = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.2)" };

/** How the business is doing over time. What needs doing today lives on the Today page. */
export default function Dashboard() {
  const { format, formatCompact } = useCurrency();
  const { user } = useAuth();
  const { isManager } = usePermissions();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api.get("/dashboard/stats").then(({ data }) => { setStats(data); setError(null); }).catch((e) => setError(e));
  }, []);
  useEffect(load, [load]);
  useDataChanged(load);

  const header = (
    <>
      <SectionSwitch section="insights" />
      <PageHeader title="Overview" subtitle={`How ${user?.org_name || "the business"} is doing: the last 30 days and the trend behind them.`}>
        <Button variant="outline" onClick={() => navigate("/today")} data-testid="overview-to-today">What needs doing <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
      </PageHeader>
    </>
  );

  if (error && !stats) return <div className="space-y-6">{header}<ErrorState message={formatApiError(error)} onRetry={load} /></div>;
  if (!stats) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const p = stats.period;
  return (
    <div className="space-y-6 animate-in-up">
      {header}

      {isManager && <WeeklySummary />}

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Last 30 days, compared with the 30 before</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Revenue" value={format(p.revenue)} icon="TrendingUp" tone="emerald" delta={p.revenue_change} sub="invoiced" testId="kpi-total-sales" onClick={() => navigate("/reports")} />
          <KpiCard label="Collected" value={format(p.collected)} icon="CreditCard" tone="primary" delta={p.collected_change} sub="payments received" testId="kpi-collected" onClick={() => navigate("/payments")} />
          <KpiCard label="Expenses" value={format(p.expenses)} icon="Receipt" tone="rose" delta={p.expenses_change} invert sub="recorded costs" testId="kpi-total-expenses" onClick={() => navigate("/expenses")} />
          <KpiCard label="Profit" value={format(p.profit)} icon="Wallet" tone={p.profit >= 0 ? "violet" : "rose"} delta={p.profit_change}
            sub={`net cash ${p.net_cash >= 0 ? "+" : "−"}${format(Math.abs(p.net_cash))}`} testId="kpi-profit" onClick={() => navigate("/reports")} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-border bg-card p-5 shadow-sm lg:col-span-2" data-testid="sales-trend-chart">
          <h3 className="font-heading text-base font-semibold">Revenue vs Expenses</h3>
          <p className="mb-4 text-xs text-muted-foreground">Last 6 months · revenue by invoice date, collected by payment date</p>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={stats.sales_trend} margin={{ left: -4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.35} /><stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} /></linearGradient>
                <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={formatCompact} width={56} />
              <Tooltip contentStyle={TOOLTIP} formatter={(v, n) => [format(v), SERIES[n] || n]} />
              <Legend formatter={(n) => SERIES[n] || n} wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="sales" stroke="hsl(var(--chart-2))" strokeWidth={2} fill="url(#gSales)" isAnimationActive={false} />
              <Area type="monotone" dataKey="collected" stroke="hsl(var(--chart-1))" strokeWidth={2} strokeDasharray="4 3" fill="none" isAnimationActive={false} />
              <Area type="monotone" dataKey="expenses" stroke="hsl(var(--chart-5))" strokeWidth={2} fill="url(#gExp)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Receivables aging={stats.receivables_aging} debtors={stats.top_debtors} outstanding={stats.outstanding} format={format} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card p-5 shadow-sm" data-testid="sales-by-category-chart">
          <h3 className="font-heading text-base font-semibold">Sales by Category</h3>
          <p className="mb-4 text-xs text-muted-foreground">All invoiced sales, by product category</p>
          {stats.sales_by_category.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No sales yet. Sales you make show up here.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.sales_by_category} layout="vertical" margin={{ left: 20, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={formatCompact} />
                <YAxis type="category" dataKey="category" width={100} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP} formatter={(v) => [format(v), "Sales"]} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
                <Bar dataKey="amount" fill="hsl(var(--chart-1))" radius={[0, 6, 6, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card className="border-border bg-card p-5 shadow-sm" data-testid="invoice-status-chart">
          <h3 className="mb-4 font-heading text-base font-semibold">Invoices by Status</h3>
          {stats.invoice_status_breakdown.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={stats.invoice_status_breakdown} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2} isAnimationActive={false}>
                  {stats.invoice_status_breakdown.map((_, i) => (
                    <Cell key={i} stroke="hsl(var(--card))" strokeWidth={2} fill={["hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-1))", "hsl(var(--chart-5))", "hsl(var(--chart-4))", "hsl(var(--muted-foreground))", "hsl(var(--border))"][i % 7]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP} formatter={(v, n) => [v, String(n).replace(/_/g, " ")]} />
                <Legend formatter={(n) => String(n).replace(/_/g, " ")} wrapperStyle={{ fontSize: 11, textTransform: "capitalize" }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}
