import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, FileText, Package, Receipt, Briefcase, CheckSquare } from "lucide-react";
import api from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";

const ICONS = { customer: Users, invoice: FileText, product: Package, expense: Receipt, employee: Briefcase, task: CheckSquare };

export function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounced = useDebounce(q, 250);

  useEffect(() => {
    if (!debounced || debounced.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    api.get("/search", { params: { q: debounced } })
      .then(({ data }) => { setResults(data); setOpen(true); })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [debounced]);

  const go = (link) => { setOpen(false); setQ(""); navigate(link); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative hidden max-w-md flex-1 sm:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            placeholder="Search customers, invoices, products..."
            className="h-9 border-border/60 bg-card/50 pl-9"
            data-testid="global-search-input"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-[380px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        {loading ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Searching...</p>
        ) : results.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground" data-testid="search-empty">No results for "{debounced}"</p>
        ) : (
          <div className="max-h-96 overflow-y-auto py-1" data-testid="search-results">
            {results.map((r) => {
              const Icon = ICONS[r.type] || Search;
              return (
                <button key={`${r.type}-${r.id}`} onClick={() => go(r.link)} data-testid={`search-result-${r.id}`}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted"><Icon className="h-4 w-4 text-muted-foreground" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.subtitle}</span>
                  </span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{r.type}</span>
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
