import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, SearchX, Lightbulb, Info, ArrowRight, Keyboard, MessageCircleQuestion, FileText, CreditCard, Package, UserPlus, X } from "lucide-react";
import { HELP_GROUPS, HELP_SECTIONS, SHORTCUTS, FAQ } from "@/modules/helpContent";
import { IS_MAC } from "@/components/layout/CommandPalette";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Icon } from "@/components/common/Icon";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

const QUICK_START = [
  { id: "invoices", title: "Send your first invoice", text: "Customer, line items, done.", icon: FileText },
  { id: "payments", title: "Record a payment", text: "Full or partial, in two clicks.", icon: CreditCard },
  { id: "products-inventory", title: "Keep stock accurate", text: "Movements and reorder alerts.", icon: Package },
  { id: "team-roles", title: "Invite your team", text: "Roles and who sees what.", icon: UserPlus },
];
const POPULAR = ["payment", "overdue", "stock", "discount", "roles", "currency"];

// Plain text of a section, lower-cased, for search.
const blockText = (b) => [b.p, b.tip, b.note, ...(b.list || []), ...(b.steps || []), ...(b.statuses || []).flat(), ...(b.terms || []).flat()]
  .filter(Boolean).join(" ");
const SEARCH_TEXT = Object.fromEntries(HELP_SECTIONS.map((s) => [
  s.id, [s.title, s.summary, s.group, ...s.blocks.map(blockText)].join(" ").toLowerCase(),
]));

function Kbd({ children }) {
  return <kbd className="mx-0.5 inline-flex min-w-[1.5rem] items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground">{children}</kbd>;
}

/** Renders **bold** and `key` markup from the help content. */
function Rich({ text }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <Kbd key={i}>{part.slice(1, -1)}</Kbd>;
    return part;
  });
}

function Block({ block }) {
  if (block.p) return <p><Rich text={block.p} /></p>;
  if (block.list) {
    return (
      <ul className="ml-5 list-disc space-y-1.5 marker:text-primary/60">
        {block.list.map((t, i) => <li key={i}><Rich text={t} /></li>)}
      </ul>
    );
  }
  if (block.steps) {
    return (
      <ol className="space-y-2.5">
        {block.steps.map((t, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{i + 1}</span>
            <span><Rich text={t} /></span>
          </li>
        ))}
      </ol>
    );
  }
  if (block.tip || block.note) {
    const tip = !!block.tip;
    const CalloutIcon = tip ? Lightbulb : Info;
    return (
      <div className={cn("flex gap-3 rounded-lg border p-3.5", tip ? "border-primary/25 bg-primary/5" : "border-amber-500/30 bg-amber-500/5")}>
        <CalloutIcon className={cn("mt-0.5 h-4 w-4 shrink-0", tip ? "text-primary" : "text-amber-500")} />
        <p><Rich text={block.tip || block.note} /></p>
      </div>
    );
  }
  if (block.statuses) {
    return (
      <div className="divide-y divide-border/60 rounded-lg border border-border/70">
        {block.statuses.map(([status, text]) => (
          <div key={status} className="flex flex-col gap-1.5 px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-4">
            <div className="w-32 shrink-0"><StatusBadge status={status} /></div>
            <p><Rich text={text} /></p>
          </div>
        ))}
      </div>
    );
  }
  if (block.terms) {
    return (
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-[150px_minmax(0,1fr)]">
        {block.terms.map(([term, text]) => (
          <div key={term} className="contents">
            <dt className="font-semibold text-foreground">{term}</dt>
            <dd className="-mt-1.5 sm:mt-0"><Rich text={text} /></dd>
          </div>
        ))}
      </dl>
    );
  }
  return null;
}

function SectionShell({ id, icon, title, summary, children, footer }) {
  return (
    <section id={id} data-help-section className="scroll-mt-4" data-testid={`help-section-${id}`}>
      <Card className="border-border/80 bg-card/90 p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-semibold tracking-tight">{title}</h2>
            {summary && <p className="mt-0.5 text-sm text-muted-foreground">{summary}</p>}
          </div>
        </div>
        <div className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
        {footer}
      </Card>
    </section>
  );
}

