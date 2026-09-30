import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, FileText, DollarSign, Send, Clock, XCircle, AlertTriangle, FilePen, Wallet } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useResource } from "@/hooks/useResource";
import { useDebounce } from "@/hooks/useDebounce";
import { useCreateParam } from "@/hooks/useCreateParam";
import { useCurrency } from "@/context/CurrencyContext";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/common/PageHeader";
import { SummaryCard } from "@/components/common/SummaryCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { TableSkeleton, ErrorState } from "@/components/common/States";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { InvoiceModal } from "@/components/modules/InvoiceModal";
import { RecordPaymentModal } from "@/components/modules/RecordPaymentModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/common/DataTable";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

// Statuses that still expect money in. "pending" is the legacy spelling of "sent".
const UNPAID = ["sent", "pending", "partially_paid", "overdue"];
const TAB_FILTERS = {
  all: () => true,
  unpaid: (r) => UNPAID.includes(r.status),
  draft: (r) => r.status === "draft",
  sent: (r) => r.status === "sent" || r.status === "pending",
  partially_paid: (r) => r.status === "partially_paid",
  paid: (r) => r.status === "paid",
  overdue: (r) => r.status === "overdue",
  cancelled: (r) => r.status === "cancelled",
};
const STATUSES = Object.keys(TAB_FILTERS);

const balanceOf = (r) => (r.total || 0) - (r.amount_paid || 0);
const today = () => new Date().toISOString().slice(0, 10);

