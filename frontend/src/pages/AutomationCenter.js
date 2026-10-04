import { useState, useEffect } from "react";
import { Zap, Play, CheckCircle2, AlertTriangle, Sparkles, Shield, RefreshCw, Clock, HelpCircle, ArrowRight, ToggleLeft, ToggleRight } from "lucide-react";
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
  const [autopilotStatus, setAutopilotStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get("/automations"),
      api.get("/autopilot/status")
    ])
      .then(([resAutomations, resAutopilot]) => {
        setData(resAutomations.data);
        setAutopilotStatus(resAutopilot.data);
        setError(null);
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleToggleRule = async (ruleId, currentEnabled) => {
    const newStatus = !currentEnabled;
    try {
      await api.post(`/automations/${ruleId}/toggle`, { enabled: newStatus });
      toast.success(newStatus ? "Automation rule enabled" : "Automation rule paused");
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const handleToggleAutopilot = async (currentEnabled) => {
    const newEnabled = !currentEnabled;
    try {
      await api.post("/autopilot/toggle", { enabled: newEnabled, mode: "full_autopilot" });
      toast.success(newEnabled ? "Business Autopilot activated!" : "Business Autopilot paused");
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const handleRunAutopilot = async () => {
    setRunning(true);
    try {
      const { data: res } = await api.post("/autopilot/run-now");
      if (res.executed_count > 0) {
        toast.success(`Business Autopilot evaluated workspace! ${res.executed_count} automatic actions executed.`);
      } else {
        toast.info("Business Autopilot scan complete: All rules up to date. No new actions required.");
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

  const rules = data?.rules || [];
  const logs = autopilotStatus?.recent_logs || data?.logs || [];
  const isAutopilotActive = autopilotStatus?.enabled ?? true;

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader
        title="Business Autopilot & Automation Center"
        subtitle="Zero-setup SME Autopilot: continuous Observe → Understand → Decide → Act → Verify engine for 2–10 person teams."
      >
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleRunAutopilot} disabled={running} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="run-autopilot-now">
            <Sparkles className="h-4 w-4" /> {running ? "Evaluating workspace..." : "Run Autopilot Scan Now"}
          </Button>
        </div>
      </PageHeader>

      {/* Autopilot Master Banner */}
      <Card className={`border-2 p-5 ${isAutopilotActive ? "border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-card to-card" : "border-amber-500/30 bg-amber-500/5"} shadow-md`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl ${isAutopilotActive ? "bg-emerald-500/20 text-emerald-500" : "bg-amber-500/20 text-amber-500"}`}>
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-bold text-lg">SME Business Autopilot Mode</h3>
                <Badge variant="outline" className={isAutopilotActive ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40" : "bg-amber-500/20 text-amber-600 border-amber-500/40"}>
                  {isAutopilotActive ? "● ACTIVE & RUNNING" : "PAUSED"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                {autopilotStatus?.summary?.description || "Six6Fix automatically detects overdue invoices, low stock, inactive leads, and overdue tasks to keep your business operating effortlessly."}
              </p>
              {autopilotStatus?.last_run_at && (
                <p className="text-[11px] font-mono text-muted-foreground mt-1">
                  Last cycle evaluated: {formatDate(autopilotStatus.last_run_at)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-semibold text-muted-foreground">Autopilot Switch</span>
            <Switch
              checked={isAutopilotActive}
              onCheckedChange={() => handleToggleAutopilot(isAutopilotActive)}
              data-testid="autopilot-master-toggle"
            />
          </div>
        </div>
      </Card>

      {/* Summary KPI stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border/70 bg-gradient-to-br from-card via-card to-emerald-500/5 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Automation Rules</span>
            <Zap className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 font-mono text-3xl font-extrabold">{data.active_count} / {rules.length}</p>
          <p className="mt-1 text-xs text-emerald-500 font-medium">Auto-executing background rules</p>
        </Card>

        <Card className="border-border/70 bg-card/90 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today's Executed Actions</span>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 font-mono text-3xl font-extrabold">{autopilotStatus?.today_actions_count ?? data.total_executed_count}</p>
          <p className="mt-1 text-xs text-muted-foreground font-medium">Logged automatic consequences today</p>
        </Card>

        <Card className="border-border/70 bg-card/90 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Human Governance</span>
            <Shield className="h-4 w-4 text-violet-500" />
          </div>
          <p className="mt-2 font-mono text-xl font-bold text-emerald-500">100% EXPLAINABLE</p>
          <p className="mt-1 text-xs text-muted-foreground font-medium">Full audit logs & 1-click human override</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recommended Automations List */}
        <Card className="border-border/70 bg-card/90 p-5 space-y-4" data-testid="automation-rules-list">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Zap className="h-4 w-4 text-amber-500" /> Standard SME Automation Rules
            </span>
            <Badge variant="outline" className="text-xs">
              Default & Zero-Setup
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

        {/* Audit Stream: Explainability Trail */}
        <Card className="border-border/70 bg-card/90 p-5 space-y-4" data-testid="automation-audit-stream">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <HelpCircle className="h-4 w-4 text-primary" /> Autopilot Explainability Audit Trail
            </span>
            <span className="text-xs text-muted-foreground">{logs.length} Recent Logs</span>
          </div>

          <div className="divide-y divide-border/50 max-h-[460px] overflow-y-auto space-y-3">
            {logs.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                <p>No automated actions executed yet.</p>
                <p className="mt-1">Click <strong>Run Autopilot Scan Now</strong> to evaluate your workspace rules.</p>
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="pt-3 text-xs space-y-1 bg-muted/20 p-3 rounded-lg border border-border/50">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {log.rule_name}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">{formatDate(log.executed_at)}</span>
                  </div>
                  <div className="space-y-0.5 pt-1">
                    <p className="text-foreground"><strong>Why:</strong> {log.reason}</p>
                    <p className="text-muted-foreground"><strong>Action:</strong> {log.action_taken}</p>
                    {log.result && <p className="text-emerald-600 dark:text-emerald-400"><strong>Result:</strong> {log.result}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
