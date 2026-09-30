import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckSquare, Target, Activity, Users, FileText, CreditCard, AlertTriangle, Plus } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { formatDate, todayIso } from "@/lib/format";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const ACT_ICON = { invoice: FileText, payment: CreditCard, customer: Users };

const isOverdue = (t) => t.due_date && t.due_date < todayIso();

export default function MyWork() {
  const { user } = useAuth();
  const { format } = useCurrency();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    api.get("/my-work").then(({ data }) => { setData(data); setError(null); })
      .catch((e) => setError(e)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const firstName = (user?.name || "there").split(" ")[0];

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-80 rounded-xl" /><Skeleton className="h-80 rounded-xl" /></div></div>;
  if (error) return <ErrorState message={formatApiError(error)} onRetry={load} />;

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader title="My Work" subtitle={`Everything assigned to you, ${firstName}.`}>
        <Button variant="outline" onClick={() => navigate("/tasks?new=1")} data-testid="mywork-new-task"><Plus className="mr-2 h-4 w-4" /> New Task</Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="border-border/70 bg-card/90 p-4" data-testid="mywork-open-tasks"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Open Tasks</p><p className="mt-2 font-mono text-2xl font-extrabold">{data.open_tasks}</p></Card>
        <Card className="border-border/70 bg-card/90 p-4" data-testid="mywork-open-leads"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Leads</p><p className="mt-2 font-mono text-2xl font-extrabold">{data.open_leads}</p></Card>
        <Card className="border-border/70 bg-card/90 p-4" data-testid="mywork-overdue"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overdue Tasks</p><p className="mt-2 font-mono text-2xl font-extrabold text-rose-500">{data.tasks.filter(isOverdue).length}</p></Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border/70 bg-card/90" data-testid="mywork-tasks">
          <div className="flex items-center gap-2 border-b border-border/70 px-5 py-4"><CheckSquare className="h-4 w-4 text-muted-foreground" /><h3 className="font-heading text-base font-semibold">My Tasks</h3></div>
          <div className="max-h-[380px] divide-y divide-border/50 overflow-y-auto">
            {data.tasks.length === 0 ? <EmptyState icon={CheckSquare} title="No open tasks" description="You're all caught up." /> :
              data.tasks.map((t) => (
                <button key={t.id} onClick={() => navigate(`/tasks?q=${encodeURIComponent(t.title)}`)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-accent/40">
                  {isOverdue(t) ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" /> : <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{t.title}</p><p className="text-xs text-muted-foreground">{t.due_date ? `Due ${formatDate(t.due_date)}` : "No due date"}{t.customer_name ? ` · ${t.customer_name}` : ""}</p></div>
                  <StatusBadge status={t.priority} />
                </button>
              ))}
          </div>
        </Card>

        <Card className="border-border/70 bg-card/90" data-testid="mywork-leads">
          <div className="flex items-center gap-2 border-b border-border/70 px-5 py-4"><Target className="h-4 w-4 text-muted-foreground" /><h3 className="font-heading text-base font-semibold">My Leads</h3></div>
          <div className="max-h-[380px] divide-y divide-border/50 overflow-y-auto">
            {data.leads.length === 0 ? <EmptyState icon={Target} title="No active leads" description="Leads you own appear here." /> :
              data.leads.map((l) => (
                <button key={l.id} onClick={() => navigate(`/leads?q=${encodeURIComponent(l.company || l.name)}`)} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-accent/40">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{l.company || l.name}</p><p className="truncate text-xs text-muted-foreground">{l.name}</p></div>
                  <div className="flex items-center gap-3"><span className="font-mono text-sm font-semibold">{format(l.value || 0)}</span><StatusBadge status={l.stage} /></div>
                </button>
              ))}
          </div>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/90" data-testid="mywork-activity">
        <div className="flex items-center gap-2 border-b border-border/70 px-5 py-4"><Activity className="h-4 w-4 text-muted-foreground" /><h3 className="font-heading text-base font-semibold">My Recent Activity</h3></div>
        <div className="divide-y divide-border/50">
          {data.activity.length === 0 ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">No activity yet — create an invoice or customer to get started.</p> :
            data.activity.map((a, i) => {
              const Icon = ACT_ICON[a.type] || Activity;
              return (
                <button key={i} onClick={() => a.link && navigate(a.link)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-accent/40">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{a.title}</p><p className="truncate text-xs text-muted-foreground">{a.description}</p></div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(a.date)}</span>
                </button>
              );
            })}
        </div>
      </Card>
    </div>
  );
}
