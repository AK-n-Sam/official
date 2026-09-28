import { useState } from "react";
import { toast } from "sonner";
import { Plus, GripVertical } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useResource } from "@/hooks/useResource";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { CrudModal } from "@/components/common/CrudModal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

const COLUMNS = [
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
];

const FIELDS = [
  { name: "title", label: "Title", required: true, full: true },
  { name: "description", label: "Description", type: "textarea", full: true },
  { name: "assignee", label: "Assignee" },
  { name: "priority", label: "Priority", type: "select", default: "medium", options: [
    { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }] },
  { name: "status", label: "Status", type: "select", default: "todo", options: [
    { value: "todo", label: "To Do" }, { value: "in_progress", label: "In Progress" }, { value: "done", label: "Done" }] },
  { name: "due_date", label: "Due Date", type: "date" },
];

export default function Tasks() {
  const { data, loading, refetch } = useResource("/tasks", {});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const submit = async (payload) => {
    try {
      if (editing) { await api.put(`/tasks/${editing.id}`, payload); toast.success("Task updated"); }
      else { await api.post("/tasks", payload); toast.success("Task created"); }
      refetch();
    } catch (e) { toast.error(formatApiError(e)); throw e; }
  };

  const moveTo = async (task, status) => {
    try { await api.put(`/tasks/${task.id}`, { status }); refetch(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const remove = async () => {
    try { await api.delete(`/tasks/${deleting.id}`); toast.success("Task deleted"); setDeleting(null); refetch(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader title="Tasks" subtitle="Organize your team's work across stages.">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} data-testid="create-task-button">
          <Plus className="mr-2 h-4 w-4" /> New Task
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const tasks = data.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="space-y-3" data-testid={`task-column-${col.key}`}>
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold">{col.label}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{tasks.length}</span>
              </div>
              <div className="space-y-2.5">
                {loading ? <Skeleton className="h-24 rounded-xl" /> : tasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/60 py-8 text-center text-xs text-muted-foreground">No tasks</div>
                ) : tasks.map((t) => (
                  <Card key={t.id} className="border-border/70 bg-card/90 p-4" data-testid={`task-card-${t.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">{t.title}</p>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {COLUMNS.filter((c) => c.key !== t.status).map((c) => (
                            <DropdownMenuItem key={c.key} onClick={() => moveTo(t, c.key)} data-testid={`move-${t.id}-${c.key}`}>Move to {c.label}</DropdownMenuItem>
                          ))}
                          <DropdownMenuItem onClick={() => { setEditing(t); setModalOpen(true); }}>Edit</DropdownMenuItem>
                          <DropdownMenuItem className="text-rose-500 focus:text-rose-500" onClick={() => setDeleting(t)}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {t.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.description}</p>}
                    <div className="mt-3 flex items-center justify-between">
                      <StatusBadge status={t.priority} />
                      <span className="text-xs text-muted-foreground">{t.assignee || "Unassigned"}</span>
                    </div>
                    {t.due_date && <p className="mt-2 text-[11px] text-muted-foreground">Due {formatDate(t.due_date)}</p>}
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <CrudModal open={modalOpen} onOpenChange={setModalOpen} title={editing ? "Edit Task" : "New Task"}
        fields={FIELDS} initial={editing} onSubmit={submit} submitLabel={editing ? "Save changes" : "Create Task"} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete task?" description={`This will remove "${deleting?.title}".`} onConfirm={remove} />
    </div>
  );
}
