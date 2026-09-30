import { Card } from "@/components/ui/card";
import { Sparkles, TrendingUp, AlertCircle } from "lucide-react";
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
        <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">Preview</Badge>
      </div>
      <div className="mt-4 space-y-2.5">
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
          <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Cashflow forecast:</span> Revenue is trending up. Projected +12% next month based on invoice pipeline.</p>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Churn alert:</span> 2 customers haven't ordered in 60+ days. Consider a re-engagement campaign.</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Full predictive analytics arrive in an upcoming release.</p>
    </Card>
  );
}
