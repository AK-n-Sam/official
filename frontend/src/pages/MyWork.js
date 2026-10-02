import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckSquare, Target, Activity, Users, FileText, CreditCard, AlertTriangle, Plus, Zap, ArrowRight, ShieldCheck, Check, X, Bell } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const ACT_ICON = { invoice: FileText, payment: CreditCard, customer: Users };
const isOverdue = (t) => t.due_date && t.due_date < new Date().toISOString().slice(0, 10);

export default function MyWork() {
  const { user } = useAuth();
  const { format } = useCurrency();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [decidingId, setDecidingId] = useState(null);

  const load = () => {
    setLoading(true);
    api.get("/my-work").then(({ data }) => { setData(data); setError(null); })
      .catch((e) => setError(e)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleApprovalDecision = async (apprId, status) => {
    setDecidingId(apprId);
    try {
      await api.post(`/collaboration/approvals/${apprId}/decide`, { status, notes: `Decided via My Work` });
      toast.success(`Approval request ${status}`);
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setDecidingId(null);
    }
  };

  const firstName = (user?.name || "there").split(" ")[0];
  const userRole = (user?.role || "member").toUpperCase();

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-80 rounded-xl" /><Skeleton className="h-80 rounded-xl" /></div></div>;
  if (error) return <ErrorState message={formatApiError(error)} onRetry={load} />;

  const actionQueue = data.action_queue || [];
  const approvals = data.approvals || [];
  const notifications = data.notifications || [];

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader
        title={`My Work & Focus (${userRole})`}
        subtitle={`Personalized action center for ${user?.name || "you"}. What do you need to do today?`}
      >
        <Button variant="outline" onClick={() => navigate("/tasks?new=1")} data-testid="mywork-new-task">
          <Plus className="mr-2 h-4 w-4" /> New Task
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border-border/70 bg-card/90 p-4" data-testid="mywork-open-tasks">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">My Tasks</p>
          <p className="mt-2 font-mono text-2xl font-extrabold">{data.open_tasks}</p>
        </Card>
        <Card className="border-border/70 bg-card/90 p-4" data-testid="mywork-open-leads">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Deals</p>
          <p className="mt-2 font-mono text-2xl font-extrabold">{data.open_leads}</p>
        </Card>
        <Card className="border-border/70 bg-card/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending Approvals</p>
          <p className={`mt-2 font-mono text-2xl font-extrabold ${data.pending_approvals_count > 0 ? "text-amber-500" : ""}`}>{data.pending_approvals_count}</p>
        </Card>
        <Card className="border-border/70 bg-card/90 p-4" data-testid="mywork-overdue">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overdue Items</p>
          <p className="mt-2 font-mono text-2xl font-extrabold text-rose-500">{data.tasks.filter(isOverdue).length}</p>
        </Card>
      </div>

      {/* Pending Approvals Widget */}
      {approvals.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <ShieldCheck className="h-4 w-4" /> Pending Approvals Requiring Decision ({approvals.length})
            </span>
          </div>
          <div className="divide-y divide-border/50">
            {approvals.map((appr) => (
              <div key={appr.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{appr.title}</p>
                  <p className="text-xs text-muted-foreground">Requested by {appr.requester_name} · Amount: {format(appr.amount || 0)}</p>
                  {appr.notes && <p className="text-xs text-muted-foreground mt-0.5">Note: {appr.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs"
                    disabled={decidingId === appr.id}
                    onClick={() => handleApprovalDecision(appr.id, "approved")}
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-rose-500 hover:text-rose-600 border-rose-500/30 gap-1 text-xs"
                    disabled={decidingId === appr.id}
                    onClick={() => handleApprovalDecision(appr.id, "rejected")}
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Prioritized Action Queue */}
      {actionQueue.length > 0 && (
        <Card className="border-border/70 bg-card/90 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Zap className="h-4 w-4 text-amber-500" /> Prioritized Action Queue
            </span>
            <Badge variant="outline" className="text-xs font-semibold">
              {actionQueue.length} Action Items
            </Badge>
          </div>
          <div className="divide-y divide-border/50">
            {actionQueue.map((act) => (
              <div key={act.id} className="flex items-center justify-between py-3 hover:bg-accent/30 px-2 rounded-lg transition-colors">
                <div className="flex items-center gap-3">
                  {act.urgency === "critical" && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
                  {act.urgency === "high" && <Zap className="h-4 w-4 text-amber-500 shrink-0" />}
                  {act.urgency === "warning" && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                  {act.urgency === "medium" && <CheckSquare className="h-4 w-4 text-blue-500 shrink-0" />}
                  <div>
                    <p className="text-sm font-medium">{act.title}</p>
                    <p className="text-xs text-muted-foreground">{act.subtitle}</p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={() => navigate(act.link)}>
                  <span>{act.action_label}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Personalized Mentions & Direct Notifications */}
      {notifications.length > 0 && (
        <Card className="border-border/70 bg-card/90 p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Bell className="h-4 w-4 text-primary" /> Direct Notifications & @Mentions
          </div>
          <div className="divide-y divide-border/50">
            {notifications.map((n) => (
              <div key={n.id} className="flex items-center justify-between py-2 text-xs">
                <div>
                  <p className="font-semibold text-foreground">{n.title}</p>
                  <p className="text-muted-foreground">{n.description}</p>
                </div>
                <span className="text-[11px] text-muted-foreground">{formatDate(n.time)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border/70 bg-card/90" data-testid="mywork-tasks">
          <div className="flex items-center gap-2 border-b border-border/70 px-5 py-4">
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-heading text-base font-semibold">My Assigned Tasks</h3>
          </div>
          <div className="max-h-[380px] divide-y divide-border/50 overflow-y-auto">
            {data.tasks.length === 0 ? <EmptyState icon={CheckSquare} title="No open tasks" description="You're all caught up." /> :
              data.tasks.map((t) => (
                <button key={t.id} onClick={() => navigate("/tasks")} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-accent/40">
                  {isOverdue(t) ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" /> : <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">Due {formatDate(t.due_date)}{t.customer_name ? ` · ${t.customer_name}` : ""}</p>
                  </div>
                  <StatusBadge status={t.priority} />
                </button>
              ))}
          </div>
        </Card>

        <Card className="border-border/70 bg-card/90" data-testid="mywork-leads">
          <div className="flex items-center gap-2 border-b border-border/70 px-5 py-4">
            <Target className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-heading text-base font-semibold">My Active Leads</h3>
          </div>
          <div className="max-h-[380px] divide-y divide-border/50 overflow-y-auto">
            {data.leads.length === 0 ? <EmptyState icon={Target} title="No active leads" description="Leads you own appear here." /> :
              data.leads.map((l) => (
                <button key={l.id} onClick={() => navigate("/leads")} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-accent/40">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.company || l.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{l.name}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold">{format(l.value || 0)}</span>
                    <StatusBadge status={l.stage} />
                  </div>
                </button>
              ))}
          </div>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/90" data-testid="mywork-activity">
        <div className="flex items-center gap-2 border-b border-border/70 px-5 py-4">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-heading text-base font-semibold">My Recent Activity History</h3>
        </div>
        <div className="divide-y divide-border/50">
          {data.activity.length === 0 ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">No activity yet — create an invoice or customer to get started.</p> :
            data.activity.map((a, i) => {
              const Icon = ACT_ICON[a.type] || Activity;
              return (
                <button key={i} onClick={() => a.link && navigate(a.link)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-accent/40">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.description}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(a.date)}</span>
                </button>
              );
            })}
        </div>
      </Card>
    </div>
  );
}
