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
import Sales from "@/pages/Sales";
import MoneyModule from "@/pages/MoneyModule";
import OperationsModule from "@/pages/OperationsModule";
import TeamModule from "@/pages/TeamModule";
import InsightsModule from "@/pages/InsightsModule";
import AutomationCenter from "@/pages/AutomationCenter";

import CustomerDetail from "@/pages/CustomerDetail";
import InvoiceDetail from "@/pages/InvoiceDetail";
import EmployeeDetail from "@/pages/EmployeeDetail";
import Settings from "@/pages/Settings";
import Help from "@/pages/Help";
import AdminCenter from "@/pages/AdminCenter";
import CommunicationsModule from "@/pages/CommunicationsModule";

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
        <SheetContent side="left" className="w-[272px] border-r border-white/10 bg-[#0d0f13] p-0 text-white">
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col bg-[#f7f8fa] dark:bg-[#090b0f]">
        <Header onMenuClick={() => setMobileOpen(true)} />
        <WorkspaceTabs />
        <main className="flex-1 overflow-y-auto">
          <div className={`mx-auto w-full max-w-[1480px] px-4 sm:px-6 lg:px-8 ${density === "compact" ? "py-4" : "py-7 lg:py-8"}`}>
            <Routes>
              <Route index element={<Navigate to={startPage} replace />} />
              
              {/* PRIMARY WORK AREA 1: OVERVIEW */}
              <Route path="/overview" element={<BusinessModule />} />
              <Route path="/business" element={<BusinessModule />} />
              <Route path="/dashboard" element={<Navigate to="/business?tab=overview" replace />} />
              <Route path="/executive" element={<Navigate to="/business?tab=decisions" replace />} />

              {/* PRIMARY WORK AREA 2: CUSTOMERS */}
              <Route path="/customers" element={<CustomersModule />} />
              <Route path="/customers/:id" element={<CustomerDetail />} />
              <Route path="/leads" element={<Navigate to="/sales" replace />} />

              {/* PRIMARY WORK AREA 3: SALES */}
              <Route path="/sales" element={<Sales />} />

              {/* PRIMARY WORK AREA 4: MONEY */}
              <Route path="/money" element={<MoneyModule />} />
              <Route path="/invoices" element={<Navigate to="/money?tab=get-paid" replace />} />
              <Route path="/invoices/:id" element={<InvoiceDetail />} />
              <Route path="/expenses" element={<Navigate to="/money?tab=spend" replace />} />

              {/* PRIMARY WORK AREA 5: OPERATIONS */}
              <Route path="/operations" element={<OperationsModule />} />
              <Route path="/products" element={<Navigate to="/operations?tab=products" replace />} />
              <Route path="/inventory" element={<Navigate to="/operations?tab=stock" replace />} />
              <Route path="/suppliers" element={<Navigate to="/operations?tab=suppliers" replace />} />

              {/* PRIMARY WORK AREA 6: PEOPLE */}
              <Route path="/people" element={<TeamModule />} />
              <Route path="/team" element={<TeamModule />} />
              <Route path="/my-work" element={<Navigate to="/team?tab=my-work" replace />} />
              <Route path="/employees" element={<Navigate to="/team?tab=directory" replace />} />
              <Route path="/employees/:id" element={<EmployeeDetail />} />
              <Route path="/tasks" element={<Navigate to="/team?tab=workload" replace />} />

              {/* SECONDARY SYSTEM AREAS */}
              <Route path="/communications" element={<CommunicationsModule />} />
              <Route path="/inbox" element={<Navigate to="/communications" replace />} />
              <Route path="/automation" element={<AutomationCenter />} />
              <Route path="/automations" element={<AutomationCenter />} />
              <Route path="/insights" element={<InsightsModule />} />
              <Route path="/reports" element={<Navigate to="/insights?tab=reports" replace />} />

              <Route path="/admin-center" element={<AdminCenter />} />
              <Route path="/admin" element={<Navigate to="/admin-center" replace />} />
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
