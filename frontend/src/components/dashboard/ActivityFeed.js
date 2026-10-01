import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Users, FileText, CreditCard, Receipt, Package, CheckSquare, Activity } from "lucide-react";
import api from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useCurrency } from "@/context/CurrencyContext";
import { useDataChanged } from "@/hooks/useDataChanged";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ICONS = { customer: Users, invoice: FileText, payment: CreditCard, expense: Receipt, stock: Package, task: CheckSquare };
const TONE = { customer: "text-violet-500", invoice: "text-blue-500", payment: "text-emerald-500", expense: "text-rose-500", stock: "text-amber-500", task: "text-emerald-500" };

export function ActivityFeed() {
  const navigate = useNavigate();
  const { format } = useCurrency();
  const [items, setItems] = useState(null);

  const load = useCallback(() => { api.get("/activity").then(({ data }) => setItems(data)).catch(() => setItems([])); }, []);
  useEffect(load, [load]);
  useDataChanged(load);

  return (
    <Card className="border-border/70 bg-card/90" data-testid="activity-feed">
      <div className="flex items-center gap-2 border-b border-border/70 px-5 py-4">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-heading text-base font-semibold">Recently</h3>
      </div>
      <div className="max-h-[420px] divide-y divide-border/50 overflow-y-auto">
        {items === null ? (
          <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
        ) : items.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No activity yet. Start by creating a customer or invoice.</p>
        ) : items.map((a, i) => {
          const Icon = ICONS[a.type] || Activity;
          return (
            <button key={i} onClick={() => a.link && navigate(a.link)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-accent/40" data-testid={`activity-item-${i}`}>
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted ${TONE[a.type] || ""}`}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{a.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{a.description}{a.amount ? ` · ${format(a.amount)}` : ""}</span>
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(a.date)}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
