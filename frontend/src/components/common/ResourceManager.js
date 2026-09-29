import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, LayoutGrid, List, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useResource } from "@/hooks/useResource";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable } from "@/components/common/DataTable";
import { CrudModal } from "@/components/common/CrudModal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { TableSkeleton, ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useDebounce } from "@/hooks/useDebounce";

function ResourceCards({ columns, rows, onEdit, onDelete, onRowClick, singular }) {
  const [titleCol, ...rest] = columns;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid={`${singular.toLowerCase()}-cards`}>
      {rows.map((row) => (
        <Card
          key={row.id}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          className={`border-border/70 bg-card/90 p-4 transition-colors ${onRowClick ? "cursor-pointer hover:border-primary/40" : ""}`}
          data-testid={`card-${row.id}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">{titleCol.render ? titleCol.render(row) : row[titleCol.key]}</div>
            {(onEdit || onDelete) && (
              <div onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" data-testid={`card-actions-${row.id}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    {onEdit && <DropdownMenuItem onClick={() => onEdit(row)} data-testid={`edit-${row.id}`}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>}
                    {onDelete && <DropdownMenuItem onClick={() => onDelete(row)} className="text-rose-500 focus:text-rose-500" data-testid={`delete-${row.id}`}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
          <div className="mt-3 space-y-1.5 border-t border-border/50 pt-3">
            {rest.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">{c.label}</span>
                <span className="min-w-0 truncate text-right">{c.render ? c.render(row) : row[c.key] ?? "—"}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function ResourceManager({ config, onRowClick }) {
  const { title, subtitle, endpoint, singular, columns, fields, filters = [], icon, searchPlaceholder } = config;
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const [filterState, setFilterState] = useState({});
  const [view, setView] = useState(() => localStorage.getItem("bmp_resource_view") || "table");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setEditing(null); setModalOpen(true);
      const p = new URLSearchParams(searchParams); p.delete("new"); setSearchParams(p, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setViewPersist = (v) => { setView(v); localStorage.setItem("bmp_resource_view", v); };

  const params = useMemo(() => {
    const p = {};
    if (debounced) p.search = debounced;
    Object.entries(filterState).forEach(([k, v]) => { if (v && v !== "all") p[k] = v; });
    return p;
  }, [debounced, filterState]);

  const { data, loading, error, refetch } = useResource(endpoint, params);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (row) => { setEditing(row); setModalOpen(true); };

  const handleSubmit = async (payload) => {
    try {
      if (editing) {
        await api.put(`${endpoint}/${editing.id}`, payload);
        toast.success(`${singular} updated`);
      } else {
        await api.post(endpoint, payload);
        toast.success(`${singular} created`);
      }
      refetch();
    } catch (e) {
      toast.error(formatApiError(e));
      throw e;
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`${endpoint}/${deleting.id}`);
      toast.success(`${singular} deleted`);
      setDeleting(null);
      refetch();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const hasFilters = search || Object.values(filterState).some((v) => v && v !== "all");

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader title={title} subtitle={subtitle}>
        <Button onClick={openCreate} data-testid={`create-${singular.toLowerCase()}-button`}>
          <Plus className="mr-2 h-4 w-4" /> New {singular}
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder || `Search ${title.toLowerCase()}...`}
            className="pl-9"
            data-testid="resource-search"
          />
        </div>
        {filters.map((f) => (
          <Select key={f.name} value={filterState[f.name] || "all"} onValueChange={(v) => setFilterState((s) => ({ ...s, [f.name]: v }))}>
            <SelectTrigger className="w-full sm:w-44" data-testid={`filter-${f.name}`}>
              <SelectValue placeholder={f.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {f.label}</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        <div className="flex rounded-lg border border-border/70 p-0.5 sm:ml-auto">
          <Button variant={view === "table" ? "secondary" : "ghost"} size="sm" className="h-8" onClick={() => setViewPersist("table")} data-testid="resource-view-table"><List className="h-4 w-4" /></Button>
          <Button variant={view === "grid" ? "secondary" : "ghost"} size="sm" className="h-8" onClick={() => setViewPersist("grid")} data-testid="resource-view-grid"><LayoutGrid className="h-4 w-4" /></Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border/80 bg-card/90"><TableSkeleton /></div>
      ) : error ? (
        <ErrorState message={formatApiError(error)} onRetry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={icon}
          title={hasFilters ? `No ${title.toLowerCase()} match your filters` : `No ${title.toLowerCase()} yet`}
          description={hasFilters ? "Try adjusting your search or filters." : `Get started by creating your first ${singular.toLowerCase()}.`}
          actionLabel={hasFilters ? undefined : `New ${singular}`}
          onAction={hasFilters ? undefined : openCreate}
          testId={`${singular.toLowerCase()}-empty`}
        />
      ) : view === "grid" ? (
        <ResourceCards columns={columns} rows={data} onEdit={openEdit} onDelete={(row) => setDeleting(row)} onRowClick={onRowClick} singular={singular} />
      ) : (
        <DataTable
          columns={columns}
          rows={data}
          onEdit={openEdit}
          onDelete={(row) => setDeleting(row)}
          onRowClick={onRowClick}
          testId={`${singular.toLowerCase()}-table`}
        />
      )}

      <CrudModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editing ? `Edit ${singular}` : `New ${singular}`}
        fields={fields}
        initial={editing}
        onSubmit={handleSubmit}
        submitLabel={editing ? "Save changes" : `Create ${singular}`}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${singular}?`}
        description={`This will permanently remove "${deleting?.name || deleting?.title || deleting?.category || ""}". This cannot be undone.`}
        onConfirm={handleDelete}
      />
    </div>
  );
}
