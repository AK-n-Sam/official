import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Search, Users, FileText, Package, Receipt, Briefcase, CheckSquare, Target, Loader2,
  SunMoon, PanelLeft, Rows3, LifeBuoy, Keyboard, Truck, ShoppingCart, HandCoins, PackagePlus,
} from "lucide-react";
import api from "@/lib/api";
import { ALL_PAGES } from "@/lib/constants";
import { useActions } from "@/components/actions/ActionsProvider";
import { helpPathFor } from "@/modules/helpContent";
import { useDebounce } from "@/hooks/useDebounce";
import { useTheme } from "@/context/ThemeContext";
import { useLayout } from "@/context/LayoutContext";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty } from "@/components/ui/command";

const RESULT_ICONS = { customer: Users, invoice: FileText, product: Package, expense: Receipt, employee: Briefcase, task: CheckSquare, lead: Target, supplier: Truck };

/**
 * The things an owner does, in business terms. The first three are one-step actions that update
 * every connected record (customer, invoice, payment, stock, expense); the rest open a form.
 */
export function useBusinessActions() {
  const actions = useActions();
  const navigate = useNavigate();
  return useMemo(() => [
    { id: "sale", label: "Make a sale", icon: ShoppingCart, run: () => actions.sell(), keywords: "sell order receipt" },
    { id: "get-paid", label: "Get paid", icon: HandCoins, run: () => actions.getPaid(), keywords: "payment receive money collect" },
    { id: "buy-stock", label: "Buy stock", icon: PackagePlus, run: () => actions.buyStock(), keywords: "restock purchase inventory order" },
    { id: "invoice", label: "New invoice", icon: FileText, run: () => actions.sell({ mode: "invoice" }), keywords: "bill" },
    { id: "expense", label: "Record an expense", icon: Receipt, run: () => navigate("/expenses?new=1"), keywords: "cost spend bill" },
    { id: "follow-up", label: "Follow up", icon: CheckSquare, run: () => actions.followUp(), keywords: "task remind todo call" },
    { id: "customer", label: "Add a customer", icon: Users, run: () => navigate("/customers?new=1"), keywords: "client" },
    { id: "lead", label: "Add a lead", icon: Target, run: () => navigate("/leads?new=1"), keywords: "prospect deal pipeline" },
    { id: "product", label: "Add a product", icon: Package, run: () => navigate("/products?new=1"), keywords: "item service" },
  ], [actions, navigate]);
}

const PAGES = ALL_PAGES;

export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const PALETTE_SHORTCUT = IS_MAC ? "⌘K" : "Ctrl K";

const matches = (q, ...texts) => texts.some((t) => t && t.toLowerCase().includes(q));

