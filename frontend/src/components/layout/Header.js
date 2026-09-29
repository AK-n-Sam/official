import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell, Sun, Moon, Menu, LogOut, User, Settings as SettingsIcon, AlertTriangle, Package, CheckSquare, Plus, FileText, Users, Receipt, CheckSquare as TaskIcon, Target, PanelLeft, Rows3, Rows2 } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useLayout } from "@/context/LayoutContext";
import { useCurrency } from "@/context/CurrencyContext";
import { CURRENCIES } from "@/lib/format";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const NOTIF_ICON = { overdue: AlertTriangle, stock: Package, task: CheckSquare };

export function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toggleSidebar, density, setDensity } = useLayout();
  const { currency, setCurrency } = useCurrency();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState([]);

  useEffect(() => {
    api.get("/notifications").then(({ data }) => setNotifs(data)).catch(() => {});
  }, [user?.active_org_id]);

  const initials = (user?.name || "U").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border/70 bg-background/90 px-4 backdrop-blur-md sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} data-testid="mobile-menu-button">
        <Menu className="h-5 w-5" />
      </Button>

      <Button variant="ghost" size="icon" className="hidden lg:flex" onClick={toggleSidebar} data-testid="sidebar-toggle-desktop">
        <PanelLeft className="h-5 w-5" />
      </Button>

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="h-9 gap-1.5" data-testid="quick-create-button">
              <Plus className="h-4 w-4" /><span className="hidden sm:inline">Create</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Quick Create</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/invoices?new=1")} data-testid="quick-create-invoice"><FileText className="mr-2 h-4 w-4" /> Invoice</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/customers?new=1")} data-testid="quick-create-customer"><Users className="mr-2 h-4 w-4" /> Customer</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/expenses?new=1")} data-testid="quick-create-expense"><Receipt className="mr-2 h-4 w-4" /> Expense</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/products?new=1")} data-testid="quick-create-product"><Package className="mr-2 h-4 w-4" /> Product</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/tasks?new=1")} data-testid="quick-create-task"><TaskIcon className="mr-2 h-4 w-4" /> Task</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/leads?new=1")} data-testid="quick-create-lead"><Target className="mr-2 h-4 w-4" /> Lead</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="h-9 w-[88px] border-border/60 bg-card/50" data-testid="currency-selector">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(CURRENCIES).map((code) => (
              <SelectItem key={code} value={code} data-testid={`currency-opt-${code}`}>
                {CURRENCIES[code].symbol} {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="ghost" size="icon" onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")} data-testid="density-toggle-button" className="hidden h-9 w-9 sm:flex" title={density === "compact" ? "Comfortable view" : "Compact view"}>
          {density === "compact" ? <Rows3 className="h-[18px] w-[18px]" /> : <Rows2 className="h-[18px] w-[18px]" />}
        </Button>

        <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="theme-toggle-button" className="h-9 w-9">
          {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9" data-testid="notifications-button">
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
              <Badge variant="secondary" className="text-xs">{notifs.length} new</Badge>
            </div>
            <div className="max-h-80 overflow-y-auto" data-testid="notifications-list">
              {notifs.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</p>
              ) : (
                notifs.map((n) => {
                  const NIcon = NOTIF_ICON[n.type] || Bell;
                  return (
                    <div key={`${n.type}-${n.id}`} className="flex gap-3 border-b border-border/50 px-4 py-3 last:border-0 hover:bg-accent/50">
                      <NIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{n.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{n.description}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full pl-1 outline-none" data-testid="user-menu-button">
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
            <DropdownMenuItem onClick={() => navigate("/settings")} data-testid="menu-profile">
              <User className="mr-2 h-4 w-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")} data-testid="menu-settings">
              <SettingsIcon className="mr-2 h-4 w-4" /> Settings
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
