import { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";
import { useLayout } from "@/context/LayoutContext";
import { usePersonalization } from "@/context/PersonalizationContext";
import { Sheet, SheetContent } from "@/components/ui/sheet";

import BusinessModule from "@/pages/BusinessModule";
import CustomersModule from "@/pages/CustomersModule";
import MoneyModule from "@/pages/MoneyModule";
import OperationsModule from "@/pages/OperationsModule";
import TeamModule from "@/pages/TeamModule";
import InsightsModule from "@/pages/InsightsModule";

import CustomerDetail from "@/pages/CustomerDetail";
import InvoiceDetail from "@/pages/InvoiceDetail";
import EmployeeDetail from "@/pages/EmployeeDetail";
import Settings from "@/pages/Settings";
import Help from "@/pages/Help";
import AdminCenter from "@/pages/AdminCenter";

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { sidebarCollapsed, density } = useLayout();
  const { preferences } = usePersonalization();
  const startPage = preferences?.start_page || "/business";

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
              <Route index element={<Navigate to={startPage} replace />} />
              
              {/* FLAGSHIP 1: BUSINESS */}
              <Route path="/business" element={<BusinessModule />} />
              <Route path="/dashboard" element={<Navigate to="/business?tab=overview" replace />} />
              <Route path="/executive" element={<Navigate to="/business?tab=decisions" replace />} />

              {/* FLAGSHIP 2: CUSTOMERS */}
              <Route path="/customers" element={<CustomersModule />} />
              <Route path="/customers/:id" element={<CustomerDetail />} />
              <Route path="/leads" element={<Navigate to="/customers?tab=opportunities" replace />} />
              <Route path="/sales" element={<Navigate to="/customers?tab=opportunities" replace />} />

              {/* FLAGSHIP 3: MONEY */}
              <Route path="/money" element={<MoneyModule />} />
              <Route path="/invoices" element={<Navigate to="/money?tab=get-paid" replace />} />
              <Route path="/invoices/:id" element={<InvoiceDetail />} />
              <Route path="/expenses" element={<Navigate to="/money?tab=spend" replace />} />

              {/* FLAGSHIP 4: OPERATIONS */}
              <Route path="/operations" element={<OperationsModule />} />
              <Route path="/products" element={<Navigate to="/operations?tab=products" replace />} />
              <Route path="/inventory" element={<Navigate to="/operations?tab=stock" replace />} />
              <Route path="/suppliers" element={<Navigate to="/operations?tab=suppliers" replace />} />

              {/* FLAGSHIP 5: TEAM */}
              <Route path="/team" element={<TeamModule />} />
              <Route path="/people" element={<Navigate to="/team" replace />} />
              <Route path="/my-work" element={<Navigate to="/team?tab=my-work" replace />} />
              <Route path="/employees" element={<Navigate to="/team?tab=directory" replace />} />
              <Route path="/employees/:id" element={<EmployeeDetail />} />
              <Route path="/tasks" element={<Navigate to="/team?tab=workload" replace />} />

              {/* FLAGSHIP 6: INSIGHTS */}
              <Route path="/insights" element={<InsightsModule />} />
              <Route path="/reports" element={<Navigate to="/insights?tab=reports" replace />} />
              <Route path="/automations" element={<Navigate to="/insights?tab=automations" replace />} />

              {/* CORE UTILITIES */}
              <Route path="/admin-center" element={<AdminCenter />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/help" element={<Help />} />

              <Route path="*" element={<Navigate to={startPage} replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}
