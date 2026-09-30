import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, FileText, DollarSign, Send, XCircle, AlertTriangle, FilePen, Wallet, Copy, Printer, Download, RotateCcw, Trash2, X } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useResource } from "@/hooks/useResource";
import { useDebounce } from "@/hooks/useDebounce";
import { useCreateParam } from "@/hooks/useCreateParam";
import { useCurrency } from "@/context/CurrencyContext";
import { formatDate } from "@/lib/format";
import { downloadCsv, csvFilename } from "@/lib/csv";
import { UNPAID, balanceOf, displayStatus, isPastDue, invoiceActions, showStockWarnings } from "@/lib/invoices";
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

export default function Invoices() {
  const { format, currency } = useCurrency();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(() => (STATUSES.includes(params.get("status")) ? params.get("status") : "all"));
  const [search, setSearch] = useState(() => params.get("q") || "");
  const [range, setRange] = useState(() => ({ from: params.get("from") || "", to: params.get("to") || "" }));
  const debounced = useDebounce(search, 300);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [template, setTemplate] = useState(null);
  const [prefillCustomer, setPrefillCustomer] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [payFor, setPayFor] = useState(null);

  // Dashboard links (e.g. /invoices?status=overdue) arriving while this page is already open.
  const statusParam = params.get("status");
  useEffect(() => { if (STATUSES.includes(statusParam)) setStatus(statusParam); }, [statusParam]);

  // Keep the URL in step with the view, so it can be bookmarked or restored from a tab.
  useEffect(() => {
    if (params.get("new")) return;
    const next = new URLSearchParams();
    if (status !== "all") next.set("status", status);
    if (debounced) next.set("q", debounced);
    if (range.from) next.set("from", range.from);
    if (range.to) next.set("to", range.to);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, debounced, range]);

  const openCreate = (customerId = "") => { setEditing(null); setTemplate(null); setPrefillCustomer(customerId); setModalOpen(true); };
  const openDuplicate = (inv) => { setEditing(null); setTemplate(inv); setPrefillCustomer(""); setModalOpen(true); };
  const openPrint = (inv) => window.open(`/print/invoices/${inv.id}?autoprint=1`, "_blank", "noopener");
  useCreateParam(({ customer }) => openCreate(customer || ""));

  // Load every invoice once (per search) and filter by status and date locally, so tab counts
  // and the summary cards always reflect the whole list and switching tabs is instant.
  const { data, loading, error, refetch } = useResource("/invoices", debounced ? { search: debounced } : {});

  const inRange = useMemo(() => data.filter((r) => (!range.from || r.issue_date >= range.from) && (!range.to || r.issue_date <= range.to)), [data, range]);
  const counts = useMemo(
    () => Object.fromEntries(STATUSES.map((s) => [s, inRange.filter(TAB_FILTERS[s]).length])),
    [inRange]
  );
  const summary = useMemo(() => {
    const unpaid = inRange.filter(TAB_FILTERS.unpaid);
    const overdue = inRange.filter(TAB_FILTERS.overdue);
    return {
      outstanding: unpaid.reduce((s, r) => s + balanceOf(r), 0),
      overdue: overdue.reduce((s, r) => s + balanceOf(r), 0),
      drafts: inRange.filter(TAB_FILTERS.draft).reduce((s, r) => s + (r.total || 0), 0),
      collected: inRange.reduce((s, r) => s + (r.amount_paid || 0), 0),
    };
  }, [inRange]);
  const rows = useMemo(() => inRange.filter(TAB_FILTERS[status]), [inRange, status]);

  const handleDelete = async () => {
    const inv = deleting;
    setDeleting(null);
    try { await api.delete(`/invoices/${inv.id}`); toast.success(`${inv.invoice_number} deleted`); refetch(); }
    catch (e) { toast.error(formatApiError(e), { duration: 8000 }); }
  };
  const setInvStatus = async (inv, s, message) => {
    try {
      const { data: saved } = await api.post(`/invoices/${inv.id}/status`, { status: s });
      toast.success(message || `${inv.invoice_number} marked ${displayStatus(saved.status).replace(/_/g, " ")}`);
      showStockWarnings(saved);
      refetch();
    } catch (e) { toast.error(formatApiError(e), { duration: 8000 }); }
  };
  const toggleStatus = (s) => setStatus((cur) => (cur === s ? "all" : s));
  const hasFilters = debounced || range.from || range.to;

  const exportCsv = () => {
    downloadCsv(csvFilename(status === "all" ? "invoices" : `invoices ${status.replace(/_/g, " ")}`), [
      { label: "Invoice", value: (r) => r.invoice_number },
      { label: "Customer", value: (r) => r.customer_name },
      { label: "Issue Date", value: (r) => r.issue_date },
      { label: "Due Date", value: (r) => r.due_date },
      { label: "Status", value: (r) => displayStatus(r.status) },
      { label: `Subtotal (${currency})`, value: (r) => r.subtotal },
      { label: `Tax (${currency})`, value: (r) => r.tax_amount },
      { label: `Total (${currency})`, value: (r) => r.total },
      { label: `Paid (${currency})`, value: (r) => r.amount_paid || 0 },
      { label: `Balance (${currency})`, value: (r) => balanceOf(r) },
    ], rows);
    toast.success(`Exported ${rows.length} invoice${rows.length === 1 ? "" : "s"}`);
  };

  const columns = [
    { key: "invoice_number", label: "Invoice", render: (r) => <span className="font-mono font-medium">{r.invoice_number}</span> },
    { key: "customer_name", label: "Customer", render: (r) => r.customer_name || "—" },
    { key: "issue_date", label: "Issued", render: (r) => formatDate(r.issue_date) },
    { key: "due_date", label: "Due", render: (r) => {
      const late = isPastDue(r);
      return <span className={late ? "font-medium text-rose-500" : ""} title={late ? "Past due" : undefined}>{formatDate(r.due_date)}</span>;
    } },
    { key: "total", label: "Total", render: (r) => <span className="font-mono font-semibold">{format(r.total)}</span> },
    { key: "balance", label: "Balance", sortValue: balanceOf, render: (r) => (
      <span className={balanceOf(r) > 0 && r.status !== "cancelled" ? "font-mono text-amber-600 dark:text-amber-500" : "font-mono text-muted-foreground"}>{format(r.status === "cancelled" ? 0 : balanceOf(r))}</span>
    ) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={displayStatus(r.status)} /> },
    // One-click "next step" for the row, so the common path doesn't need the actions menu.
    { key: "next", label: "", sortable: false, className: "w-px whitespace-nowrap py-1 text-right", render: (r) => {
      const can = invoiceActions(r);
      if (can.send) {
        return (
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" data-testid={`quick-send-${r.id}`}
            onClick={(e) => { e.stopPropagation(); setInvStatus(r, "sent"); }}>
            <Send className="mr-1.5 h-3.5 w-3.5" /> Mark sent
          </Button>
        );
      }
      if (can.pay) {
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
      <PageHeader title="Invoices" subtitle="Create, send and collect on your invoices. Overdue invoices are flagged automatically.">
        <Button onClick={() => openCreate()} data-testid="create-invoice-button">
          <Plus className="mr-2 h-4 w-4" /> New Invoice
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="invoice-summary">
        <SummaryCard label="Outstanding" value={format(summary.outstanding)} sub={`${counts.unpaid} unpaid invoice${counts.unpaid === 1 ? "" : "s"}`}
          icon={Wallet} tone="text-amber-500" active={status === "unpaid"} onClick={() => toggleStatus("unpaid")} testId="invoice-summary-unpaid" />
        <SummaryCard label="Overdue" value={format(summary.overdue)} sub={counts.overdue ? `${counts.overdue} need${counts.overdue === 1 ? "s" : ""} follow-up` : "Nothing overdue"}
          icon={AlertTriangle} tone={counts.overdue ? "text-rose-500" : undefined} active={status === "overdue"} onClick={() => toggleStatus("overdue")} testId="invoice-summary-overdue" />
        <SummaryCard label="Drafts" value={counts.draft} sub={counts.draft ? `${format(summary.drafts)} ready to send` : "No drafts"}
          icon={FilePen} active={status === "draft"} onClick={() => toggleStatus("draft")} testId="invoice-summary-draft" />
        <SummaryCard label="Collected" value={format(summary.collected)} sub={`${counts.paid} paid in full`}
          icon={DollarSign} tone="text-emerald-500" active={status === "paid"} onClick={() => toggleStatus("paid")} testId="invoice-summary-paid" />
      </div>

      <div className="flex flex-col gap-3">
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
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number or customer..." className="pl-9" aria-label="Search invoices" data-testid="invoice-search" />
          </div>
          <div className="flex items-center gap-2" title="Filter by issue date">
            <Input type="date" value={range.from} max={range.to || undefined} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="h-9 w-full sm:w-[150px]" aria-label="Issued from" data-testid="invoice-date-from" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={range.to} min={range.from || undefined} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="h-9 w-full sm:w-[150px]" aria-label="Issued to" data-testid="invoice-date-to" />
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => { setSearch(""); setRange({ from: "", to: "" }); }} data-testid="invoice-clear-filters">
              <X className="mr-1 h-4 w-4" /> Clear
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-9 sm:ml-auto" onClick={exportCsv} disabled={loading || rows.length === 0} data-testid="invoice-export">
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
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
          <EmptyState icon={FileText} title="No invoices match" description="Try another status tab, search term or date range." testId="invoices-empty" />
        )
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          testId="invoices-table"
          onRowClick={(row) => navigate(`/invoices/${row.id}`)}
          rowActions={(row) => {
            const can = invoiceActions(row);
            return (
              <>
                {can.pay && (
                  <DropdownMenuItem onClick={() => setPayFor(row)} data-testid={`record-payment-${row.id}`}>
                    <DollarSign className="mr-2 h-4 w-4" /> Record payment
                  </DropdownMenuItem>
                )}
                {can.send && (
                  <DropdownMenuItem onClick={() => setInvStatus(row, "sent")} data-testid={`mark-sent-${row.id}`}>
                    <Send className="mr-2 h-4 w-4" /> Mark sent
                  </DropdownMenuItem>
                )}
                {can.markPaid && (
                  <DropdownMenuItem onClick={() => setInvStatus(row, "paid")} data-testid={`mark-paid-${row.id}`}>
                    <DollarSign className="mr-2 h-4 w-4" /> Mark paid in full
                  </DropdownMenuItem>
                )}
                {can.reopen && (
                  <DropdownMenuItem onClick={() => setInvStatus(row, "draft", `${row.invoice_number} reopened as a draft`)} data-testid={`reopen-${row.id}`}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Reopen as draft
                  </DropdownMenuItem>
                )}
                {can.edit && (
                  <DropdownMenuItem onClick={() => { setEditing(row); setTemplate(null); setModalOpen(true); }} data-testid={`edit-${row.id}`}>
                    <FilePen className="mr-2 h-4 w-4" /> Edit
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => openDuplicate(row)} data-testid={`duplicate-${row.id}`}>
                  <Copy className="mr-2 h-4 w-4" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openPrint(row)} data-testid={`print-${row.id}`}>
                  <Printer className="mr-2 h-4 w-4" /> Print / PDF
                </DropdownMenuItem>
                {(can.cancel || can.remove) && <DropdownMenuSeparator />}
                {can.cancel && (
                  <DropdownMenuItem onClick={() => setCancelling(row)} className="text-rose-500 focus:text-rose-500" data-testid={`cancel-${row.id}`}>
                    <XCircle className="mr-2 h-4 w-4" /> Cancel invoice
                  </DropdownMenuItem>
                )}
                {can.remove && (
                  <DropdownMenuItem onClick={() => setDeleting(row)} className="text-rose-500 focus:text-rose-500" data-testid={`delete-${row.id}`}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                )}
              </>
            );
          }}
        />
      )}

      <InvoiceModal open={modalOpen} onOpenChange={setModalOpen} initial={editing} template={template} defaultCustomerId={prefillCustomer} onSaved={() => refetch()} />
      <RecordPaymentModal open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} invoice={payFor} onSaved={refetch} />
      <ConfirmDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)} confirmLabel="Cancel invoice"
        title={`Cancel ${cancelling?.invoice_number}?`}
        description="The invoice stays on record but no longer counts as owed, and any stock it used goes back into inventory. You can reopen it later."
        onConfirm={() => { const inv = cancelling; setCancelling(null); setInvStatus(inv, "cancelled"); }} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.invoice_number}?`}
        description="The invoice is removed permanently and any stock it used goes back into inventory. To keep a record instead, cancel it."
        onConfirm={handleDelete} />
    </div>
  );
}
