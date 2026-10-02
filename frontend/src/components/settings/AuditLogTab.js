import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { ShieldCheck, History, RefreshCw, Filter } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/EmptyState";

export function AuditLogTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");

  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/audit-logs", { params: { category } });
      setLogs(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  const categoryBadgeColor = (cat) => {
    switch (cat) {
      case "financial": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "crm": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "inventory": return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "team": return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-4 animate-in-up">
      <Card className="border-border/70 bg-card/90 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-heading text-base font-semibold">Workspace Audit Trail</h3>
              <p className="text-xs text-muted-foreground">Immutable record of financial transactions, customer modifications, and system events.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-36 text-xs h-9">
                <Filter className="mr-1.5 h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                <SelectItem value="financial">Financial</SelectItem>
                <SelectItem value="crm">CRM</SelectItem>
                <SelectItem value="inventory">Inventory</SelectItem>
                <SelectItem value="team">Team</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchAuditLogs} disabled={loading} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>
      </Card>

      <Card className="border-border/70 bg-card/90 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading audit trail...</div>
        ) : logs.length === 0 ? (
          <EmptyState icon={History} title="No audit logs recorded" description="Business events such as payments, deletions, and status changes will be logged here." />
        ) : (
          <div className="divide-y divide-border/50">
            {logs.map((log) => (
              <div key={log.id} className="flex flex-col gap-2 p-4 text-sm transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{log.action.replace(/_/g, " ").toUpperCase()}</span>
                    <Badge variant="outline" className={`text-[10px] uppercase font-semibold ${categoryBadgeColor(log.category)}`}>
                      {log.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{log.details}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground sm:text-right">
                  <div>
                    <span className="font-medium text-foreground">{log.actor_name}</span>
                    <p className="text-[11px]">{formatDate(log.created_at)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