export default function Help() {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(HELP_SECTIONS[0].id);
  const q = query.trim().toLowerCase();

  const sections = useMemo(() => (q ? HELP_SECTIONS.filter((s) => SEARCH_TEXT[s.id].includes(q)) : HELP_SECTIONS), [q]);
  const faq = useMemo(() => (q ? FAQ.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(q)) : FAQ), [q]);
  const showShortcuts = !q || "keyboard shortcuts keys".includes(q) || SHORTCUTS.some((s) => s.action.toLowerCase().includes(q));
  const nothing = !sections.length && !faq.length && !showShortcuts;

  const tocGroups = useMemo(() => HELP_GROUPS
    .map((g) => ({ group: g, items: sections.filter((s) => s.group === g) }))
    .filter((g) => g.items.length), [sections]);

  const jumpTo = (id) => navigate({ hash: id }, { replace: true });

  // Scroll to the topic in the URL hash on every navigation: deep links (header help button, `?`
  // shortcut, palette), table-of-contents clicks, and repeat clicks on the same topic.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (!id) return;
    // A search may be hiding the requested topic; clear it so the topic renders before scrolling.
    if (!document.getElementById(id)) setQuery("");
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }, 50);
    return () => clearTimeout(t);
  }, [location.key, location.hash]);

  // Highlight the table-of-contents entry for the section currently in view.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll("[data-help-section]"));
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver((entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setActiveId(top.target.id);
    }, { rootMargin: "-15% 0px -70% 0px" });
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sections, faq, showShortcuts]);

  const tocLink = (id, label, iconName) => (
    <button
      key={id}
      type="button"
      onClick={() => jumpTo(id)}
      data-testid={`help-toc-${id}`}
      className={cn(
        "flex w-full items-center gap-2 rounded-md border-l-2 px-2.5 py-1.5 text-left text-sm transition-colors",
        activeId === id ? "border-primary bg-primary/10 font-medium text-primary" : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon name={iconName} className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader title="Help Center" subtitle="Guides, shortcuts and answers for everything in NexusOS." />

      <Card className="relative overflow-hidden border-border/80 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm sm:p-6">
        <p className="font-heading text-base font-semibold">How can we help?</p>
        <div className="relative mt-3 max-w-2xl">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search help, e.g. "partial payment" or "low stock"'
            className="h-11 bg-background pl-10 pr-10 text-base sm:text-sm"
            data-testid="help-search"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Popular:</span>
          {POPULAR.map((w) => (
            <button key={w} type="button" onClick={() => setQuery(w)} className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
              {w}
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Tip: press <Kbd>?</Kbd> on any page to open its guide, or <Kbd>{IS_MAC ? "⌘" : "Ctrl"}</Kbd>+<Kbd>K</Kbd> to search and create from anywhere.
        </p>
      </Card>

      {!q && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="help-quick-start">
          {QUICK_START.map((c) => (
            <button key={c.id} type="button" onClick={() => jumpTo(c.id)}
              className="group flex items-center gap-3 rounded-xl border border-border/80 bg-card/90 p-4 text-left shadow-sm transition-colors hover:border-primary/40">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><c.icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{c.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{c.text}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>
          ))}
        </div>
      )}

      {/* Mobile: horizontal jump list in place of the sidebar table of contents. */}
      {!nothing && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none lg:hidden">
          {sections.map((s) => (
            <button key={s.id} type="button" onClick={() => jumpTo(s.id)}
              className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
                activeId === s.id ? "border-primary/50 bg-primary/10 text-primary" : "border-border/80 text-muted-foreground")}>
              {s.title}
            </button>
          ))}
          {showShortcuts && <button type="button" onClick={() => jumpTo("shortcuts")} className="shrink-0 rounded-full border border-border/80 px-3 py-1.5 text-xs font-medium text-muted-foreground">Shortcuts</button>}
          {faq.length > 0 && <button type="button" onClick={() => jumpTo("faq")} className="shrink-0 rounded-full border border-border/80 px-3 py-1.5 text-xs font-medium text-muted-foreground">FAQ</button>}
        </div>
      )}

      {nothing ? (
        <EmptyState icon={SearchX} title={`No help topics match "${query.trim()}"`} description="Try a different word, or clear the search to browse every topic."
          actionLabel="Clear search" onAction={() => setQuery("")} testId="help-empty" />
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[210px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <nav className="sticky top-4 space-y-4" aria-label="Help topics" data-testid="help-toc">
              {tocGroups.map(({ group, items }) => (
                <div key={group}>
                  <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">{group}</p>
                  <div className="space-y-0.5">{items.map((s) => tocLink(s.id, s.title, s.icon))}</div>
                </div>
              ))}
              {(showShortcuts || faq.length > 0) && (
                <div>
                  <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">Reference</p>
                  <div className="space-y-0.5">
                    {showShortcuts && tocLink("shortcuts", "Keyboard shortcuts", "Keyboard")}
                    {faq.length > 0 && tocLink("faq", "FAQ", "MessageCircleQuestion")}
                  </div>
                </div>
              )}
            </nav>
          </aside>

          <div className="min-w-0 space-y-6">
            {sections.map((s) => (
              <SectionShell
                key={s.id}
                id={s.id}
                icon={<Icon name={s.icon} className="h-[18px] w-[18px]" />}
                title={s.title}
                summary={s.summary}
                footer={s.links?.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-border/60 pt-4">
                    {s.links.map((l) => (
                      <Button key={l.to} variant="outline" size="sm" onClick={() => navigate(l.to)} data-testid={`help-link-${s.id}`}>
                        {l.label} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Button>
                    ))}
                  </div>
                )}
              >
                {s.blocks.map((b, i) => <Block key={i} block={b} />)}
              </SectionShell>
            ))}

            {showShortcuts && (
              <SectionShell id="shortcuts" icon={<Keyboard className="h-[18px] w-[18px]" />} title="Keyboard shortcuts" summary="Get around without reaching for the mouse.">
                <div className="divide-y divide-border/60 rounded-lg border border-border/70">
                  {SHORTCUTS.map((s) => (
                    <div key={s.action} className="flex items-center justify-between gap-4 px-3.5 py-2.5">
                      <span>{s.action}</span>
                      <span className="flex shrink-0 items-center">
                        {(IS_MAC && s.mac ? s.mac : s.keys).map((k, i, arr) => (
                          <span key={k} className="flex items-center"><Kbd>{k}</Kbd>{i < arr.length - 1 && <span className="text-xs">+</span>}</span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </SectionShell>
            )}

            {faq.length > 0 && (
              <SectionShell id="faq" icon={<MessageCircleQuestion className="h-[18px] w-[18px]" />} title="Frequently asked questions" summary="Quick answers to common questions.">
                <Accordion type="multiple" className="-mt-2" data-testid="help-faq">
                  {faq.map((f, i) => (
                    <AccordionItem key={f.q} value={`faq-${i}`} className="border-border/60">
                      <AccordionTrigger className="text-left text-sm font-medium text-foreground hover:no-underline">{f.q}</AccordionTrigger>
                      <AccordionContent className="text-sm leading-relaxed text-muted-foreground"><Rich text={f.a} /></AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </SectionShell>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
