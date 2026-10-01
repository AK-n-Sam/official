import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Loader2, Upload, FileText, Search, ChevronDown } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { formatDate } from "@/lib/format";
import { balanceOf, UNPAID } from "@/lib/invoices";
import { notifyDataChanged } from "@/hooks/useDataChanged";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const MAX_BYTES = 3 * 1024 * 1024;
const NONE = "__none__";
const NEW_ACCOUNT = "__new__";
const DATE_FORMATS = [
  ["%Y-%m-%d", "2026-09-30"], ["%d/%m/%Y", "30/09/2026"], ["%m/%d/%Y", "09/30/2026"], ["%d-%m-%Y", "30-09-2026"],
  ["%d.%m.%Y", "30.09.2026"], ["%d/%m/%y", "30/09/26"], ["%m/%d/%y", "09/30/26"], ["%d %b %Y", "30 Sep 2026"], ["%d-%b-%Y", "30-Sep-2026"], ["%b %d, %Y", "Sep 30, 2026"],
];
const COLUMN_FIELDS = [
  ["date", "Date"], ["description", "Description"], ["amount", "Amount (+ in / − out)"], ["money_in", "Money in"], ["money_out", "Money out"],
];

function Amount({ value }) {
  const { format } = useCurrency();
  return <span className={cn("font-mono tabular-nums", value > 0 ? "text-emerald-600 dark:text-emerald-500" : "")}>{value > 0 ? "+" : "−"}{format(Math.abs(value))}</span>;
}

/**
 * Import a statement downloaded from online banking (CSV, OFX or QFX). Columns and date format are
 * detected; the preview shows exactly what will be imported, and the columns can be corrected.
 */
