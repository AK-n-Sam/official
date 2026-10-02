import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import api from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { CURRENCIES } from "@/lib/format";
import { downloadCsv, csvFilename } from "@/lib/csv";
import { PageHeader } from "@/components/common/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { BarChart3, Download, ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--muted-foreground))"];
const TOOLTIP = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.2)" };

export default function Reports() {
  const { format, currency } = useCurrency();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const rate = CURRENCIES[currency].rate;

  useEffect(() => {
    api.get("/dashboard/stats")
      .then(({ data }) => setStats(data))
      .catch(() => toast.error("Failed to load reports"))
      .finally(() => setLoading(false));
  }, []);

  const exportReportCsv = () => {
    if (!stats || !stats.sales_trend) return;
    const columns = [
      { label: "Month", value: (r) => r.month },
      { label: "Revenue", value: (r) => r.sales },
      { label: "Expenses", value: (r) => r.expenses },
      { label: "Net Profit", value: (r) => r.sales - r.expenses }
    ];
    downloadCsv(csvFilename("financial-report"), columns, stats.sales_trend);
    toast.success("Financial report exported");
  };

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );

  const health = stats?.business_health || { score: 100, status: "Good", cashflow_trend: "Positive", receivables_risk: "Low" };

  return (
    <div className="space-y-8 animate-in-up">
      <PageHeader
        title="Reports & Financial Intelligence"
        subtitle="Comprehensive financial breakdown, sales trends, and profit margins."
        action={
          <Button onClick={exportReportCsv} variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Export CSV Report
          </Button>
        }
      />

      {/* Business Health Summary Banner */}
      <Card className="border-border/80 bg-gradient-to-br from-card via-card to-muted/20 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${health.score >= 80 ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
              {health.score >= 80 ? <ShieldCheck className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-lg font-bold">Business Health Index</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${health.score >= 80 ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                  {health.status} ({health.score}/100)
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Cashflow Trend: <strong className="text-foreground">{health.cashflow_trend}</strong> · Receivables Risk: <strong className="text-foreground">{health.receivables_risk}</strong>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6 border-t border-border/60 pt-3 sm:border-t-0 sm:pt-0">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Collection Rate</p>
              <p className="font-mono text-base font-bold text-foreground">
                {stats?.total_sales > 0 ? `${Math.round((stats.amount_collected / stats.total_sales) * 100)}%` : "100%"}
              </p>
            </div>
            <div className="h-8 w-[1px] bg-border/60" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Overdue Exposure</p>
              <p className="font-mono text-base font-bold text-amber-500">{format(stats?.overdue_amount || 0)}</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card p-5 shadow-sm sm:p-6" data-testid="expense-breakdown-chart">
          <h3 className="mb-4 font-heading text-base font-semibold">Expense Breakdown by Category</h3>
          {stats?.expense_breakdown?.length === 0 ? (
            <EmptyState icon={BarChart3} title="No expenses recorded" description="Logged expenses will automatically populate category breakdowns." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={stats.expense_breakdown} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={100} innerRadius={55} paddingAngle={2} isAnimationActive={false}>
                  {stats.expense_breakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="hsl(var(--card))" strokeWidth={2} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP} formatter={(v) => format(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="border-border bg-card p-5 shadow-sm sm:p-6" data-testid="revenue-expense-report">
          <h3 className="mb-4 font-heading text-base font-semibold">Revenue vs Expenses (6-Month Trend)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats?.sales_trend || []} margin={{ left: -12, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${CURRENCIES[currency].symbol}${Math.round(v * rate / 1000)}k`} />
              <Tooltip contentStyle={TOOLTIP} formatter={(v, n) => [format(v), n === "sales" ? "Revenue" : "Expenses"]} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
              <Bar dataKey="sales" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="expenses" fill="hsl(var(--chart-5))" radius={[6, 6, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Revenue", value: format(stats?.total_sales || 0), bar: "bg-emerald-500" },
          { label: "Total Expenses", value: format(stats?.total_expenses || 0), bar: "bg-rose-500" },
          { label: "Net Profit", value: format(stats?.profit || 0), bar: "bg-blue-500" },
          { label: "Outstanding Receivables", value: format(stats?.outstanding || 0), bar: "bg-amber-500" },
        ].map((s) => (
          <Card key={s.label} className="relative overflow-hidden border-border bg-card p-5 shadow-sm sm:p-6">
            <span className={`absolute inset-x-0 top-0 h-0.5 ${s.bar}`} aria-hidden />
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{s.label}</p>
            <p className="mt-3 font-mono text-2xl font-bold leading-none tracking-tight tabular-nums text-foreground">{s.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
