import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

export function DataTable({ columns, rows, onEdit, onDelete, rowActions, testId }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-card/90 shadow-sm">
      <div className="overflow-x-auto">
        <Table data-testid={testId || "data-table"}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  {c.label}
                </TableHead>
              ))}
              {(onEdit || onDelete || rowActions) && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} data-testid={`table-row-${row.id}`} className="group">
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.className || "whitespace-nowrap text-sm"}>
                    {c.render ? c.render(row) : row[c.key] ?? "—"}
                  </TableCell>
                ))}
                {(onEdit || onDelete || rowActions) && (
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`row-actions-${row.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
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
    </div>
  );
}
