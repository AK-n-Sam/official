import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Mail, Copy } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatDate, todayIso } from "@/lib/format";
import { notifyDataChanged } from "@/hooks/useDataChanged";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const WHEN = [
  { label: "Tomorrow", days: 1 }, { label: "In 3 days", days: 3 }, { label: "Next week", days: 7 }, { label: "In 2 weeks", days: 14 },
];

/** "Remind me to…": a task for yourself, already linked to the customer, with a due date in one tap. */
export function FollowUpDialog({ open, onOpenChange, prefill }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [days, setDays] = useState(1);
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(prefill?.title || (prefill?.customerName ? `Follow up with ${prefill.customerName}` : ""));
    setDays(prefill?.days || 1); setCustom(""); setErr("");
  }, [open, prefill]);

  const due = custom || todayIso(days);
  const submit = async (e) => {
    e?.preventDefault();
    if (!title.trim()) return setErr("What do you need to do?");
    setSaving(true);
    try {
      await api.post("/tasks", { title: title.trim(), due_date: due, assignee_id: user?.id, customer_id: prefill?.customerId || "", priority: "medium", status: "todo" });
      toast.success(`Added to your tasks for ${formatDate(due)}`, { description: "It will show on Today when it's due." });
      notifyDataChanged();
      onOpenChange(false);
      prefill?.onDone?.();
    } catch (e2) { setErr(formatApiError(e2)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md" data-testid="follow-up-dialog">
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Follow up</DialogTitle>
            <DialogDescription>{prefill?.customerName ? `A reminder for you, linked to ${prefill.customerName}.` : "A reminder for you."}</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="followup-title" className="text-xs text-muted-foreground">What to do</Label>
            <Input id="followup-title" value={title} onChange={(e) => { setTitle(e.target.value); setErr(""); }} className="mt-1.5" autoFocus data-testid="followup-title" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">When</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {WHEN.map((w) => (
                <button key={w.days} type="button" onClick={() => { setDays(w.days); setCustom(""); }}
                  className={cn("rounded-full border px-3 py-1 text-sm transition-colors", !custom && days === w.days ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent")}>
                  {w.label}
                </button>
              ))}
              <Input type="date" value={custom} min={todayIso()} onChange={(e) => setCustom(e.target.value)} className="h-8 w-[150px]" aria-label="Pick a date" />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Due {formatDate(due)}</p>
          </div>
          {err && <p className="text-sm text-rose-500" role="alert">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="followup-submit">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add follow-up</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Copy text even where the async clipboard API is unavailable or blocked. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    el.remove();
  }
}

/**
 * Chase a payment: a reminder already written for how late the invoice is. "Open in email" starts
 * a message in the user's own mail app; either button records that the customer was reminded.
 */
export function ReminderDialog({ open, onOpenChange, prefill }) {
  const [msg, setMsg] = useState(null);
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const invoiceId = prefill?.invoiceId;

  useEffect(() => {
    if (!open || !invoiceId) return;
    setMsg(null); setErr("");
    api.get(`/invoices/${invoiceId}/reminder`).then(({ data }) => { setMsg(data); setBody(data.body); }).catch((e) => setErr(formatApiError(e)));
  }, [open, invoiceId]);

  const done = async (how) => {
    setBusy(true);
    try {
      if (how === "email") {
        window.location.href = `mailto:${encodeURIComponent(msg.to || "")}?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(body)}`;
      } else {
        await copyText(`${msg.subject}\n\n${body}`);
      }
      await api.post(`/invoices/${invoiceId}/remind`);
      toast.success(how === "email" ? "Reminder opened in your email app" : "Reminder copied", { description: "Logged on the invoice. It leaves Today for 3 days." });
      notifyDataChanged();
      onOpenChange(false);
      prefill?.onDone?.();
    } catch (e) { setErr(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg" data-testid="reminder-dialog">
        <DialogHeader>
          <DialogTitle>Send a payment reminder</DialogTitle>
          <DialogDescription>
            {msg ? (msg.to ? `To ${msg.to}` : "This customer has no email on file. Copy the message instead.") : "Writing the reminder..."}
            {msg?.reminder_count > 0 && ` · reminded ${msg.reminder_count}× before, last ${formatDate(msg.last_reminded)}`}
          </DialogDescription>
        </DialogHeader>
        {msg && (
          <div className="space-y-2">
            <p className="text-sm font-medium" data-testid="reminder-subject">{msg.subject}</p>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} className="text-sm" aria-label="Reminder message" data-testid="reminder-body" />
          </div>
        )}
        {err && <p className="text-sm text-rose-500" role="alert">{err}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button type="button" variant="outline" onClick={() => done("copy")} disabled={!msg || busy} data-testid="reminder-copy"><Copy className="mr-1.5 h-4 w-4" /> Copy</Button>
          {msg?.to && <Button type="button" onClick={() => done("email")} disabled={busy} data-testid="reminder-email"><Mail className="mr-1.5 h-4 w-4" /> Open in email</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
