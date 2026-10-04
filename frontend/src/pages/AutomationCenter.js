import { useState, useEffect } from "react";
import { Zap, Play, CheckCircle2, AlertTriangle, Sparkles, Shield, RefreshCw, Clock, HelpCircle, ArrowRight } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function AutomationCenter() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/automations")
      .then(({ data }) => { setData(data); setError(null); })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleToggleRule = async (ruleId, currentEnabled) => {
    const newStatus = !currentEnabled;
    try {
      await api.post(`/automations/${ruleId}/toggle`, { enabled: newStatus });
      toast.success(newStatus ? "Automation enabled" : "Automation paused");
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const handleRunBrain = async () => {
    setRunning(true);
    try {
      const { data: res } = await api.post("/automations/run");
      if (res.executed_count > 0) {
        toast.success(`Business Brain evaluated workspace! ${res.executed_count} automatic actions executed.`);
      } else {
        toast.info("Business Brain evaluated workspace: All rules up to date. No actions required.");
      }
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><div className="grid gap-6 sm:grid-cols-2"><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div></div>;
  if (error) return <ErrorState message={formatApiError(error)} onRetry={load} />;

  const rules = data.rules || [];
  const logs = data.logs || [];

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader
        title="Business Automation Center & Rules Engine"
        subtitle="Configure natural-language rules that automatically handle follow-ups, reorders, approvals, and task escalations."
      >
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleRunBrain} disabled={running} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="run-business-brain">
            <Sparkles className="h-4 w-4" /> {running ? "Evaluating workspace..." : "Run Business Brain Now"}
          </Button>
        </div>
      </PageHeader>

      {/* Summary KPI stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border/70 bg-gradient-to-br from-card via-card to-emerald-500/5 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Rules</span>
            <Zap className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 font-mono text-3xl font-extrabold">{data.active_count} / {rules.length}</p>
          <p className="mt-1 text-xs text-emerald-500 font-medium">Auto-executing background rules</p>
        </Card>

        <Card className="border-border/70 bg-card/90 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Executed Actions</span>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 font-mono text-3xl font-extrabold">{data.total_executed_count}</p>
          <p className="mt-1 text-xs text-muted-foreground font-medium">Logged automatic consequences</p>
        </Card>

        <Card className="border-border/70 bg-card/90 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">System Health</span>
            <Shield className="h-4 w-4 text-violet-500" />
          </div>
          <p className="mt-2 font-mono text-xl font-bold text-emerald-500">100% OPERATIONAL</p>
          <p className="mt-1 text-xs text-muted-foreground font-medium">Zero automation failures</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recommended Automations List */}
        <Card className="border-border/70 bg-card/90 p-5 space-y-4" data-testid="automation-rules-list">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Zap className="h-4 w-4 text-amber-500" /> Recommended Rules for Your Business
            </span>
            <Badge variant="outline" className="text-xs">
              Natural Language Syntax
            </Badge>
          </div>

          <div className="divide-y divide-border/50">
            {rules.map((rule) => (
              <div key={rule.id} className="py-4 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{rule.name}</p>
                      <Badge variant="secondary" className="text-[10px]">
                        {rule.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      "{rule.description}"
                    </p>
                  </div>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={() => handleToggleRule(rule.id, rule.enabled)}
                    data-testid={`rule-toggle-${rule.id}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Audit Stream: Why Did the System Do This? */}
        <Card className="border-border/70 bg-card/90 p-5 space-y-4" data-testid="automation-audit-stream">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <HelpCircle className="h-4 w-4 text-primary" /> "Why Did The System Do This?" (Audit Log)
            </span>
            <span className="text-xs text-muted-foreground">{logs.length} Recent Logs</span>
          </div>

          <div className="divide-y divide-border/50 max-h-[460px] overflow-y-auto">
            {logs.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                <p>No automated actions executed yet.</p>
                <p className="mt-1">Click <strong>Run Business Brain Now</strong> to evaluate your workspace rules.</p>
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="py-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {log.rule_name}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">{formatDate(log.executed_at)}</span>
                  </div>
                  <p className="text-foreground"><strong>Action:</strong> {log.action_taken}</p>
                  <p className="text-muted-foreground"><strong>Why:</strong> {log.reason}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
