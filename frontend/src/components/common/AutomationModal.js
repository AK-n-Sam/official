import { useState } from "react";
import { Zap, Sparkles, ArrowRight, Check, Bot, Send, RefreshCw } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

const WHEN_OPTIONS = [
  { id: "invoice_overdue", label: "An invoice becomes 7+ days overdue", category: "Money", action: "create_task", defaultActionLabel: "Create follow-up collection task" },
  { id: "lead_won", label: "A deal / lead stage becomes Won", category: "Sales", action: "convert_customer", defaultActionLabel: "Automatically convert lead to active customer" },
  { id: "stock_low", label: "Product stock drops below reorder level", category: "Operations", action: "create_task", defaultActionLabel: "Create purchase reorder task for supplier" },
  { id: "expense_high", label: "An expense exceeds ₹50,000", category: "Money", action: "request_approval", defaultActionLabel: "Route to manager approval queue" },
  { id: "task_overdue", label: "A high-priority task becomes overdue", category: "People", action: "notify_manager", defaultActionLabel: "Escalate notice to workspace owner" },
  { id: "lead_inactive", label: "A lead has no activity for 7+ days", category: "Sales", action: "create_task", defaultActionLabel: "Create sales re-engagement task" },
];

export function AutomationModal({ open, onOpenChange, defaultModule = "General", onSuccess }) {
  const [selectedWhen, setSelectedWhen] = useState(WHEN_OPTIONS[0]);
  const [customName, setCustomName] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const ruleName = customName.trim() || `${selectedWhen.label} → ${selectedWhen.defaultActionLabel}`;
      await api.post("/automations", {
        name: ruleName,
        description: `Contextual Rule (${defaultModule}): WHEN ${selectedWhen.label} THEN ${selectedWhen.defaultActionLabel}`,
        trigger: selectedWhen.id,
        action: selectedWhen.action,
        category: selectedWhen.category,
        enabled: true,
        is_recommended: true
      });
      toast.success("Automation rule created!", {
        description: `WHEN: ${selectedWhen.label}`
      });
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleAskAi = async () => {
    if (!aiPrompt.trim()) return;
    setLoadingAi(true);
    try {
      const res = await api.post("/ai/ask", { prompt: aiPrompt });
      setAiResponse(res.data.answer);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoadingAi(false);
    }
  };

  const handleFetchBriefing = async () => {
    setLoadingAi(true);
    try {
      const res = await api.post("/ai/briefing");
      setAiResponse(res.data.raw_briefing || JSON.stringify(res.data.metrics, null, 2));
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoadingAi(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl border-border/80 bg-card p-6 shadow-xl" data-testid="contextual-automation-modal">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-500">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold font-heading">Six6Fix AI & Automation Hub</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Set up 1-click rules or execute AI Autopilot tasks powered by OpenRouter.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="rules" className="w-full mt-2">
          <TabsList className="grid w-full grid-cols-2 h-9">
            <TabsTrigger value="rules" className="text-xs font-semibold gap-1.5">
              <Zap className="h-3.5 w-3.5" /> Rule Builder
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-xs font-semibold gap-1.5">
              <Bot className="h-3.5 w-3.5 text-amber-500" /> AI Autopilot (OpenRouter)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="space-y-4 pt-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                1. WHEN (Trigger Event)
              </label>
              <div className="grid grid-cols-1 gap-2 max-h-44 overflow-y-auto pr-1">
                {WHEN_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedWhen(opt)}
                    className={`flex items-start justify-between p-3 rounded-lg border text-left transition-all ${selectedWhen.id === opt.id ? "border-emerald-500/60 bg-emerald-500/10 text-foreground" : "border-border/60 hover:bg-accent/40 text-muted-foreground"}`}
                  >
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-foreground">{opt.label}</p>
                      <p className="text-[11px] text-muted-foreground">Module: {opt.category}</p>
                    </div>
                    {selectedWhen.id === opt.id && (
                      <Badge variant="outline" className="bg-emerald-500/20 text-emerald-600 border-emerald-500/40 text-[10px]">
                        Selected
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                2. DO (Automatic Consequence)
              </label>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {selectedWhen.defaultActionLabel}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Six6Fix Autopilot will continuously execute this action with zero manual data entry.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Rule Name (Optional Customization)</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={`Auto-rule: ${selectedWhen.label}`}
                className="w-full h-9 rounded-md border border-border/70 bg-background px-3 text-xs outline-none focus:border-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/70">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                <span>{saving ? "Saving..." : "Enable Automation Rule"}</span>
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="ai" className="space-y-3 pt-3">
            <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-amber-500" />
                <div>
                  <p className="text-xs font-bold text-foreground">OpenRouter AI Intelligence</p>
                  <p className="text-[11px] text-muted-foreground">Automate business queries, draft communications, and summarize executive briefs.</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleFetchBriefing} disabled={loadingAi} className="h-7 text-[11px] gap-1 border-amber-500/40 text-amber-600 hover:bg-amber-500/10">
                <RefreshCw className={`h-3 w-3 ${loadingAi ? "animate-spin" : ""}`} />
                <span>Executive Briefing</span>
              </Button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAskAi()}
                placeholder="Ask OpenRouter AI: e.g. Draft payment reminder text for overdue accounts..."
                className="flex-1 h-9 rounded-md border border-border/70 bg-background px-3 text-xs outline-none focus:border-amber-500"
              />
              <Button size="sm" onClick={handleAskAi} disabled={loadingAi || !aiPrompt.trim()} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold h-9 px-3 gap-1">
                <Send className="h-3.5 w-3.5" />
                <span>{loadingAi ? "Processing..." : "Ask AI"}</span>
              </Button>
            </div>

            {aiResponse && (
              <div className="rounded-lg border border-border/70 bg-accent/30 p-3 max-h-52 overflow-y-auto space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500">AI Response</p>
                <div className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                  {aiResponse}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/70">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

