import { useEffect, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { Icon } from "@/components/common/Icon";
import { NAV_SECTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const NAV_MAP = {};
NAV_SECTIONS.forEach((s) => s.items.forEach((i) => { NAV_MAP[i.path] = i; }));

const HOME = "/dashboard";
const STORAGE = "bmp_open_tabs";

function resolveTab(pathname) {
  if (NAV_MAP[pathname]) return { path: pathname, label: NAV_MAP[pathname].name, icon: NAV_MAP[pathname].icon };
  const seg = pathname.split("/").filter(Boolean);
  const short = seg[1] ? ` · ${seg[1].slice(-4)}` : "";
  if (seg[0] === "customers" && seg[1]) return { path: pathname, label: `Customer${short}`, icon: "Users" };
  if (seg[0] === "invoices" && seg[1]) return { path: pathname, label: `Invoice${short}`, icon: "FileText" };
  if (seg[0] === "employees" && seg[1]) return { path: pathname, label: `Employee${short}`, icon: "Briefcase" };
  return { path: pathname, label: seg[0] || "Page", icon: "Circle" };
}

const tid = (p) => p.replace(/\//g, "-");

export function WorkspaceTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = location.pathname;

  const [tabs, setTabs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE) || "[]");
      if (Array.isArray(saved) && saved.length) return saved;
    } catch (e) { /* ignore */ }
    return [resolveTab(HOME)];
  });

  useEffect(() => { localStorage.setItem(STORAGE, JSON.stringify(tabs)); }, [tabs]);

  useEffect(() => {
    setTabs((prev) => (prev.some((t) => t.path === active) ? prev : [...prev, resolveTab(active)]));
  }, [active]);

  const closeTab = useCallback((e, path) => {
    e.stopPropagation();
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === path);
      const remaining = prev.filter((t) => t.path !== path);
      const safe = remaining.length ? remaining : [resolveTab(HOME)];
      if (path === active) {
        const fallback = safe[Math.max(0, idx - 1)] || safe[0];
        navigate(fallback.path);
      }
      return safe;
    });
  }, [active, navigate]);

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none border-b border-border/70 bg-card/40 px-2 py-1.5 backdrop-blur-sm" data-testid="workspace-tabs">
      {tabs.map((t) => {
        const isActive = t.path === active;
        return (
          <div
            key={t.path}
            role="button"
            tabIndex={0}
            onClick={() => navigate(t.path)}
            onKeyDown={(e) => { if (e.key === "Enter") navigate(t.path); }}
            data-testid={`tab-chip${tid(t.path)}`}
            className={cn(
              "group flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon name={t.icon} className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[150px] truncate">{t.label}</span>
            {t.path !== HOME && (
              <button
                onClick={(e) => closeTab(e, t.path)}
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
  );
}