export function ImportStatementDialog({ open, onOpenChange, accounts, onDone }) {
  const [file, setFile] = useState(null);
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [showColumns, setShowColumns] = useState(false);
  const [accountId, setAccountId] = useState(NEW_ACCOUNT);
  const [accountName, setAccountName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const importAccounts = accounts.filter((a) => a.source === "import");

  useEffect(() => {
    if (!open) return;
    setFile(null); setContent(""); setPreview(null); setMapping(null); setShowColumns(false); setErr(""); setBusy(false);
    setAccountId(importAccounts[0]?.id || NEW_ACCOUNT); setAccountName("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const runPreview = async (text, name, map) => {
    setBusy(true); setErr("");
    try {
      const { data } = await api.post("/bank/import/preview", { filename: name, content: text, ...(map ? { mapping: map } : {}) });
      setPreview(data);
      setMapping(data.mapping);
      if (data.problems?.length) setShowColumns(true);
    } catch (e) { setErr(formatApiError(e)); setPreview(null); }
    finally { setBusy(false); }
  };

  const pick = async (f) => {
    if (!f) return;
    if (f.size > MAX_BYTES) return setErr("That file is over 3 MB. Download a shorter date range from your bank.");
    const text = await f.text();
    setFile(f); setContent(text);
    if (!accountName) setAccountName(f.name.replace(/\.(csv|ofx|qfx|txt)$/i, "").replace(/[_-]+/g, " ").slice(0, 60) || "Bank account");
    runPreview(text, f.name);
  };

  const changeColumn = (field, value) => {
    const next = { ...mapping, [field]: value === NONE ? "" : value };
    if (field === "amount" && next.amount) { next.money_in = ""; next.money_out = ""; }
    if ((field === "money_in" || field === "money_out") && value !== NONE) next.amount = "";
    setMapping(next);
    runPreview(content, file.name, next);
  };

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const { data } = await api.post("/bank/import", {
        filename: file.name, content, ...(mapping ? { mapping } : {}),
        ...(accountId === NEW_ACCOUNT ? { account_name: accountName || "Bank account" } : { account_id: accountId }),
      });
      toast.success(`Imported ${data.imported} transaction${data.imported === 1 ? "" : "s"}`, {
        description: `${formatDate(data.first_date)} – ${formatDate(data.last_date)}${data.duplicates ? ` · ${data.duplicates} already imported, skipped` : ""}`,
      });
      notifyDataChanged();
      onOpenChange(false);
      onDone?.(data);
    } catch (e) { setErr(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const ready = preview && !preview.problems?.length && preview.count > 0;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl" data-testid="import-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl">Import a bank statement</DialogTitle>
          <DialogDescription>In your online banking, download your transactions as CSV, OFX or QFX (often under “Export” or “Download statement”), then add the file here.</DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
          onClick={() => inputRef.current?.click()}
          role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
          className={cn("flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent/40")}
          data-testid="import-drop"
        >
          {file ? <FileText className="h-6 w-6 text-primary" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
          <p className="text-sm font-medium">{file ? file.name : "Drop the file here, or click to choose"}</p>
          <p className="text-xs text-muted-foreground">{file ? "Click to choose a different file" : "CSV, OFX or QFX · up to 3 MB"}</p>
          <input ref={inputRef} type="file" accept=".csv,.ofx,.qfx,.txt,text/csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} data-testid="import-file" />
        </div>

        {busy && !preview && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reading the file...</p>}

        {preview && (
          <div className="space-y-3">
            {preview.problems?.length > 0 ? (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm" role="alert" data-testid="import-problems">
                {preview.problems.join(". ")}. Set the columns below.
              </p>
            ) : (
              <p className="text-sm" data-testid="import-count"><span className="font-semibold">{preview.count}</span> transactions found{preview.skipped ? ` (${preview.skipped} rows without a date or amount skipped)` : ""}. First few:</p>
            )}
            {preview.rows.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border/70">
                <table className="w-full text-sm" data-testid="import-preview">
                  <tbody className="divide-y divide-border/50">
                    {preview.rows.map((r, i) => (
                      <tr key={i}><td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{formatDate(r.date)}</td>
                        <td className="max-w-[260px] truncate px-3 py-1.5">{r.description}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right"><Amount value={r.amount} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.format === "csv" && (
              <div>
                <button type="button" onClick={() => setShowColumns((s) => !s)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground" aria-expanded={showColumns} data-testid="import-columns-toggle">
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showColumns && "rotate-180")} /> {showColumns ? "Hide columns" : "Columns look wrong? Set them"}
                </button>
                {showColumns && mapping && (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="import-columns">
                    {COLUMN_FIELDS.map(([field, label]) => (
                      <div key={field}>
                        <Label className="text-[11px] text-muted-foreground">{label}</Label>
                        <Select value={mapping[field] || NONE} onValueChange={(v) => changeColumn(field, v)}>
                          <SelectTrigger className="mt-1 h-8 text-xs" aria-label={`${label} column`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Not in this file</SelectItem>
                            {preview.columns.filter(Boolean).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Dates look like</Label>
                      <Select value={mapping.date_format || NONE} onValueChange={(v) => changeColumn("date_format", v)}>
                        <SelectTrigger className="mt-1 h-8 text-xs" aria-label="Date format"><SelectValue placeholder="Choose" /></SelectTrigger>
                        <SelectContent>{DATE_FORMATS.map(([f, ex]) => <SelectItem key={f} value={f}>{ex}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">Into account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="mt-1" aria-label="Account" data-testid="import-account"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {importAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    <SelectItem value={NEW_ACCOUNT}>A new account…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {accountId === NEW_ACCOUNT && (
                <div>
                  <Label htmlFor="import-account-name" className="text-xs text-muted-foreground">Account name</Label>
                  <Input id="import-account-name" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. Business current account" className="mt-1" data-testid="import-account-name" />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Already-imported transactions are skipped, so overlapping statements are fine.</p>
          </div>
        )}

        {err && <p className="text-sm text-rose-500" role="alert" data-testid="import-error">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={!ready || busy} data-testid="import-submit">
            {busy && preview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Import {ready ? `${preview.count} transactions` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "This was an expense": category (suggested from past expenses), vendor and optional supplier. */
export function ExpenseFromBankDialog({ open, onOpenChange, txn, onConfirm }) {
  const { format } = useCurrency();
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [category, setCategory] = useState("");
  const [vendor, setVendor] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open || !txn) return;
    const s = txn.suggestion?.action === "create_expense" ? txn.suggestion : {};
    setCategory(s.category || ""); setVendor(s.vendor || ""); setSupplierId(s.supplier_id || ""); setErr("");
    Promise.all([api.get("/expenses"), api.get("/suppliers")]).then(([e, sp]) => {
      setCategories([...new Set(e.data.map((x) => x.category).filter(Boolean))].sort());
      setSuppliers(sp.data);
    }).catch(() => {});
  }, [open, txn]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!category.trim()) return setErr("Choose or type a category");
    setBusy(true);
    try { await onConfirm({ action: "create_expense", category: category.trim(), vendor: vendor.trim(), supplier_id: supplierId }); onOpenChange(false); }
    catch (e2) { setErr(formatApiError(e2)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md" data-testid="bank-expense-dialog">
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Record as an expense</DialogTitle>
            <DialogDescription>{txn ? `${format(Math.abs(txn.amount))} on ${formatDate(txn.date)} · ${txn.description}` : ""}</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="bank-exp-category" className="text-xs text-muted-foreground">Category</Label>
            <Input id="bank-exp-category" list="bank-exp-categories" value={category} onChange={(e) => { setCategory(e.target.value); setErr(""); }} placeholder="e.g. Utilities" className="mt-1.5" autoFocus data-testid="bank-exp-category" />
            <datalist id="bank-exp-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="bank-exp-vendor" className="text-xs text-muted-foreground">Paid to</Label>
              <Input id="bank-exp-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} className="mt-1.5" disabled={!!supplierId} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Supplier</Label>
              <Select value={supplierId || NONE} onValueChange={(v) => setSupplierId(v === NONE ? "" : v)}>
                <SelectTrigger className="mt-1.5" aria-label="Supplier"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not a supplier</SelectItem>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {err && <p className="text-sm text-rose-500" role="alert">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy} data-testid="bank-exp-submit">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record expense</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "This was a payment for…": the unpaid invoices this deposit could pay (it can't overpay). */
export function InvoiceForBankDialog({ open, onOpenChange, txn, onConfirm }) {
  const { format } = useCurrency();
  const [invoices, setInvoices] = useState([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery(""); setErr("");
    api.get("/invoices").then(({ data }) => setInvoices(data.filter((i) => UNPAID.includes(i.status) && balanceOf(i) > 0))).catch((e) => setErr(formatApiError(e)));
  }, [open]);

  const amount = txn?.amount || 0;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices
      .filter((i) => !q || i.invoice_number.toLowerCase().includes(q) || (i.customer_name || "").toLowerCase().includes(q))
      .sort((a, b) => Math.abs(balanceOf(a) - amount) - Math.abs(balanceOf(b) - amount));
  }, [invoices, query, amount]);

  const choose = async (inv) => {
    setBusy(true);
    try { await onConfirm({ action: "invoice_payment", invoice_id: inv.id }); onOpenChange(false); }
    catch (e) { setErr(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" data-testid="bank-invoice-dialog">
        <DialogHeader>
          <DialogTitle>Which invoice did this pay?</DialogTitle>
          <DialogDescription>{txn ? `${format(amount)} received on ${formatDate(txn.date)} · ${txn.description}` : ""}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Invoice number or customer..." className="pl-9" aria-label="Find an invoice" autoFocus />
        </div>
        <ul className="divide-y divide-border/50 rounded-lg border border-border/70">
          {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No unpaid invoices match.</li>}
          {shown.slice(0, 40).map((i) => {
            const bal = balanceOf(i);
            const tooBig = amount > bal + 0.01;
            return (
              <li key={i.id}>
                <button type="button" disabled={tooBig || busy} onClick={() => choose(i)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50">
                  <span className="min-w-0"><span className="font-mono font-medium">{i.invoice_number}</span> · <span className="truncate">{i.customer_name}</span>
                    <span className="block text-xs text-muted-foreground">due {formatDate(i.due_date)}{tooBig ? " · balance is less than this deposit" : Math.abs(bal - amount) < 0.01 ? " · exact amount" : " · part payment"}</span></span>
                  <span className="shrink-0 font-mono text-xs">{format(bal)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {err && <p className="text-sm text-rose-500" role="alert">{err}</p>}
      </DialogContent>
    </Dialog>
  );
}

export { Amount };
