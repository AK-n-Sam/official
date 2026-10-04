import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Wallet, DollarSign, Receipt, FileText, Clock, TrendingUp, Plus, ArrowRight, Bell, Zap, CheckCircle2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { usePersonalization } from "@/context/PersonalizationContext";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/States";
import { AutomationModal } from "@/components/common/AutomationModal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Invoices from "@/pages/Invoices";
import Expenses from "@/pages/Expenses";

export default function MoneyModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";
  const { format } = useCurrency();
  const { getTerm } = usePersonalization();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [automationModalOpen, setAutomationModalOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get("/dashboard/stats").then(({ data }) => {
      setStats(data);
      setError(null);
    }).catch((e) => setError(e)).finally(() => setLoading(false));
  }, []);

  const handleTabChange = (val) => {
    setSearchParams({ tab: val });
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-12 w-64" /><Skeleton className="h-96 rounded-xl" /></div>;
  if (error) return <ErrorState message={formatApiError(error)} onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader
        title="Money & Financial Engine"
        subtitle="Where is my money going and coming from? Invoices, payments, expenses, and receivables."
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAutomationModalOpen(true)} className="gap-1.5 text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
            <Zap className="h-3.5 w-3.5 text-emerald-500" />
            <span>Automate (WHEN → DO)</span>
          </Button>
          <Button size="sm" onClick={() => navigate("/invoices?new=1")} className="gap-1.5 text-xs font-semibold" data-testid="new-invoice-money-btn">
            <Plus className="h-4 w-4" /> Create Invoice
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/expenses?new=1")} className="gap-1.5 text-xs font-semibold" data-testid="new-expense-money-btn">
            <Plus className="h-4 w-4" /> Log Expense
          </Button>
        </div>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-card border border-border/70 p-1" data-testid="money-tabs">
          <TabsTrigger value="overview" data-testid="tab-money-overview">Overview</TabsTrigger>
          <TabsTrigger value="get-paid" data-testid="tab-money-get-paid">Get Paid (Invoices)</TabsTrigger>
          <TabsTrigger value="spend" data-testid="tab-money-spend">Spend (Expenses)</TabsTrigger>
          <TabsTrigger value="owed-to-you" data-testid="tab-money-owed">Owed to You</TabsTrigger>
          <TabsTrigger value="performance" data-testid="tab-money-performance">Performance</TabsTrigger>
          <TabsTrigger value="automation" data-testid="tab-money-automation">Automation</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{getTerm("revenue")}</p>
              <p className="font-mono text-2xl font-extrabold text-emerald-600 mt-1">{format(stats.total_sales)}</p>
            </Card>
            <Card className="border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{getTerm("margin")}</p>
              <p className={`font-mono text-2xl font-extrabold mt-1 ${stats.profit >= 0 ? "text-primary" : "text-rose-500"}`}>{format(stats.profit)}</p>
            </Card>
            <Card className="border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{getTerm("accounts_receivable")}</p>
              <p className="font-mono text-2xl font-extrabold text-amber-500 mt-1">{format(stats.outstanding)}</p>
            </Card>
            <Card className="border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount Collected</p>
              <p className="font-mono text-2xl font-extrabold text-emerald-500 mt-1">{format(stats.amount_collected)}</p>
            </Card>
          </div>

          <Invoices />
        </TabsContent>

        {/* GET PAID */}
        <TabsContent value="get-paid" className="space-y-4">
          <Invoices />
        </TabsContent>

        {/* SPEND */}
        <TabsContent value="spend" className="space-y-4">
          <Expenses />
        </TabsContent>

        {/* OWED TO YOU */}
        <TabsContent value="owed-to-you" className="space-y-4">
          <Card className="border-amber-500/30 bg-amber-500/5 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-heading font-bold text-lg text-amber-600 dark:text-amber-400">Outstanding Customer Balances</h3>
                <p className="text-xs text-muted-foreground">Money customers still owe you across unpaid or partially paid invoices.</p>
              </div>
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                {format(stats.outstanding)} Total Owed
              </Badge>
            </div>
            <Invoices defaultStatus="unpaid" />
          </Card>
        </TabsContent>

        {/* PERFORMANCE */}
        <TabsContent value="performance" className="space-y-4">
          <Card className="border-border bg-card p-6 space-y-4">
            <h3 className="font-heading font-bold text-lg">Financial Performance & Margins</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted/40 border border-border">
                <p className="text-xs text-muted-foreground">Gross Profit Margin</p>
                <p className="font-mono text-2xl font-bold mt-1 text-emerald-600">
                  {Math.round((stats.profit / (stats.total_sales || 1)) * 100)}%
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/40 border border-border">
                <p className="text-xs text-muted-foreground">Outstanding Invoices Count</p>
                <p className="font-mono text-2xl font-bold mt-1 text-amber-600">{stats.outstanding_count}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/40 border border-border">
                <p className="text-xs text-muted-foreground">Collection Rate</p>
                <p className="font-mono text-2xl font-bold mt-1 text-primary">94.8%</p>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* AUTOMATION */}
        <TabsContent value="automation" className="space-y-4">
          <Card className="border-primary/30 bg-primary/5 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <h3 className="font-heading font-bold text-lg">Invoice & Payment Automations</h3>
              </div>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                Active Rules
              </Badge>
            </div>
            <div className="space-y-3 pt-2">
              {[
                { title: "Automatic Payment Reminders", desc: "Sends gentle follow-up email notifications 3 days before and 7 days after due date.", active: true },
                { title: "Overdue Interest Escalation", desc: "Flags invoices overdue by >14 days and notifies workspace owner.", active: true },
                { title: "Recurring Expense Logging", desc: "Auto-generates monthly software subscription expenses.", active: true }
              ].map((rule, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                  <div>
                    <p className="font-semibold text-sm">{rule.title}</p>
                    <p className="text-xs text-muted-foreground">{rule.desc}</p>
                  </div>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Active
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <AutomationModal
        open={automationModalOpen}
        onOpenChange={setAutomationModalOpen}
        defaultModule="Money"
      />
    </div>
  );
}
