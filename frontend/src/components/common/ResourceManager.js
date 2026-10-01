import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Download, X } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useResource } from "@/hooks/useResource";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, PAGE_SIZE } from "@/components/common/DataTable";
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
import { useCreateParam } from "@/hooks/useCreateParam";
import { useRefOptions } from "@/hooks/useRefOptions";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useDataChanged } from "@/hooks/useDataChanged";
import { SectionSwitch } from "@/components/layout/SectionSwitch";
import { downloadCsv, csvFilename } from "@/lib/csv";

function ResourceCards({ columns, rows, onEdit, onDelete, rowActions, onRowClick, singular }) {
  const [titleCol, ...rest] = columns;
  const [shown, setShown] = useState(PAGE_SIZE);
  useEffect(() => { setShown(PAGE_SIZE); }, [rows.length]);
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid={`${singular.toLowerCase()}-cards`}>
        {rows.slice(0, shown).map((row) => (
          <Card
            key={row.id}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" && e.target === e.currentTarget) onRowClick(row); } : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            className={`border-border/70 bg-card/90 p-4 transition-colors ${onRowClick ? "cursor-pointer hover:border-primary/40 focus-visible:border-primary/60 focus-visible:outline-none" : ""}`}
            data-testid={`card-${row.id}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">{titleCol.render ? titleCol.render(row) : row[titleCol.key]}</div>
              {(onEdit || onDelete || rowActions) && (
                <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Actions" data-testid={`card-actions-${row.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {rowActions?.(row)}
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
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">{c.label}</span>
                  <span className="min-w-0 truncate text-right">{c.render ? c.render(row) : row[c.key] ?? "—"}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
      {rows.length > shown && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE_SIZE)} data-testid="cards-show-more">
            Show more ({rows.length - shown} left)
          </Button>
        </div>
      )}
    </>
  );
}

const nameOf = (row) => row?.name || row?.title || [row?.category, row?.vendor].filter(Boolean).join(" · ") || "this record";

/**
 * Generic list + create/edit/delete page driven by a config (see modules/resourceConfigs.js).
 * The URL carries search and filters (`?q=`, `?status=`, `?from=&to=`), so other pages can link
 * straight to a filtered list. `perms` says which actions the signed-in user may take.
 */
export function ResourceManager({ config, onRowClick, rowActions, section, perms = { create: true, edit: true, delete: true } }) {
  const { title, subtitle, endpoint, singular, columns, fields, filters = [], icon, searchPlaceholder, dateFilter } = config;
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(() => params.get("q") || "");
  const debounced = useDebounce(search, 300);
  const [filterState, setFilterState] = useState(() => Object.fromEntries(filters.map((f) => [f.name, params.get(f.name) || "all"])));
  const [range, setRange] = useState(() => ({ from: params.get("from") || "", to: params.get("to") || "" }));
  // Tables on wide screens, cards on phones: chosen for the user rather than another toggle.
  const view = useMediaQuery("(min-width: 768px)") ? "table" : "grid";
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // Links like /products?q=Desk arriving while this page is already open.
  const qParam = params.get("q");
  useEffect(() => { if (qParam != null) setSearch(qParam); }, [qParam]);

  useCreateParam(() => { if (perms.create) { setEditing(null); setModalOpen(true); } });
  const formFields = useRefOptions(fields, modalOpen);

  // Mirror search + filters into the URL so the view can be shared, bookmarked or reopened.
  useEffect(() => {
    const next = new URLSearchParams();
    if (debounced) next.set("q", debounced);
    Object.entries(filterState).forEach(([k, v]) => { if (v && v !== "all") next.set(k, v); });
    if (range.from) next.set("from", range.from);
    if (range.to) next.set("to", range.to);
    if (next.toString() !== params.toString() && !params.get("new")) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, filterState, range]);

  const query = useMemo(() => {
    const p = {};
    if (debounced) p.search = debounced;
    Object.entries(filterState).forEach(([k, v]) => { if (v && v !== "all") p[k] = v; });
    if (dateFilter && range.from) p.date_from = range.from;
    if (dateFilter && range.to) p.date_to = range.to;
    return p;
  }, [debounced, filterState, range, dateFilter]);

  const { data, loading, error, refetch } = useResource(endpoint, query);
  useDataChanged(refetch);

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
    const row = deleting;
    setDeleting(null);
    try {
      await api.delete(`${endpoint}/${row.id}`);
      toast.success(`${singular} deleted`);
      refetch();
    } catch (e) {
      toast.error(formatApiError(e), { duration: 8000 });
    }
  };

  const activeFilters = Object.values(filterState).some((v) => v && v !== "all") || range.from || range.to;
  const hasFilters = search || activeFilters;
  const clearFilters = () => {
    setSearch("");
    setFilterState(Object.fromEntries(filters.map((f) => [f.name, "all"])));
    setRange({ from: "", to: "" });
  };

  // Exports what's currently listed (search + filters applied): every form field, any computed
  // columns the config names in `exportExtra`, and the creation date.
  const exportCsv = () => {
    const cols = [
      ...fields.filter((f) => f.type !== "ref").map((f) => ({ label: f.label, value: (r) => r[f.name] })),
      ...fields.filter((f) => f.type === "ref" && f.nameField).map((f) => ({ label: f.label, value: (r) => r[f.nameField] })),
      ...(config.exportExtra || []).map((x) => ({ label: x.label, value: (r) => r[x.key] })),
      { label: "Created", value: (r) => (r.created_at || "").slice(0, 10) },
    ].filter((c) => data.some((r) => c.value(r) !== undefined));
    downloadCsv(csvFilename(title), cols, data);
    toast.success(`Exported ${data.length} ${data.length === 1 ? singular.toLowerCase() : title.toLowerCase()}`);
  };

  const onEdit = perms.edit ? openEdit : undefined;
  const onDelete = perms.delete ? (row) => setDeleting(row) : undefined;

  return (
    <div className="space-y-6 animate-in-up">
      {section && <SectionSwitch section={section} />}
      <PageHeader title={title} subtitle={subtitle}>
        {perms.create && (
          <Button onClick={openCreate} data-testid={`create-${singular.toLowerCase()}-button`}>
            <Plus className="mr-2 h-4 w-4" /> New {singular}
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder || `Search ${title.toLowerCase()}...`}
            className="pl-9"
            aria-label={`Search ${title.toLowerCase()}`}
            data-testid="resource-search"
          />
        </div>
        {filters.map((f) => (
          <Select key={f.name} value={filterState[f.name] || "all"} onValueChange={(v) => setFilterState((s) => ({ ...s, [f.name]: v }))}>
            <SelectTrigger className="w-full sm:w-44" aria-label={f.label} data-testid={`filter-${f.name}`}>
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
        {dateFilter && (
          <div className="flex items-center gap-2" data-testid="date-range">
            <Input type="date" value={range.from} max={range.to || undefined} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="h-9 w-full sm:w-[150px]" aria-label="From date" data-testid="date-from" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={range.to} min={range.from || undefined} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="h-9 w-full sm:w-[150px]" aria-label="To date" data-testid="date-to" />
          </div>
        )}
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={clearFilters} data-testid="clear-filters">
            <X className="mr-1 h-4 w-4" /> Clear
          </Button>
        )}
        <div className="flex items-center gap-2 sm:ml-auto">
          {!loading && !error && (
            <span className="hidden text-xs text-muted-foreground md:inline" data-testid="resource-count">
              {data.length} {data.length === 1 ? singular.toLowerCase() : title.toLowerCase()}
            </span>
          )}
          <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={loading || data.length === 0} data-testid="resource-export">
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
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
          description={hasFilters ? "Try a different search, or clear the filters." : config.emptyHint || `Get started by creating your first ${singular.toLowerCase()}.`}
          actionLabel={hasFilters ? "Clear filters" : perms.create ? `New ${singular}` : undefined}
          onAction={hasFilters ? clearFilters : perms.create ? openCreate : undefined}
          testId={`${singular.toLowerCase()}-empty`}
        />
      ) : view === "grid" ? (
        <ResourceCards columns={columns} rows={data} onEdit={onEdit} onDelete={onDelete} rowActions={rowActions} onRowClick={onRowClick} singular={singular} />
      ) : (
        <DataTable
          columns={columns}
          rows={data}
          onEdit={onEdit}
          onDelete={onDelete}
          rowActions={rowActions}
          onRowClick={onRowClick}
          testId={`${singular.toLowerCase()}-table`}
        />
      )}

      <CrudModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editing ? `Edit ${singular}` : `New ${singular}`}
        fields={formFields}
        initial={editing}
        onSubmit={handleSubmit}
        submitLabel={editing ? "Save changes" : `Create ${singular}`}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${singular.toLowerCase()}?`}
        description={`"${nameOf(deleting)}" will be permanently removed. This can't be undone.${config.deleteHint ? ` ${config.deleteHint}` : ""}`}
        onConfirm={handleDelete}
      />
    </div>
  );
}
