import { useState, useRef, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

// Every automated outcome is shown with one of a few plain words.
const WORDS = {
  done: ["Done", "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"],
  waiting: ["Waiting for you", "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"],
  queued: ["Queued", "bg-slate-500/10 text-slate-500 border-slate-500/20"],
  running: ["Processing", "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"],
  deferred: ["Will retry", "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"],
  needs_attention: ["Needs attention", "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"],
  failed: ["Needs attention", "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"],
  skipped: ["Skipped", "bg-slate-500/10 text-slate-500 border-slate-500/20"],
  rejected: ["Skipped", "bg-slate-500/10 text-slate-500 border-slate-500/20"],
  pending: ["Waiting for you", "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"],
  // integration health
  healthy: ["Healthy", "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"],
  degraded: ["Degraded", "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"],
  rate_limited: ["Rate limited", "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"],
  cooldown: ["Resting", "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"],
  quota_exhausted: ["Quota used up", "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"],
  auth_error: ["Key rejected", "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"],
  quarantined: ["Key rejected", "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"],
  unavailable: ["Unavailable", "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"],
  not_configured: ["Not set up", "bg-slate-500/10 text-slate-500 border-slate-500/20"],
  off: ["Switched off", "bg-slate-500/10 text-slate-500 border-slate-500/20"],
};

export function StateWord({ status, className }) {
  const [label, style] = WORDS[status] || [String(status || "—").replace(/_/g, " "), WORDS.queued[1]];
  return (
    <span data-testid={`state-${status}`} className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", style, className)}>
      {label}
    </span>
  );
}

export function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 0) {
    const ahead = -s;
    if (ahead < 3600) return `in ${Math.max(1, Math.round(ahead / 60))} min`;
    if (ahead < 86400) return `in ${Math.round(ahead / 3600)} h`;
    return `in ${Math.round(ahead / 86400)} d`;
  }
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** Start a background job and follow it until it finishes. `state` is idle | queued | running | done | failed. */
export function useJob() {
  const [state, setState] = useState("idle");
  const [job, setJob] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const start = useCallback(async (what, { onDone, timeoutMs = 120000 } = {}) => {
    clearTimeout(timer.current);
    setState("queued");
    const { data } = await api.post(`/automation/run/${what}`);
    setJob(data);
    const until = Date.now() + timeoutMs;
    const poll = async () => {
      try {
        const { data: j } = await api.get(`/automation/jobs/${data.id}`);
        setJob(j);
        if (["done", "failed", "skipped"].includes(j.status)) {
          setState(j.status === "done" ? "done" : "failed");
          onDone?.(j);
          return;
        }
        setState(j.status);
      } catch { /* keep polling; a blip shouldn't end it */ }
      if (Date.now() < until) timer.current = setTimeout(poll, 1500);
      else setState("failed");
    };
    timer.current = setTimeout(poll, 800);
    return data;
  }, []);

  return { state, job, start, busy: state === "queued" || state === "running" };
}
