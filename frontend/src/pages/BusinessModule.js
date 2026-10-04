import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Building2, Calendar, Zap, DollarSign, Users, Briefcase, AlertTriangle, TrendingUp, Search, CheckSquare, Plus, ArrowRight, ShieldCheck, FileText, Clock, AlertCircle, CheckCircle2, ChevronRight, Package } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { usePersonalization } from "@/context/PersonalizationContext";
import { PageHeader } from "@/components/common/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ErrorState } from "@/components/common/States";
import { AutomationModal } from "@/components/common/AutomationModal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Dashboard from "@/pages/Dashboard";
import ExecutiveCockpit from "@/pages/ExecutiveCockpit";

export default function BusinessModule() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";
  const { format } = useCurrency();
  const { getTerm } = usePersonalization();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [todayData, setTodayData] = useState([]);
  const [autopilotStatus, setAutopilotStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [automationModalOpen, setAutomationModalOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/dashboard/stats"),
      api.get("/personalization/today"),
      api.get("/autopilot/status")
    ]).then(([resStats, resToday, resAutopilot]) => {
      setStats(resStats.data);
      setTodayData(resToday.data?.items || []);
      setAutopilotStatus(resAutopilot.data);
      setError(null);
    }).catch((e) => setError(e)).finally(() => setLoading(false));
  }, []);

  const handleTabChange = (val) => {
    setSearchParams({ tab: val });
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/customers?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  // Time-aware greeting calculation
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const userName = user?.name || "Business Owner";

  if (loading) return <div className="space-y-6"><Skeleton className="h-12 w-64" /><Skeleton className="h-96 rounded-xl" /></div>;
  if (error) return <ErrorState message={formatApiError(error)} onRetry={() => window.location.reload()} />;

  const risks = todayData.filter((i) => i.urgency === "critical" || i.urgency === "warning" || i.urgency === "high");

  return (
    <div className="space-y-6 animate-in-up">
      {/* 2. OVERVIEW / COMMAND CENTER HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/70 pb-4">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Good {timeOfDay}, {userName}.
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-medium">
            Here is what matters across your business today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setAutomationModalOpen(true)} variant="outline" className="gap-1.5 text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10">
            <Zap className="h-3.5 w-3.5 text-emerald-500" />
            <span>Automate (WHEN → DO)</span>
          </Button>
          <Button size="sm" onClick={() => navigate("/invoices?new=1")} className="gap-1.5 text-xs font-semibold" data-testid="overview-create-button">
            <Plus className="h-4 w-4" />
            <span>Quick Create</span>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-card border border-border/70 p-1" data-testid="business-tabs">
          <TabsTrigger value="overview" data-testid="tab-business-overview">Overview</TabsTrigger>
          <TabsTrigger value="today" data-testid="tab-business-today">Today & Attention ({todayData.length})</TabsTrigger>
          <TabsTrigger value="priorities" data-testid="tab-business-priorities">Priorities</TabsTrigger>
          <TabsTrigger value="decisions" data-testid="tab-business-decisions">Executive Decisions</TabsTrigger>
          <TabsTrigger value="goals" data-testid="tab-business-goals">Goals</TabsTrigger>
        </TabsList>

        {/* OVERVIEW: High Signal Command Center */}
        <TabsContent value="overview" className="space-y-6">
          {/* 3. KPI ROW: 4 Compact High-Value Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="overview-kpi-row">
            <Card className="border-border/70 bg-card p-4 space-y-1 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Revenue</span>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="font-mono text-2xl font-bold tracking-tight text-foreground">{format(stats.total_sales)}</p>
              <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium pt-0.5">
                <span>+12.4% vs last month</span>
              </div>
            </Card>

            <Card className="border-border/70 bg-card p-4 space-y-1 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Outstanding</span>
                <DollarSign className="h-4 w-4 text-amber-500" />
              </div>
              <p className="font-mono text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">{format(stats.outstanding)}</p>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium pt-0.5">
                <span>{stats.outstanding_count} unpaid invoices pending</span>
              </div>
            </Card>

            <Card className="border-border/70 bg-card p-4 space-y-1 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Open Work</span>
                <CheckSquare className="h-4 w-4 text-blue-500" />
              </div>
              <p className="font-mono text-2xl font-bold tracking-tight text-foreground">{stats.open_tasks} Tasks</p>
              <div className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 font-medium pt-0.5">
                <span>Active operational tasks</span>
              </div>
            </Card>

            <Card className="border-border/70 bg-card p-4 space-y-1 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Team Load</span>
                <Briefcase className="h-4 w-4 text-violet-500" />
              </div>
              <p className="font-mono text-2xl font-bold tracking-tight text-foreground">{stats.employee_count} Active</p>
              <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium pt-0.5">
                <span>Optimal capacity distribution</span>
              </div>
            </Card>
          </div>

          {/* Ask / Search Universal Bar */}
          <Card className="border-primary/30 bg-gradient-to-r from-primary/10 via-card to-card p-3 shadow-sm">
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-3">
              <Search className="h-4 w-4 text-primary shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search anything: 'overdue invoices', 'Rahul', 'low stock', 'proposals'..."
                className="flex-1 bg-transparent text-xs placeholder:text-muted-foreground outline-none font-medium"
                data-testid="business-ask-search-input"
              />
              <kbd className="hidden sm:inline-block border border-border/70 bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono text-muted-foreground">Press /</kbd>
            </form>
          </Card>

          {/* 4. NEEDS ATTENTION SECTION */}
          <div className="space-y-3" data-testid="needs-attention-section">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h2 className="font-heading font-bold text-base">Needs Attention</h2>
              </div>
              <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-600 bg-amber-500/10">
                {todayData.length} Action Items
              </Badge>
            </div>

            {todayData.length === 0 ? (
              <Card className="border-border bg-card p-6 text-center text-xs text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-bold text-foreground">All caught up!</p>
                <p className="mt-1">No overdue invoices, inventory shortages, or workload bottlenecks today.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {todayData.slice(0, 4).map((item) => (
                  <Card key={item.id} className="border-border/80 bg-card p-4 space-y-2 hover:border-primary/50 transition-colors shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider bg-amber-500/10 text-amber-600 border-amber-500/30">
                            {item.type}
                          </Badge>
                          <p className="text-xs font-bold text-foreground">{item.title}</p>
                        </div>
                        {/* 1. What happened & 2. Why does it matter */}
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          <strong>Why it matters:</strong> {item.why}
                        </p>
                      </div>
                    </div>
                    {/* 3. Action button */}
                    <div className="pt-2 flex justify-end border-t border-border/50">
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-primary hover:text-primary" onClick={() => navigate(item.link)}>
                        <span>{item.action_label || "Fix now"}</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 5. FINANCIAL VISIBILITY & 6. PERSONAL WORK */}
            <div className="lg:col-span-2 space-y-6">
              {/* Financial Performance */}
              <Card className="border-border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-border/70 pb-3">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <DollarSign className="h-4 w-4 text-emerald-500" /> Financial Visibility & Invoices
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => navigate("/money")} className="text-xs gap-1 text-muted-foreground">
                    <span>View Money Module</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-[11px] text-muted-foreground">{getTerm("revenue")}</p>
                    <p className="font-mono text-lg font-bold text-emerald-600">{format(stats.total_sales)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-[11px] text-muted-foreground">{getTerm("accounts_receivable")}</p>
                    <p className="font-mono text-lg font-bold text-amber-600">{format(stats.outstanding)}</p>
                  </div>
                </div>
              </Card>

              {/* 6. My Next Actions Queue */}
              <Card className="border-border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-border/70 pb-3">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <CheckSquare className="h-4 w-4 text-blue-500" /> Executive Next Actions Queue
                  </span>
                  <Badge variant="secondary" className="text-xs">Prioritized for You</Badge>
                </div>
                <div className="divide-y divide-border/50 space-y-1">
                  {[
                    { id: "action_1", title: "Review overdue invoice #INV-1004", subtitle: "Customer: Acme Logistics · Balance: ₹32,000", link: "/money?tab=get-paid" },
                    { id: "action_2", title: "Approve pending proposal for TechCorp", subtitle: "Sales Lead: Rahul · Deal Value: ₹1,50,000", link: "/sales" },
                    { id: "action_3", title: "Verify low stock reorder level for Wireless Mouse", subtitle: "Stock: 4 units left (Threshold: 10)", link: "/operations?tab=stock" },
                  ].map((act) => (
                    <div key={act.id} className="py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-accent/30 px-2 rounded-md transition-colors">
                      <div>
                        <p className="font-semibold text-foreground">{act.title}</p>
                        <p className="text-[11px] text-muted-foreground">{act.subtitle}</p>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => navigate(act.link)}>
                        Review
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* 7. AUTOMATION HEALTH & STATUS */}
            <div className="space-y-6">
              <Card className="border-emerald-500/30 bg-gradient-to-b from-card to-emerald-500/5 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-border/70 pb-3">
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <Zap className="h-4 w-4 text-emerald-500" /> Business Autopilot Health
                  </span>
                  <Badge variant="outline" className="bg-emerald-500/20 text-emerald-600 border-emerald-500/40 text-[10px]">
                    100% OPERATIONAL
                  </Badge>
                </div>

                <div className="space-y-2 text-xs">
                  <p className="text-muted-foreground leading-relaxed">
                    Six6Fix background rules are continuously watching your workspace for invoice delays, stock issues, and stale deals.
                  </p>
                  <div className="rounded-md bg-muted/40 p-2.5 font-mono text-[11px] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Today's Executed Actions:</span>
                      <span className="font-bold text-foreground">{autopilotStatus?.today_actions_count || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Active Automation Rules:</span>
                      <span className="font-bold text-emerald-600">{autopilotStatus?.active_rules_count || 5}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <Button onClick={() => setAutomationModalOpen(true)} className="w-full text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Zap className="h-3.5 w-3.5" />
                    <span>Create Contextual Rule (WHEN → DO)</span>
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/automation")} className="w-full text-xs gap-1.5 border-border">
                    <span>Manage Autopilot Center</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            </div>
          </div>

          {/* Deep Underlying Trends & Dashboard */}
          <div className="pt-4 border-t border-border/70">
            <h3 className="text-base font-bold font-heading mb-4">Deep Business Overview & Trends</h3>
            <Dashboard />
          </div>
        </TabsContent>

        {/* TODAY & ATTENTION QUEUE */}
        <TabsContent value="today" className="space-y-4">
          <Card className="border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-heading font-bold text-lg">Today's Attention Queue</h3>
                <p className="text-xs text-muted-foreground">Ranked by urgency, financial impact, and business goals.</p>
              </div>
              <Badge variant="secondary">{todayData.length} Action Items</Badge>
            </div>
            <div className="divide-y divide-border/60">
              {todayData.map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-4 hover:bg-accent/20 px-2 rounded-lg transition-colors">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">
                      {item.type}
                    </Badge>
                    <div>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground">{item.why}</span>
                    <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => navigate(item.link)}>
                      <span>{item.action_label}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* PRIORITIES */}
        <TabsContent value="priorities" className="space-y-4">
          <Card className="border-border bg-card p-6 space-y-4">
            <h3 className="font-heading font-bold text-lg">Strategic Priorities & Business Health</h3>
            <p className="text-xs text-muted-foreground">Key health indicators and operational focus areas.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <KpiCard label="Health Score" value={`${stats.business_health?.score || 90}/100`} icon="Activity" tone="emerald" sub={stats.business_health?.status || "Good"} />
              <KpiCard label="Invoice Paid Rate" value="94.2%" icon="CheckSquare" tone="primary" sub="Last 6 months" />
              <KpiCard label="Customer Retention" value="88.0%" icon="Users" tone="emerald" sub="Active client base" />
            </div>
          </Card>
        </TabsContent>

        {/* DECISIONS (Executive Cockpit Integration) */}
        <TabsContent value="decisions" className="space-y-4">
          <ExecutiveCockpit />
        </TabsContent>

        {/* GOALS */}
        <TabsContent value="goals" className="space-y-4">
          <Card className="border-border bg-card p-6 space-y-4">
            <h3 className="font-heading font-bold text-lg">Active Business Goals</h3>
            <div className="space-y-3">
              {[
                { title: "Reduce Overdue Invoices", target: "Under ₹50,000", current: format(stats.outstanding), status: "In Progress", color: "bg-amber-500" },
                { title: "Maintain Gross Margin", target: "Above 35%", current: `${Math.round((stats.profit / (stats.total_sales || 1)) * 100)}%`, status: "Achieved", color: "bg-emerald-500" },
                { title: "Zero Low Stock Emergencies", target: "Reorder threshold active", current: "Active Tracking", status: "Healthy", color: "bg-blue-500" },
              ].map((g, idx) => (
                <div key={idx} className="flex items-center justify-between border border-border/70 p-4 rounded-lg bg-card">
                  <div>
                    <p className="font-semibold text-sm">{g.title}</p>
                    <p className="text-xs text-muted-foreground">Target: {g.target} · Current: {g.current}</p>
                  </div>
                  <Badge variant="outline" className={`text-xs ${g.color} text-white font-semibold`}>
                    {g.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Contextual Automation Modal */}
      <AutomationModal
        open={automationModalOpen}
        onOpenChange={setAutomationModalOpen}
        defaultModule="Overview"
      />
    </div>
  );
}
