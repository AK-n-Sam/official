import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Plus, ArrowRight, CheckCircle2, TrendingUp, DollarSign, CheckSquare, Briefcase, BarChart3, Check, Shield, Clock, AlertCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { AutomationModal } from "@/components/common/AutomationModal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function BusinessModule() {
  const { user } = useAuth();
  const { format } = useCurrency();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [automationModalOpen, setAutomationModalOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/dashboard/stats"),
      api.get("/invoices")
    ]).then(([resStats, resInv]) => {
      setStats(resStats.data);
      const invArray = Array.isArray(resInv.data) ? resInv.data : (Array.isArray(resInv.data?.items) ? resInv.data.items : []);
      setInvoices(invArray.slice(0, 3));
      setError(null);
    }).catch((e) => setError(e)).finally(() => setLoading(false));
  }, []);

  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const userName = user?.name ? user.name.split(" ")[0] : "there";

  if (loading) return <div className="space-y-6"><Skeleton className="h-12 w-64" /><Skeleton className="h-96 rounded-2xl" /></div>;

  const salesTrendData = (stats?.sales_trend || []).map((t) => ({
    month: t.month,
    val: t.sales || 0
  }));

  const hasSalesData = salesTrendData.some((t) => t.val > 0);
  const tasksAttention = stats?.tasks_attention || [];
  const totalSales = stats?.total_sales || 0;
  const outstanding = stats?.outstanding || 0;
  const openTasks = stats?.open_tasks || 0;
  const employeeCount = stats?.employee_count || 1;

  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).toUpperCase();

  return (
    <div className="space-y-6 animate-in-up font-sans">
      {/* Date & Context Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground font-mono">
            {formattedDate}
          </p>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-foreground">
            Good {timeOfDay}, {userName}.
          </h1>
          <p className="text-xs text-muted-foreground font-medium">
            Here is what matters across your business today.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutomationModalOpen(true)}
            className="h-9 px-3 text-xs font-semibold gap-1.5 border-border bg-card shadow-sm text-foreground hover:bg-accent"
          >
            <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
            <span>Automate</span>
          </Button>
          <Button
            size="sm"
            onClick={() => navigate("/invoices?new=1")}
            className="h-9 px-4 text-xs font-bold gap-1.5 bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 shadow-sm rounded-lg"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>Create</span>
          </Button>
        </div>
      </div>

      {/* Row 1: 4 Compact KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="overview-kpi-row">
        {/* Revenue */}
        <Card className="border-border/70 bg-card p-4 rounded-2xl shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Revenue</span>
            <span className="inline-flex items-center rounded-full bg-accent/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {totalSales > 0 ? "Live" : "No sales yet"}
            </span>
          </div>
          <p className="font-mono text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
            {totalSales > 0 ? format(totalSales) : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {totalSales > 0 ? "Total sales recorded" : "No sales recorded yet"}
          </p>
        </Card>

        {/* Outstanding */}
        <Card className="border-border/70 bg-card p-4 rounded-2xl shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Outstanding</span>
            <span className="inline-flex items-center rounded-full bg-accent/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {outstanding > 0 ? "Receivables" : "Clear"}
            </span>
          </div>
          <p className="font-mono text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
            {outstanding > 0 ? format(outstanding) : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {outstanding > 0 ? "Unpaid invoice balances" : "No unpaid invoices"}
          </p>
        </Card>

        {/* Open work */}
        <Card className="border-border/70 bg-card p-4 rounded-2xl shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Open work</span>
            <span className="inline-flex items-center rounded-full bg-accent/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {openTasks > 0 ? `${openTasks} active` : "Zero open"}
            </span>
          </div>
          <p className="font-mono text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
            {openTasks}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {openTasks > 0 ? "Active action items" : "No open tasks"}
          </p>
        </Card>

        {/* Team load */}
        <Card className="border-border/70 bg-card p-4 rounded-2xl shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Team load</span>
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              Balanced
            </span>
          </div>
          <p className="font-mono text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
            {employeeCount}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {employeeCount === 1 ? "1 active workspace member" : `${employeeCount} active members`}
          </p>
        </Card>
      </div>

      {/* Row 2: Four Column Content Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Cash Performance Chart (5 columns) */}
        <Card className="lg:col-span-5 border-border/70 bg-card p-5 rounded-2xl shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-sm text-foreground">Cash performance</h3>
            <span className="text-xs text-muted-foreground">Last 6 months</span>
          </div>
          <div className="h-44 w-full pt-2 flex items-center justify-center">
            {hasSalesData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesTrendData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(val) => [format(val), "Revenue"]}
                    contentStyle={{ borderRadius: "8px", fontSize: "11px", backgroundColor: "#0f172a", color: "#fff" }}
                  />
                  <Bar
                    dataKey="val"
                    radius={[6, 6, 0, 0]}
                    fill="#0f172a"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-6 space-y-1">
                <BarChart3 className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <p className="text-xs font-semibold text-foreground">Not enough data yet</p>
                <p className="text-[11px] text-muted-foreground">Your sales chart will appear here once invoices are paid.</p>
              </div>
            )}
          </div>
        </Card>

        {/* Recent Invoices Table (3 columns) */}
        <Card className="lg:col-span-3 border-border/70 bg-card p-4 rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-sm text-foreground">Recent invoices</h3>
            <Button variant="outline" size="sm" onClick={() => navigate("/money")} className="h-6 px-2 text-[10px] font-semibold">
              View all
            </Button>
          </div>
          {invoices.length > 0 ? (
            <div className="divide-y divide-border/60 text-xs">
              <div className="grid grid-cols-4 pb-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                <span>INVOICE</span>
                <span>CLIENT</span>
                <span className="text-right">AMOUNT</span>
                <span className="text-right">STATUS</span>
              </div>
              {invoices.map((inv) => (
                <div key={inv.id} className="grid grid-cols-4 py-2.5 items-center">
                  <span className="font-mono text-[11px] font-semibold text-foreground truncate">{inv.invoice_number}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{inv.customer_name}</span>
                  <span className="font-mono text-[11px] font-bold text-right text-foreground">{format(inv.total)}</span>
                  <div className="text-right">
                    <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border capitalize ${
                      inv.status === "paid" ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                      inv.status === "overdue" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-amber-50 text-amber-600 border-amber-200"
                    }`}>
                      {inv.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center space-y-2">
              <p className="text-xs font-semibold text-foreground">No invoices yet</p>
              <p className="text-[11px] text-muted-foreground">Create your first invoice to start tracking receivables.</p>
              <Button size="sm" variant="outline" onClick={() => navigate("/invoices?new=1")} className="h-7 text-xs font-semibold">
                + Create Invoice
              </Button>
            </div>
          )}
        </Card>

        {/* My Next Actions (2 columns) */}
        <Card className="lg:col-span-2 border-border/70 bg-card p-4 rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-sm text-foreground">My next actions</h3>
            <span className="text-[10px] text-muted-foreground font-medium">Today</span>
          </div>
          {tasksAttention.length > 0 ? (
            <div className="space-y-3 pt-1 text-xs">
              {tasksAttention.map((task) => (
                <div key={task.id} className="flex items-start gap-2 border-b border-border/50 pb-2 last:border-0">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-emerald-500 bg-emerald-50 text-emerald-600 font-bold text-[10px] mt-0.5">✓</span>
                  <div>
                    <p className="font-bold text-foreground leading-tight truncate">{task.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">{task.priority} priority</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center space-y-2">
              <p className="text-xs font-semibold text-foreground">No active work</p>
              <p className="text-[11px] text-muted-foreground">Create a task when something needs attention.</p>
              <Button size="sm" variant="outline" onClick={() => navigate("/my-work")} className="h-7 text-xs font-semibold">
                + Create Task
              </Button>
            </div>
          )}
        </Card>

        {/* Automation Health (2 columns) */}
        <Card className="lg:col-span-2 border-border/70 bg-card p-4 rounded-2xl shadow-sm flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-sm text-foreground">Automation health</h3>
            <span className="text-[10px] text-muted-foreground font-medium">Engine Active</span>
          </div>
          <div className="space-y-1">
            <p className="font-mono text-3xl font-extrabold text-foreground tracking-tight">Active</p>
            <p className="text-[10px] text-muted-foreground">Autopilot continuous monitoring</p>
          </div>
          <div className="pt-1 space-y-2">
            <span className="inline-block w-full text-center text-[10px] font-bold py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              Autopilot Online
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/automation")}
              className="w-full h-7 text-[10px] font-semibold border-border bg-card"
            >
              Manage automations
            </Button>
          </div>
        </Card>
      </div>

      {/* Contextual Automation Modal */}
      <AutomationModal
        open={automationModalOpen}
        onOpenChange={setAutomationModalOpen}
        defaultModule="Overview"
      />
    </div>
  );
}

