import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import api, { formatApiError } from "@/lib/api";
import { useResource } from "@/hooks/useResource";
import { useCurrency } from "@/context/CurrencyContext";
import { CURRENCIES, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/common/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableSkeleton, ErrorState } from "@/components/common/States";
import { EmptyState } from "@/components/common/EmptyState";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/common/DataTable";
import { TrendingUp } from "lucide-react";

export default function Sales() {
  const { format, currency } = useCurrency();
  const [stats, setStats] = useState(null);
  const { data: payments, loading, error, refetch } = useResource("/payments", {});

  useEffect(() => { api.get("/dashboard/stats").then(({ data }) => setStats(data)).catch(() => {}); }, []);
  const rate = CURRENCIES[currency].rate;

  const columns = [
    { key: "invoice_number", label: "Invoice", render: (r) => <span className="font-mono">{r.invoice_number}</span> },
    { key: "customer_name", label: "Customer" },
    { key: "amount", label: "Amount", render: (r) => <span className="font-mono font-semibold text-emerald-500">{format(r.amount)}</span> },
    { key: "method", label: "Method", render: (r) => <span className="capitalize">{String(r.method).replace(/_/g, " ")}</span> },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
  ];

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader title="Sales" subtitle="Revenue performance and payment history." />

      {stats && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard label="Total Revenue" value={format(stats.total_sales)} icon="TrendingUp" tone="emerald" testId="sales-revenue" />
            <KpiCard label="Outstanding" value={format(stats.outstanding)} icon="Clock" tone="amber" sub={`${stats.outstanding_count} unpaid`} testId="sales-outstanding" />
            <KpiCard label="Payments Received" value={payments.length} icon="CreditCard" tone="primary" testId="sales-payments-count" />
          </div>

          <Card className="border-border/70 bg-card/90 p-5" data-testid="sales-bar-chart">
            <h3 className="mb-4 font-heading text-base font-semibold">Monthly Revenue</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stats.sales_trend} margin={{ left: -12, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${CURRENCIES[currency].symbol}${Math.round(v * rate / 1000)}k`} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} formatter={(v) => [format(v), "Revenue"]} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
                <Bar dataKey="sales" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}

      <div>
        <h3 className="mb-3 font-heading text-lg font-semibold">Payment History</h3>
        {loading ? (
          <div className="rounded-xl border border-border/80 bg-card/90"><TableSkeleton /></div>
        ) : error ? (
          <ErrorState message={formatApiError(error)} onRetry={refetch} />
        ) : payments.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No payments yet" description="Payments appear here once invoices are paid." />
        ) : (
          <DataTable columns={columns} rows={payments} testId="payments-table" />
        )}
      </div>
    </div>
  );
}
