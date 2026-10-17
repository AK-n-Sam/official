import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Bell, Sun, Moon, Menu, LogOut, User, Settings as SettingsIcon, AlertTriangle, Package, CheckSquare, Plus, PanelLeft, Rows3, ChevronRight, CircleHelp, LifeBuoy, Keyboard, Check, Star, Clock } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useLayout } from "@/context/LayoutContext";
import { useCurrency } from "@/context/CurrencyContext";
import { usePersonalization } from "@/context/PersonalizationContext";
import { CURRENCIES } from "@/lib/format";
import { CommandPalette, CREATE_ACTIONS, PALETTE_SHORTCUT } from "@/components/layout/CommandPalette";
import { helpPathFor } from "@/modules/helpContent";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const NOTIF_ICON = { overdue: AlertTriangle, stock: Package, task: CheckSquare };
const NOTIF_LINK = { overdue: (n) => `/invoices/${n.id}`, stock: () => "/inventory", task: () => "/tasks" };

const isTyping = (el) => el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

export function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toggleSidebar, density, setDensity } = useLayout();
  const { currency, setCurrency } = useCurrency();
  const { favorites = [], recentHistory = [] } = usePersonalization();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const helpPath = helpPathFor(pathname);
  const [notifs, setNotifs] = useState([]);
  const [notifsOpen, setNotifsOpen] = useState(false);

  useEffect(() => {
    api.get("/notifications").then(({ data }) => setNotifs(Array.isArray(data) ? data : (data?.items || []))).catch(() => setNotifs([]));
  }, [user?.active_org_id]);

  const safeNotifs = Array.isArray(notifs) ? notifs : [];

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

  const routeName = pathname === "/business" || pathname === "/" || pathname === "/overview" ? "Overview" : pathname.replace("/", "").replace(/-/g, " ");

  return (
    <header className="sticky top-0 z-40 flex h-[60px] items-center justify-between border-b border-border/70 bg-white/90 px-4 backdrop-blur-xl dark:bg-[#0b0d11]/90 sm:px-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} data-testid="mobile-menu-button">
          <Menu className="h-5 w-5" />
        </Button>

        {/* Left Breadcrumb */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span>Workspace</span>
          <span>/</span>
          <span className="font-bold text-foreground capitalize">{routeName}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <CommandPalette />

        <Button variant="ghost" size="icon" onClick={() => window.location.reload()} className="h-8 w-8 rounded-md border border-border/70 bg-card" title="Refresh workspace">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>

        <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="theme-toggle-button" className="h-8 w-8 rounded-full border border-border/60 bg-card">
          {theme === "dark" ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-muted-foreground" />}
        </Button>

        {/* User Profile Avatar Circle */}
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 font-extrabold text-xs text-white shadow-sm">
          {initials}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-md" data-testid="favorites-recent-button" title="Favorites & Recent Pages">
              <Star className="h-[18px] w-[18px] text-amber-500 fill-amber-500/20" />
              {favorites.length > 0 && (
                <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-black">
                  {favorites.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <Tabs defaultValue="favorites">
              <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
                <TabsList className="h-8">
                  <TabsTrigger value="favorites" className="text-xs px-2.5 py-1" data-testid="tab-starred-trigger">Starred ({favorites.length})</TabsTrigger>
                  <TabsTrigger value="recent" className="text-xs px-2.5 py-1" data-testid="tab-recent-trigger">Recent ({recentHistory.length})</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="favorites" className="m-0 max-h-72 overflow-y-auto p-2" data-testid="starred-list font-medium">
                {favorites.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">No starred items yet. Click the star icon on any record to favorite it.</p>
                ) : (
                  favorites.map((fav) => (
                    <button
                      key={`${fav.type}-${fav.id}`}
                      type="button"
                      onClick={() => navigate(fav.path || `/${fav.type}s/${fav.id}`)}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-accent transition-colors"
                    >
                      <div className="truncate">
                        <p className="font-medium truncate">{fav.title}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">{fav.type}</p>
                      </div>
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0 ml-2" />
                    </button>
                  ))
                )}
              </TabsContent>
              <TabsContent value="recent" className="m-0 max-h-72 overflow-y-auto p-2" data-testid="recent-list">
                {recentHistory.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">No recent context logged yet.</p>
                ) : (
                  recentHistory.map((rec, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => navigate(rec.path)}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-accent transition-colors"
                    >
                      <div className="truncate">
                        <p className="font-medium truncate">{rec.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{rec.path}</p>
                      </div>
                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2" />
                    </button>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </PopoverContent>
        </Popover>

        <Popover open={notifsOpen} onOpenChange={setNotifsOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9" data-testid="notifications-button">
              <Bell className="h-[18px] w-[18px]" />
              {safeNotifs.length > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {safeNotifs.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              <Badge variant="secondary" className="text-xs">{safeNotifs.length} new</Badge>
            </div>
            <div className="max-h-80 overflow-y-auto" data-testid="notifications-list">
              {safeNotifs.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</p>
              ) : (
                safeNotifs.map((n) => {
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
                        <p className="truncate text-xs text-muted-foreground">{n.description}</p>
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
            <button className="flex items-center rounded-full pl-0.5 outline-none" data-testid="user-menu-button">
              <Avatar className="h-8 w-8 border border-border/70">
                <AvatarImage src={user?.picture} alt={user?.name} />
                <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold">{user?.name}</p>
                <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider text-primary border-primary/30 shrink-0">
                  {user?.role || "owner"}
                </Badge>
              </div>
              <p className="truncate text-xs font-normal text-muted-foreground mt-0.5">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings?tab=profile")} data-testid="menu-profile">
              <User className="mr-2 h-4 w-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")} data-testid="menu-settings">
              <SettingsIcon className="mr-2 h-4 w-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => { e.preventDefault(); setDensity(density === "compact" ? "comfortable" : "compact"); }}
              data-testid="density-toggle-button"
            >
              <Rows3 className="mr-2 h-4 w-4" /> Compact rows
              {density === "compact" && <Check className="ml-auto h-4 w-4 text-primary" />}
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
