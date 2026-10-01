import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Landmark, Upload, Link2, RefreshCw, MoreHorizontal, CheckCircle2, Loader2, Undo2, ShieldCheck, Trash2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { usePermissions } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { useDataChanged, notifyDataChanged } from "@/hooks/useDataChanged";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/States";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ImportStatementDialog, ExpenseFromBankDialog, InvoiceForBankDialog, Amount } from "@/components/bank/BankDialogs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const PLAID_SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
const CONFIDENCE = { high: "bg-emerald-500", medium: "bg-amber-500", low: "bg-slate-400" };
const TABS = [["review", "To confirm"], ["matched", "Confirmed"], ["ignored", "Ignored"]];

/** Load Plaid Link only when someone actually connects a bank. */
function loadPlaid() {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PLAID_SCRIPT;
    s.async = true;
    s.onload = () => (window.Plaid ? resolve(window.Plaid) : reject(new Error("Plaid didn't load")));
    s.onerror = () => reject(new Error("Couldn't load the bank connection window. Check your internet connection."));
    document.body.appendChild(s);
  });
}

const confirmLabel = (s) => {
  if (!s) return "";
  if (s.action === "invoice_payment") return "Confirm payment";
  if (s.action === "expense_paid") return "Mark bill paid";
  if (s.action === "link_expense") return "Confirm match";
  if (s.action === "ignore") return "Ignore";
  return s.category ? "Record expense" : "Choose category";
};

