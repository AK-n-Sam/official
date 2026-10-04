import { useEffect, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, ChevronDown } from "lucide-react";
import { Icon } from "@/components/common/Icon";
import { NAV_SECTIONS } from "@/lib/constants";
import { TAB_TITLE_EVENT } from "@/hooks/useTabTitle";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const NAV_MAP = {};
NAV_SECTIONS.forEach((s) => s.items.forEach((i) => { NAV_MAP[i.path] = i; }));

const HOME = "/dashboard";
const STORAGE = "bmp_open_tabs";
const DETAIL_ROUTES = {
  customers: { label: "Customer", icon: "Users" },
  invoices: { label: "Invoice", icon: "FileText" },
  employees: { label: "Employee", icon: "Briefcase" },
};

function resolveTab(pathname) {
  if (NAV_MAP[pathname]) return { path: pathname, label: NAV_MAP[pathname].name, icon: NAV_MAP[pathname].icon };
  const [section, id] = pathname.split("/").filter(Boolean);
  const detail = DETAIL_ROUTES[section];
  if (detail && id) return { path: pathname, label: `${detail.label} · ${id.slice(-4)}`, icon: detail.icon };
  return null; // unknown route: the shell redirects it, so don't open a tab for it
}

const tid = (p) => p.replace(/\//g, "-");

export function WorkspaceTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = location.pathname;

  const [tabs, setTabs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE) || "[]");
      const valid = Array.isArray(saved) ? saved.filter((t) => t?.path && resolveTab(t.path)) : [];
      if (valid.length) return valid;
    } catch (e) { /* ignore */ }
    return [resolveTab(HOME)];
  });

  useEffect(() => { localStorage.setItem(STORAGE, JSON.stringify(tabs)); }, [tabs]);

  useEffect(() => {
    const tab = resolveTab(active);
    if (!tab) return;
    setTabs((prev) => (prev.some((t) => t.path === active) ? prev : [...prev, tab]));
  }, [active]);

  // Detail pages report a readable title once their record loads (see useTabTitle).
  useEffect(() => {
    const onTitle = (e) => {
      const { path, title } = e.detail;
      setTabs((prev) => prev.map((t) => (t.path === path && t.label !== title ? { ...t, label: title } : t)));
    };
    window.addEventListener(TAB_TITLE_EVENT, onTitle);
    return () => window.removeEventListener(TAB_TITLE_EVENT, onTitle);
  }, []);

  const closeTab = useCallback((path) => {
    const idx = tabs.findIndex((t) => t.path === path);
    const remaining = tabs.filter((t) => t.path !== path);
    const safe = remaining.length ? remaining : [resolveTab(HOME)];
    setTabs(safe);
    if (path === active) navigate((safe[Math.max(0, idx - 1)] || safe[0]).path);
  }, [tabs, active, navigate]);

  const closeOthers = () => {
    setTabs(tabs.filter((t) => t.path === HOME || t.path === active));
  };

  const closeAll = () => {
    setTabs([resolveTab(HOME)]);
    if (active !== HOME) navigate(HOME);
  };

  return (
    <div className="flex items-center gap-1 border-b border-border/70 bg-card/40 px-2 py-1 backdrop-blur-sm" data-testid="workspace-tabs">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
        {tabs.map((t) => {
          const isActive = t.path === active;
          const closable = t.path !== HOME;
          return (
            <div
              key={t.path}
              role="button"
              tabIndex={0}
              title={closable ? `${t.label} — middle-click to close` : t.label}
              onClick={() => navigate(t.path)}
              onKeyDown={(e) => { if (e.key === "Enter") navigate(t.path); }}
              onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
              onAuxClick={(e) => { if (e.button === 1 && closable) closeTab(t.path); }}
              data-testid={`tab-chip${tid(t.path)}`}
              className={cn(
                "group flex shrink-0 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
                isActive
                  ? "border-border bg-card text-foreground shadow-sm"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon name={t.icon} className="h-3.5 w-3.5 shrink-0" />
              <span className="max-w-[160px] truncate">{t.label}</span>
              {closable && (
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(t.path); }}
                  data-testid={`tab-close${tid(t.path)}`}
                  aria-label={`Close ${t.label}`}
                  className={cn(
                    "ml-0.5 rounded p-0.5 transition-colors hover:bg-foreground/10",
                    isActive ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground"
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {tabs.length > 2 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1 px-2 text-xs text-muted-foreground" data-testid="tabs-menu-button">
              {tabs.length} tabs <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={closeOthers} data-testid="tabs-close-others">Close other tabs</DropdownMenuItem>
            <DropdownMenuItem onClick={closeAll} data-testid="tabs-close-all">Close all tabs</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
