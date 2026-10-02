import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Users, AlertCircle, ArrowUpRight, CheckCircle2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function TeamWorkloadWidget() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState(null);

  const fetchWorkload = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get("/team/workload");
      setData(res);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkload();
  }, [fetchWorkload]);

  const handleAssignItem = async (item, assigneeId) => {
    if (!assigneeId) return;
    setAssigningId(item.id);
    try {
      await api.post("/collaboration/handoffs", {
        target_type: item.type,
        target_id: item.id,
        assignee_id: assigneeId,
        note: "Assigned from Unassigned Work Queue",
      });
      toast.success(`Assigned ${item.type} #${item.id.slice(0, 6)}`);
      fetchWorkload();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setAssigningId(null);
    }
  };

  if (loading) return <div className="p-6 text-center text-xs text-muted-foreground">Loading workload...</div>;

  return (
    <div className="space-y-6">
      {/* Workload by Teammate */}
      <Card className="border-border/70 bg-card/90 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="font-heading text-base font-semibold">Team Workload Overview</h3>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            {data?.member_workload?.length || 0} Teammates Active
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.member_workload?.map((m) => (
            <div key={m.member_id} className="rounded-xl border border-border/60 bg-muted/20 p-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">{m.name}</span>
                <Badge variant="secondary" className="capitalize text-[10px]">{m.role}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/50 pt-2 text-center text-muted-foreground">
                <div>
                  <p className="text-[10px] uppercase">Tasks</p>
                  <p className="font-mono font-bold text-foreground">{m.open_tasks_count}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase">Overdue</p>
                  <p className={`font-mono font-bold ${m.overdue_tasks_count > 0 ? "text-amber-500" : "text-foreground"}`}>{m.overdue_tasks_count}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase">Deals</p>
                  <p className="font-mono font-bold text-foreground">{m.active_leads_count}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Unassigned Work Queue */}
      <Card className="border-border/70 bg-card/90 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <h3 className="font-heading text-base font-semibold">Unassigned Work Queue ({data?.unassigned_count || 0})</h3>
          </div>
          <span className="text-xs text-muted-foreground">Items requiring an assigned owner</span>
        </div>

        {data?.unassigned_queue?.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-500">
            <CheckCircle2 className="h-4 w-4" /> All tasks, leads, and stock items have assigned owners!
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {data?.unassigned_queue?.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="font-semibold text-foreground">{item.title}</span>
                  <p className="text-[11px] text-muted-foreground">{item.subtitle}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Select disabled={assigningId === item.id} onValueChange={(val) => handleAssignItem(item, val)}>
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue placeholder="Assign Owner..." />
                    </SelectTrigger>
                    <SelectContent>
                      {data?.member_workload?.map((m) => (
                        <SelectItem key={m.member_id} value={m.member_id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                    <a href={item.link}><ArrowUpRight className="h-4 w-4" /></a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
