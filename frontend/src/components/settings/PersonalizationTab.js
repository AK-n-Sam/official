import { useState } from "react";
import { Sparkles, Sliders, Star, Clock, Target, Languages, Layers, ShieldCheck, Check } from "lucide-react";
import { usePersonalization } from "@/context/PersonalizationContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export function PersonalizationTab() {
  const { preferences, updatePreferences, favorites } = usePersonalization();
  const [form, setForm] = useState({
    language_mode: preferences.language_mode || "simple",
    priority_mode: preferences.priority_mode || "balanced",
    start_page: preferences.start_page || "/dashboard",
    density: preferences.density || "comfortable",
    business_goals: preferences.business_goals || ["reduce_overdue", "increase_revenue"],
    work_hours: preferences.work_hours || { start: "09:00", end: "18:00", quiet_hours_enabled: true }
  });

  const handleSave = async () => {
    await updatePreferences(form);
  };

  const toggleGoal = (goal) => {
    const current = form.business_goals || [];
    const updated = current.includes(goal) ? current.filter((g) => g !== goal) : [...current, goal];
    setForm({ ...form, business_goals: updated });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border/70 pb-4">
        <div>
          <h3 className="font-heading text-lg font-semibold">Personalization & Work Style</h3>
          <p className="text-xs text-muted-foreground">Configure how Six6Fix adapts terminology, daily queues, working hours, and priorities for you.</p>
        </div>
        <Button onClick={handleSave} className="bg-primary text-primary-foreground gap-1.5" data-testid="save-personalization">
          <Sparkles className="h-4 w-4" /> Save Preferences
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Terminology & Explanations */}
        <Card className="border-border/70 bg-card/90 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Languages className="h-4 w-4 text-primary" /> Business Terminology Mode
            </span>
            <Badge variant="outline" className="text-xs uppercase">{form.language_mode}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Choose how financial and operational metrics are described across your dashboard and reports.</p>

          <div className="space-y-3">
            {[
              { id: "simple", title: "Layman-First (Simple)", example: '"Money customers still owe you" instead of Accounts Receivable' },
              { id: "standard", title: "Standard Business", example: '"Outstanding customer balance" & "Inactive leads"' },
              { id: "advanced", title: "Professional Executive", example: '"Accounts Receivable (AR)" & "Pipeline Lead Aging"' }
            ].map((m) => (
              <div
                key={m.id}
                onClick={() => setForm({ ...form, language_mode: m.id })}
                className={`cursor-pointer rounded-lg border p-3.5 transition-colors ${form.language_mode === m.id ? "border-primary bg-primary/10" : "border-border/60 hover:bg-accent/40"}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{m.title}</p>
                  {form.language_mode === m.id && <Check className="h-4 w-4 text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{m.example}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Task & Work Priority Ranking */}
        <Card className="border-border/70 bg-card/90 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Layers className="h-4 w-4 text-amber-500" /> Task & Work Ranking Style
            </span>
            <Badge variant="outline" className="text-xs uppercase">{form.priority_mode}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Select how your "Your Day" and "Start Here" queues prioritize your daily agenda.</p>

          <Select value={form.priority_mode} onValueChange={(val) => setForm({ ...form, priority_mode: val })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="balanced">Balanced (Urgency + Deadline + Financial Impact)</SelectItem>
              <SelectItem value="deadline">Deadline-First (Due date order)</SelectItem>
              <SelectItem value="revenue">Revenue-First (High-value customers & invoice impact)</SelectItem>
              <SelectItem value="urgency">Urgency-First (Critical alerts & overdue tasks)</SelectItem>
            </SelectContent>
          </Select>

          <div className="pt-2">
            <Label className="text-xs font-semibold">Preferred Start Page</Label>
            <Select value={form.start_page} onValueChange={(val) => setForm({ ...form, start_page: val })}>
              <SelectTrigger className="w-full mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="/dashboard">Dashboard</SelectItem>
                <SelectItem value="/my-work">My Work & Focus</SelectItem>
                <SelectItem value="/executive">Executive Cockpit</SelectItem>
                <SelectItem value="/sales">Sales & Leads</SelectItem>
                <SelectItem value="/invoices">Invoices & Finance</SelectItem>
                <SelectItem value="/customers">Customer 360</SelectItem>
                <SelectItem value="/automations">Automation Center</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>
      </div>

      {/* Business Priorities & Goals */}
      <Card className="border-border/70 bg-card/90 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4 text-emerald-500" /> Active Business Priorities & Goals
          </span>
          <span className="text-xs text-muted-foreground">Influences recommended actions</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { id: "reduce_overdue", title: "Reduce Overdue Receivables", desc: "Prioritizes invoice reminders & collection tasks" },
            { id: "increase_revenue", title: "Increase Sales & Win Deals", desc: "Surface lead follow-ups & deal win opportunities" },
            { id: "reorder_inventory", title: "Prevent Stock Run-outs", desc: "Automate low-stock alerts & supplier reorders" },
            { id: "improve_efficiency", title: "Streamline Team Delivery", desc: "Identify overdue tasks & workload bottlenecks" }
          ].map((goal) => {
            const isSelected = (form.business_goals || []).includes(goal.id);
            return (
              <div
                key={goal.id}
                onClick={() => toggleGoal(goal.id)}
                className={`cursor-pointer rounded-lg border p-3.5 transition-colors ${isSelected ? "border-emerald-500/50 bg-emerald-500/10" : "border-border/60 hover:bg-accent/40"}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{goal.title}</p>
                  {isSelected && <Check className="h-4 w-4 text-emerald-500" />}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{goal.desc}</p>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
