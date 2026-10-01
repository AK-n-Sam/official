import { useState, useEffect, useMemo } from "react";
import { useDataChanged } from "@/hooks/useDataChanged";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Download, TrendingUp } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useResource } from "@/hooks/useResource";
import { useCurrency } from "@/context/CurrencyContext";
import { formatDate } from "@/lib/format";
import { downloadCsv, csvFilename } from "@/lib/csv";
import { PAYMENT_METHODS } from "@/modules/resourceConfigs";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionSwitch } from "@/components/layout/SectionSwitch";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { TableSkeleton, ErrorState } from "@/components/common/States";
import { EmptyState } from "@/components/common/EmptyState";
import { DateRangePicker, RANGE_PRESETS } from "@/components/common/DateRangePicker";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/common/DataTable";

const methodLabel = (v) => PAYMENT_METHODS.find((m) => m.value === v)?.label || String(v || "—").replace(/_/g, " ");

/** Money actually received: payments over a period, how they were paid, and what is still owed. */
export default function Sales() {
  const { format, formatCompact, currency } = useCurrency();
  const navigate = useNavigate();
  const [range, setRange] = useState(() => ({ preset: "last_12", ...RANGE_PRESETS.last_12.range() }));
  const [outstanding, setOutstanding] = useState(null);
  const { data: payments, loading, error, refetch } = useResource("/payments", { date_from: range.from, date_to: range.to });
  useDataChanged(refetch);

  useEffect(() => {
    api.get("/dashboard/stats").then(({ data }) => setOutstanding({ amount: data.outstanding, count: data.outstanding_count, overdue: data.overdue_amount })).catch(() => setOutstanding(null));
  }, []);

  const total = payments.reduce((s, p) => s + p.amount, 0);
  const monthly = useMemo(() => {
    const byMonth = {};
    payments.forEach((p) => { const k = (p.date || "").slice(0, 7); if (k) byMonth[k] = (byMonth[k] || 0) + p.amount; });
    return Object.keys(byMonth).sort().map((k) => ({
      month: new Date(`${k}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" }), amount: Math.round(byMonth[k] * 100) / 100,
    }));
  }, [payments]);
  const byMethod = useMemo(() => {
    const m = {};
    payments.forEach((p) => { m[p.method] = (m[p.method] || 0) + p.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [payments]);

  const exportCsv = () => {
    downloadCsv(csvFilename(`payments ${range.from} to ${range.to}`), [
      { label: "Date", value: (r) => r.date }, { label: "Invoice", value: (r) => r.invoice_number },
      { label: "Customer", value: (r) => r.customer_name }, { label: `Amount (${currency})`, value: (r) => r.amount },
      { label: "Method", value: (r) => methodLabel(r.method) }, { label: "Notes", value: (r) => r.notes },
    ], payments);
    toast.success(`Exported ${payments.length} payment${payments.length === 1 ? "" : "s"}`);
  };

  const columns = [
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "invoice_number", label: "Invoice", render: (r) => <span className="font-mono">{r.invoice_number}</span> },
    { key: "customer_name", label: "Customer" },
    { key: "amount", label: "Amount", render: (r) => <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-500">{format(r.amount)}</span> },
    { key: "method", label: "Method", render: (r) => methodLabel(r.method) },
  ];

  return (
    <div className="space-y-6 animate-in-up">
      <SectionSwitch section="invoices" />
      <PageHeader title="Payments" subtitle="Money received from customers, and what is still owed to you.">
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading || payments.length === 0} data-testid="sales-export"><Download className="mr-1.5 h-4 w-4" /> Export CSV</Button>
      </PageHeader>

      <DateRangePicker value={range} onChange={setRange} testId="sales-range" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Collected" value={loading ? "…" : format(total)} icon="TrendingUp" tone="emerald" sub={`${payments.length} payment${payments.length === 1 ? "" : "s"} in this period`} testId="sales-revenue" />
        <KpiCard label="Average payment" value={loading ? "…" : format(payments.length ? total / payments.length : 0)} icon="CreditCard" tone="primary"
          sub={byMethod.length ? `mostly ${methodLabel(byMethod[0][0]).toLowerCase()}` : "no payments yet"} testId="sales-average" />
        <KpiCard label="Still owed to you" value={outstanding ? format(outstanding.amount) : "…"} icon="Clock" tone="amber"
          sub={outstanding ? (outstanding.overdue ? `${format(outstanding.overdue)} overdue` : `${outstanding.count} unpaid invoice${outstanding.count === 1 ? "" : "s"}`) : ""}
          testId="sales-outstanding" onClick={() => navigate("/invoices?status=unpaid")} />
      </div>

      {error ? (
        <ErrorState message={formatApiError(error)} onRetry={refetch} />
      ) : (
        <>
          <Card className="border-border/70 bg-card/90 p-5" data-testid="sales-bar-chart">
            <h3 className="mb-4 font-heading text-base font-semibold">Payments received by month</h3>
            {!loading && monthly.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No payments in this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthly} margin={{ left: -4, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={formatCompact} width={56} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} formatter={(v) => [format(v), "Collected"]} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
                  <Bar dataKey="amount" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <div>
            <h3 className="mb-3 font-heading text-lg font-semibold">Payment History</h3>
            {loading ? (
              <div className="rounded-xl border border-border/80 bg-card/90"><TableSkeleton /></div>
            ) : payments.length === 0 ? (
              <EmptyState icon={TrendingUp} title="No payments in this period" description="Payments appear here when you record them on an invoice. Try a longer date range." />
            ) : (
              <DataTable columns={columns} rows={payments} testId="payments-table" onRowClick={(r) => r.invoice_id && navigate(`/invoices/${r.invoice_id}`)} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
