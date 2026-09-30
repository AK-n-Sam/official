import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";

const STAMP = {
  paid: "border-emerald-600 text-emerald-600",
  overdue: "border-rose-600 text-rose-600",
  cancelled: "border-slate-500 text-slate-500",
  partially_paid: "border-amber-600 text-amber-600",
};

/**
 * Standalone, print-ready invoice (outside the app shell) at /print/invoices/:id.
 * Always rendered light for paper; `?autoprint=1` opens the print dialog once it has loaded,
 * where "Save as PDF" produces a PDF named after the invoice.
 */
export default function InvoicePrint() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { format } = useCurrency();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ data: inv }, { data: org }] = await Promise.all([api.get(`/invoices/${id}`), api.get("/organizations/current")]);
        // Members may not see customers they didn't create; the invoice still prints with its stored name.
        const customer = inv.customer_id ? await api.get(`/customers/${inv.customer_id}`).then((r) => r.data).catch(() => null) : null;
        if (!cancelled) setState({ loading: false, inv, org, customer });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: formatApiError(e) });
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const { loading, error, inv, org, customer } = state;

  useEffect(() => {
    if (!inv) return;
    const previous = document.title;
    document.title = `${inv.invoice_number}${org?.name ? ` · ${org.name}` : ""}`;
    let t;
    if (searchParams.get("autoprint") === "1") t = setTimeout(() => window.print(), 400);
    return () => { clearTimeout(t); document.title = previous; };
  }, [inv, org, searchParams]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-100"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  }
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100 text-slate-700">
        <p className="text-sm">Couldn't load this invoice: {error}</p>
        <Link to="/invoices" className="text-sm font-medium text-blue-600 hover:underline">Back to invoices</Link>
      </div>
    );
  }

  const balance = inv.balance ?? inv.total - (inv.amount_paid || 0);
  const orgLines = [org?.address, [org?.city, org?.country].filter(Boolean).join(", "), org?.email, org?.phone, org?.website].filter(Boolean);
  const billTo = [customer?.company && customer.company !== inv.customer_name ? customer.company : "", customer?.email, customer?.phone,
    customer?.address, [customer?.city, customer?.country].filter(Boolean).join(", ")].filter(Boolean);
  const hasDiscount = inv.items.some((it) => Number(it.discount) > 0);

  return (
    <div className="min-h-screen bg-slate-100 py-6 text-slate-900 print:bg-white print:py-0" data-testid="invoice-print">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 print:hidden">
        <Link to={`/invoices/${inv.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to invoice
        </Link>
        <Button onClick={() => window.print()} data-testid="print-now"><Printer className="mr-2 h-4 w-4" /> Print / Save as PDF</Button>
      </div>

      <article className="relative mx-auto max-w-[210mm] bg-white p-8 shadow-sm sm:p-12 print:max-w-none print:p-0 print:shadow-none">
        {STAMP[inv.status] && (
          <div className={`absolute right-10 top-72 rotate-[-12deg] rounded-md border-4 px-4 py-1 text-2xl font-black uppercase tracking-widest opacity-70 ${STAMP[inv.status]}`}>
            {inv.status.replace(/_/g, " ")}
          </div>
        )}

        <header className="flex flex-col justify-between gap-6 sm:flex-row">
          <div>
            <p className="text-xl font-bold">{org?.name}</p>
            {orgLines.map((l) => <p key={l} className="text-sm text-slate-600">{l}</p>)}
            {org?.tax_id && <p className="mt-1 text-sm text-slate-600">Tax ID: {org.tax_id}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-3xl font-black uppercase tracking-tight text-slate-800">Invoice</p>
            <p className="mt-1 font-mono text-base font-semibold" data-testid="print-invoice-number">{inv.invoice_number}</p>
            <dl className="mt-3 grid grid-cols-[auto_auto] justify-start gap-x-4 gap-y-0.5 text-sm sm:justify-end">
              <dt className="text-slate-500">Issued</dt><dd>{formatDate(inv.issue_date)}</dd>
              <dt className="text-slate-500">Due</dt><dd className="font-semibold">{formatDate(inv.due_date)}</dd>
            </dl>
          </div>
        </header>

        <section className="mt-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bill to</p>
          <p className="mt-1 text-base font-semibold">{inv.customer_name}</p>
          {billTo.map((l) => <p key={l} className="text-sm text-slate-600">{l}</p>)}
        </section>

        <table className="mt-8 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-2 font-semibold">Description</th>
              <th className="px-2 py-2 text-right font-semibold">Qty</th>
              <th className="px-2 py-2 text-right font-semibold">Unit price</th>
              {hasDiscount && <th className="px-2 py-2 text-right font-semibold">Discount</th>}
              <th className="py-2 pl-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it, i) => (
              <tr key={i} className="border-b border-slate-200 align-top">
                <td className="py-2.5 pr-2">{it.description}</td>
                <td className="px-2 py-2.5 text-right font-mono">{it.quantity}</td>
                <td className="px-2 py-2.5 text-right font-mono">{format(it.unit_price)}</td>
                {hasDiscount && <td className="px-2 py-2.5 text-right font-mono">{Number(it.discount) > 0 ? `−${format(it.discount)}` : "—"}</td>}
                <td className="py-2.5 pl-2 text-right font-mono font-semibold">{format(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="font-mono">{format(inv.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Tax ({+((inv.tax_rate || 0) * 100).toFixed(2)}%)</dt><dd className="font-mono">{format(inv.tax_amount)}</dd></div>
            <div className="flex justify-between border-t-2 border-slate-800 pt-1.5 text-base font-bold"><dt>Total</dt><dd className="font-mono">{format(inv.total)}</dd></div>
            {(inv.amount_paid || 0) > 0 && <div className="flex justify-between text-slate-600"><dt>Paid</dt><dd className="font-mono">−{format(inv.amount_paid)}</dd></div>}
            <div className="flex justify-between rounded bg-slate-100 px-2 py-1.5 font-bold print:bg-transparent print:px-0" data-testid="print-balance">
              <dt>Balance due</dt><dd className="font-mono">{format(Math.max(0, balance))}</dd>
            </div>
          </dl>
        </div>

        {inv.notes && (
          <section className="mt-10 border-t border-slate-200 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notes</p>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{inv.notes}</p>
          </section>
        )}
      </article>
    </div>
  );
}
