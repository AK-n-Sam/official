import { NavLink } from "react-router-dom";
import { NAV_SECTIONS } from "@/lib/constants";
import { Icon } from "@/components/common/Icon";
import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher";
import { useLayout } from "@/context/LayoutContext";
import { cn } from "@/lib/utils";
import { Zap, PanelLeftClose, PanelLeft, Settings, ShieldCheck } from "lucide-react";

import { useAuth } from "@/context/AuthContext";

export function Sidebar({ onNavigate, collapsed = false }) {
  const { toggleSidebar } = useLayout();
  const { user } = useAuth();
  const userRole = (user?.role || "member").toLowerCase();
  const isAdminOrOwner = ["owner", "admin"].includes(userRole);

  const filteredSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (!item.roles) return true;
      return item.roles.includes(userRole);
    }),
  })).filter((section) => section.items.length > 0);

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
            <p className="font-heading text-sm font-bold tracking-tight">Six6<span className="text-primary">Fix</span></p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Business Operating System</p>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="px-3 pt-4">
          <WorkspaceSwitcher />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {filteredSections.map((section) => (
          <div key={section.label} className={collapsed ? "mb-2 border-b border-border/40 pb-2 last:border-0" : "mb-3.5"}>
            {!collapsed && (
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
                {section.label}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onNavigate}
                  title={collapsed ? item.name : item.tagline}
                  data-testid={`sidebar-nav-${item.name.toLowerCase()}`}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg border-l-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-foreground",
                      collapsed && "justify-center px-0 py-2",
                      isActive && "border-primary bg-primary/10 text-primary font-semibold hover:bg-primary/10 hover:text-primary"
                    )
                  }
                >
                  <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                  {!collapsed && (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm leading-tight">{item.name}</p>
                    </div>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border/70 p-2 space-y-1">
        {isAdminOrOwner && (
          <NavLink
            to="/admin-center"
            onClick={onNavigate}
            title={collapsed ? "Admin Center" : undefined}
            data-testid="sidebar-nav-admin"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                collapsed && "justify-center px-0",
                isActive && "bg-accent text-foreground"
              )
            }
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-amber-500" />
            {!collapsed && <span>Admin Center</span>}
          </NavLink>
        )}
        <NavLink
          to="/settings"
          onClick={onNavigate}
          title={collapsed ? "Settings" : undefined}
          data-testid="sidebar-nav-settings"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              collapsed && "justify-center px-0",
              isActive && "bg-accent text-foreground"
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
        <button
          onClick={toggleSidebar}
          data-testid="sidebar-collapse-toggle"
          className={cn(
            "hidden w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:flex",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" /> Collapse</>}
        </button>
      </div>
    </aside>
  );
}
