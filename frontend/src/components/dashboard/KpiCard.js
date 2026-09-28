import { Card } from "@/components/ui/card";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export function KpiCard({ label, value, icon, tone = "primary", delta, sub, testId }) {
  const tones = {
    primary: "bg-blue-500/10 text-blue-500",
    emerald: "bg-emerald-500/10 text-emerald-500",
    amber: "bg-amber-500/10 text-amber-500",
    rose: "bg-rose-500/10 text-rose-500",
    violet: "bg-violet-500/10 text-violet-500",
  };
  return (
    <Card className="border-border/70 bg-card/90 p-5 transition-colors hover:border-border" data-testid={testId}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", tones[tone])}>
          <Icon name={icon} className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 font-mono text-2xl font-extrabold tracking-tight tabular-nums sm:text-3xl" data-testid={`${testId}-value`}>
        {value}
      </p>
      {(delta != null || sub) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          {delta != null && (
            <span className={cn("inline-flex items-center gap-0.5 font-medium", delta >= 0 ? "text-emerald-500" : "text-rose-500")}>
              {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(delta)}%
            </span>
          )}
          {sub && <span className="text-muted-foreground">{sub}</span>}
        </div>
      )}
    </Card>
  );
}
