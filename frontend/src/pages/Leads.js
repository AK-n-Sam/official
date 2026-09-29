import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Target, UserPlus, MoreHorizontal } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useResource } from "@/hooks/useResource";
import { useCurrency } from "@/context/CurrencyContext";
import { PageHeader } from "@/components/common/PageHeader";
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
  const { data, loading, refetch } = useResource("/leads", {});
  const [members, setMembers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    api.get("/team").then(({ data }) => setMembers(data)).catch(() => {});
  }, []);

  const fields = useMemo(() => FIELDS.map((f) => (
    f.name === "owner_id"
      ? { ...f, options: members.map((m) => ({ value: m.id, label: m.name + (m.is_you ? " (you)" : "") })) }
      : f
  )), [members]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setEditing(null); setModalOpen(true);
      const p = new URLSearchParams(searchParams); p.delete("new"); setSearchParams(p, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (payload) => {
    const m = members.find((x) => x.id === payload.owner_id);
    payload.owner = m ? m.name : "";
    try {
      if (editing) { await api.put(`/leads/${editing.id}`, payload); toast.success("Lead updated"); }
      else { await api.post("/leads", payload); toast.success("Lead created"); }
      refetch();
    } catch (e) { toast.error(formatApiError(e)); throw e; }
  };
  const moveStage = async (lead, stage) => {
    try { await api.put(`/leads/${lead.id}`, { stage }); refetch(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const convert = async (lead) => {
    try { await api.post(`/leads/${lead.id}/convert`); toast.success(`${lead.company || lead.name} converted to customer`); refetch(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const remove = async () => {
    try { await api.delete(`/leads/${deleting.id}`); toast.success("Lead deleted"); setDeleting(null); refetch(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const stageTotal = (key) => data.filter((l) => l.stage === key).reduce((s, l) => s + (l.value || 0), 0);

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader title="Sales Pipeline" subtitle="Track leads from first contact to won deals.">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} data-testid="create-lead-button">
          <Plus className="mr-2 h-4 w-4" /> New Lead
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {STAGES.map((stage) => {
          const leads = data.filter((l) => l.stage === stage.key);
          return (
            <div key={stage.key} className="space-y-3" data-testid={`lead-column-${stage.key}`}>
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{stage.label}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{leads.length}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{format(stageTotal(stage.key))}</span>
              </div>
              <div className="space-y-2.5">
                {loading ? <Skeleton className="h-24 rounded-xl" /> : leads.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/60 py-6 text-center text-xs text-muted-foreground">Empty</div>
                ) : leads.map((l) => (
                  <Card key={l.id} className="border-border/70 bg-card/90 p-4" data-testid={`lead-card-${l.id}`}>
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
                          <DropdownMenuItem onClick={() => convert(l)} data-testid={`convert-lead-${l.id}`}><UserPlus className="mr-2 h-4 w-4" /> Convert to customer</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setEditing(l); setModalOpen(true); }}>Edit</DropdownMenuItem>
                          <DropdownMenuItem className="text-rose-500 focus:text-rose-500" onClick={() => setDeleting(l)}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-foreground">{format(l.value || 0)}</span>
                      <span className="text-muted-foreground">{l.owner || "—"}</span>
                    </div>
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
