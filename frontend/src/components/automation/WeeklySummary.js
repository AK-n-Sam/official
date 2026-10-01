import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, RefreshCw, ArrowRight } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { timeAgo, useJob } from "@/components/automation/shared";

/** The weekly summary, written in the background every Monday (or now, on request). Owners and admins. */
export function WeeklySummary() {
  const [summary, setSummary] = useState(null);
  const job = useJob();

  const load = useCallback(() => {
    api.get("/automation/summary").then(({ data }) => setSummary(data)).catch(() => setSummary({}));
  }, []);
  useEffect(load, [load]);

  const writeNow = async () => {
    try {
      await job.start("summary", { onDone: (j) => { if (j.status === "done") load(); else toast.error("The summary couldn't be written. It will try again on schedule."); } });
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (summary === null) return null;
  const has = !!summary.headline;
  return (
    <Card className="border-border bg-card p-5 shadow-sm" data-testid="weekly-summary">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> This week{has ? ` · ${timeAgo(summary.created_at)}` : ""}
          </p>
          <h2 className="mt-1 font-heading text-lg font-semibold">{has ? summary.headline : "Your weekly summary"}</h2>
        </div>
        <Button size="sm" variant="outline" className="h-8" disabled={job.busy} onClick={writeNow} data-testid="summary-refresh">
          {job.busy ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />{job.state === "queued" ? "Queued" : "Writing"}</> : <><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{has ? "Update" : "Write it now"}</>}
        </Button>
      </div>
      {has ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">{summary.text}</p>
          {summary.next_steps?.length > 0 && (
            <ul className="mt-3 space-y-1">
              {summary.next_steps.map((s) => <li key={s} className="flex items-start gap-2 text-sm"><ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{s}</li>)}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">{summary.source === "ai" ? "Written with AI from your numbers." : "Standard summary from your numbers."}{summary.note ? ` ${summary.note}` : ""}</p>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">A short summary of the week, with the next things worth doing, is written for you every Monday.</p>
      )}
    </Card>
  );
}