function isTypingTarget(el) {
  return el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** Header search trigger + the Ctrl/⌘+K command palette: search records, create, and jump anywhere. */
export function CommandPalette() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { toggleTheme } = useTheme();
  const { toggleSidebar, density, setDensity } = useLayout();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounced = useDebounce(query.trim(), 200);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  useEffect(() => {
    if (debounced.length < 2) { setResults([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    api.get("/search", { params: { q: debounced } })
      .then(({ data }) => { if (!cancelled) setResults(data); })
      .catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [debounced]);

  const q = query.trim().toLowerCase();
  const businessActions = useBusinessActions();
  const creates = useMemo(() => businessActions.filter((a) => !q || matches(q, a.label, a.keywords, "create add new")), [q, businessActions]);
  const pages = useMemo(() => PAGES.filter((p) => !q || matches(q, p.name, p.section)), [q]);
  const prefs = useMemo(() => [
    { id: "theme", label: "Toggle light / dark theme", icon: SunMoon, run: toggleTheme },
    { id: "sidebar", label: "Collapse / expand sidebar", icon: PanelLeft, run: toggleSidebar },
    { id: "density", label: density === "compact" ? "Switch to comfortable rows" : "Switch to compact rows", icon: Rows3,
      run: () => setDensity(density === "compact" ? "comfortable" : "compact") },
  ].filter((p) => !q || matches(q, p.label)), [q, density, toggleTheme, toggleSidebar, setDensity]);
  const helps = useMemo(() => [
    { id: "page", label: "Help for this page", icon: LifeBuoy, path: helpPathFor(pathname) },
    { id: "shortcuts", label: "Keyboard shortcuts", icon: Keyboard, path: "/help#shortcuts" },
  ].filter((h) => !q || matches(q, h.label, "help guide docs")), [q, pathname]);

  const run = (fn) => { setOpen(false); fn(); };
  const stillSearching = searching || (q.length >= 2 && debounced !== query.trim());
  const nothing = !stillSearching && !results.length && !creates.length && !pages.length && !prefs.length && !helps.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="global-search-trigger"
        className="hidden h-9 max-w-md flex-1 items-center gap-2 rounded-md border border-border/60 bg-card/50 px-3 text-sm text-muted-foreground transition-colors hover:border-border hover:bg-card sm:flex"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">Search or jump to...</span>
        <kbd className="pointer-events-none hidden select-none rounded border border-border/70 bg-muted px-1.5 font-mono text-[10px] font-medium md:inline-block">
          {PALETTE_SHORTCUT}
        </kbd>
      </button>
      <Button variant="ghost" size="icon" className="h-9 w-9 sm:hidden" onClick={() => setOpen(true)} data-testid="global-search-trigger-mobile" aria-label="Search">
        <Search className="h-[18px] w-[18px]" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl [&>button.absolute]:hidden" data-testid="command-palette">
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <DialogDescription className="sr-only">Search records, create items, or jump to a page.</DialogDescription>
          <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Find anything, or type what you want to do (e.g. sell, restock)"
              className="h-12"
              data-testid="global-search-input"
            />
            <CommandList className="max-h-[min(60vh,420px)]">
              {nothing && <CommandEmpty data-testid="search-empty">No results for "{query}"</CommandEmpty>}

              {creates.length > 0 && (
                <CommandGroup heading="Do">
                  {creates.map((a) => (
                    <CommandItem key={a.id} value={`create-${a.id}`} onSelect={() => run(a.run)} data-testid={`palette-create-${a.id}`} className="gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><a.icon className="h-4 w-4" /></span>
                      {a.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {q.length >= 2 && (stillSearching || results.length > 0) && (
                <CommandGroup heading="Records" data-testid="search-results">
                  {stillSearching && !results.length ? (
                    <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Searching...
                    </div>
                  ) : results.map((r) => {
                    const RIcon = RESULT_ICONS[r.type] || Search;
                    return (
                      <CommandItem key={`${r.type}-${r.id}`} value={`record-${r.type}-${r.id}`} onSelect={() => run(() => navigate(r.link))} data-testid={`search-result-${r.id}`} className="gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted"><RIcon className="h-4 w-4 text-muted-foreground" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{r.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{r.subtitle}</span>
                        </span>
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">{r.type}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}

              {pages.length > 0 && (
                <CommandGroup heading="Go to">
                  {pages.map((p) => (
                    <CommandItem key={p.path} value={`page-${p.path}`} onSelect={() => run(() => navigate(p.path))} data-testid={`palette-page-${p.name.toLowerCase().replace(/\s+/g, "-")}`} className="gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted"><Icon name={p.icon} className="h-4 w-4 text-muted-foreground" /></span>
                      <span className="flex-1">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.section}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {helps.length > 0 && (
                <CommandGroup heading="Help">
                  {helps.map((h) => (
                    <CommandItem key={h.id} value={`help-${h.id}`} onSelect={() => run(() => navigate(h.path))} data-testid={`palette-help-${h.id}`} className="gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted"><h.icon className="h-4 w-4 text-muted-foreground" /></span>
                      {h.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {prefs.length > 0 && (
                <CommandGroup heading="Preferences">
                  {prefs.map((p) => (
                    <CommandItem key={p.id} value={`pref-${p.id}`} onSelect={() => run(p.run)} data-testid={`palette-pref-${p.id}`} className="gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted"><p.icon className="h-4 w-4 text-muted-foreground" /></span>
                      {p.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
            <div className="flex items-center gap-4 border-t border-border/70 px-4 py-2 text-[11px] text-muted-foreground">
              <span><kbd className="font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono">↵</kbd> open</span>
              <span><kbd className="font-mono">esc</kbd> close</span>
              <span className="ml-auto hidden sm:inline">Press <kbd className="font-mono">/</kbd> anywhere to search</span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
