import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, LayoutGrid, List, Search, MoreHorizontal, AlertTriangle, Circle, CheckCircle2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useResource } from "@/hooks/useResource";
import { useCreateParam } from "@/hooks/useCreateParam";
import { useRefOptions } from "@/hooks/useRefOptions";
import { formatDate, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { CrudModal } from "@/components/common/CrudModal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { DataTable } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const COLUMNS = [
  { key: "todo", label: "To Do", match: ["todo"] },
  { key: "in_progress", label: "In Progress", match: ["in_progress"] },
  { key: "completed", label: "Completed", match: ["completed", "done"] },
];

const FIELDS = [
  { name: "title", label: "Title", required: true, full: true },
  { name: "description", label: "Description", type: "textarea", full: true },
  { name: "assignee_id", label: "Assigned To", type: "member" },
  { name: "customer_id", label: "Related Customer", type: "ref", endpoint: "/customers", nameField: "customer_name", emptyLabel: "No customer" },
  { name: "reference", label: "Reference" },
  { name: "priority", label: "Priority", type: "select", default: "medium", options: [
    { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }] },
  { name: "status", label: "Status", type: "select", default: "todo", options: [
    { value: "todo", label: "To Do" }, { value: "in_progress", label: "In Progress" }, { value: "completed", label: "Completed" }] },
  { name: "due_date", label: "Due Date", type: "date" },
];

const isDone = (t) => t.status === "completed" || t.status === "done";

function CompleteToggle({ task, onToggle }) {
  const done = isDone(task);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(task); }}
      aria-label={done ? "Mark as not done" : "Mark as done"}
      title={done ? "Mark as not done" : "Mark as done"}
      data-testid={`complete-toggle-${task.id}`}
      className={cn("mt-0.5 shrink-0 rounded-full transition-colors", done ? "text-emerald-500" : "text-muted-foreground/60 hover:text-emerald-500")}
    >
      {done ? <CheckCircle2 className="h-[18px] w-[18px]" /> : <Circle className="h-[18px] w-[18px]" />}
    </button>
  );
}

const isOverdue = (t) => t.status !== "completed" && t.status !== "done" && t.due_date && t.due_date < todayIso();
const STATUS_FILTERS = ["all", "todo", "in_progress", "completed", "overdue"];
const VIEW_KEY = "bmp_tasks_view";

