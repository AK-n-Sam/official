import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Plus, Target, UserPlus, MoreHorizontal, Trophy, Percent, TrendingUp, UserCheck } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useResource } from "@/hooks/useResource";
import { useCreateParam } from "@/hooks/useCreateParam";
import { useCurrency } from "@/context/CurrencyContext";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/PageHeader";
import { SummaryCard } from "@/components/common/SummaryCard";
import { CrudModal } from "@/components/common/CrudModal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const STAGES = [
  { key: "lead", label: "Lead" },
  { key: "qualified", label: "Qualified" },
  { key: "proposal", label: "Proposal" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

const FIELDS = [
  { name: "name", label: "Contact Name", required: true, full: true },
  { name: "company", label: "Company" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone" },
  { name: "value", label: "Estimated Value (USD)", type: "number", min: 0, default: 0 },
  { name: "owner_id", label: "Owner", type: "member" },
  { name: "stage", label: "Stage", type: "select", default: "lead", options: STAGES.map((s) => ({ value: s.key, label: s.label })) },
  { name: "source", label: "Source", type: "select", default: "Website", options: [
    { value: "Website", label: "Website" }, { value: "Referral", label: "Referral" },
    { value: "Cold Outreach", label: "Cold Outreach" }, { value: "Event", label: "Event" }] },
  { name: "notes", label: "Notes", type: "textarea", full: true },
];

export default function Leads() {
  const { format } = useCurrency();
  const navigate = useNavigate();
  const { data, loading, refetch, setData } = useResource("/leads", {});
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(null);
  const [members, setMembers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    api.get("/team").then(({ data }) => setMembers(Array.isArray(data) ? data : [])).catch(() => setMembers([]));
  }, []);

  const safeMembers = useMemo(() => (Array.isArray(members) ? members : []), [members]);

  const fields = useMemo(() => FIELDS.map((f) => (
    f.name === "owner_id"
      ? { ...f, options: safeMembers.map((m) => ({ value: m.id, label: m.name + (m.is_you ? " (you)" : "") })) }
      : f
  )), [safeMembers]);

  useCreateParam(() => { setEditing(null); setModalOpen(true); });

  const submit = async (payload) => {
    const m = safeMembers.find((x) => x.id === payload.owner_id);
    payload.owner = m ? m.name : "";
    try {
      if (editing) { await api.put(`/leads/${editing.id}`, payload); toast.success("Lead updated"); }
      else { await api.post("/leads", payload); toast.success("Lead created"); }
      refetch();
    } catch (e) { toast.error(formatApiError(e)); throw e; }
  };
  const convert = async (lead) => {
    try {
      const { data: customer } = await api.post(`/leads/${lead.id}/convert`);
      toast.success(`${lead.company || lead.name} converted to customer`, {
        action: { label: "Open", onClick: () => navigate(`/customers/${customer.id}`) },
      });
      refetch();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  // Optimistic: the card moves immediately and snaps back if the save fails.
  const moveStage = async (lead, stage) => {
    const previous = data;
    setData((rows) => rows.map((l) => (l.id === lead.id ? { ...l, stage } : l)));
    try {
      await api.put(`/leads/${lead.id}`, { stage });
      if (stage === "won" && !lead.customer_id) {
        toast.success(`${lead.company || lead.name} won`, {
          description: "Turn it into a customer to start invoicing.",
          action: { label: "Convert to customer", onClick: () => convert(lead) },
        });
      }
    } catch (e) { setData(previous); toast.error(formatApiError(e)); }
  };
  const dropOn = (stage) => (e) => {
    e.preventDefault();
    setOverStage(null);
    const lead = data.find((l) => l.id === e.dataTransfer.getData("text/plain"));
    if (lead && lead.stage !== stage.key) moveStage(lead, stage.key);
  };
  const remove = async () => {
    try { await api.delete(`/leads/${deleting.id}`); toast.success("Lead deleted"); setDeleting(null); refetch(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const stageTotal = (key) => data.filter((l) => l.stage === key).reduce((s, l) => s + (l.value || 0), 0);
  const openDeals = data.filter((l) => !["won", "lost"].includes(l.stage));
  const openValue = openDeals.reduce((s, l) => s + (l.value || 0), 0);
  const wonCount = data.filter((l) => l.stage === "won").length;
  const lostCount = data.filter((l) => l.stage === "lost").length;
  const closedCount = wonCount + lostCount;

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader title="Sales Pipeline" subtitle="Track leads from first contact to won deals.">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} data-testid="create-lead-button">
          <Plus className="mr-2 h-4 w-4" /> New Lead
        </Button>
      </PageHeader>

      {!loading && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="pipeline-summary">
          <SummaryCard label="Open pipeline" value={format(openValue)} sub={`${openDeals.length} open deal${openDeals.length === 1 ? "" : "s"}`} icon={Target} tone="text-primary" />
          <SummaryCard label="Won" value={format(stageTotal("won"))} sub={`${wonCount} deal${wonCount === 1 ? "" : "s"} closed`} icon={Trophy} tone="text-emerald-500" />
          <SummaryCard label="Win rate" value={closedCount ? `${Math.round((wonCount / closedCount) * 100)}%` : "—"} sub={`${wonCount} won · ${lostCount} lost`} icon={Percent} />
          <SummaryCard label="Avg. open deal" value={format(openDeals.length ? openValue / openDeals.length : 0)} sub="Lead, qualified & proposal" icon={TrendingUp} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {STAGES.map((stage) => {
          const leads = data.filter((l) => l.stage === stage.key);
          return (
            <div
              key={stage.key}
              data-testid={`lead-column-${stage.key}`}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overStage !== stage.key) setOverStage(stage.key); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverStage(null); }}
              onDrop={dropOn(stage)}
              className={cn("space-y-3 rounded-xl p-1.5 transition-colors", dragId && "bg-muted/40", overStage === stage.key && "bg-primary/10 ring-2 ring-primary/40")}
            >
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{stage.label}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{leads.length}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{format(stageTotal(stage.key))}</span>
              </div>
              <div className="space-y-2.5">
                {loading ? <Skeleton className="h-24 rounded-xl" /> : leads.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/60 py-6 text-center text-xs text-muted-foreground">{dragId ? "Drop here" : "Empty"}</div>
                ) : leads.map((l) => (
                  <Card
                    key={l.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", l.id); e.dataTransfer.effectAllowed = "move"; setDragId(l.id); }}
                    onDragEnd={() => { setDragId(null); setOverStage(null); }}
                    className={cn("cursor-grab border-border/70 bg-card/90 p-4 active:cursor-grabbing", dragId === l.id && "opacity-50")}
                    data-testid={`lead-card-${l.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{l.company || l.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{l.name}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {STAGES.filter((s) => s.key !== l.stage).map((s) => (
                            <DropdownMenuItem key={s.key} onClick={() => moveStage(l, s.key)} data-testid={`move-lead-${l.id}-${s.key}`}>Move to {s.label}</DropdownMenuItem>
                          ))}
                          {l.customer_id ? (
                            <DropdownMenuItem onClick={() => navigate(`/customers/${l.customer_id}`)} data-testid={`open-customer-${l.id}`}><UserCheck className="mr-2 h-4 w-4" /> Open customer</DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => convert(l)} data-testid={`convert-lead-${l.id}`}><UserPlus className="mr-2 h-4 w-4" /> Convert to customer</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => { setEditing(l); setModalOpen(true); }}>Edit</DropdownMenuItem>
                          <DropdownMenuItem className="text-rose-500 focus:text-rose-500" onClick={() => setDeleting(l)}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-foreground">{format(l.value || 0)}</span>
                      <span className="text-muted-foreground">{l.owner || "—"}</span>
                    </div>
                    {l.customer_id && (
                      <button type="button" onClick={() => navigate(`/customers/${l.customer_id}`)} data-testid={`lead-customer-link-${l.id}`}
                        className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400">
                        <UserCheck className="h-3 w-3" /> Customer
                      </button>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <CrudModal open={modalOpen} onOpenChange={setModalOpen} title={editing ? "Edit Lead" : "New Lead"}
        fields={fields} initial={editing} onSubmit={submit} submitLabel={editing ? "Save changes" : "Create Lead"} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete lead?" description={`This will remove "${deleting?.company || deleting?.name}".`} onConfirm={remove} />
    </div>
  );
}
