import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Sparkles, Landmark, Mail, ArrowUp, ArrowDown, RefreshCw, KeyRound } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { StateWord, timeAgo } from "@/components/automation/shared";

const ERROR_WORDS = { rate_limited: "rate limited", quota_exhausted: "quota used up", auth_error: "key rejected", transient: "temporary error", bad_request: "request refused" };

function Tile({ icon: Icon, title, status, children, testId }) {
  return (
    <Card className="border-border/70 bg-card/90 p-5" data-testid={testId}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-muted-foreground" />{title}</p>
        <StateWord status={status} />
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{children}</div>
    </Card>
  );
}

export function IntegrationsTab() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    api.get("/automation/integrations").then(({ data: d }) => { setData(d); setError(null); }).catch(setError);
  }, []);
  useEffect(load, [load]);

  const act = async (label, fn) => {
    setBusy(label);
    try { await fn(); load(); } catch (e) { toast.error(formatApiError(e)); } finally { setBusy(""); }
  };

  if (error) return <ErrorState message={formatApiError(error)} onRetry={load} />;
  if (!data) return <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>;

  const { ai, bank, email } = data;
  const pool = ai.pool;
  const order = pool ? pool.providers.map((p) => p.provider) : [];
  const move = (i, d) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    return act("order", () => api.put("/automation/integrations/ai", { provider_order: next }));
  };

  return (
    <div className="space-y-5" data-testid="integrations-tab">
      <div className="grid gap-3 lg:grid-cols-3">
        <Tile icon={Sparkles} title="AI help" status={ai.status} testId="integration-ai">
          {ai.status === "not_configured" ? "Not set up. Bank categories and summaries use built-in rules instead."
            : ai.status === "off" ? "Switched off by the administrator."
            : <>Suggests bank categories and writes the weekly summary. {ai.providers.map((p) => `${p.label}: ${p.status_label}`).join(" · ")}.
              {ai.status !== "healthy" && " If every provider is unavailable, built-in rules take over and AI work is retried later."}</>}
        </Tile>
        <Tile icon={Landmark} title="Bank" status={bank.status} testId="integration-bank">
          {bank.accounts.length === 0 ? <>No accounts yet. <button type="button" className="underline" onClick={() => navigate("/bank")}>Import a statement or connect a bank</button>.</>
            : bank.accounts.map((a) => <span key={a.id} className="block">{a.name}{a.source === "plaid" ? " (connected)" : " (imported)"} · {a.error ? <span className="text-rose-500">{a.error}</span> : `updated ${timeAgo(a.last_synced_at)}`}</span>)}
          {!bank.plaid_configured && bank.accounts.length > 0 && <span className="mt-1 block">Live bank connection isn't set up; statements can be imported any time.</span>}
        </Tile>
        <Tile icon={Mail} title="Email sending" status={email.status} testId="integration-email">{email.note}</Tile>
      </div>

      {pool && (
        <Card className="border-border/70 bg-card/90" data-testid="ai-pool">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
            <div>
              <h3 className="font-heading text-sm font-semibold">AI providers and keys</h3>
              <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
                Tried in this order. A key that's rate limited rests and the next one answers; a key that's out of quota waits for its reset; a rejected key is set aside.
                Keys live in the server's environment and are only shown masked. Platform administrator only.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs">AI help <Switch checked={pool.enabled} onCheckedChange={(v) => act("enabled", () => api.put("/automation/integrations/ai", { enabled: v }))} data-testid="ai-enabled" /></label>
              <Button size="sm" variant="outline" className="h-8" disabled={busy === "check"} onClick={() => act("check", async () => { await api.post("/automation/integrations/check"); toast.success("Checked every key"); })} data-testid="ai-check">
                {busy === "check" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}Check now
              </Button>
            </div>
          </div>
          <div className="divide-y divide-border/50">
            {pool.providers.map((p, i) => {
              const usage = ai.usage_24h?.[p.provider];
              return (
                <div key={p.provider} className="px-5 py-4" data-testid={`provider-${p.provider}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-5 text-center font-mono text-xs text-muted-foreground">{i + 1}</span>
                    <p className="text-sm font-medium">{p.label}</p>
                    <StateWord status={p.enabled ? p.status : "off"} />
                    <span className="font-mono text-[11px] text-muted-foreground">{p.model}</span>
                    <div className="ml-auto flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0 || !!busy} onClick={() => move(i, -1)} aria-label={`Move ${p.label} up`}><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === order.length - 1 || !!busy} onClick={() => move(i, 1)} aria-label={`Move ${p.label} down`}><ArrowDown className="h-3.5 w-3.5" /></Button>
                      <Switch checked={p.enabled} aria-label={`Use ${p.label}`}
                        onCheckedChange={(v) => act("toggle", () => api.put("/automation/integrations/ai", { disabled: v ? order.filter((x) => x !== p.provider && !pool.providers.find((q) => q.provider === x).enabled) : [...order.filter((x) => !pool.providers.find((q) => q.provider === x).enabled), p.provider] }))} />
                    </div>
                  </div>
                  <p className="mt-1 pl-8 text-[11px] text-muted-foreground">
                    Last 24 h: {usage ? `${usage.requests} request${usage.requests === 1 ? "" : "s"}, ${usage.ok} answered${usage.avg_latency_ms != null ? `, ~${usage.avg_latency_ms} ms` : ""}${usage.after_failover ? `, ${usage.after_failover} after switching` : ""}${Object.keys(usage.failed).length ? ` · problems: ${Object.entries(usage.failed).map(([k, n]) => `${n} ${ERROR_WORDS[k] || k}`).join(", ")}` : ""}` : "no requests"}
                  </p>
                  {p.keys.length === 0 ? <p className="mt-2 pl-8 text-xs text-muted-foreground">No key configured.</p> : (
                    <ul className="mt-2 space-y-1.5 pl-8">
                      {p.keys.map((k) => (
                        <li key={k.key_id} className="flex flex-wrap items-center gap-2 text-xs" data-testid="ai-key">
                          <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-mono">{k.masked}</span>
                          <StateWord status={k.status} />
                          <span className="text-muted-foreground">
                            {k.requests ? `${k.success_rate}% ok of ${k.requests}` : "unused"}
                            {k.avg_latency_ms != null ? ` · ~${k.avg_latency_ms} ms` : ""}
                            {k.cooldown_until && !k.available ? ` · back ${timeAgo(k.cooldown_until)}` : ""}
                            {k.last_error_class && k.status !== "healthy" ? ` · ${ERROR_WORDS[k.last_error_class] || k.last_error_class} ${timeAgo(k.last_failure_at)}` : ""}
                          </span>
                          {k.status !== "healthy" && (
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={!!busy}
                              onClick={() => act("release", () => api.post(`/automation/integrations/keys/${p.provider}/${k.key_id}/release`))}>Put back in use</Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          {ai.last_check?.finished_at && <p className="border-t border-border/60 px-5 py-3 text-[11px] text-muted-foreground">Last automatic health check {timeAgo(ai.last_check.finished_at)}.</p>}
        </Card>
      )}
    </div>
  );
}
