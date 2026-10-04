import { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
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

import ExecutiveCockpit from "@/pages/ExecutiveCockpit";
import AdminCenter from "@/pages/AdminCenter";
import AutomationCenter from "@/pages/AutomationCenter";

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
        <WorkspaceTabs />
        <main className="flex-1 overflow-y-auto">
          <div className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 ${density === "compact" ? "py-3" : "py-6"}`}>
            <Routes>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/my-work" element={<MyWork />} />
              <Route path="/executive" element={<ExecutiveCockpit />} />
              <Route path="/admin-center" element={<AdminCenter />} />
              <Route path="/automations" element={<AutomationCenter />} />
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
