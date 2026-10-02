import { Card } from "@/components/ui/card";
import { Sparkles, TrendingUp, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function AiInsightsPlaceholder() {
  return (
    <Card className="relative flex h-full flex-col overflow-hidden border-violet-500/20 bg-gradient-to-b from-violet-500/[0.06] via-card to-card p-5 shadow-sm sm:p-6" data-testid="ai-insights-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/15 text-violet-500 dark:text-violet-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <h3 className="font-heading text-base font-semibold">AI Insights Engine</h3>
        </div>
        <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">Active</Badge>
      </div>
      <div className="mt-4 space-y-2.5">
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
          <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Cashflow Intelligence:</span> Real-time cashflow predictions and profit tracking activate automatically as sales are recorded.</p>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Risk Prevention:</span> Overdue payment risks and inventory reorder alerts will be flagged automatically.</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">System constantly analyzes business data to keep your operations running smoothly.</p>
    </Card>
  );
}
