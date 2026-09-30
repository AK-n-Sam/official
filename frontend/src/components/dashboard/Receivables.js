import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";

export const AGING = [
  { key: "current", label: "Not yet due", color: "bg-emerald-500" },
  { key: "d1_30", label: "1–30 days late", color: "bg-amber-400" },
  { key: "d31_60", label: "31–60 days", color: "bg-orange-500" },
  { key: "d61_90", label: "61–90 days", color: "bg-rose-500" },
  { key: "d90_plus", label: "90+ days", color: "bg-rose-700" },
];

/** Money owed to the business, split by how late it is — the older, the harder to collect. */
export function AgingBar({ aging, format, testId = "receivables-aging" }) {
  const total = AGING.reduce((s, b) => s + (aging?.[b.key] || 0), 0);
  return (
    <div data-testid={testId}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Receivables by age">
        {total > 0 && AGING.map((b) => aging[b.key] > 0 && (
          <span key={b.key} className={b.color} style={{ width: `${(aging[b.key] / total) * 100}%` }} title={`${b.label}: ${format(aging[b.key])}`} />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        {AGING.map((b) => (
          <div key={b.key} className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-1.5 text-muted-foreground"><span className={`h-2 w-2 rounded-full ${b.color}`} />{b.label}</dt>
            <dd className="font-mono tabular-nums">{format(aging?.[b.key] || 0)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Receivables({ aging, debtors, outstanding, format }) {
  const navigate = useNavigate();
  return (
    <Card className="border-border bg-card shadow-sm" data-testid="receivables-card">
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        <div>
          <h3 className="font-heading text-base font-semibold">Money owed to you</h3>
          <p className="text-xs text-muted-foreground">{format(outstanding)} across unpaid invoices</p>
        </div>
        <button type="button" onClick={() => navigate("/invoices?status=unpaid")} className="text-xs font-medium text-primary hover:underline">View unpaid</button>
      </div>
      <div className="px-5 py-4">
        <AgingBar aging={aging} format={format} />
      </div>
      <div className="border-t border-border/70">
        <p className="px-5 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Who owes you most</p>
        {debtors.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">Nobody owes you anything right now.</p>
        ) : (
          <div className="divide-y divide-border/50" data-testid="top-debtors">
            {debtors.map((d) => (
              <button key={d.customer_id || d.customer_name} type="button" disabled={!d.customer_id}
                onClick={() => navigate(`/customers/${d.customer_id}`)}
                className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-accent/40 disabled:cursor-default">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{d.customer_name || "Unknown customer"}</span>
                  <span className="block text-xs text-muted-foreground">
                    {d.invoices} invoice{d.invoices === 1 ? "" : "s"} · oldest due {formatDate(d.oldest_due)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-sm font-semibold">{format(d.amount)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