export default function Invoices() {
  const { format } = useCurrency();
  const navigate = useNavigate();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [prefillCustomer, setPrefillCustomer] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [payFor, setPayFor] = useState(null);

  const openCreate = (customerId = "") => { setEditing(null); setPrefillCustomer(customerId); setModalOpen(true); };
  useCreateParam(({ customer }) => openCreate(customer || ""));

  // Load every invoice once (per search) and filter by status locally, so tab counts and
  // the summary cards always reflect the whole list and switching tabs is instant.
  const { data, loading, error, refetch } = useResource("/invoices", debounced ? { search: debounced } : {});

  const counts = useMemo(
    () => Object.fromEntries(STATUSES.map((s) => [s, data.filter(TAB_FILTERS[s]).length])),
    [data]
  );
  const summary = useMemo(() => {
    const unpaid = data.filter(TAB_FILTERS.unpaid);
    const overdue = data.filter(TAB_FILTERS.overdue);
    return {
      outstanding: unpaid.reduce((s, r) => s + balanceOf(r), 0),
      overdue: overdue.reduce((s, r) => s + balanceOf(r), 0),
      collected: data.reduce((s, r) => s + (r.amount_paid || 0), 0),
    };
  }, [data]);
  const rows = useMemo(() => data.filter(TAB_FILTERS[status]), [data, status]);

  const handleDelete = async () => {
    try { await api.delete(`/invoices/${deleting.id}`); toast.success("Invoice deleted"); setDeleting(null); refetch(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const setInvStatus = async (inv, s) => {
    try { await api.post(`/invoices/${inv.id}/status`, { status: s }); toast.success(`${inv.invoice_number} marked ${s.replace(/_/g, " ")}`); refetch(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const toggleStatus = (s) => setStatus((cur) => (cur === s ? "all" : s));

  const columns = [
    { key: "invoice_number", label: "Invoice", render: (r) => <span className="font-mono font-medium">{r.invoice_number}</span> },
    { key: "customer_name", label: "Customer", render: (r) => r.customer_name || "—" },
    { key: "issue_date", label: "Issued", render: (r) => formatDate(r.issue_date) },
    { key: "due_date", label: "Due", render: (r) => {
      const late = UNPAID.includes(r.status) && r.due_date && r.due_date < today();
      return <span className={late ? "font-medium text-rose-500" : ""} title={late ? "Past due" : undefined}>{formatDate(r.due_date)}</span>;
    } },
    { key: "total", label: "Total", render: (r) => <span className="font-mono font-semibold">{format(r.total)}</span> },
    { key: "balance", label: "Balance", sortValue: balanceOf, render: (r) => (
      <span className={balanceOf(r) > 0 && r.status !== "cancelled" ? "font-mono text-amber-500" : "font-mono text-muted-foreground"}>{format(balanceOf(r))}</span>
    ) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    // One-click "next step" for the row, so the common path doesn't need the actions menu.
    { key: "next", label: "", sortable: false, className: "w-px whitespace-nowrap py-1 text-right", render: (r) => {
      if (r.status === "draft") {
        return (
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" data-testid={`quick-send-${r.id}`}
            onClick={(e) => { e.stopPropagation(); setInvStatus(r, "sent"); }}>
            <Send className="mr-1.5 h-3.5 w-3.5" /> Mark sent
          </Button>
        );
      }
      if (UNPAID.includes(r.status) && balanceOf(r) > 0) {
        return (
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" data-testid={`quick-pay-${r.id}`}
            onClick={(e) => { e.stopPropagation(); setPayFor(r); }}>
            <DollarSign className="mr-1 h-3.5 w-3.5" /> Record payment
          </Button>
        );
      }
      return null;
    } },
  ];

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader title="Invoices" subtitle="Create, track and collect on your invoices.">
        <Button onClick={() => openCreate()} data-testid="create-invoice-button">
          <Plus className="mr-2 h-4 w-4" /> New Invoice
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="invoice-summary">
        <SummaryCard label="Outstanding" value={format(summary.outstanding)} sub={`${counts.unpaid} unpaid invoice${counts.unpaid === 1 ? "" : "s"}`}
          icon={Wallet} tone="text-amber-500" active={status === "unpaid"} onClick={() => toggleStatus("unpaid")} testId="invoice-summary-unpaid" />
        <SummaryCard label="Overdue" value={format(summary.overdue)} sub={counts.overdue ? `${counts.overdue} need${counts.overdue === 1 ? "s" : ""} follow-up` : "Nothing overdue"}
          icon={AlertTriangle} tone={counts.overdue ? "text-rose-500" : undefined} active={status === "overdue"} onClick={() => toggleStatus("overdue")} testId="invoice-summary-overdue" />
        <SummaryCard label="Drafts" value={counts.draft} sub={counts.draft ? "Ready to send" : "No drafts"}
          icon={FilePen} active={status === "draft"} onClick={() => toggleStatus("draft")} testId="invoice-summary-draft" />
        <SummaryCard label="Collected" value={format(summary.collected)} sub={`${counts.paid} paid in full`}
          icon={DollarSign} tone="text-emerald-500" active={status === "paid"} onClick={() => toggleStatus("paid")} testId="invoice-summary-paid" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList data-testid="invoice-status-tabs" className="h-auto flex-wrap">
            {STATUSES.map((s) => (
              <TabsTrigger key={s} value={s} className="gap-1.5 capitalize" data-testid={`invoice-tab-${s}`}>
                {s.replace(/_/g, " ")}
                {!loading && <span className="rounded bg-foreground/10 px-1.5 text-[10px] font-semibold tabular-nums">{counts[s]}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative lg:max-w-xs lg:flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number or customer..." className="pl-9" data-testid="invoice-search" />
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border/80 bg-card/90"><TableSkeleton /></div>
      ) : error ? (
        <ErrorState message={formatApiError(error)} onRetry={refetch} />
      ) : rows.length === 0 ? (
        data.length === 0 && !debounced ? (
          <EmptyState icon={FileText} title="No invoices yet" description="Create your first invoice to start billing customers."
            actionLabel="New Invoice" onAction={() => openCreate()} testId="invoices-empty" />
        ) : (
          <EmptyState icon={FileText} title="No invoices match" description="Try another status tab or search term." testId="invoices-empty" />
        )
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          testId="invoices-table"
          onRowClick={(row) => navigate(`/invoices/${row.id}`)}
          onEdit={(row) => { setEditing(row); setModalOpen(true); }}
          onDelete={(row) => setDeleting(row)}
          rowActions={(row) => (
            <>
              {balanceOf(row) > 0 && row.status !== "cancelled" && (
                <DropdownMenuItem onClick={() => setPayFor(row)} data-testid={`record-payment-${row.id}`}>
                  <DollarSign className="mr-2 h-4 w-4" /> Record payment
                </DropdownMenuItem>
              )}
              {row.status === "draft" && (
                <DropdownMenuItem onClick={() => setInvStatus(row, "sent")} data-testid={`mark-sent-${row.id}`}>
                  <Send className="mr-2 h-4 w-4" /> Mark sent
                </DropdownMenuItem>
              )}
              {!["paid", "cancelled"].includes(row.status) && (
                <DropdownMenuItem onClick={() => setInvStatus(row, "paid")} data-testid={`mark-paid-${row.id}`}>
                  <DollarSign className="mr-2 h-4 w-4" /> Mark paid
                </DropdownMenuItem>
              )}
              {!["paid", "cancelled", "overdue"].includes(row.status) && (
                <DropdownMenuItem onClick={() => setInvStatus(row, "overdue")} data-testid={`mark-overdue-${row.id}`}>
                  <Clock className="mr-2 h-4 w-4" /> Mark overdue
                </DropdownMenuItem>
              )}
              {row.status !== "cancelled" && (
                <DropdownMenuItem onClick={() => setInvStatus(row, "cancelled")} className="text-rose-500 focus:text-rose-500" data-testid={`cancel-${row.id}`}>
                  <XCircle className="mr-2 h-4 w-4" /> Cancel
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}
        />
      )}

      <InvoiceModal open={modalOpen} onOpenChange={setModalOpen} initial={editing} defaultCustomerId={prefillCustomer} onSaved={refetch} />
      <RecordPaymentModal open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} invoice={payFor} onSaved={refetch} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete invoice?" description={`This will remove ${deleting?.invoice_number}.`} onConfirm={handleDelete} />
    </div>
  );
}
