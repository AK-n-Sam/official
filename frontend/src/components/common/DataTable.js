import { useMemo, useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, ArrowUp, ArrowDown, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";

// Columns sort by `sortValue(row)` when given, else by `row[key]`. Set `sortable: false` to opt out.
const sortValueOf = (col, row) => (col.sortValue ? col.sortValue(row) : row[col.key]);

const isEmpty = (v) => v === undefined || v === null || v === "";

function compare(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export const PAGE_SIZE = 25;

export function DataTable({ columns, rows, onEdit, onDelete, rowActions, onRowClick, testId, pageSize = PAGE_SIZE }) {
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  const [page, setPage] = useState(0);

  const sortedRows = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((ra, rb) => {
      const a = sortValueOf(col, ra);
      const b = sortValueOf(col, rb);
      // Empty values always sink to the bottom, regardless of direction.
      return (isEmpty(a) - isEmpty(b)) || (isEmpty(a) ? 0 : compare(a, b) * factor);
    });
  }, [rows, columns, sort]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  // A new search or filter starts again from the first page (editing a row in place does not).
  useEffect(() => { setPage(0); }, [rows.length]);
  const current = Math.min(page, pageCount - 1);
  const visible = sortedRows.slice(current * pageSize, (current + 1) * pageSize);

  // Click cycles: ascending -> descending -> original order.
  const toggleSort = (key) => setSort((s) => {
    if (s.key !== key) return { key, dir: "asc" };
    if (s.dir === "asc") return { key, dir: "desc" };
    return { key: null, dir: "asc" };
  });

  const hasActions = onEdit || onDelete || rowActions;

  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-card/90 shadow-sm">
      <div className="overflow-x-auto">
        <Table data-testid={testId || "data-table"}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((c) => {
                const sortable = c.sortable !== false && c.label;
                const active = sort.key === c.key;
                const SortIcon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <TableHead
                    key={c.key}
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        data-testid={`sort-${c.key}`}
                        className={`group/sort -ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase tracking-wider transition-colors hover:text-foreground ${active ? "text-foreground" : ""}`}
                      >
                        {c.label}
                        <SortIcon className={`h-3 w-3 ${active ? "opacity-100" : "opacity-0 group-hover/sort:opacity-60"}`} />
                      </button>
                    ) : c.label}
                  </TableHead>
                );
              })}
              {hasActions && <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow
                key={row.id}
                data-testid={`table-row-${row.id}`}
                className={onRowClick ? "group cursor-pointer focus-visible:bg-accent/60 focus-visible:outline-none" : "group"}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                // Rows that open a record are reachable with Tab and open with Enter.
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" && e.target === e.currentTarget) onRowClick(row); } : undefined}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.className || "whitespace-nowrap text-sm"}>
                    {c.render ? c.render(row) : row[c.key] ?? "—"}
                  </TableCell>
                ))}
                {hasActions && (
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Row actions" data-testid={`row-actions-${row.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        {rowActions?.(row)}
                        {onEdit && (
                          <DropdownMenuItem onClick={() => onEdit(row)} data-testid={`edit-${row.id}`}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                        )}
                        {onDelete && (
                          <DropdownMenuItem onClick={() => onDelete(row)} className="text-rose-500 focus:text-rose-500" data-testid={`delete-${row.id}`}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {sortedRows.length > pageSize && (
        <div className="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-2.5 text-xs text-muted-foreground" data-testid="table-pagination">
          <span>
            {current * pageSize + 1}–{Math.min((current + 1) * pageSize, sortedRows.length)} of {sortedRows.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page" data-testid="page-prev">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-1 tabular-nums">Page {current + 1} of {pageCount}</span>
            <Button variant="ghost" size="sm" className="h-7 px-2" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)} aria-label="Next page" data-testid="page-next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
