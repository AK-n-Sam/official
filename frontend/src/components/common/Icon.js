import {
  AlertTriangle, BarChart3, Briefcase, CalendarCheck, CheckSquare, Circle, CircleUser, Clock, CreditCard, FileText,
  Keyboard, Landmark, LayoutDashboard, LifeBuoy, MessageCircleQuestion, Package, PackageX, Receipt, Rocket, ShieldCheck, Sliders, Sparkles, Target,
  TrendingUp, Truck, UserPlus, Users, Wallet, Warehouse, Zap,
} from "lucide-react";

// Icons referenced by name from config (navigation, help topics, KPI cards). Listing them keeps
// the bundle small: `import * as Icons` would ship every icon in lucide.
const ICONS = {
  AlertTriangle, BarChart3, Briefcase, CalendarCheck, CheckSquare, Circle, CircleUser, Clock, CreditCard, FileText,
  Keyboard, Landmark, LayoutDashboard, LifeBuoy, MessageCircleQuestion, Package, PackageX, Receipt, Rocket, ShieldCheck, Sliders, Sparkles, Target,
  TrendingUp, Truck, UserPlus, Users, Wallet, Warehouse, Zap,
};

export function Icon({ name, className }) {
  const Cmp = ICONS[name] || Circle;
  return <Cmp className={className} aria-hidden />;
}
