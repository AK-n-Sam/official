import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Zap, Loader2, Mail, Lock, User, Building2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function AuthPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (mode === "register" && form.password.length < 8) { setError("Use at least 8 characters for your password"); return; }
    setLoading(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register({ name: form.name, email: form.email, password: form.password });
      toast.success("Welcome to NexusOS");
      navigate("/dashboard");
    } catch (err) {
      setError(formatApiError(err));
    } finally { setLoading(false); }
  };

  const handleGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  // Demo sign-in is opt-in per environment, so real deployments never ship credentials in the bundle.
  const demo = process.env.REACT_APP_DEMO_EMAIL && process.env.REACT_APP_DEMO_PASSWORD
    ? { email: process.env.REACT_APP_DEMO_EMAIL, password: process.env.REACT_APP_DEMO_PASSWORD } : null;
  const fill = (email, password) => setForm({ ...form, email, password });

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-primary/15 via-background to-violet-500/10 p-12 lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Zap className="h-5 w-5" /></div>
          <span className="font-heading text-lg font-bold">Nexus<span className="text-primary">OS</span></span>
        </div>
        <div>
          <h1 className="font-heading text-4xl font-extrabold leading-tight tracking-tight">The operating system for your business.</h1>
          <p className="mt-4 max-w-md text-muted-foreground">Manage sales, invoices, inventory, customers and your team — all in one clean, fast workspace built for SMEs.</p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            {["Multi-currency billing", "Live dashboards", "Inventory tracking", "Team & tasks"].map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm"><div className="h-1.5 w-1.5 rounded-full bg-primary" />{f}</div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">© 2026 NexusOS Business Suite</p>
      </div>

      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <Card className="w-full max-w-md border-border/70 bg-card/90 p-8">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Zap className="h-4 w-4" /></div>
            <span className="font-heading text-base font-bold">NexusOS</span>
          </div>
          <h2 className="font-heading text-2xl font-bold tracking-tight">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{mode === "login" ? "Sign in to your workspace." : "Start managing your business in minutes."}</p>

          <Button variant="outline" className="mt-6 w-full" onClick={handleGoogle} data-testid="google-login-button">
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="currentColor" d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 1 1 0-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0 0 12.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z"/></svg>
            Continue with Google
          </Button>

          <div className="my-5 flex items-center gap-3"><div className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">or</span><div className="h-px flex-1 bg-border" /></div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Full Name</Label>
                <div className="relative mt-1.5">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Cooper" className="pl-9" required data-testid="auth-name" />
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Email</Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" className="pl-9" required data-testid="auth-email" />
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Password</Label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" className="pl-9" required
                  minLength={mode === "register" ? 8 : undefined} autoComplete={mode === "login" ? "current-password" : "new-password"} data-testid="auth-password" />
              </div>
              {mode === "register" && <p className="mt-1 text-xs text-muted-foreground">At least 8 characters.</p>}
            </div>
            {error && <p className="text-sm text-rose-500" data-testid="auth-error">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading} data-testid="auth-submit">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          {mode === "login" && demo && (
            <button type="button" onClick={() => fill(demo.email, demo.password)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 py-2 text-xs text-muted-foreground hover:bg-accent" data-testid="demo-fill">
              <Building2 className="h-3.5 w-3.5" /> Use demo owner account
            </button>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }} className="font-medium text-primary hover:underline" data-testid="auth-toggle">
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </Card>
      </div>
    </div>
  );
}
