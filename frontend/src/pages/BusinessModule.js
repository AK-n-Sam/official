import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Building2, Calendar, Zap, DollarSign, Users, Briefcase, AlertTriangle, TrendingUp, Search, CheckSquare, Crown, Target, ArrowRight, ShieldCheck, FileText } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { usePersonalization } from "@/context/PersonalizationContext";
import { PageHeader } from "@/components/common/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Dashboard from "@/pages/Dashboard";
import ExecutiveCockpit from "@/pages/ExecutiveCockpit";

export default function BusinessModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";
  const { format } = useCurrency();
  const { getTerm } = usePersonalization();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [todayData, setTodayData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/dashboard/stats"),
      api.get("/personalization/today")
    ]).then(([resStats, resToday]) => {
      setStats(resStats.data);
      setTodayData(resToday.data?.items || []);
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

  if (loading) return <div className="space-y-6"><Skeleton className="h-12 w-64" /><Skeleton className="h-96 rounded-xl" /></div>;
  if (error) return <ErrorState message={formatApiError(error)} onRetry={() => window.location.reload()} />;

  const risks = todayData.filter((i) => i.urgency === "critical" || i.urgency === "warning" || i.urgency === "high");
  const opportunities = todayData.filter((i) => i.type === "deal" || i.type === "customer" || i.why?.includes("lead"));

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader
        title="Business Command Center"
        subtitle="How is my business doing? 6 simple areas to understand, operate, and grow your business."
      >
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs px-3 py-1 font-semibold">
          🏢 Flagship Module 1
        </Badge>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-card border border-border/70 p-1" data-testid="business-tabs">
          <TabsTrigger value="overview" data-testid="tab-business-overview">Overview</TabsTrigger>
          <TabsTrigger value="today" data-testid="tab-business-today">Today & Attention ({todayData.length})</TabsTrigger>
          <TabsTrigger value="priorities" data-testid="tab-business-priorities">Priorities</TabsTrigger>
          <TabsTrigger value="decisions" data-testid="tab-business-decisions">Executive Decisions</TabsTrigger>
          <TabsTrigger value="goals" data-testid="tab-business-goals">Goals</TabsTrigger>
        </TabsList>

        {/* OVERVIEW: The 6 Simple Business Areas */}
        <TabsContent value="overview" className="space-y-6">
          {/* Ask / Search / Act Universal Bar */}
          <Card className="border-primary/30 bg-gradient-to-r from-primary/10 via-card to-card p-4 shadow-sm">
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-3">
              <Search className="h-5 w-5 text-primary shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ask or search anything: 'overdue invoices', 'low stock', 'Rahul', 'monthly profit'..."
                className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground outline-none font-medium"
                data-testid="business-ask-search-input"
              />
              <Button type="submit" size="sm" className="gap-1.5 shrink-0">
                <span>Ask / Search</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          </Card>

          {/* The 6 Flagship Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. TODAY */}
            <Card className="border-border bg-card p-5 space-y-3 hover:border-primary/50 transition-colors">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-sm">
                  <Calendar className="h-4 w-4 text-amber-500" /> 1. Today
                </span>
                <Badge variant="secondary" className="text-xs">{todayData.length} Action Items</Badge>
              </div>
              <p className="text-xs text-muted-foreground">What needs your immediate attention right now.</p>
              {todayData.length === 0 ? (
                <p className="text-xs text-muted-foreground pt-2">All caught up! No urgent tasks today.</p>
              ) : (
                <div className="space-y-2 pt-1">
                  {todayData.slice(0, 2).map((item) => (
                    <button key={item.id} onClick={() => navigate(item.link)} className="w-full text-left p-2 rounded bg-muted/40 hover:bg-accent text-xs block transition-colors">
                      <p className="font-semibold truncate">{item.title}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{item.why}</p>
                    </button>
                  ))}
                </div>
              )}
              <Button variant="ghost" size="sm" className="w-full text-xs justify-between pt-2" onClick={() => handleTabChange("today")}>
                <span>Open Today's Queue</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Card>

            {/* 2. MONEY */}
            <Card className="border-border bg-card p-5 space-y-3 hover:border-primary/50 transition-colors">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-sm">
                  <DollarSign className="h-4 w-4 text-emerald-500" /> 2. Money
                </span>
                <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-600 bg-emerald-500/10">
                  {format(stats.total_sales)} Revenue
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">What is happening financially across sales & expenses.</p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded bg-muted/40 p-2">
                  <p className="text-[10px] text-muted-foreground">{getTerm("revenue")}</p>
                  <p className="font-mono text-sm font-bold text-emerald-600">{format(stats.total_sales)}</p>
                </div>
                <div className="rounded bg-muted/40 p-2">
                  <p className="text-[10px] text-muted-foreground">{getTerm("accounts_receivable")}</p>
                  <p className="font-mono text-sm font-bold text-amber-600">{format(stats.outstanding)}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="w-full text-xs justify-between pt-2" onClick={() => navigate("/money")}>
                <span>Manage Money & Invoices</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Card>

            {/* 3. CUSTOMERS */}
            <Card className="border-border bg-card p-5 space-y-3 hover:border-primary/50 transition-colors">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-sm">
                  <Users className="h-4 w-4 text-blue-500" /> 3. Customers
                </span>
                <Badge variant="secondary" className="text-xs">{stats.customer_count} Active</Badge>
              </div>
              <p className="text-xs text-muted-foreground">What is happening commercially with clients and deals.</p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded bg-muted/40 p-2">
                  <p className="text-[10px] text-muted-foreground">New (30 Days)</p>
                  <p className="font-mono text-sm font-bold">{stats.new_customers}</p>
                </div>
                <div className="rounded bg-muted/40 p-2">
                  <p className="text-[10px] text-muted-foreground">Total Invoices</p>
                  <p className="font-mono text-sm font-bold">{stats.invoice_count}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="w-full text-xs justify-between pt-2" onClick={() => navigate("/customers")}>
                <span>View Customer CRM</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Card>

            {/* 4. TEAM */}
            <Card className="border-border bg-card p-5 space-y-3 hover:border-primary/50 transition-colors">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-sm">
                  <Briefcase className="h-4 w-4 text-violet-500" /> 4. Team
                </span>
                <Badge variant="secondary" className="text-xs">{stats.employee_count} Employees</Badge>
              </div>
              <p className="text-xs text-muted-foreground">What is happening operationally with your workforce.</p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded bg-muted/40 p-2">
                  <p className="text-[10px] text-muted-foreground">Open Tasks</p>
                  <p className="font-mono text-sm font-bold">{stats.open_tasks}</p>
                </div>
                <div className="rounded bg-muted/40 p-2">
                  <p className="text-[10px] text-muted-foreground">Team Active</p>
                  <p className="font-mono text-sm font-bold">{stats.employee_count}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="w-full text-xs justify-between pt-2" onClick={() => navigate("/people")}>
                <span>Manage Team & Tasks</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Card>

            {/* 5. RISKS */}
            <Card className="border-border bg-card p-5 space-y-3 hover:border-primary/50 transition-colors">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-sm text-red-500">
                  <AlertTriangle className="h-4 w-4" /> 5. Risks
                </span>
                <Badge variant="outline" className="text-xs border-red-500/30 text-red-600 bg-red-500/10">
                  {risks.length} Risk Alert{risks.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">What could become a problem if left unattended.</p>
              {risks.length === 0 ? (
                <p className="text-xs text-muted-foreground pt-2">No critical risks detected today!</p>
              ) : (
                <div className="space-y-1.5 pt-1">
                  {risks.slice(0, 2).map((r) => (
                    <div key={r.id} className="rounded bg-red-500/5 border border-red-500/20 p-2 text-xs">
                      <p className="font-semibold text-red-600 dark:text-red-400 truncate">{r.title}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{r.subtitle}</p>
                    </div>
                  ))}
                </div>
              )}
              <Button variant="ghost" size="sm" className="w-full text-xs justify-between pt-2" onClick={() => navigate("/insights?tab=risks")}>
                <span>Inspect All Risks</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Card>

            {/* 6. OPPORTUNITIES */}
            <Card className="border-border bg-card p-5 space-y-3 hover:border-primary/50 transition-colors">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-sm text-emerald-500">
                  <TrendingUp className="h-4 w-4" /> 6. Opportunities
                </span>
                <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-600 bg-emerald-500/10">
                  Growth Signals
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">What could improve business revenue or client retention.</p>
              <div className="rounded bg-emerald-500/5 border border-emerald-500/20 p-2 text-xs">
                <p className="font-semibold text-emerald-600 dark:text-emerald-400">Re-engage inactive leads</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">3 potential buyers ready for a follow-up offer.</p>
              </div>
              <Button variant="ghost" size="sm" className="w-full text-xs justify-between pt-2" onClick={() => navigate("/insights?tab=risks")}>
                <span>Explore Opportunities</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Card>
          </div>

          {/* Deep Underlying Dashboard */}
          <div className="pt-4 border-t border-border/70">
            <h3 className="text-lg font-bold font-heading mb-4">Deep Business Overview & Trends</h3>
            <Dashboard />
          </div>
        </TabsContent>

        {/* TODAY & ATTENTION */}
        <TabsContent value="today" className="space-y-4">
          <Card className="border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-heading font-bold text-lg">Today's Priority Focus Queue</h3>
                <p className="text-xs text-muted-foreground">Automatically ranked by urgency, financial impact, and business goals.</p>
              </div>
              <Badge variant="secondary">{todayData.length} Actionable Items</Badge>
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

        {/* PRIORITIES & PERFORMANCE */}
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
    </div>
  );
}
