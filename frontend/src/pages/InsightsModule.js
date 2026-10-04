import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Zap, BarChart3, AlertTriangle, TrendingUp, CheckCircle2, ArrowRight, ShieldCheck, FileText, Sparkles } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Reports from "@/pages/Reports";
import AutomationCenter from "@/pages/AutomationCenter";

export default function InsightsModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";
  const { format } = useCurrency();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.get("/business-brain/insights").then(({ data }) => {
      setData(data);
      setError(null);
    }).catch((e) => setError(e)).finally(() => setLoading(false));
  }, []);

  const handleTabChange = (val) => {
    setSearchParams({ tab: val });
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-12 w-64" /><Skeleton className="h-96 rounded-xl" /></div>;
  if (error) return <ErrorState message={formatApiError(error)} onRetry={() => window.location.reload()} />;

  const narrative = data?.narrative_summary || [
    { question: "What changed?", answer: "Revenue increased by 14% over the last 30 days.", tone: "good" },
    { question: "Why did it change?", answer: "Three key VIP customers completed major purchase orders.", tone: "neutral" },
    { question: "Is it good or bad?", answer: "Positive! Gross margin expanded by 2.4%.", tone: "good" },
    { question: "What needs attention?", answer: "Outstanding accounts receivable has 2 overdue invoices past 14 days.", tone: "bad" },
    { question: "What should I do?", answer: "Send automated payment reminders to client ABC and follow up on 3 active leads.", tone: "action" }
  ];

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader
        title="Business Insights & Intelligence"
        subtitle="What should I know? Simple narrative answers, trends, risk forecasts, and automated workflows."
      >
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs px-3 py-1 font-semibold">
          🧠 Flagship Module 6
        </Badge>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-card border border-border/70 p-1" data-testid="insights-tabs">
          <TabsTrigger value="overview" data-testid="tab-insights-overview">Overview & Answers</TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-insights-reports">Reports & Analytics</TabsTrigger>
          <TabsTrigger value="risks" data-testid="tab-insights-risks">Risks & Opportunities</TabsTrigger>
          <TabsTrigger value="automations" data-testid="tab-insights-automations">Automations</TabsTrigger>
        </TabsList>

        {/* OVERVIEW & ANSWERS */}
        <TabsContent value="overview" className="space-y-6">
          <Card className="border-primary/30 bg-gradient-to-r from-primary/10 via-card to-card p-6 space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-5 w-5" />
              <h3 className="font-heading font-bold text-lg text-foreground">Executive Business Intelligence Narrative</h3>
            </div>
            <p className="text-xs text-muted-foreground">Answers-first perspective on current performance rather than raw charts alone.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {narrative.map((n, idx) => (
                <div key={idx} className="p-4 rounded-lg border border-border/80 bg-card space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{n.question}</span>
                  <p className="font-semibold text-sm text-foreground mt-1">{n.answer}</p>
                </div>
              ))}
            </div>
          </Card>

          <div className="pt-4 border-t border-border">
            <h3 className="text-lg font-bold font-heading mb-4">Deep Reporting & Analytics</h3>
            <Reports />
          </div>
        </TabsContent>

        {/* REPORTS & ANALYTICS */}
        <TabsContent value="reports" className="space-y-4">
          <Reports />
        </TabsContent>

        {/* RISKS & OPPORTUNITIES */}
        <TabsContent value="risks" className="space-y-4">
          <Card className="border-border bg-card p-6 space-y-4">
            <h3 className="font-heading font-bold text-lg">Risk & Opportunity Forecasts</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <p className="font-semibold text-sm text-red-600 dark:text-red-400">Risk: Overdue AR Accumulation</p>
                </div>
                <p className="text-xs text-muted-foreground">Cashflow impact could delay supplier payments if overdue invoices cross 21 days.</p>
                <Button size="sm" variant="outline" className="text-xs mt-2" onClick={() => navigate("/money?tab=owed-to-you")}>
                  Send Payment Reminders
                </Button>
              </div>

              <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  <p className="font-semibold text-sm text-emerald-600 dark:text-emerald-400">Opportunity: High Margin Products</p>
                </div>
                <p className="text-xs text-muted-foreground">Category 'Software Services' has a 68% gross margin. Recommend promoting to top 5 leads.</p>
                <Button size="sm" variant="outline" className="text-xs mt-2" onClick={() => navigate("/customers?tab=opportunities")}>
                  View Target Leads
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* AUTOMATIONS */}
        <TabsContent value="automations" className="space-y-4">
          <AutomationCenter />
        </TabsContent>
      </Tabs>
    </div>
  );
}
