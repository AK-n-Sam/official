import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Download } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { formatDate } from "@/lib/format";
import { downloadRowsCsv, csvFilename } from "@/lib/csv";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionSwitch } from "@/components/layout/SectionSwitch";
import { ErrorState } from "@/components/common/States";
import { DateRangePicker, RANGE_PRESETS } from "@/components/common/DateRangePicker";
import { AgingBar } from "@/components/dashboard/Receivables";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--muted-foreground))"];
const TOOLTIP = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.2)" };
const SERIES = { revenue: "Revenue", expenses: "Expenses", collected: "Collected" };

function Stat({ label, value, sub, tone, testId }) {
  return (
    <Card className="border-border bg-card p-5 shadow-sm" data-testid={testId}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={`mt-2 font-mono text-2xl font-bold leading-none tracking-tight tabular-nums ${tone || "text-foreground"}`}>{value}</p>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function RankTable({ title, rows, columns, empty, testId }) {
  return (
    <Card className="border-border bg-card shadow-sm" data-testid={testId}>
      <div className="border-b border-border/70 px-5 py-4"><h3 className="font-heading text-base font-semibold">{title}</h3></div>
      {rows.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted-foreground">{empty}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              {columns.map((c) => <th key={c.label} className={`px-5 py-2 font-semibold ${c.right ? "text-right" : ""}`}>{c.label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((r, i) => (
                <tr key={i} className={r.onClick ? "cursor-pointer hover:bg-accent/40" : ""} onClick={r.onClick}>
                  {columns.map((c) => <td key={c.label} className={`px-5 py-2.5 ${c.right ? "text-right font-mono tabular-nums" : ""}`}>{c.value(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const initialRange = (params) => {
  const preset = params.get("range");
  if (params.get("from") && params.get("to")) return { preset: "custom", from: params.get("from"), to: params.get("to") };
  const key = RANGE_PRESETS[preset] ? preset : "ytd";
  return { preset: key, ...RANGE_PRESETS[key].range() };
};

export default function Reports() {
  const { format, formatCompact, currency } = useCurrency();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState(() => initialRange(params));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/reports/summary", { params: { from: range.from, to: range.to } })
      .then(({ data }) => { setData(data); setError(null); })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [range.from, range.to]);
  useEffect(load, [load]);
  // The chosen period lives in the URL, so a report can be bookmarked or shared.
  useEffect(() => {
    setParams(range.preset === "custom" ? { from: range.from, to: range.to } : { range: range.preset }, { replace: true });
  }, [range, setParams]);

  const exportCsv = () => {
    const d = data;
    const c = `(${currency})`;
    downloadRowsCsv(csvFilename(`profit and loss ${d.from} to ${d.to}`), [
      ["Profit and loss", `${d.from} to ${d.to}`],
      [`Revenue excl. tax ${c}`, d.revenue], [`Cost of goods sold (estimated) ${c}`, d.cost_of_goods],
      [`Gross profit ${c}`, d.gross_profit], [`Expenses ${c}`, d.expenses], [`Net profit ${c}`, d.net_profit],
      [`Tax collected ${c}`, d.tax_collected], [`Payments received ${c}`, d.collected],
      [`Expenses paid ${c}`, d.expenses_paid], [`Expenses unpaid ${c}`, d.expenses_pending],
      [], ["Month", `Revenue ${c}`, `Expenses ${c}`, `Collected ${c}`],
      ...d.monthly.map((m) => [m.month, m.revenue, m.expenses, m.collected]),
      [], ["Expense category", `Amount ${c}`], ...d.expense_by_category.map((e) => [e.category, e.amount]),
      [], ["Customer", "Invoices", `Revenue ${c}`], ...d.top_customers.map((t) => [t.name, t.invoices, t.revenue]),
    ]);
    toast.success("Report exported");
  };

  const header = (
    <>
      <SectionSwitch section="insights" />
      <PageHeader title="Reports" subtitle="Profit and loss, cash and receivables for any period.">
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data || loading} data-testid="report-export"><Download className="mr-1.5 h-4 w-4" /> Export CSV</Button>
      </PageHeader>
    </>
  );

  const d = data;
  const margin = d && d.revenue > 0 ? Math.round((d.gross_profit / d.revenue) * 100) : null;

  return (
    <div className="space-y-6 animate-in-up">
      {header}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <DateRangePicker value={range} onChange={setRange} testId="report-range" />
        {d && <p className="text-xs text-muted-foreground" data-testid="report-period">{formatDate(d.from)} – {formatDate(d.to)} · {d.invoice_count} invoice{d.invoice_count === 1 ? "" : "s"}, {d.expense_count} expense{d.expense_count === 1 ? "" : "s"}</p>}
      </div>

      {error ? (
        <ErrorState message={formatApiError(error)} onRetry={load} />
      ) : !d ? (
        <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div><Skeleton className="h-80 rounded-xl" /></div>
      ) : (
        <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Revenue" value={format(d.revenue)} sub={`excl. ${format(d.tax_collected)} tax`} testId="report-revenue" />
            <Stat label="Gross profit" value={format(d.gross_profit)} sub={margin != null ? `${margin}% margin after ${format(d.cost_of_goods)} cost of goods` : "no sales in this period"} testId="report-gross" />
            <Stat label="Expenses" value={format(d.expenses)} sub={d.expenses_pending ? `${format(d.expenses_pending)} still unpaid` : "all paid"} testId="report-expenses" />
            <Stat label="Net profit" value={format(d.net_profit)} tone={d.net_profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"} sub="gross profit − expenses" testId="report-net" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="border-border bg-card p-5 shadow-sm lg:col-span-2" data-testid="revenue-expense-report">
              <h3 className="font-heading text-base font-semibold">Revenue vs Expenses by month</h3>
              <p className="mb-4 text-xs text-muted-foreground">Revenue excludes tax · {format(d.collected)} was received in payments over this period</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={d.monthly} margin={{ left: -4, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={formatCompact} width={56} />
                  <Tooltip contentStyle={TOOLTIP} formatter={(v, n) => [format(v), SERIES[n] || n]} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                  <Legend formatter={(n) => SERIES[n] || n} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="collected" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="expenses" fill="hsl(var(--chart-5))" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="border-border bg-card p-5 shadow-sm" data-testid="expense-breakdown-chart">
              <h3 className="mb-4 font-heading text-base font-semibold">Where the money went</h3>
              {d.expense_by_category.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">No expenses in this period.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={d.expense_by_category.slice(0, 6)} dataKey="amount" nameKey="category" cx="50%" cy="45%" outerRadius={90} innerRadius={50} paddingAngle={2} isAnimationActive={false}>
                      {d.expense_by_category.slice(0, 6).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="hsl(var(--card))" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP} formatter={(v) => format(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <RankTable title="Top customers" testId="report-top-customers" empty="No invoiced sales in this period."
              rows={d.top_customers.map((c) => ({ ...c, onClick: c.customer_id ? () => navigate(`/customers/${c.customer_id}`) : undefined }))}
              columns={[{ label: "Customer", value: (r) => r.name }, { label: "Invoices", right: true, value: (r) => r.invoices }, { label: "Revenue", right: true, value: (r) => format(r.revenue) }]} />
            <RankTable title="Best-selling items" testId="report-top-products" empty="No invoiced sales in this period."
              rows={d.top_products}
              columns={[{ label: "Item", value: (r) => r.name }, { label: "Units", right: true, value: (r) => +r.units.toFixed(2) }, { label: "Revenue", right: true, value: (r) => format(r.revenue) }]} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-border bg-card p-5 shadow-sm" data-testid="report-aging">
              <h3 className="font-heading text-base font-semibold">Receivables today</h3>
              <p className="mb-4 text-xs text-muted-foreground">Unpaid invoice balances by how late they are (all dates, not just this period)</p>
              <AgingBar aging={d.receivables_aging} format={format} testId="report-aging-bar" />
            </Card>
            <Card className="border-border bg-card p-5 shadow-sm" data-testid="sales-category-report">
              <h3 className="mb-4 font-heading text-base font-semibold">Sales by category</h3>
              {d.sales_by_category.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No sales in this period.</p> : (
                <div className="space-y-2.5">
                  {d.sales_by_category.slice(0, 6).map((c, i) => {
                    const pct = d.revenue > 0 ? (c.amount / d.revenue) * 100 : 0;
                    return (
                      <div key={c.category}>
                        <div className="mb-1 flex justify-between text-xs"><span>{c.category}</span><span className="font-mono">{format(c.amount)} · {Math.round(pct)}%</span></div>
                        <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: COLORS[i % COLORS.length] }} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
          <p className="text-xs text-muted-foreground">Revenue counts invoices by issue date (drafts and cancelled invoices excluded). Cost of goods is estimated from each product's purchase price. Expenses count by expense date.</p>
        </div>
      )}
    </div>
  );
}
