import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Bell, Sun, Moon, Menu, LogOut, User, Settings as SettingsIcon, AlertTriangle, Package, CheckSquare, ChevronDown, PanelLeft, ChevronRight, CircleHelp, LifeBuoy, Keyboard, ShoppingCart } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useLayout } from "@/context/LayoutContext";
import { useCurrency } from "@/context/CurrencyContext";
import { CommandPalette, useBusinessActions, PALETTE_SHORTCUT } from "@/components/layout/CommandPalette";
import { helpPathFor } from "@/modules/helpContent";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const NOTIF_ICON = { overdue: AlertTriangle, stock: Package, task: CheckSquare };
const NOTIF_LINK = { overdue: (n) => `/invoices/${n.id}`, stock: () => "/inventory?low=1", task: (n) => `/tasks?q=${encodeURIComponent(n.title)}` };

const isTyping = (el) => el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

export function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toggleSidebar } = useLayout();
  const businessActions = useBusinessActions();
  const { format } = useCurrency();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const helpPath = helpPathFor(pathname);
  const [notifs, setNotifs] = useState([]);
  const [notifsOpen, setNotifsOpen] = useState(false);

  const loadNotifs = useCallback(() => {
    api.get("/notifications").then(({ data }) => setNotifs(data)).catch(() => {});
  }, []);
  // Load on sign-in / workspace switch, and refresh whenever the panel is opened.
  useEffect(() => { loadNotifs(); }, [user?.active_org_id, loadNotifs]);
  const toggleNotifs = (open) => { setNotifsOpen(open); if (open) loadNotifs(); };

  // "?" opens the guide for the current page (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !isTyping(e.target)) {
        e.preventDefault();
        navigate(helpPath);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, helpPath]);

  const initials = (user?.name || "U").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border/70 bg-background/90 px-4 backdrop-blur-md sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} aria-label="Open menu" data-testid="mobile-menu-button">
        <Menu className="h-5 w-5" />
      </Button>

      <Button variant="ghost" size="icon" className="hidden lg:flex" onClick={toggleSidebar} aria-label="Collapse or expand sidebar" data-testid="sidebar-toggle-desktop">
        <PanelLeft className="h-5 w-5" />
      </Button>

      <CommandPalette />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {/* The most common thing an owner does, one click away; everything else one more. */}
        <div className="flex items-center">
          <Button size="sm" className="h-9 gap-1.5 rounded-r-none" onClick={businessActions[0].run} data-testid="header-sell">
            <ShoppingCart className="h-4 w-4" /><span className="hidden sm:inline">Make a sale</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-9 rounded-l-none border-l border-primary-foreground/25 px-2" aria-label="More actions" data-testid="quick-create-button">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="flex items-center justify-between">
                Do something
                <span className="font-mono text-[10px] font-normal text-muted-foreground">{PALETTE_SHORTCUT}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {businessActions.map((a, i) => (
                <div key={a.id}>
                  {i === 4 && <DropdownMenuSeparator />}
                  <DropdownMenuItem onClick={a.run} data-testid={`quick-create-${a.id}`}>
                    <a.icon className="mr-2 h-4 w-4" /> {a.label}
                  </DropdownMenuItem>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>


        <Button variant="ghost" size="icon" onClick={() => navigate(helpPath)} data-testid="help-button" className="hidden h-9 w-9 sm:flex" title="Help for this page (?)" aria-label="Help for this page">
          <CircleHelp className="h-[18px] w-[18px]" />
        </Button>

        <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="theme-toggle-button" className="h-9 w-9" aria-label="Toggle light or dark theme">
          {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </Button>

        <Popover open={notifsOpen} onOpenChange={toggleNotifs}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label={`Notifications (${notifs.length})`} data-testid="notifications-button">
              <Bell className="h-[18px] w-[18px]" />
              {notifs.length > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {notifs.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              <Badge variant="secondary" className="text-xs">{notifs.length}</Badge>
            </div>
            <div className="max-h-80 overflow-y-auto" data-testid="notifications-list">
              {notifs.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</p>
              ) : (
                notifs.map((n) => {
                  const NIcon = NOTIF_ICON[n.type] || Bell;
                  const link = NOTIF_LINK[n.type]?.(n);
                  return (
                    <button
                      key={`${n.type}-${n.id}`}
                      type="button"
                      disabled={!link}
                      onClick={() => { setNotifsOpen(false); navigate(link); }}
                      data-testid={`notification-${n.type}-${n.id}`}
                      className="group flex w-full gap-3 border-b border-border/50 px-4 py-3 text-left last:border-0 hover:bg-accent/50 disabled:cursor-default"
                    >
                      <NIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{n.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{n.description}{n.amount != null ? ` · ${format(n.amount)}` : ""}</p>
                      </div>
                      {link && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />}
                    </button>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full pl-1 outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu" data-testid="user-menu-button">
              <Avatar className="h-8 w-8 border border-border/60">
                <AvatarImage src={user?.picture} alt={user?.name} />
                <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="truncate text-sm font-semibold">{user?.name}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings?tab=profile")} data-testid="menu-profile">
              <User className="mr-2 h-4 w-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")} data-testid="menu-settings">
              <SettingsIcon className="mr-2 h-4 w-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/help")} data-testid="menu-help">
              <LifeBuoy className="mr-2 h-4 w-4" /> Help Center
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/help#shortcuts")} data-testid="menu-shortcuts">
              <Keyboard className="mr-2 h-4 w-4" /> Keyboard shortcuts
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-rose-500 focus:text-rose-500" data-testid="logout-button">
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
