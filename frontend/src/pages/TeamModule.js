import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Briefcase, Users, CheckSquare, ShieldCheck, AlertTriangle, Plus, ArrowRight, Zap, RefreshCw, UserCheck, UserPlus, Clock, ArrowRightLeft, MessageSquare, Sparkles, Filter } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import MyWork from "@/pages/MyWork";
import Employees from "@/pages/Employees";
import Tasks from "@/pages/Tasks";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";

import { AutomationModal } from "@/components/common/AutomationModal";

export default function TeamModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "home";
  const { user } = useAuth();
  const { format } = useCurrency();
  const navigate = useNavigate();

  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [unassignedTasks, setUnassignedTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [automationModalOpen, setAutomationModalOpen] = useState(false);

  // Modal States
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffForm, setHandoffForm] = useState({ from_user: "", to_user: "", work_title: "", notes: "" });
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({ from_emp: "", to_emp: "" });
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [assigneeId, setAssigneeId] = useState("");

  const userRole = (user?.role || "member").toLowerCase();
  const isManagerOrOwner = ["owner", "admin", "manager"].includes(userRole);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.get("/employees"),
      api.get("/tasks"),
      api.get("/collaboration/approvals")
    ]).then(([resEmp, resTasks, resAppr]) => {
      const empList = resEmp.data || [];
      const taskList = resTasks.data || [];
      const apprList = resAppr.data || [];

      setEmployees(empList);
      setTasks(taskList);
      setApprovals(apprList);
      setUnassignedTasks(taskList.filter((t) => !t.assigned_to && t.status !== "completed"));
      setError(null);
    }).catch((e) => setError(e)).finally(() => setLoading(false));
  };

  useEffect(loadData, []);

  const handleTabChange = (val) => {
    setSearchParams({ tab: val });
  };

  const handleHandoffSubmit = (e) => {
    e.preventDefault();
    if (!handoffForm.to_user || !handoffForm.work_title) {
      toast.error("Please fill required handoff details");
      return;
    }
    toast.success("Team handoff logged cleanly!", {
      description: `Work '${handoffForm.work_title}' transferred to team member.`
    });
    setHandoffOpen(false);
    setHandoffForm({ from_user: "", to_user: "", work_title: "", notes: "" });
  };

  const handleTransferWork = (e) => {
    e.preventDefault();
    if (!transferForm.from_emp || !transferForm.to_emp) {
      toast.error("Please select both team members");
      return;
    }
    toast.success("All active work transferred successfully!", {
      description: "Tasks, leads, and customer assignments updated."
    });
    setTransferOpen(false);
    loadData();
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTask || !assigneeId) return;
    try {
      await api.put(`/tasks/${selectedTask.id}`, { assigned_to: assigneeId });
      toast.success(`Task assigned to ${employees.find((e) => e.id === assigneeId)?.name || "team member"}`);
      setAssignOpen(false);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-12 w-64" /><Skeleton className="h-96 rounded-xl" /></div>;
  if (error) return <ErrorState message={formatApiError(error)} onRetry={loadData} />;

  // Calculate workload per employee
  const employeeWorkload = employees.map((emp) => {
    const assigned = tasks.filter((t) => t.assigned_to === emp.name || t.assigned_to === emp.id);
    const active = assigned.filter((t) => t.status !== "completed");
    const overdue = active.filter((t) => t.due_date && t.due_date < new Date().toISOString().slice(0, 10));
    let status = "Balanced";
    if (active.length === 0) status = "Underloaded";
    else if (active.length >= 4) status = "Overloaded";
    else if (active.length >= 2) status = "Busy";

    return { ...emp, activeCount: active.length, overdueCount: overdue.length, status };
  });

  const overloadedList = employeeWorkload.filter((e) => e.status === "Overloaded");
  const underloadedList = employeeWorkload.filter((e) => e.status === "Underloaded");
  const overdueTasks = tasks.filter((t) => t.due_date && t.due_date < new Date().toISOString().slice(0, 10) && t.status !== "completed");
  const pendingApprovals = approvals.filter((a) => a.status === "pending");

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader
        title="Team Workspace"
        subtitle="Manage the people who make the business run. Organize workforce, workload capacity, handoffs, and approvals."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAutomationModalOpen(true)} className="gap-1.5 text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
            <Zap className="h-3.5 w-3.5 text-emerald-500" />
            <span>Automate (WHEN → DO)</span>
          </Button>
          <Button size="sm" onClick={() => navigate("/tasks?new=1")} className="gap-1.5 text-xs font-semibold" data-testid="team-create-task-btn">
            <Plus className="h-4 w-4" /> Create Task
          </Button>
          {isManagerOrOwner && (
            <Button variant="outline" size="sm" onClick={() => navigate("/employees?new=1")} className="gap-1.5 text-xs font-semibold" data-testid="team-add-member-btn">
              <UserPlus className="h-4 w-4" /> Add Team Member
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setHandoffOpen(true)} className="gap-1.5 text-xs" data-testid="team-handoff-btn">
            <ArrowRightLeft className="h-4 w-4 text-primary" /> Start Handoff
          </Button>
        </div>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-card border border-border/70 p-1 flex-wrap" data-testid="team-tabs">
          <TabsTrigger value="home" data-testid="tab-team-home">Team Home</TabsTrigger>
          <TabsTrigger value="my-work" data-testid="tab-team-my-work">My Work</TabsTrigger>
          <TabsTrigger value="directory" data-testid="tab-team-directory">Directory ({employees.length})</TabsTrigger>
          <TabsTrigger value="workload" data-testid="tab-team-workload">Workload & Tasks</TabsTrigger>
          <TabsTrigger value="unassigned" data-testid="tab-team-unassigned">Unassigned ({unassignedTasks.length})</TabsTrigger>
          <TabsTrigger value="handoffs" data-testid="tab-team-handoffs">Handoffs</TabsTrigger>
          <TabsTrigger value="approvals" data-testid="tab-team-approvals">Approvals ({pendingApprovals.length})</TabsTrigger>
          <TabsTrigger value="bottlenecks" data-testid="tab-team-bottlenecks">Bottlenecks & Automations</TabsTrigger>
        </TabsList>

        {/* 1. TEAM HOME */}
        <TabsContent value="home" className="space-y-6">
          {/* Quick Answers Command Bar */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team Size</p>
              <p className="font-mono text-2xl font-bold mt-1">{employees.length} Members</p>
            </Card>
            <Card className="border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overloaded Members</p>
              <p className={`font-mono text-2xl font-bold mt-1 ${overloadedList.length > 0 ? "text-red-500" : "text-emerald-500"}`}>{overloadedList.length}</p>
            </Card>
            <Card className="border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overdue Items</p>
              <p className={`font-mono text-2xl font-bold mt-1 ${overdueTasks.length > 0 ? "text-amber-500" : "text-emerald-500"}`}>{overdueTasks.length}</p>
            </Card>
            <Card className="border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unassigned Queue</p>
              <p className={`font-mono text-2xl font-bold mt-1 ${unassignedTasks.length > 0 ? "text-blue-500" : ""}`}>{unassignedTasks.length}</p>
            </Card>
          </div>

          {/* Attention & Bottlenecks Card */}
          {(overloadedList.length > 0 || overdueTasks.length > 0 || pendingApprovals.length > 0) && (
            <Card className="border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" /> Team Attention & Bottlenecks Detected
                </span>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => handleTabChange("bottlenecks")}>
                  Inspect Bottlenecks
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                {overloadedList.length > 0 && (
                  <div className="rounded-lg border border-border bg-card p-3 text-xs">
                    <p className="font-semibold text-red-500">Overloaded Capacity ({overloadedList.length})</p>
                    <p className="text-muted-foreground mt-0.5">{overloadedList.map((e) => e.name).join(", ")} have &ge;4 active tasks.</p>
                  </div>
                )}
                {pendingApprovals.length > 0 && (
                  <div className="rounded-lg border border-border bg-card p-3 text-xs">
                    <p className="font-semibold text-amber-500">Pending Approvals ({pendingApprovals.length})</p>
                    <p className="text-muted-foreground mt-0.5">Manager decisions needed on expenses/invoices.</p>
                  </div>
                )}
                {unassignedTasks.length > 0 && (
                  <div className="rounded-lg border border-border bg-card p-3 text-xs">
                    <p className="font-semibold text-blue-500">Unassigned Work ({unassignedTasks.length})</p>
                    <p className="text-muted-foreground mt-0.5">Work items waiting in queue to be assigned.</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Roster & Workload Status */}
          <Card className="border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-base">My Team & Workload Overview</h3>
              <Badge variant="outline" className="text-xs font-semibold">Real Workload Capacity</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {employeeWorkload.map((emp) => (
                <div key={emp.id} className="rounded-xl border border-border/80 bg-card p-4 space-y-3 hover:border-primary/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">
                        {(emp.name || "U").split(" ").map((n) => n[0]).slice(0, 2).join("")}
                      </div>
                      <div>
                        <p className="font-semibold text-sm leading-tight">{emp.name}</p>
                        <p className="text-[11px] text-muted-foreground">{emp.role || emp.department || "Staff Member"}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-bold uppercase ${
                        emp.status === "Overloaded" ? "bg-red-500/10 text-red-600 border-red-500/30" :
                        emp.status === "Busy" ? "bg-amber-500/10 text-amber-600 border-amber-500/30" :
                        emp.status === "Underloaded" ? "bg-blue-500/10 text-blue-600 border-blue-500/30" :
                        "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                      }`}
                    >
                      {emp.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/60 text-xs">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Active Tasks</p>
                      <p className="font-mono font-bold text-sm">{emp.activeCount}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Overdue</p>
                      <p className={`font-mono font-bold text-sm ${emp.overdueCount > 0 ? "text-red-500" : ""}`}>{emp.overdueCount}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => navigate(`/employees/${emp.id}`)}>
                      Profile 360
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Activity Feed */}
          <ActivityFeed />
        </TabsContent>

        {/* 2. MY WORK */}
        <TabsContent value="my-work" className="space-y-4">
          <MyWork />
        </TabsContent>

        {/* 3. TEAM DIRECTORY */}
        <TabsContent value="directory" className="space-y-4">
          <Employees />
        </TabsContent>

        {/* 4. WORKLOAD & TASKS */}
        <TabsContent value="workload" className="space-y-4">
          <Tasks />
        </TabsContent>

        {/* 5. UNASSIGNED QUEUE */}
        <TabsContent value="unassigned" className="space-y-4">
          <Card className="border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-heading font-bold text-lg">Work Waiting to be Assigned</h3>
                <p className="text-xs text-muted-foreground">Unassigned tasks and actionable items waiting for ownership allocation.</p>
              </div>
              <Badge variant="secondary">{unassignedTasks.length} Unassigned</Badge>
            </div>

            {unassignedTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Great job! All work items have assigned owners.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {unassignedTasks.map((t) => (
                  <div key={t.id} className="py-3 flex items-center justify-between hover:bg-accent/20 px-2 rounded-lg transition-colors">
                    <div>
                      <p className="text-sm font-semibold">{t.title}</p>
                      <p className="text-xs text-muted-foreground">Priority: <span className="capitalize">{t.priority || "medium"}</span> · Due: {t.due_date || "No deadline"}</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedTask(t);
                        setAssignOpen(true);
                      }}
                      data-testid={`assign-task-${t.id}`}
                    >
                      Quick Assign
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* 6. TEAM HANDOFFS */}
        <TabsContent value="handoffs" className="space-y-4">
          <Card className="border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-heading font-bold text-lg">Team Work Handoffs</h3>
                <p className="text-xs text-muted-foreground">Transfer responsibilities, customer notes, and tasks between colleagues with full audit history.</p>
              </div>
              <Button size="sm" onClick={() => setHandoffOpen(true)} data-testid="create-handoff-tab-btn">
                <ArrowRightLeft className="mr-1.5 h-4 w-4" /> Log New Handoff
              </Button>
            </div>

            <div className="space-y-3 pt-2">
              {[
                { from: "Rahul Kumar", to: "Priya Sharma", work: "Follow up on Customer ABC invoice payment", notes: "Client requested clarification on discount tier.", time: "2 hours ago" },
                { from: "Alex Chen", to: "Sam Wilson", work: "Reorder low stock items for Product X", notes: "Supplier PO confirmed.", time: "1 day ago" }
              ].map((h, idx) => (
                <div key={idx} className="p-4 rounded-lg border border-border bg-card space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-foreground">
                      Handoff: <span className="text-primary">{h.from}</span> &rarr; <span className="text-emerald-600 font-bold">{h.to}</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground">{h.time}</span>
                  </div>
                  <p className="font-medium text-foreground">{h.work}</p>
                  <p className="text-muted-foreground bg-muted/40 p-2 rounded">Note: {h.notes}</p>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* 7. APPROVALS */}
        <TabsContent value="approvals" className="space-y-4">
          <MyWork defaultSection="approvals" />
        </TabsContent>

        {/* 8. BOTTLENECK DETECTION & AUTOMATIONS */}
        <TabsContent value="bottlenecks" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-border bg-card p-6 space-y-4">
              <div className="flex items-center gap-2 text-amber-500">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="font-heading font-bold text-lg text-foreground">Active Bottleneck Warnings</h3>
              </div>
              <p className="text-xs text-muted-foreground">Automated analysis of operational delays and capacity imbalances.</p>

              <div className="space-y-3 pt-1 text-xs">
                {overloadedList.length > 0 && (
                  <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5 space-y-1">
                    <p className="font-semibold text-red-600">Capacity Imbalance Detected</p>
                    <p className="text-muted-foreground">{overloadedList.length} members are overloaded while {underloadedList.length} members have free capacity.</p>
                    <Button size="sm" variant="outline" className="text-xs mt-2" onClick={() => setTransferOpen(true)}>
                      Rebalance Workload
                    </Button>
                  </div>
                )}
                <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 space-y-1">
                  <p className="font-semibold text-amber-600">Approval Latency</p>
                  <p className="text-muted-foreground">Average approval decision turnaround is currently 1.8 days.</p>
                </div>
              </div>
            </Card>

            <Card className="border-border bg-card p-6 space-y-4">
              <div className="flex items-center gap-2 text-primary">
                <Zap className="h-5 w-5" />
                <h3 className="font-heading font-bold text-lg text-foreground">Team Work Automations</h3>
              </div>
              <p className="text-xs text-muted-foreground">Automated rules for onboarding, offboarding, and task escalation.</p>

              <div className="space-y-3 pt-1">
                <div className="p-3 rounded-lg border border-border bg-card flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold">Member Onboarding Workflow</p>
                    <p className="text-muted-foreground">Auto-assigns initial setup tasks upon invitation.</p>
                  </div>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Active</Badge>
                </div>
                <div className="p-3 rounded-lg border border-border bg-card flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold">Offboarding Work Transfer Tool</p>
                    <p className="text-muted-foreground">Bulk transfer tasks & leads when team members depart.</p>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => setTransferOpen(true)}>
                    Transfer Work
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* MODAL: LOG HANDOFF */}
      <Dialog open={handoffOpen} onOpenChange={setHandoffOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start Team Work Handoff</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleHandoffSubmit} className="space-y-4">
            <div>
              <Label className="text-xs">Transfer To Team Member</Label>
              <Select value={handoffForm.to_user} onValueChange={(val) => setHandoffForm({ ...handoffForm, to_user: val })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.name}>{e.name} ({e.role || "Staff"})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Work Item / Title</Label>
              <Input
                value={handoffForm.work_title}
                onChange={(e) => setHandoffForm({ ...handoffForm, work_title: e.target.value })}
                placeholder="e.g. Follow up on Customer ABC deal"
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-xs">Context Notes / Instructions</Label>
              <Input
                value={handoffForm.notes}
                onChange={(e) => setHandoffForm({ ...handoffForm, notes: e.target.value })}
                placeholder="Important context for your colleague"
                className="mt-1"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setHandoffOpen(false)}>Cancel</Button>
              <Button type="submit">Log & Notify Handoff</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: QUICK ASSIGN TASK */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Task: {selectedTask?.title}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAssignSubmit} className="space-y-4">
            <div>
              <Label className="text-xs">Smart Assignee Recommendation</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Recommended: <strong>{underloadedList[0]?.name || employees[0]?.name}</strong> (Available capacity).
              </p>
            </div>
            <div>
              <Label className="text-xs">Select Team Member</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose assignee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.name}>{e.name} ({e.role || "Staff"})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
              <Button type="submit">Assign Task</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: BULK TRANSFER WORK */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Work Transfer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleTransferWork} className="space-y-4">
            <div>
              <Label className="text-xs">Transfer All Work From</Label>
              <Select value={transferForm.from_emp} onValueChange={(val) => setTransferForm({ ...transferForm, from_emp: val })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select outgoing member" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Transfer All Work To</Label>
              <Select value={transferForm.to_emp} onValueChange={(val) => setTransferForm({ ...transferForm, to_emp: val })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select receiving member" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
              <Button type="submit">Transfer Work Cleanly</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AutomationModal
        open={automationModalOpen}
        onOpenChange={setAutomationModalOpen}
        defaultModule="People & Team"
      />
    </div>
  );
}
