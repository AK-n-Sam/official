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

/**
 * Headline number. `delta` is a % change vs the previous period (null hides it); `invert` marks
 * metrics where going up is bad (e.g. expenses), so the colour reflects good/bad, not up/down.
 */
export function KpiCard({ label, value, icon, tone = "primary", delta, invert = false, sub, onClick, testId }) {
  const t = TONES[tone] || TONES.primary;
  const good = delta != null && (invert ? delta <= 0 : delta >= 0);
  const Tag = onClick ? "button" : "div";
  return (
    <Card
      className={cn("group relative overflow-hidden border-border bg-card p-5 text-left shadow-sm transition-all duration-200 sm:p-6", onClick && "hover:-translate-y-0.5 hover:shadow-md")}
      data-testid={testId}
    >
      <Tag type={onClick ? "button" : undefined} onClick={onClick} className={cn("block w-full rounded-md text-left", onClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card")}>
        <span className={cn("absolute inset-x-0 top-0 h-0.5", t.bar)} aria-hidden />
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-transform duration-200 group-hover:scale-105", t.badge)}>
            <Icon name={icon} className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-4 font-mono text-2xl font-bold leading-none tracking-tight tabular-nums text-foreground sm:text-3xl" data-testid={`${testId}-value`}>
          {value}
        </p>
        {(delta != null || sub) && (
          <div className="mt-2.5 flex items-center gap-2 text-xs">
            {delta != null && (
              <span
                className={cn("inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 font-semibold tabular-nums", good ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400")}
                title="Compared with the previous 30 days"
                data-testid={`${testId}-delta`}
              >
                {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(delta)}%
              </span>
            )}
            {sub && <span className="truncate text-muted-foreground">{sub}</span>}
          </div>
        )}
      </Tag>
    </Card>
  );
}
