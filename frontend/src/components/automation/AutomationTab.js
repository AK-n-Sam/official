import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Play, RotateCcw, Trash2, Repeat, CheckCircle2, Clock } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { useDataChanged, notifyDataChanged } from "@/hooks/useDataChanged";
import { formatDate } from "@/lib/format";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StateWord, timeAgo, useJob } from "@/components/automation/shared";

const ALWAYS_ON = [
  ["Overdue check", "Invoices past their due date are marked overdue every 15 minutes, even when nobody is signed in."],
  ["Repeating invoices and bills", "Checked every hour. Each one is created once per period, however many times the check runs."],
  ["Bank", "New bank lines get a suggested category in the background. Connected banks sync every 6 hours."],
  ["Upkeep", "Old finished jobs are cleaned up daily, and AI connections are health-checked every 30 minutes."],
];
const FREQ = { weekly: "Every week", monthly: "Every month", quarterly: "Every 3 months", yearly: "Every year" };

function Section({ title, sub, action, children, testId }) {
  return (
    <Card className="border-border/70 bg-card/90" data-testid={testId}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div><h3 className="font-heading text-sm font-semibold">{title}</h3>{sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}</div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </Card>
  );
}

export function AutomationTab() {
  const { format } = useCurrency();
  const [settings, setSettings] = useState(null);
  const [labels, setLabels] = useState({});
  const [approvals, setApprovals] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [log, setLog] = useState([]);
  const [jobs, setJobs] = useState({ jobs: [], counts: {} });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState("");
  const [removing, setRemoving] = useState(null);
  const [days, setDays] = useState("");
  const repeatJob = useJob();

  const load = useCallback(async () => {
    try {
      const [s, a, r, l, j] = await Promise.all([
        api.get("/automation/settings"), api.get("/automation/approvals"), api.get("/automation/recurring"),
        api.get("/automation/log", { params: { limit: 60 } }), api.get("/automation/jobs"),
      ]);
      setSettings(s.data.settings); setLabels(s.data.labels); setDays(String(s.data.settings.followup_after_days ?? 14));
      setApprovals(a.data); setRecurring(r.data); setLog(l.data); setJobs(j.data); setError(null);
    } catch (e) { setError(e); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useDataChanged(load);

  const saveSetting = async (patch) => {
    const before = settings;
    setSettings({ ...settings, ...patch });
    try { const { data } = await api.put("/automation/settings", patch); setSettings(data.settings); toast.success("Saved"); }
    catch (e) { setSettings(before); toast.error(formatApiError(e)); }
  };

  const decide = async (a, approve) => {
    setBusy(a.id);
    try {
      const { data } = await api.post(`/automation/approvals/${a.id}/${approve ? "approve" : "reject"}`);
      toast.success(approve ? (data.result?.message || "Done") : "Skipped");
      notifyDataChanged();
    } catch (e) { toast.error(formatApiError(e)); load(); } finally { setBusy(""); }
  };

  const updateRec = async (r, patch) => {
    setBusy(r.id);
    try { await api.put(`/automation/recurring/${r.id}`, patch); await load(); }
    catch (e) { toast.error(formatApiError(e)); } finally { setBusy(""); }
  };

  const retry = async (j) => {
    setBusy(j.id);
    try { await api.post(`/automation/jobs/${j.id}/retry`); toast.success("Queued to run again"); await load(); }
    catch (e) { toast.error(formatApiError(e)); } finally { setBusy(""); }
  };

  const runRepeatsNow = async () => {
    try {
      await repeatJob.start("recurring", { onDone: (j) => {
        const r = j.result || {};
        const made = (r.invoices || 0) + (r.approvals || 0) + (r.bills || 0);
        toast.success(made ? `Created ${made} item${made === 1 ? "" : "s"}` : "Nothing was due yet");
        notifyDataChanged();
      } });
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (error) return <ErrorState message={formatApiError(error)} onRetry={load} />;
  if (!settings) return <div className="space-y-4"><Skeleton className="h-48 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;

  return (
    <div className="space-y-5" data-testid="automation-tab">
      {approvals.length > 0 && (
        <Section title="Waiting for your approval" sub="Prepared automatically. Nothing goes out until you approve it." testId="automation-approvals">
          <ul className="divide-y divide-border/50">
            {approvals.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.detail}{a.error ? ` · ${a.error}` : ""}</p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" className="h-8" disabled={busy === a.id} onClick={() => decide(a, true)} data-testid="approval-approve">{a.status === "failed" ? "Try again" : "Approve"}</Button>
                  <Button size="sm" variant="outline" className="h-8" disabled={busy === a.id} onClick={() => decide(a, false)} data-testid="approval-skip">Skip</Button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="What runs by itself" sub="Switch off anything you'd rather do by hand." testId="automation-settings">
        <div className="space-y-3">
          {Object.entries(labels).map(([k, label]) => (
            <div key={k} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm">{label}</p>
                {k === "overdue_followups" && settings[k] && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    After
                    <Input type="number" min={1} max={120} value={days} onChange={(e) => setDays(e.target.value)} aria-label="Days overdue before a follow-up"
                      onBlur={() => { const n = parseInt(days, 10); if (n >= 1 && n <= 120 && n !== settings.followup_after_days) saveSetting({ followup_after_days: n }); else setDays(String(settings.followup_after_days)); }}
                      className="h-7 w-16 px-2 text-xs" data-testid="automation-followup-days" />
                    days overdue, assigned to whoever made the sale.
                  </p>
                )}
                {k === "ai_assist" && <p className="mt-0.5 text-xs text-muted-foreground">Only bank descriptions and summary figures are sent. Without AI, built-in rules and a standard summary are used.</p>}
              </div>
              <Switch checked={!!settings[k]} onCheckedChange={(v) => saveSetting({ [k]: v })} aria-label={label} data-testid={`automation-toggle-${k}`} />
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-2 border-t border-border/60 pt-4 sm:grid-cols-2">
          {ALWAYS_ON.map(([t, d]) => (
            <div key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /><p className="text-xs"><span className="font-medium">{t}.</span> <span className="text-muted-foreground">{d}</span></p></div>
          ))}
        </div>
      </Section>

      <Section title="Repeating invoices and bills" sub="Set one up from an invoice or an expense with “Repeat”." testId="automation-recurring"
        action={recurring.length > 0 && (
          <Button size="sm" variant="outline" className="h-8" disabled={repeatJob.busy} onClick={runRepeatsNow} data-testid="automation-run-recurring">
            {repeatJob.busy ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Processing</> : <><Play className="mr-1.5 h-3.5 w-3.5" />Run what's due</>}
          </Button>
        )}>
        {recurring.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Repeat className="h-4 w-4" /> Nothing repeats yet. Open an invoice or an expense and choose Repeat.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {recurring.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center" data-testid="recurring-row">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.kind === "invoice" ? "Invoice" : "Bill"} · {r.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {format(r.kind === "invoice" ? r.template.total : r.template.amount)} · {FREQ[r.frequency]} ·{" "}
                    {r.active ? `next on ${formatDate(r.next_date)}` : `paused${r.paused_reason ? `: ${r.paused_reason}` : ""}`}
                    {r.kind === "invoice" && (r.auto_send ? " · issued automatically" : " · asks you first")}
                    {r.count ? ` · ${r.count} made so far` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {r.kind === "invoice" && (
                    <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={busy === r.id} onClick={() => updateRec(r, { auto_send: !r.auto_send })}>
                      {r.auto_send ? "Ask me first" : "Issue automatically"}
                    </Button>
                  )}
                  <Switch checked={r.active} disabled={busy === r.id} onCheckedChange={(v) => updateRec(r, { active: v })} aria-label={r.active ? "Pause" : "Resume"} />
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Stop repeating" onClick={() => setRemoving(r)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="What happened" sub="Everything automation did, and anything it couldn't finish." testId="automation-log">
        {log.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet. Automatic steps will show up here.</p> : (
          <ul className="max-h-96 divide-y divide-border/50 overflow-y-auto">
            {log.map((l) => (
              <li key={l.id} className="flex items-start gap-3 py-2">
                <StateWord status={l.status} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{l.message}</p>
                  <p className="text-[11px] text-muted-foreground">{l.rule} · {timeAgo(l.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Background work" testId="automation-jobs"
        sub={`${jobs.counts.queued || 0} queued · ${jobs.counts.running || 0} processing · ${jobs.counts.done || 0} done · ${jobs.counts.failed || 0} need attention`}>
        {jobs.jobs.length === 0 ? <p className="text-sm text-muted-foreground">No background work yet.</p> : (
          <ul className="max-h-72 divide-y divide-border/50 overflow-y-auto">
            {jobs.jobs.slice(0, 40).map((j) => (
              <li key={j.id} className="flex items-center gap-3 py-2">
                <StateWord status={j.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{j.label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    <Clock className="mr-1 inline h-3 w-3" />{timeAgo(j.updated_at)}{j.attempts > 1 ? ` · attempt ${j.attempts} of ${j.max_attempts}` : ""}{j.error ? ` · ${j.error}` : ""}
                  </p>
                </div>
                {["failed", "skipped"].includes(j.status) && (
                  <Button size="sm" variant="outline" className="h-7" disabled={busy === j.id} onClick={() => retry(j)} data-testid="job-retry"><RotateCcw className="mr-1 h-3 w-3" />Retry</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Stop repeating?"
        description={removing ? `${removing.label} won't be created again. Anything already created stays as it is.` : ""}
        confirmLabel="Stop repeating"
        onConfirm={async () => {
          try { await api.delete(`/automation/recurring/${removing.id}`); toast.success("Stopped"); setRemoving(null); notifyDataChanged(); }
          catch (e) { toast.error(formatApiError(e)); }
        }} />
    </div>
  );
}
