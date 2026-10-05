import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import "@/App.css";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { LayoutProvider } from "@/context/LayoutContext";
import { AppShell } from "@/components/layout/AppShell";
import AuthPage from "@/pages/AuthPage";
import AuthCallback from "@/pages/AuthCallback";
import InvoicePrint from "@/pages/InvoicePrint";
import { Toaster } from "@/components/ui/sonner";

import { PersonalizationProvider } from "@/context/PersonalizationContext";

function FullLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  if (loading) return <FullLoader />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <AuthPage />} />
      <Route
        path="/print/invoices/:id"
        element={user ? <CurrencyProvider><PersonalizationProvider><InvoicePrint /></PersonalizationProvider></CurrencyProvider> : <Navigate to="/login" replace />}
      />
      <Route
        path="/*"
        element={user ? <CurrencyProvider><PersonalizationProvider><LayoutProvider><AppShell /></LayoutProvider></PersonalizationProvider></CurrencyProvider> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter basename={process.env.PUBLIC_URL || ""}>
          <AppRoutes />
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </ThemeProvider>
  );
}
