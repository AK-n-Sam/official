import { cn } from "@/lib/utils";

/** Compact stat card for page-level summaries. Pass `onClick` to make it act as a filter toggle. */
export function SummaryCard({ label, value, sub, icon: IconCmp, tone, active, onClick, testId }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      data-testid={testId}
      aria-pressed={onClick ? !!active : undefined}
      className={cn(
        "flex items-start justify-between gap-3 rounded-xl border bg-card/90 p-4 text-left shadow-sm transition-colors",
        onClick && "hover:border-primary/40",
        active ? "border-primary/60 ring-1 ring-primary/30" : "border-border/80"
      )}
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("mt-1 truncate font-mono text-lg font-bold sm:text-xl", tone)}>{value}</p>
        {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
      {IconCmp && <IconCmp className={cn("hidden h-5 w-5 shrink-0 sm:block", tone || "text-muted-foreground")} />}
    </Tag>
  );
}
