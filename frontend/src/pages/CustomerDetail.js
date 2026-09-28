import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Phone, Building2, MapPin, FileText, CreditCard, CheckSquare } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function Kpi({ label, value, tone }) {
  return (
    <Card className="border-border/70 bg-card/90 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1.5 font-mono text-2xl font-extrabold ${tone || ""}`}>{value}</p>
    </Card>
  );
}

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { format } = useCurrency();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/customers/${id}/history`)
      .then(({ data }) => { setData(data); setError(null); })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(load, [load]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-40 rounded-xl" /></div>;
  if (error) return <ErrorState message={formatApiError(error)} onRetry={load} />;

  const c = data.customer;
  const initials = (c.name || "C").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="space-y-6 animate-in-up">
      <Button variant="ghost" size="sm" onClick={() => navigate("/customers")} data-testid="back-to-customers" className="-ml-2">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Customers
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 border border-border/60">
            <AvatarFallback className="bg-primary/15 text-lg font-bold text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="customer-detail-name">{c.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {c.company && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{c.company}</span>}
              {c.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{c.email}</span>}
              {c.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{c.phone}</span>}
            </div>
          </div>
        </div>
        <StatusBadge status={c.status} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total Sales" value={format(data.total_sales)} tone="text-emerald-500" />
        <Kpi label="Outstanding" value={format(data.outstanding)} tone="text-amber-500" />
        <Kpi label="Total Paid" value={format(data.total_paid)} />
        <Kpi label="Invoices" value={data.invoice_count} />
      </div>

      <Tabs defaultValue="invoices">
        <TabsList data-testid="customer-tabs">
          <TabsTrigger value="invoices">Invoices ({data.invoices.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({data.payments.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({data.tasks.length})</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <Card className="border-border/70 bg-card/90">
            {data.invoices.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted-foreground">No invoices.</p> :
              <div className="divide-y divide-border/50">
                {data.invoices.map((inv) => (
                  <div key={inv.id} className="flex cursor-pointer items-center justify-between px-5 py-3 hover:bg-accent/40" onClick={() => navigate(`/invoices/${inv.id}`)} data-testid={`customer-invoice-${inv.id}`}>
                    <div className="flex items-center gap-3"><FileText className="h-4 w-4 text-muted-foreground" />
                      <div><p className="font-mono text-sm font-medium">{inv.invoice_number}</p><p className="text-xs text-muted-foreground">{formatDate(inv.issue_date)}</p></div></div>
                    <div className="flex items-center gap-3"><span className="font-mono text-sm font-semibold">{format(inv.total)}</span><StatusBadge status={inv.status} /></div>
                  </div>
                ))}
              </div>}
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card className="border-border/70 bg-card/90">
            {data.payments.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted-foreground">No payments.</p> :
              <div className="divide-y divide-border/50">
                {data.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3"><CreditCard className="h-4 w-4 text-emerald-500" />
                      <div><p className="text-sm font-medium">{p.invoice_number}</p><p className="text-xs text-muted-foreground capitalize">{String(p.method).replace(/_/g, " ")} · {formatDate(p.date)}</p></div></div>
                    <span className="font-mono text-sm font-semibold text-emerald-500">{format(p.amount)}</span>
                  </div>
                ))}
              </div>}
          </Card>
        </TabsContent>

        <TabsContent value="tasks">
          <Card className="border-border/70 bg-card/90">
            {data.tasks.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted-foreground">No related tasks.</p> :
              <div className="divide-y divide-border/50">
                {data.tasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3"><CheckSquare className="h-4 w-4 text-muted-foreground" />
                      <div><p className="text-sm font-medium">{t.title}</p><p className="text-xs text-muted-foreground">Due {formatDate(t.due_date)}</p></div></div>
                    <StatusBadge status={t.status} />
                  </div>
                ))}
              </div>}
          </Card>
        </TabsContent>

        <TabsContent value="about">
          <Card className="border-border/70 bg-card/90 p-6 space-y-3 text-sm">
            <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{[c.address, c.city, c.country].filter(Boolean).join(", ") || "No address on file"}</p>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</p><p className="mt-1 text-muted-foreground">{c.notes || "No notes."}</p></div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
