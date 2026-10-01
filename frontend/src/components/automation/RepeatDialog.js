import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Repeat } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { todayIso } from "@/lib/format";
import { notifyDataChanged } from "@/hooks/useDataChanged";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const FREQ = [["weekly", "Every week"], ["monthly", "Every month"], ["quarterly", "Every 3 months"], ["yearly", "Every year"]];

function nextFrom(iso, freq) {
  const d = new Date(`${iso}T00:00:00`);
  if (freq === "weekly") d.setDate(d.getDate() + 7);
  else {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + ({ monthly: 1, quarterly: 3, yearly: 12 }[freq]));
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Make an invoice or a bill repeat. `source` = { type: "invoice"|"expense", id, label, date }. */
export function RepeatDialog({ open, onOpenChange, source }) {
  const [frequency, setFrequency] = useState("monthly");
  const [start, setStart] = useState("");
  const [mode, setMode] = useState("ask");
  const [busy, setBusy] = useState(false);
  const isInvoice = source?.type === "invoice";

  useEffect(() => {
    if (!open || !source) return;
    setFrequency("monthly"); setMode("ask");
    let d = nextFrom(source.date || todayIso(), "monthly");
    while (d < todayIso()) d = nextFrom(d, "monthly");
    setStart(d);
  }, [open, source]);

  const changeFrequency = (f) => {
    setFrequency(f);
    let d = nextFrom(source.date || todayIso(), f);
    while (d < todayIso()) d = nextFrom(d, f);
    setStart(d);
  };

  const save = async () => {
    if (!start || start < todayIso()) return toast.error("Choose a start date of today or later");
    setBusy(true);
    try {
      await api.post("/automation/recurring", { source_type: source.type, source_id: source.id, frequency, start_date: start, auto_send: isInvoice && mode === "auto" });
      toast.success(isInvoice
        ? (mode === "auto" ? "It will be issued automatically on schedule" : "We'll prepare it on schedule and ask you before it goes out")
        : "The bill will be added on schedule, ready to pay");
      notifyDataChanged();
      onOpenChange(false);
    } catch (e) { toast.error(formatApiError(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="repeat-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Repeat className="h-4 w-4" /> Repeat {isInvoice ? "this invoice" : "this bill"}</DialogTitle>
          <DialogDescription>{source?.label}. Same {isInvoice ? "customer, items and payment terms" : "amount, category and vendor"}, on a schedule.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">How often</Label>
              <Select value={frequency} onValueChange={changeFrequency}>
                <SelectTrigger className="mt-1.5" data-testid="repeat-frequency"><SelectValue /></SelectTrigger>
                <SelectContent>{FREQ.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="repeat-start" className="text-xs text-muted-foreground">Next one on</Label>
              <Input id="repeat-start" type="date" min={todayIso()} value={start} onChange={(e) => setStart(e.target.value)} className="mt-1.5" data-testid="repeat-start" />
            </div>
          </div>
          {isInvoice && (
            <div>
              <Label className="text-xs text-muted-foreground">When it's due</Label>
              <RadioGroup value={mode} onValueChange={setMode} className="mt-2 space-y-1.5">
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 has-[:checked]:border-primary/60">
                  <RadioGroupItem value="ask" className="mt-0.5" data-testid="repeat-ask" />
                  <span><span className="block text-sm font-medium">Ask me first</span><span className="text-xs text-muted-foreground">It's prepared for you and waits on Today for one click.</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 has-[:checked]:border-primary/60">
                  <RadioGroupItem value="auto" className="mt-0.5" data-testid="repeat-auto" />
                  <span><span className="block text-sm font-medium">Issue it automatically</span><span className="text-xs text-muted-foreground">It's created as sent, and stock is taken off the shelf.</span></span>
                </label>
              </RadioGroup>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy} data-testid="repeat-save">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Repeat</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
