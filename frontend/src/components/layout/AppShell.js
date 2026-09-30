import { useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";
import { useLayout } from "@/context/LayoutContext";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import Dashboard from "@/pages/Dashboard";
import MyWork from "@/pages/MyWork";
import Sales from "@/pages/Sales";
import Leads from "@/pages/Leads";
import Customers from "@/pages/Customers";
import CustomerDetail from "@/pages/CustomerDetail";
import Invoices from "@/pages/Invoices";
import InvoiceDetail from "@/pages/InvoiceDetail";
import Expenses from "@/pages/Expenses";
import Suppliers from "@/pages/Suppliers";
import Products from "@/pages/Products";
import Inventory from "@/pages/Inventory";
import Employees from "@/pages/Employees";
import EmployeeDetail from "@/pages/EmployeeDetail";
import Tasks from "@/pages/Tasks";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import Help from "@/pages/Help";

/** Invited teammates sign in with a temporary password; keep asking until they choose their own. */
function TempPasswordBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  if (!user?.must_change_password || (pathname === "/settings" && search.includes("tab=profile"))) return null;
  return (
    <div className="flex flex-col gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm sm:flex-row sm:items-center sm:px-6" role="status" data-testid="temp-password-banner">
      <KeyRound className="hidden h-4 w-4 shrink-0 text-amber-600 sm:block" />
      <p className="flex-1">You're signed in with a temporary password. Choose your own to keep your account secure.</p>
      <Button size="sm" variant="outline" className="h-7 self-start sm:self-auto" onClick={() => navigate("/settings?tab=profile")}>Set password</Button>
    </div>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { sidebarCollapsed, density } = useLayout();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden lg:block">
        <Sidebar collapsed={sidebarCollapsed} />
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setMobileOpen(true)} />
        <TempPasswordBanner />
        <WorkspaceTabs />
        <main className="flex-1 overflow-y-auto">
          <div className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 ${density === "compact" ? "py-3" : "py-6"}`}>
            <Routes>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/my-work" element={<MyWork />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/customers/:id" element={<CustomerDetail />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/invoices/:id" element={<InvoiceDetail />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="/products" element={<Products />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/employees" element={<Employees />} />
              <Route path="/employees/:id" element={<EmployeeDetail />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/help" element={<Help />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}
