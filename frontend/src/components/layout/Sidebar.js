import { NavLink } from "react-router-dom";
import { NAV_SECTIONS } from "@/lib/constants";
import { Icon } from "@/components/common/Icon";
import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher";
import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";

export function Sidebar({ onNavigate }) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border/70 bg-card/60 backdrop-blur-md">
      <div className="flex h-16 items-center gap-2 border-b border-border/70 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <p className="font-heading text-sm font-bold tracking-tight">Nexus<span className="text-primary">OS</span></p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Business Suite</p>
        </div>
      </div>

      <div className="px-3 pt-4">
        <WorkspaceSwitcher />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-5">
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onNavigate}
                  data-testid={`sidebar-nav-${item.name.toLowerCase()}`}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg border-l-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                      isActive && "border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
                    )
                  }
                >
                  <Icon name={item.icon} className="h-[18px] w-[18px]" />
                  {item.name}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border/70 p-3">
        <div className="rounded-lg bg-gradient-to-br from-primary/15 to-violet-500/10 p-3">
          <p className="text-xs font-semibold">AI Insights</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Predictive analytics coming soon to your dashboard.</p>
        </div>
      </div>
    </aside>
  );
}
