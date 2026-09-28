import { useState } from "react";
import { toast } from "sonner";
import { Plus, Search, FileText, Trash2, DollarSign } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useResource } from "@/hooks/useResource";
import { useCurrency } from "@/context/CurrencyContext";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { TableSkeleton, ErrorState } from "@/components/common/States";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { InvoiceModal } from "@/components/modules/InvoiceModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/common/DataTable";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

const STATUSES = ["all", "paid", "pending", "overdue", "draft"];

export default function Invoices() {
  const { format } = useCurrency();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const params = {};
  if (status !== "all") params.status = status;
  if (search) params.search = search;
  const { data, loading, error, refetch } = useResource("/invoices", params);

  const handleDelete = async () => {
    try {
      await api.delete(`/invoices/${deleting.id}`);
      toast.success("Invoice deleted");
      setDeleting(null);
      refetch();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const markPaid = async (inv) => {
    try {
      await api.post(`/invoices/${inv.id}/pay`, { amount: inv.total - (inv.amount_paid || 0), method: "bank_transfer" });
      toast.success(`${inv.invoice_number} marked as paid`);
      refetch();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const columns = [
    { key: "invoice_number", label: "Invoice", render: (r) => <span className="font-mono font-medium">{r.invoice_number}</span> },
    { key: "customer_name", label: "Customer", render: (r) => r.customer_name || "—" },
    { key: "issue_date", label: "Issued", render: (r) => formatDate(r.issue_date) },
    { key: "due_date", label: "Due", render: (r) => formatDate(r.due_date) },
    { key: "total", label: "Total", render: (r) => <span className="font-mono font-semibold">{format(r.total)}</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader title="Invoices" subtitle="Create, track and collect on your invoices.">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} data-testid="create-invoice-button">
          <Plus className="mr-2 h-4 w-4" /> New Invoice
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList data-testid="invoice-status-tabs">
            {STATUSES.map((s) => (
              <TabsTrigger key={s} value={s} className="capitalize" data-testid={`invoice-tab-${s}`}>{s}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoices..." className="pl-9" data-testid="invoice-search" />
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border/80 bg-card/90"><TableSkeleton /></div>
      ) : error ? (
        <ErrorState message={formatApiError(error)} onRetry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState icon={FileText} title="No invoices found" description="Create your first invoice to start billing customers."
          actionLabel="New Invoice" onAction={() => { setEditing(null); setModalOpen(true); }} testId="invoices-empty" />
      ) : (
        <DataTable
          columns={columns}
          rows={data}
          testId="invoices-table"
          onEdit={(row) => { setEditing(row); setModalOpen(true); }}
          onDelete={(row) => setDeleting(row)}
          rowActions={(row) => row.status !== "paid" ? (
            <DropdownMenuItem onClick={() => markPaid(row)} data-testid={`mark-paid-${row.id}`}>
              <DollarSign className="mr-2 h-4 w-4" /> Mark paid
            </DropdownMenuItem>
          ) : null}
        />
      )}

      <InvoiceModal open={modalOpen} onOpenChange={setModalOpen} initial={editing} onSaved={refetch} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete invoice?" description={`This will remove ${deleting?.invoice_number}.`} onConfirm={handleDelete} />
    </div>
  );
}