export default function Bank() {
  const { isManager } = usePermissions();
  const { format } = useCurrency();
  const [status, setStatus] = useState(null);
  const [tab, setTab] = useState("review");
  const [txns, setTxns] = useState(null);
  const [counts, setCounts] = useState({ review: 0, matched: 0, ignored: 0 });
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [expenseFor, setExpenseFor] = useState(null);
  const [invoiceFor, setInvoiceFor] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const autoSynced = useRef(false);

  const load = useCallback(() => {
    if (!isManager) return;
    Promise.all([api.get("/bank/status"), api.get("/bank/transactions", { params: { status: tab } })])
      .then(([s, t]) => { setStatus(s.data); setTxns(t.data.transactions); setCounts(t.data.counts); setError(null); })
      .catch((e) => setError(e));
  }, [tab, isManager]);
  useEffect(load, [load]);
  useDataChanged(load);

  const sync = useCallback(async (quiet = false) => {
    setSyncing(true);
    try {
      const { data } = await api.post("/bank/sync");
      if (!quiet || data.imported) toast.success(data.imported ? `${data.imported} new transaction${data.imported === 1 ? "" : "s"} from your bank` : "Up to date");
      notifyDataChanged();
    } catch (e) { if (!quiet) toast.error(formatApiError(e)); }
    finally { setSyncing(false); }
  }, []);

  // Connected banks refresh themselves when the page opens (at most hourly).
  useEffect(() => {
    if (autoSynced.current || !status) return;
    const live = status.accounts.filter((a) => a.source === "plaid");
    const stale = live.some((a) => !a.last_synced_at || Date.now() - new Date(a.last_synced_at).getTime() > 3600e3);
    if (live.length && stale) { autoSynced.current = true; sync(true); }
  }, [status, sync]);

  const connect = async () => {
    setConnecting(true);
    try {
      const [{ data }, Plaid] = await Promise.all([api.post("/bank/plaid/link-token"), loadPlaid()]);
      const handler = Plaid.create({
        token: data.link_token,
        onSuccess: async (publicToken, metadata) => {
          const t = toast.loading("Connecting your bank and fetching transactions...");
          try {
            const { data: res } = await api.post("/bank/plaid/exchange", { public_token: publicToken, institution_name: metadata?.institution?.name || "" });
            toast.success(`${metadata?.institution?.name || "Bank"} connected`, { id: t, description: `${res.accounts.length} account${res.accounts.length === 1 ? "" : "s"} · ${res.imported} transactions` });
            notifyDataChanged();
          } catch (e) { toast.error(formatApiError(e), { id: t }); }
        },
        onExit: (err) => { if (err) toast.error(err.display_message || err.error_message || "The bank connection was closed."); },
      });
      handler.open();
    } catch (e) { toast.error(e.response ? formatApiError(e) : e.message); }
    finally { setConnecting(false); }
  };

  const match = async (t, body) => {
    setBusyId(t.id);
    try {
      const { data } = await api.post(`/bank/transactions/${t.id}/match`, body);
      setTxns((list) => list.filter((x) => x.id !== t.id));
      toast.success(data.status === "ignored" ? "Ignored" : data.match.label, {
        action: { label: "Undo", onClick: async () => { await api.post(`/bank/transactions/${t.id}/undo`); notifyDataChanged(); } },
      });
      notifyDataChanged();
    } finally { setBusyId(""); }
  };
  const tryMatch = (t, body) => match(t, body).catch((e) => toast.error(formatApiError(e)));

  const confirmSuggestion = (t) => {
    const s = t.suggestion;
    if (s.action === "create_expense" && !s.category) return setExpenseFor(t);
    tryMatch(t, { action: s.action, invoice_id: s.invoice_id, expense_id: s.expense_id, category: s.category, vendor: s.vendor, supplier_id: s.supplier_id });
  };

  const undo = async (t) => {
    setBusyId(t.id);
    try { await api.post(`/bank/transactions/${t.id}/undo`); toast.success("Back in the list to confirm"); notifyDataChanged(); }
    catch (e) { toast.error(formatApiError(e)); }
    finally { setBusyId(""); }
  };

  const confident = (txns || []).filter((t) => t.suggestion?.confidence === "high");
  const confirmAll = async () => {
    setBusyId("all");
    try {
      const { data } = await api.post("/bank/transactions/confirm", { ids: confident.map((t) => t.id) });
      toast.success(`Confirmed ${data.confirmed} transaction${data.confirmed === 1 ? "" : "s"}`);
      notifyDataChanged();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusyId(""); }
  };

  const removeAccount = async () => {
    const a = removing;
    setRemoving(null);
    try { await api.delete(`/bank/accounts/${a.id}`); toast.success(`${a.name} removed`); notifyDataChanged(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  if (!isManager) {
    return (
      <div className="space-y-6">
        <PageHeader title="Bank" />
        <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground"><ShieldCheck className="h-5 w-5" /> Only owners and admins can see the business's bank transactions.</Card>
      </div>
    );
  }
  if (error && !status) return <div className="space-y-6"><PageHeader title="Bank" /><ErrorState message={formatApiError(error)} onRetry={load} /></div>;
  if (!status || !txns) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64 rounded-xl" /></div>;

  const plaid = status.plaid;
  const hasLive = status.accounts.some((a) => a.source === "plaid");

  const ConnectButton = ({ primary }) => plaid.configured ? (
    <Button variant={primary ? "default" : "outline"} onClick={connect} disabled={connecting} data-testid="bank-connect">
      {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}Connect a bank
    </Button>
  ) : null;

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader title="Bank" subtitle="Money in and out of your bank, matched to your invoices and bills. Confirm each line and the books update.">
        <div className="flex flex-wrap gap-2">
          {hasLive && <Button variant="outline" onClick={() => sync(false)} disabled={syncing} data-testid="bank-sync">{syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Sync</Button>}
          {status.accounts.length > 0 && <ConnectButton />}
          {status.accounts.length > 0 && <Button onClick={() => setImportOpen(true)} data-testid="bank-import"><Upload className="mr-2 h-4 w-4" /> Import statement</Button>}
        </div>
      </PageHeader>

      {status.accounts.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="bank-onboarding">
          <Card className="flex flex-col p-6">
            <Upload className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-heading text-lg font-semibold">Import a statement</h3>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">Free and works with any bank. In online banking, download your transactions as CSV or OFX and add the file here. NexusOS reads the columns for you and matches each line to your invoices and bills.</p>
            <Button className="mt-4 self-start" onClick={() => setImportOpen(true)} data-testid="bank-import">Import a statement</Button>
          </Card>
          <Card className="flex flex-col p-6">
            <Link2 className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-heading text-lg font-semibold">Connect your bank</h3>
            {plaid.configured ? (
              <>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">Sign in to your bank through Plaid and new transactions arrive by themselves. NexusOS never sees your bank password.{plaid.env === "sandbox" ? " (Test mode: use the test bank, user_good / pass_good.)" : ""}</p>
                <div className="mt-4"><ConnectButton primary /></div>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground" data-testid="bank-connect-unavailable">
                Live bank feeds aren't switched on for this workspace yet. They use Plaid (US and Canadian banks; free for up to 10 connected banks on Plaid's Trial plan), and need Plaid keys added on the server. Until then, statement import does the same job.
              </p>
            )}
          </Card>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3" data-testid="bank-accounts">
            {status.accounts.map((a) => (
              <Card key={a.id} className="flex min-w-[220px] items-center gap-3 px-4 py-3">
                <Landmark className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.name}{a.mask ? ` ··${a.mask}` : ""}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.source === "plaid" ? "Connected" : "Imported"}{a.institution ? ` · ${a.institution}` : ""}{a.last_synced_at ? ` · ${formatDate(a.last_synced_at)}` : ""}
                    {a.balance != null ? ` · ${format(a.balance)}` : ""}
                  </p>
                  {a.error && <p className="text-xs text-rose-500">{a.error}</p>}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Options for ${a.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {a.source === "plaid" ? <DropdownMenuItem onClick={() => sync(false)}><RefreshCw className="mr-2 h-4 w-4" /> Sync now</DropdownMenuItem>
                      : <DropdownMenuItem onClick={() => setImportOpen(true)}><Upload className="mr-2 h-4 w-4" /> Import more</DropdownMenuItem>}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-rose-500 focus:text-rose-500" onClick={() => setRemoving(a)}><Trash2 className="mr-2 h-4 w-4" /> Remove</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-border/70 bg-muted/40 p-0.5" role="tablist">
              {TABS.map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} data-testid={`bank-tab-${key}`}
                  className={cn("rounded-md px-3 py-1 text-sm font-medium transition-colors", tab === key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {label} <span className="ml-1 text-xs tabular-nums text-muted-foreground">{counts[key]}</span>
                </button>
              ))}
            </div>
            {tab === "review" && confident.length > 1 && (
              <Button variant="outline" size="sm" onClick={confirmAll} disabled={busyId === "all"} data-testid="bank-confirm-all">
                {busyId === "all" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" />}Confirm {confident.length} sure matches
              </Button>
            )}
          </div>

          <Card className="overflow-hidden" data-testid="bank-list">
            {txns.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-12 text-center">
                <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" />
                <p className="font-medium">{tab === "review" ? "Everything is confirmed" : "Nothing here yet"}</p>
                {tab === "review" && <p className="mt-0.5 text-sm text-muted-foreground">{hasLive ? "New transactions arrive when you sync." : "Import your next statement when it's ready."}</p>}
              </div>
            ) : (
              <ul className="divide-y divide-border/50">
                {txns.map((t) => {
                  const s = t.suggestion;
                  return (
                    <li key={t.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center" data-testid="bank-txn">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span className="w-20 shrink-0 pt-0.5 text-xs text-muted-foreground">{formatDate(t.date)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium" title={t.description}>{t.description}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {tab === "review" ? (s ? <><span className={cn("mr-1.5 inline-block h-2 w-2 rounded-full", CONFIDENCE[s.confidence])} aria-hidden />{s.label}{s.reason ? ` — ${s.reason}` : ""}</> : "No match found: say what it was")
                              : t.match?.label}
                            {t.account_name ? ` · ${t.account_name}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold"><Amount value={t.amount} /></span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 pl-[92px] md:pl-0">
                        {tab === "review" ? (
                          <>
                            {s && <Button size="sm" className="h-8" disabled={busyId === t.id} onClick={() => confirmSuggestion(t)} data-testid="bank-confirm">{confirmLabel(s)}</Button>}
                            {!s && t.amount > 0 && <Button size="sm" variant="outline" className="h-8" onClick={() => setInvoiceFor(t)} data-testid="bank-pick-invoice">Which invoice?</Button>}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Other options" data-testid="bank-more"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                {t.amount > 0 && <DropdownMenuItem onClick={() => setInvoiceFor(t)}>Payment for an invoice…</DropdownMenuItem>}
                                {t.amount < 0 && <DropdownMenuItem onClick={() => setExpenseFor(t)} data-testid="bank-as-expense">Record as an expense…</DropdownMenuItem>}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => tryMatch(t, { action: "ignore" })} data-testid="bank-ignore">Ignore (transfer, owner's money…)</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-8" disabled={busyId === t.id} onClick={() => undo(t)} data-testid="bank-undo"><Undo2 className="mr-1.5 h-4 w-4" /> Undo</Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <p className="text-xs text-muted-foreground">Confirming a payment marks the invoice paid on the bank date; confirming an expense records or settles it. Undo reverses both.</p>
        </>
      )}

      <ImportStatementDialog open={importOpen} onOpenChange={setImportOpen} accounts={status.accounts} onDone={() => setTab("review")} />
      <ExpenseFromBankDialog open={!!expenseFor} onOpenChange={(o) => !o && setExpenseFor(null)} txn={expenseFor} onConfirm={(body) => match(expenseFor, body)} />
      <InvoiceForBankDialog open={!!invoiceFor} onOpenChange={(o) => !o && setInvoiceFor(null)} txn={invoiceFor} onConfirm={(body) => match(invoiceFor, body)} />
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} confirmLabel="Remove"
        title={`Remove ${removing?.name}?`}
        description="Its unconfirmed transactions are removed. Payments and expenses you already confirmed from it stay in your books."
        onConfirm={removeAccount} />
    </div>
  );
}
