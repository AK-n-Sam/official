import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, DollarSign, PieChart, ShieldCheck, ArrowUpRight, Zap, Target, Users, CheckCircle2, ChevronRight, Activity, Award } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

export default function ExecutiveCockpit() {
  const { user } = useAuth();
  const { format } = useCurrency();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    api.get("/executive/overview")
      .then(({ data }) => { setData(data); setError(null); })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><div className="grid gap-6 sm:grid-cols-4"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" /></div></div>;
  if (error) return <ErrorState message={formatApiError(error)} onRetry={load} />;

  const isExecutiveRole = ["owner", "admin", "manager", "executive"].includes((user?.role || "").toLowerCase());

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader
        title="Executive Cockpit & Strategic Overview"
        subtitle={`Real-time C-Suite financial performance, ARR run-rate, and executive indicators for ${(user?.name || "Executive")}.`}
      >
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs uppercase font-bold text-amber-500 border-amber-500/30 gap-1 py-1 px-3">
            <Award className="h-3.5 w-3.5" /> {(user?.role || "Owner").toUpperCase()} COMMAND
          </Badge>
          <Button variant="outline" size="sm" onClick={() => navigate("/reports")} data-testid="exec-open-reports">
            Full Financial Reports <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </PageHeader>

      {!isExecutiveRole && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-600 dark:text-amber-400">
          <strong>Notice:</strong> You are viewing Executive Cockpit in read-only mode for your assigned role ({user?.role}).
        </Card>
      )}

      {/* C-Suite Core KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/70 bg-gradient-to-br from-card via-card to-primary/5 p-5" data-testid="exec-arr">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Annual Run Rate (ARR)</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 font-mono text-3xl font-extrabold">{format(data.arr || 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground font-medium truncate">
            {data.data_confidence || "Calculated from active invoices"}
          </p>
        </Card>

        <Card className="border-border/70 bg-gradient-to-br from-card via-card to-emerald-500/5 p-5" data-testid="exec-mrr">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monthly Sales (MRR)</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 font-mono text-3xl font-extrabold">{format(data.mrr || 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground font-medium">
            Avg across {data.data_months || 1} active month(s)
          </p>
        </Card>

        <Card className="border-border/70 bg-gradient-to-br from-card via-card to-violet-500/5 p-5" data-testid="exec-margin">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gross Profit Margin</span>
            <PieChart className="h-4 w-4 text-violet-500" />
          </div>
          <p className="mt-2 font-mono text-3xl font-extrabold">{data.margin_pct}%</p>
          <p className="mt-1 text-xs text-muted-foreground font-medium">
            Net Profit: {format(data.net_profit || 0)}
          </p>
        </Card>

        <Card className="border-border/70 bg-gradient-to-br from-card via-card to-amber-500/5 p-5" data-testid="exec-runway">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cash Runway</span>
            <ShieldCheck className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold">{data.cash_runway_label || "Stable"}</p>
          <p className="mt-1 text-xs text-emerald-500 font-medium">
            Operating liquidity status
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Departmental Efficiency Matrix */}
        <Card className="border-border/70 bg-card/90 p-5 space-y-4" data-testid="exec-efficiency">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Zap className="h-4 w-4 text-amber-500" /> Departmental Delivery & Throughput
            </span>
            <Badge variant="secondary" className="text-xs font-mono">{data.task_throughput_pct}% Delivered</Badge>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs font-medium mb-1">
                <span>Task Delivery Velocity ({data.completed_tasks_count} completed / {data.open_tasks_count + data.completed_tasks_count} total)</span>
                <span>{data.task_throughput_pct}%</span>
              </div>
              <Progress value={data.task_throughput_pct} className="h-2" />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-medium mb-1">
                <span>Sales Pipeline Win Rate</span>
                <span>{data.lead_conversion_pct}%</span>
              </div>
              <Progress value={data.lead_conversion_pct} className="h-2" />
            </div>

            <div className="pt-2 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <p className="text-muted-foreground font-semibold">Total Revenue</p>
                <p className="font-mono text-lg font-bold text-foreground">{format(data.total_revenue || 0)}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <p className="text-muted-foreground font-semibold">Operating Expenses</p>
                <p className="font-mono text-lg font-bold text-rose-500">{format(data.total_expenses || 0)}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Top Account Concentration */}
        <Card className="border-border/70 bg-card/90 p-5 space-y-4" data-testid="exec-top-accounts">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-primary" /> Key Account Revenue Concentration
            </span>
            <span className="text-xs text-muted-foreground">{data.total_customers_count} Total Clients</span>
          </div>

          <div className="divide-y divide-border/50">
            {(data?.top_customers || []).length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No customer sales recorded yet.</p>
            ) : (
              (data?.top_customers || []).map((c, idx) => (
                <div key={idx} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{idx + 1}</span>
                    <span className="text-sm font-medium">{c.name}</span>
                  </div>
                  <span className="font-mono text-sm font-bold">{format(c.revenue)}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Strategic Pending Approvals */}
      {(data?.pending_approvals || []).length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
              <Activity className="h-4 w-4" /> Pending Executive Sign-Offs & Approvals ({(data?.pending_approvals || []).length})
            </span>
            <Button size="sm" variant="outline" onClick={() => navigate("/my-work")} className="h-7 text-xs">
              Review in My Work <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="divide-y divide-border/50">
            {(data?.pending_approvals || []).map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2 text-xs">
                <div>
                  <p className="font-semibold text-foreground">{a.title}</p>
                  <p className="text-muted-foreground">Requester: {a.requester_name} · Amount: {format(a.amount || 0)}</p>
                </div>
                <Badge variant="outline" className="text-[11px] font-mono border-amber-500/40 text-amber-500">
                  PENDING SIGN-OFF
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
