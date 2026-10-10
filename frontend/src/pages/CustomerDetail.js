import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Phone, Building2, MapPin, FileText, CreditCard, CheckSquare, Plus, MessageSquare, AlertTriangle, ShieldCheck, Clock, Zap, Star } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { usePersonalization } from "@/context/PersonalizationContext";
import { useTabTitle } from "@/hooks/useTabTitle";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/States";
import { InvoiceModal } from "@/components/modules/InvoiceModal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CollaborationSection } from "@/components/common/CollaborationSection";
import { toast } from "sonner";

function Kpi({ label, value, tone }) {
  return (
    <Card className="border-border/70 bg-card/90 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1.5 font-mono text-2xl font-extrabold ${tone || ""}`}>{value}</p>
    </Card>
  );
}

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { format } = useCurrency();
  const { isFavorite, toggleFavorite, logRecent } = usePersonalization();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  
  // Note / Interaction Modal state
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteType, setNoteType] = useState("note");
  const [noteContent, setNoteContent] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/customers/${id}/history`)
      .then(({ data }) => {
        setData(data);
        setError(null);
        if (data?.customer?.name) {
          logRecent({ type: "customer", id, title: data.customer.name, path: `/customers/${id}` });
        }
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [id, logRecent]);
  useEffect(load, [load]);
  useTabTitle(data?.customer?.name);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    setSubmittingNote(true);
    try {
      await api.post(`/customers/${id}/notes`, { note: noteContent, type: noteType });
      toast.success("Interaction logged successfully");
      setNoteContent("");
      setNoteOpen(false);
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmittingNote(false);
    }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-40 rounded-xl" /></div>;
  if (error) return <ErrorState message={formatApiError(error)} onRetry={load} />;

  const c = data.customer;
  const insights = data.insights || {};
  const initials = (c.name || "C").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  const getTierColor = (tier) => {
    switch (tier) {
      case "VIP": return "bg-amber-500/15 text-amber-600 border-amber-500/30";
      case "At-Risk": return "bg-red-500/15 text-red-600 border-red-500/30";
      case "New": return "bg-blue-500/15 text-blue-600 border-blue-500/30";
      default: return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    }
  };

  return (
    <div className="space-y-6 animate-in-up">
      <Button variant="ghost" size="sm" onClick={() => navigate("/customers")} data-testid="back-to-customers" className="-ml-2">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Customers
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 border border-border/60">
            <AvatarFallback className="bg-primary/15 text-lg font-bold text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight" data-testid="customer-detail-name">{c.name}</h1>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleFavorite({ type: "customer", id, title: c.name, path: `/customers/${id}` })}
                title={isFavorite("customer", id) ? "Remove from starred" : "Star this customer"}
                className="h-8 w-8"
                data-testid="star-customer-button"
              >
                <Star className={`h-4 w-4 ${isFavorite("customer", id) ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`} />
              </Button>
              {insights.tier && (
                <Badge variant="outline" className={`font-semibold ${getTierColor(insights.tier)}`}>
                  {insights.tier} Tier
                </Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {c.company && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{c.company}</span>}
              {c.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{c.email}</span>}
              {c.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{c.phone}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={c.status} />
          <Button variant="outline" size="sm" onClick={() => setNoteOpen(true)}>
            <MessageSquare className="mr-1.5 h-4 w-4" /> Log Note
          </Button>
          <Button size="sm" onClick={() => setInvoiceOpen(true)} data-testid="customer-new-invoice">
            <Plus className="mr-1.5 h-4 w-4" /> New Invoice
          </Button>
        </div>
      </div>

      {/* Smart Context & Risk Insights Card */}
      <Card className="border-border/70 bg-card/90 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Zap className="h-4 w-4 text-amber-500" /> Customer Context & Insights
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {insights.buying_cadence || "Regular"}
          </span>
        </div>
        
        {insights.risk_alerts?.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {insights.risk_alerts.map((alert, idx) => (
              <Badge key={idx} variant="secondary" className="bg-amber-500/10 text-amber-600 border border-amber-500/20 py-1 px-3 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> {alert}
              </Badge>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
            <ShieldCheck className="h-4 w-4" /> Account in excellent standing. No payment risk or overdue balance.
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total Sales" value={format(data.total_sales)} tone="text-emerald-500" />
        <Kpi label="Outstanding" value={format(data.outstanding)} tone={data.outstanding > 0 ? "text-amber-500" : ""} />
        <Kpi label="Total Paid" value={format(data.total_paid)} />
        <Kpi label="Invoices" value={data.invoice_count} />
      </div>

      <Tabs defaultValue="timeline">
        <TabsList data-testid="customer-tabs">
          <TabsTrigger value="timeline">Activity Timeline ({data?.timeline?.length || 0})</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({data?.invoices?.length || 0})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({data?.payments?.length || 0})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({data?.tasks?.length || 0})</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <Card className="border-border/70 bg-card/90">
            {!data.timeline || data.timeline.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">No recent activity recorded.</p>
            ) : (
              <div className="divide-y divide-border/50">
                {(data.timeline || []).map((evt) => (
                  <div key={evt.id} className="flex items-start justify-between px-5 py-3.5 hover:bg-accent/30 transition-colors">
                    <div className="flex items-start gap-3">
                      {evt.type === "invoice" && <FileText className="h-4 w-4 text-blue-500 mt-0.5" />}
                      {evt.type === "payment" && <CreditCard className="h-4 w-4 text-emerald-500 mt-0.5" />}
                      {evt.type === "task" && <CheckSquare className="h-4 w-4 text-purple-500 mt-0.5" />}
                      {evt.type === "note" && <MessageSquare className="h-4 w-4 text-amber-500 mt-0.5" />}
                      <div>
                        <p className="text-sm font-medium">{evt.title}</p>
                        <p className="text-xs text-muted-foreground">{evt.description}</p>
                        {evt.author && <p className="text-[11px] text-muted-foreground mt-0.5">Logged by {evt.author}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground font-mono">{formatDate(evt.date)}</p>
                      {evt.link && (
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => navigate(evt.link)}>
                          View
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card className="border-border/70 bg-card/90">
            {(data?.invoices || []).length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted-foreground">No invoices.</p> :
              <div className="divide-y divide-border/50">
                {(data.invoices || []).map((inv) => (
                  <div key={inv.id} className="flex cursor-pointer items-center justify-between px-5 py-3 hover:bg-accent/40" onClick={() => navigate(`/invoices/${inv.id}`)} data-testid={`customer-invoice-${inv.id}`}>
                    <div className="flex items-center gap-3"><FileText className="h-4 w-4 text-muted-foreground" />
                      <div><p className="font-mono text-sm font-medium">{inv.invoice_number}</p><p className="text-xs text-muted-foreground">{formatDate(inv.issue_date)}</p></div></div>
                    <div className="flex items-center gap-3"><span className="font-mono text-sm font-semibold">{format(inv.total)}</span><StatusBadge status={inv.status} /></div>
                  </div>
                ))}
              </div>}
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card className="border-border/70 bg-card/90">
            {(data?.payments || []).length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted-foreground">No payments.</p> :
              <div className="divide-y divide-border/50">
                {(data.payments || []).map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3"><CreditCard className="h-4 w-4 text-emerald-500" />
                      <div><p className="text-sm font-medium">{p.invoice_number}</p><p className="text-xs text-muted-foreground capitalize">{String(p.method).replace(/_/g, " ")} · {formatDate(p.date)}</p></div></div>
                    <span className="font-mono text-sm font-semibold text-emerald-500">{format(p.amount)}</span>
                  </div>
                ))}
              </div>}
          </Card>
        </TabsContent>

        <TabsContent value="tasks">
          <Card className="border-border/70 bg-card/90">
            {(data?.tasks || []).length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted-foreground">No related tasks.</p> :
              <div className="divide-y divide-border/50">
                {(data.tasks || []).map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3"><CheckSquare className="h-4 w-4 text-muted-foreground" />
                      <div><p className="text-sm font-medium">{t.title}</p><p className="text-xs text-muted-foreground">Due {formatDate(t.due_date)}</p></div></div>
                    <StatusBadge status={t.status} />
                  </div>
                ))}
              </div>}
          </Card>
        </TabsContent>

        <TabsContent value="about">
          <Card className="border-border/70 bg-card/90 p-6 space-y-3 text-sm">
            <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{[c.address, c.city, c.country].filter(Boolean).join(", ") || "No address on file"}</p>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</p><p className="mt-1 text-muted-foreground">{c.notes || "No notes."}</p></div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Team Handoffs, Notes & @Mentions */}
      <CollaborationSection targetType="customer" targetId={id} title="Customer Handoffs & Team Notes" />

      {/* Log Interaction Modal */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Log Interaction / Note</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddNote} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="type">Interaction Type</Label>
              <Select value={noteType} onValueChange={setNoteType}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">General Note</SelectItem>
                  <SelectItem value="call">Phone Call</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">Details</Label>
              <Textarea
                id="note"
                placeholder="What was discussed or noted?"
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={4}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNoteOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submittingNote}>
                {submittingNote ? "Saving..." : "Save Interaction"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <InvoiceModal open={invoiceOpen} onOpenChange={setInvoiceOpen} defaultCustomerId={c.id} onSaved={load} />
    </div>
  );
}
