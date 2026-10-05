import { NavLink } from "react-router-dom";
import { NAV_SECTIONS } from "@/lib/constants";
import { Icon } from "@/components/common/Icon";
import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher";
import { useLayout } from "@/context/LayoutContext";
import { cn } from "@/lib/utils";
import { Zap, PanelLeftClose, PanelLeft, Settings, ShieldCheck, Home, Users, TrendingUp, Wallet, LayoutGrid, User, Plus, MessageSquare } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV_ICONS = {
  Overview: Home,
  Customers: Users,
  Sales: TrendingUp,
  Money: Wallet,
  Operations: LayoutGrid,
  People: User,
  Communications: MessageSquare,
  Automations: Zap,
  "Team & Access": ShieldCheck
};

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
        "flex h-full shrink-0 flex-col bg-[#0b0c10] text-slate-300 border-r border-white/5 transition-[width] duration-200 select-none",
        collapsed ? "w-[72px]" : "w-[248px]"
      )}
      data-testid="app-sidebar"
    >
      {/* Brand Header */}
      <div className={cn("flex h-16 items-center", collapsed ? "justify-center px-2" : "px-4 py-2")}>
        {collapsed ? (
          <img src="/six6fix-logo.png" alt="Six6Fix" className="h-7 w-7 object-cover object-left rounded-md shrink-0" />
        ) : (
          <img src="/six6fix-logo.png" alt="Six6Fix" className="h-8 max-w-[170px] w-auto object-contain shrink-0" />
        )}
      </div>

      {/* Workspace Switcher */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <WorkspaceSwitcher />
        </div>
      )}

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {filteredSections.map((section) => (
          <div key={section.label} className={collapsed ? "mb-2 border-b border-white/5 pb-2 last:border-0" : ""}>
            {!collapsed && (
              <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {section.label}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const ItemIcon = NAV_ICONS[item.name] || Icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onNavigate}
                    title={collapsed ? item.name : item.tagline}
                    data-testid={`sidebar-nav-${item.name.toLowerCase()}`}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-3 rounded-[8px] px-3 py-[9px] text-[12px] font-semibold text-slate-400 transition-all hover:bg-white/5 hover:text-white",
                        collapsed && "justify-center px-0 py-2",
                        isActive && "bg-[#1a1e25] text-white font-bold"
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r-full bg-white" />
                        )}
                        {item.name === "Automations" ? (
                          <Zap className="h-4 w-4 shrink-0 text-amber-500 fill-amber-500/20" />
                        ) : item.name === "Communications" ? (
                          <MessageSquare className="h-4 w-4 shrink-0 text-sky-400" />
                        ) : item.name === "Team & Access" ? (
                          <Plus className="h-4 w-4 shrink-0 text-slate-400" />
                        ) : (
                          <ItemIcon className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-white" />
                        )}
                        {!collapsed && (
                          <span className="truncate text-xs tracking-wide">{item.name}</span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom Footer Section */}
      <div className="border-t border-white/5 p-2 space-y-1">
        <NavLink
          to="/settings"
          onClick={onNavigate}
          title={collapsed ? "Settings" : undefined}
          data-testid="sidebar-nav-settings"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold text-slate-400 transition-colors hover:bg-white/5 hover:text-white",
              collapsed && "justify-center px-0",
              isActive && "bg-[#191c24] text-white font-bold"
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
            "hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold text-slate-400 transition-colors hover:bg-white/5 hover:text-white lg:flex",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" /> <span>Collapse</span></>}
        </button>
      </div>
    </aside>
  );
}