export default function Tasks() {
  const { data, loading, error, refetch, setData } = useResource("/tasks", {});
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [members, setMembers] = useState([]);
  const [view, setViewState] = useState(() => { try { return localStorage.getItem(VIEW_KEY) || "board"; } catch { return "board"; } });
  const setView = (v) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } };
  const [search, setSearch] = useState(() => params.get("q") || "");
  const [priority, setPriority] = useState("all");
  const [statusFilter, setStatusFilter] = useState(() => (STATUS_FILTERS.includes(params.get("status")) ? params.get("status") : "all"));
  const [prefill, setPrefill] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // Links from the dashboard, search and notifications: /tasks?q=..., /tasks?status=overdue
  const qParam = params.get("q");
  const statusParam = params.get("status");
  useEffect(() => { if (qParam != null) setSearch(qParam); }, [qParam]);
  useEffect(() => { if (STATUS_FILTERS.includes(statusParam)) setStatusFilter(statusParam); }, [statusParam]);

  // ?new=1&customer=<id> (from a customer's page) opens the form with that customer chosen.
  useCreateParam(({ customer }) => { setEditing(null); setPrefill(customer ? { customer_id: customer } : null); setModalOpen(true); });

  useEffect(() => {
    api.get("/team").then(({ data }) => setMembers(data)).catch(() => {});
  }, []);

  const memberFields = useMemo(() => FIELDS.map((f) => (
    f.name === "assignee_id"
      ? { ...f, options: members.map((m) => ({ value: m.id, label: m.name + (m.is_you ? " (you)" : "") })) }
      : f
  )), [members]);
  const fields = useRefOptions(memberFields, modalOpen);

  const filtered = useMemo(() => data.filter((t) => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !(t.customer_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (priority !== "all" && t.priority !== priority) return false;
    if (statusFilter === "overdue") return isOverdue(t);
    if (statusFilter !== "all" && !(t.status === statusFilter || (statusFilter === "completed" && t.status === "done"))) return false;
    return true;
  }), [data, search, priority, statusFilter]);

  const submit = async (payload) => {
    // The server fills in the assignee's and customer's names from their records.
    try {
      if (editing) { await api.put(`/tasks/${editing.id}`, payload); toast.success("Task updated"); }
      else { await api.post("/tasks", payload); toast.success("Task created"); }
      refetch();
    } catch (e) { toast.error(formatApiError(e)); throw e; }
  };
  // Optimistic: the card moves immediately and snaps back if the save fails.
  const moveTo = async (task, status) => {
    const previous = data;
    setData((rows) => rows.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try { await api.put(`/tasks/${task.id}`, { status }); }
    catch (e) { setData(previous); toast.error(formatApiError(e)); }
  };
  const toggleComplete = (task) => moveTo(task, isDone(task) ? "todo" : "completed");

  const dropOn = (col) => (e) => {
    e.preventDefault();
    setOverCol(null);
    const task = data.find((t) => t.id === e.dataTransfer.getData("text/plain"));
    if (task && !col.match.includes(task.status)) {
      moveTo(task, col.key);
      toast.success(`Moved to ${col.label}`, { description: task.title });
    }
  };
  const remove = async () => {
    try { await api.delete(`/tasks/${deleting.id}`); toast.success("Task deleted"); setDeleting(null); refetch(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const overdueCount = data.filter(isOverdue).length;

  const columns = [
    { key: "title", label: "Task", render: (r) => (
      <div className="flex items-center gap-2.5">
        <CompleteToggle task={r} onToggle={toggleComplete} />
        {isOverdue(r) && <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}
        <div>
          <p className={cn("font-medium", isDone(r) && "text-muted-foreground line-through")}>{r.title}</p>
          {r.customer_name && <p className="text-xs text-muted-foreground">{r.customer_name}</p>}
        </div>
      </div>
    ) },
    { key: "assignee", label: "Assignee", render: (r) => r.assignee || "—" },
    { key: "priority", label: "Priority", render: (r) => <StatusBadge status={r.priority} /> },
    { key: "due_date", label: "Due", render: (r) => <span className={isOverdue(r) ? "text-rose-500" : ""}>{formatDate(r.due_date)}</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader title="Tasks" subtitle={overdueCount > 0 ? `${overdueCount} task(s) overdue and need attention.` : "Organize your team's work across stages."}>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border/70 p-0.5">
            <Button variant={view === "board" ? "secondary" : "ghost"} size="sm" className="h-8" onClick={() => setView("board")} data-testid="task-view-board"><LayoutGrid className="h-4 w-4" /></Button>
            <Button variant={view === "list" ? "secondary" : "ghost"} size="sm" className="h-8" onClick={() => setView("list")} data-testid="task-view-list"><List className="h-4 w-4" /></Button>
          </div>
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} data-testid="create-task-button">
            <Plus className="mr-2 h-4 w-4" /> New Task
          </Button>
        </div>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks..." className="pl-9" data-testid="task-search" />
        </div>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-full sm:w-40" data-testid="task-filter-priority"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40" data-testid="task-filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="todo">To Do</SelectItem><SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem><SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <ErrorState message={formatApiError(error)} onRetry={refetch} />
      ) : view === "list" ? (
        loading ? <Skeleton className="h-64 rounded-xl" /> : filtered.length === 0 ? (
          <EmptyState icon={List} title={data.length ? "No tasks match" : "No tasks yet"} description={data.length ? "Adjust the search or filters." : "Create a task to track work for yourself or a teammate."} />
        ) : (
          <DataTable columns={columns} rows={filtered} testId="tasks-table" onRowClick={(row) => { setEditing(row); setModalOpen(true); }}
            onEdit={(row) => { setEditing(row); setModalOpen(true); }} onDelete={(row) => setDeleting(row)} />
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const tasks = filtered.filter((t) => col.match.includes(t.status));
            return (
              <div
                key={col.key}
                data-testid={`task-column-${col.key}`}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overCol !== col.key) setOverCol(col.key); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null); }}
                onDrop={dropOn(col)}
                className={cn("space-y-3 rounded-xl p-1.5 transition-colors", dragId && "bg-muted/40", overCol === col.key && "bg-primary/10 ring-2 ring-primary/40")}
              >
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold">{col.label}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{tasks.length}</span>
                </div>
                <div className="space-y-2.5">
                  {loading ? <Skeleton className="h-24 rounded-xl" /> : tasks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 py-8 text-center text-xs text-muted-foreground">{dragId ? "Drop here" : "No tasks"}</div>
                  ) : tasks.map((t) => (
                    <Card
                      key={t.id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; setDragId(t.id); }}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      className={cn("cursor-grab border-border/70 bg-card/90 p-4 active:cursor-grabbing", dragId === t.id && "opacity-50")}
                      data-testid={`task-card-${t.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-start gap-2">
                          <CompleteToggle task={t} onToggle={toggleComplete} />
                          <button type="button" onClick={() => { setEditing(t); setModalOpen(true); }} data-testid={`task-open-${t.id}`}
                            className={cn("text-left text-sm font-medium leading-snug hover:underline", isDone(t) && "text-muted-foreground line-through")}>{t.title}</button>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`Actions for ${t.title}`}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {COLUMNS.filter((c) => !c.match.includes(t.status)).map((c) => (
                              <DropdownMenuItem key={c.key} onClick={() => moveTo(t, c.key)} data-testid={`move-${t.id}-${c.key}`}>Move to {c.label}</DropdownMenuItem>
                            ))}
                            <DropdownMenuItem onClick={() => { setEditing(t); setModalOpen(true); }}>Edit</DropdownMenuItem>
                            <DropdownMenuItem className="text-rose-500 focus:text-rose-500" onClick={() => setDeleting(t)}>Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {t.customer_name && (t.customer_id
                        ? <button type="button" onClick={() => navigate(`/customers/${t.customer_id}`)} className="mt-1 block text-left text-xs text-primary hover:underline">{t.customer_name}</button>
                        : <p className="mt-1 text-xs text-muted-foreground">{t.customer_name}</p>)}
                      {t.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.description}</p>}
                      <div className="mt-3 flex items-center justify-between">
                        <StatusBadge status={t.priority} />
                        <span className="text-xs text-muted-foreground">{t.assignee || "Unassigned"}</span>
                      </div>
                      {t.due_date && <p className={`mt-2 text-[11px] ${isOverdue(t) ? "text-rose-500" : "text-muted-foreground"}`}>Due {formatDate(t.due_date)}</p>}
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CrudModal open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) setPrefill(null); }} title={editing ? "Edit Task" : "New Task"}
        fields={fields} initial={editing || prefill} onSubmit={submit} submitLabel={editing ? "Save changes" : "Create Task"} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete task?" description={`This will remove "${deleting?.title}".`} onConfirm={remove} />
    </div>
  );
}
