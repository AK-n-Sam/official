import { Card } from "@/components/ui/card";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

const TONES = {
  primary: { badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20", bar: "bg-blue-500" },
  emerald: { badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20", bar: "bg-emerald-500" },
  amber: { badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20", bar: "bg-amber-500" },
  rose: { badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20", bar: "bg-rose-500" },
  violet: { badge: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20", bar: "bg-violet-500" },
};

export function KpiCard({ label, value, icon, tone = "primary", delta, sub, testId }) {
  const t = TONES[tone] || TONES.primary;
  return (
    <Card
      className="group relative overflow-hidden rounded-xl border-border/80 bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-border hover:shadow-[0_6px_18px_rgba(16,24,40,0.06)] sm:p-6"
      data-testid={testId}
    >
      <span className={cn("absolute inset-x-0 top-0 h-0.5", t.bar)} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <div className={cn("flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full", t.badge)}>
          <Icon name={icon} className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-4 font-mono text-[27px] font-bold leading-none tracking-tight tabular-nums text-foreground sm:text-3xl" data-testid={`${testId}-value`}>
        {value}
      </p>
      {(delta != null || sub) && (
        <div className="mt-2.5 flex items-center gap-2 text-xs">
          {delta != null && (
            <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 font-semibold tabular-nums", delta >= 0 ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400")}>
              {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(delta)}%
            </span>
          )}
          {sub && <span className="truncate text-muted-foreground">{sub}</span>}
        </div>
      )}
    </Card>
  );
}
