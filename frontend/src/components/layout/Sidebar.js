import { NavLink } from "react-router-dom";
import { NAV_SECTIONS } from "@/lib/constants";
import { Icon } from "@/components/common/Icon";
import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher";
import { useLayout } from "@/context/LayoutContext";
import { cn } from "@/lib/utils";
import { Zap, PanelLeftClose, PanelLeft } from "lucide-react";

export function Sidebar({ onNavigate, collapsed = false }) {
  const { toggleSidebar } = useLayout();

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border/70 bg-card/60 backdrop-blur-md transition-[width] duration-200",
        collapsed ? "w-[68px]" : "w-64"
      )}
      data-testid="app-sidebar"
    >
      <div className={cn("flex h-16 items-center gap-2 border-b border-border/70", collapsed ? "justify-center px-2" : "px-5")}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <p className="font-heading text-sm font-bold tracking-tight">Nexus<span className="text-primary">OS</span></p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Business Suite</p>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="px-3 pt-4">
          <WorkspaceSwitcher />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-5">
            {!collapsed && (
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onNavigate}
                  title={collapsed ? item.name : undefined}
                  data-testid={`sidebar-nav-${item.name.toLowerCase()}`}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg border-l-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                      collapsed && "justify-center px-0",
                      isActive && "border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
                    )
                  }
                >
                  <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && item.name}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border/70 p-3">
        {!collapsed && (
          <div className="mb-3 rounded-lg bg-gradient-to-br from-primary/15 to-violet-500/10 p-3">
            <p className="text-xs font-semibold">AI Insights</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Predictive analytics coming soon to your dashboard.</p>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          data-testid="sidebar-collapse-toggle"
          className={cn(
            "hidden w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:flex",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" /> Collapse</>}
        </button>
      </div>
    </aside>
  );
}
