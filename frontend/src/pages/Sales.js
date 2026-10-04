import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Plus, Target, UserPlus, MoreHorizontal, Trophy, Percent, TrendingUp, UserCheck, Zap, ArrowRight, BarChart3, CreditCard } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import api, { formatApiError } from "@/lib/api";
import { useResource } from "@/hooks/useResource";
import { useCreateParam } from "@/hooks/useCreateParam";
import { useCurrency } from "@/context/CurrencyContext";
import { CURRENCIES, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/PageHeader";
import { SummaryCard } from "@/components/common/SummaryCard";
import { CrudModal } from "@/components/common/CrudModal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { AutomationModal } from "@/components/common/AutomationModal";
import { DataTable } from "@/components/common/DataTable";
import { TableSkeleton, ErrorState } from "@/components/common/States";
import { EmptyState } from "@/components/common/EmptyState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const STAGES = [
  { key: "lead", label: "Lead" },
  { key: "qualified", label: "Qualified" },
  { key: "proposal", label: "Proposal" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

const FIELDS = [
  { name: "name", label: "Contact / Deal Name", required: true, full: true },
  { name: "company", label: "Company / Prospect" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone" },
  { name: "value", label: "Estimated Deal Value (USD)", type: "number", min: 0, default: 0 },
  { name: "owner_id", label: "Deal Owner", type: "member" },
  { name: "stage", label: "Stage", type: "select", default: "lead", options: STAGES.map((s) => ({ value: s.key, label: s.label })) },
  { name: "source", label: "Source", type: "select", default: "Website", options: [
    { value: "Website", label: "Website" }, { value: "Referral", label: "Referral" },
    { value: "Cold Outreach", label: "Cold Outreach" }, { value: "Event", label: "Event" }] },
  { name: "notes", label: "Notes", type: "textarea", full: true },
];

export default function Sales() {
  const { format, currency } = useCurrency();
  const navigate = useNavigate();
  const { data: leads, loading, refetch, setData } = useResource("/leads", {});
  const { data: payments } = useResource("/payments", {});
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState("pipeline");
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(null);
  const [members, setMembers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [automationModalOpen, setAutomationModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    api.get("/team").then(({ data }) => setMembers(data)).catch(() => {});
    api.get("/dashboard/stats").then(({ data }) => setStats(data)).catch(() => {});
  }, []);

  const rate = CURRENCIES[currency]?.rate || 1;

  const fields = useMemo(() => FIELDS.map((f) => (
    f.name === "owner_id"
      ? { ...f, options: members.map((m) => ({ value: m.id, label: m.name + (m.is_you ? " (you)" : "") })) }
      : f
  )), [members]);

  useCreateParam(() => { setEditing(null); setModalOpen(true); });

  const submit = async (payload) => {
    const m = members.find((x) => x.id === payload.owner_id);
    payload.owner = m ? m.name : "";
    try {
      if (editing) { await api.put(`/leads/${editing.id}`, payload); toast.success("Deal updated"); }
      else { await api.post("/leads", payload); toast.success("Deal created"); }
      refetch();
    } catch (e) { toast.error(formatApiError(e)); throw e; }
  };

  const convert = async (lead) => {
    try {
      const { data: customer } = await api.post(`/leads/${lead.id}/convert`);
      toast.success(`${lead.company || lead.name} converted to customer`, {
        action: { label: "Open Customer", onClick: () => navigate(`/customers/${customer.id}`) },
      });
      refetch();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const moveStage = async (lead, stage) => {
    const previous = leads;
    setData((rows) => rows.map((l) => (l.id === lead.id ? { ...l, stage } : l)));
    try {
      await api.put(`/leads/${lead.id}`, { stage });
      if (stage === "won" && !lead.customer_id) {
        toast.success(`${lead.company || lead.name} won!`, {
          description: "Turn this deal into a customer to issue invoices.",
          action: { label: "Convert to Customer", onClick: () => convert(lead) },
        });
      }
    } catch (e) { setData(previous); toast.error(formatApiError(e)); }
  };

  const dropOn = (stage) => (e) => {
    e.preventDefault();
    setOverStage(null);
    const lead = leads.find((l) => l.id === e.dataTransfer.getData("text/plain"));
    if (lead && lead.stage !== stage.key) moveStage(lead, stage.key);
  };

  const remove = async () => {
    try { await api.delete(`/leads/${deleting.id}`); toast.success("Deal deleted"); setDeleting(null); refetch(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const stageTotal = (key) => leads.filter((l) => l.stage === key).reduce((s, l) => s + (l.value || 0), 0);
  const openDeals = leads.filter((l) => !["won", "lost"].includes(l.stage));
  const openValue = openDeals.reduce((s, l) => s + (l.value || 0), 0);
  const wonCount = leads.filter((l) => l.stage === "won").length;
  const lostCount = leads.filter((l) => l.stage === "lost").length;
  const closedCount = wonCount + lostCount;

  const paymentColumns = [
    { key: "invoice_number", label: "Invoice", render: (r) => <span className="font-mono">{r.invoice_number}</span> },
    { key: "customer_name", label: "Customer" },
    { key: "amount", label: "Amount", render: (r) => <span className="font-mono font-semibold text-emerald-500">{format(r.amount)}</span> },
    { key: "method", label: "Method", render: (r) => <span className="capitalize">{String(r.method).replace(/_/g, " ")}</span> },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
  ];

  return (
    <div className="space-y-6 animate-in-up">
      {/* Module Standard Header */}
      <PageHeader
        title="Sales Workspace & Pipeline"
        subtitle="Track deals from initial lead contact to won revenue. Simple visual pipeline: Lead → Qualified → Proposal → Won/Lost."
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAutomationModalOpen(true)} className="gap-1.5 text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
            <Zap className="h-3.5 w-3.5 text-emerald-500" />
            <span>Automate (WHEN → DO)</span>
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5 text-xs font-semibold" data-testid="create-lead-button">
            <Plus className="h-4 w-4" />
            <span>New Lead / Deal</span>
          </Button>
        </div>
      </PageHeader>

      {/* Module Summary Metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="pipeline-summary">
        <SummaryCard label="Open Pipeline Value" value={format(openValue)} sub={`${openDeals.length} open deal${openDeals.length === 1 ? "" : "s"}`} icon={Target} tone="text-primary" />
        <SummaryCard label="Won Revenue" value={format(stageTotal("won"))} sub={`${wonCount} deal${wonCount === 1 ? "" : "s"} closed won`} icon={Trophy} tone="text-emerald-500" />
        <SummaryCard label="Win Rate" value={closedCount ? `${Math.round((wonCount / closedCount) * 100)}%` : "—"} sub={`${wonCount} won · ${lostCount} lost`} icon={Percent} />
        <SummaryCard label="Avg. Deal Size" value={format(openDeals.length ? openValue / openDeals.length : 0)} sub="Lead, qualified & proposal" icon={TrendingUp} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card border border-border/70 p-1">
          <TabsTrigger value="pipeline" className="gap-1.5 text-xs">
            <Target className="h-3.5 w-3.5" /> Pipeline Kanban
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-1.5 text-xs">
            <BarChart3 className="h-3.5 w-3.5" /> Revenue Performance
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-xs">
            <CreditCard className="h-3.5 w-3.5" /> Payment Stream
          </TabsTrigger>
        </TabsList>

        {/* PIPELINE KANBAN */}
        <TabsContent value="pipeline" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {STAGES.map((stage) => {
              const stageLeads = leads.filter((l) => l.stage === stage.key);
              return (
                <div
                  key={stage.key}
                  data-testid={`lead-column-${stage.key}`}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overStage !== stage.key) setOverStage(stage.key); }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverStage(null); }}
                  onDrop={dropOn(stage)}
                  className={cn("space-y-3 rounded-xl p-2 bg-card/60 border border-border/60 transition-colors min-h-[380px]", dragId && "bg-muted/40", overStage === stage.key && "bg-primary/10 ring-2 ring-primary/40")}
                >
                  <div className="flex items-center justify-between px-1 pb-2 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">{stage.label}</h3>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono font-bold text-muted-foreground">{stageLeads.length}</span>
                    </div>
                    <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">{format(stageTotal(stage.key))}</span>
                  </div>

                  <div className="space-y-2.5">
                    {stageLeads.map((lead) => (
                      <Card
                        key={lead.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", lead.id); setDragId(lead.id); }}
                        onDragEnd={() => setDragId(null)}
                        className="p-3 space-y-2 border-border/80 hover:border-primary/50 transition-all cursor-grab active:cursor-grabbing shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-foreground leading-tight">{lead.name}</p>
                            {lead.company && <p className="text-[11px] text-muted-foreground">{lead.company}</p>}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setEditing(lead); setModalOpen(true); }}>Edit Deal</DropdownMenuItem>
                              {!lead.customer_id && (
                                <DropdownMenuItem onClick={() => convert(lead)}>Convert to Customer</DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="text-red-500" onClick={() => setDeleting(lead)}>Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{format(lead.value || 0)}</span>
                          <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{lead.owner || "Unassigned"}</span>
                        </div>

                        {/* Fast stage change pill */}
                        <div className="pt-1 flex items-center justify-between">
                          <select
                            value={lead.stage}
                            onChange={(e) => moveStage(lead, e.target.value)}
                            className="text-[10px] bg-muted/60 border border-border/50 rounded px-1.5 py-0.5 font-medium outline-none"
                          >
                            {STAGES.map((s) => (
                              <option key={s.key} value={s.key}>{s.label}</option>
                            ))}
                          </select>
                          {lead.stage === "won" && !lead.customer_id && (
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] text-emerald-600 px-1 gap-1" onClick={() => convert(lead)}>
                              <span>Convert</span>
                              <ArrowRight className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* REVENUE PERFORMANCE */}
        <TabsContent value="performance" className="space-y-4">
          {stats && (
            <Card className="border-border/70 bg-card p-5" data-testid="sales-bar-chart">
              <h3 className="mb-4 font-heading text-base font-semibold">Monthly Revenue Stream</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stats.sales_trend} margin={{ left: -12, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${CURRENCIES[currency]?.symbol || "$"}${Math.round(v * rate / 1000)}k`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} formatter={(v) => [format(v), "Revenue"]} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
                  <Bar dataKey="sales" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </TabsContent>

        {/* PAYMENT HISTORY */}
        <TabsContent value="history" className="space-y-4">
          <Card className="border-border bg-card p-5">
            <h3 className="mb-3 font-heading text-base font-semibold">Recent Payment Transactions</h3>
            {payments.length === 0 ? (
              <EmptyState icon={TrendingUp} title="No payments recorded yet" description="Payments appear here automatically as invoices are paid." />
            ) : (
              <DataTable columns={paymentColumns} rows={payments} testId="payments-table" />
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Crud Modal for Lead Creation */}
      <CrudModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editing ? "Edit Deal" : "New Lead / Deal"}
        fields={fields}
        initial={editing}
        onSubmit={submit}
      />

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete Deal?"
        description={`Are you sure you want to delete ${deleting?.name}?`}
        onConfirm={remove}
      />

      {/* Contextual Automation Modal */}
      <AutomationModal
        open={automationModalOpen}
        onOpenChange={setAutomationModalOpen}
        defaultModule="Sales"
      />
    </div>
  );
}
