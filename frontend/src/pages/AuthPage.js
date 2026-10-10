import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ShieldCheck,
  UserCheck,
  Building2,
  Lock,
  Mail,
  User,
  Send,
  Loader2,
  CheckCircle2,
  Database,
  ArrowRight,
  Eye,
  Sliders,
  Sparkles,
  Server
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

export default function AuthPage() {
  const { login, register, demoLogin, requestAccess } = useAuth();
  const navigate = useNavigate();

  // Role Toggles: "member" | "owner" | "admin"
  const [roleMode, setRoleMode] = useState("owner"); // Default: Enterprise Owner
  // Auth Modes: "login" | "request_access" | "register"
  const [authMode, setAuthMode] = useState("login");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    organization_name: "",
    reason: "",
  });

  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState("");
  const [previewStats, setPreviewStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Load preview stats when Admin role toggle is selected
  useEffect(() => {
    if (roleMode === "admin") {
      setStatsLoading(true);
      api
        .get("/admin/system-data-preview")
        .then(({ data }) => setPreviewStats(data))
        .catch(() => {
          // Fallback static preview metrics if unauthenticated
          setPreviewStats({
            total_organizations: 1,
            total_customers: 18,
            total_invoices: 42,
            global_platform_revenue: 128450.0,
            total_audit_logs: 156,
            system_status: { database: "ONLINE", engine_version: "Six6Fix v2.4" },
          });
        })
        .finally(() => setStatsLoading(false));
    }
  }, [roleMode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (authMode === "request_access") {
        const res = await requestAccess({
          name: form.name,
          email: form.email,
          role: roleMode,
          organization_name: form.organization_name,
          reason: form.reason,
        });
        toast.success("Request Submitted!", {
          description: res.message || "An administrator will review your application shortly.",
        });
        setForm({ name: "", email: "", password: "", organization_name: "", reason: "" });
        setAuthMode("login");
      } else if (authMode === "register") {
        await register({
          name: form.name,
          email: form.email,
          password: form.password,
          organization_name: form.organization_name || undefined,
        });
        toast.success("Workspace Created! Welcome to Six6Fix.");
        navigate("/dashboard");
      } else {
        // Sign In
        await login(form.email, form.password);
        toast.success("Signed in successfully!");
        if (roleMode === "admin") {
          navigate("/admin-center");
        } else {
          navigate("/dashboard");
        }
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSignIn = async (role) => {
    setError("");
    setDemoLoading(true);
    try {
      const u = await demoLogin(role);
      toast.success(`Logged in as ${role === "admin" ? "System Admin" : role === "owner" ? "Enterprise Owner" : "Team Member"}`);
      if (role === "admin") {
        navigate("/admin-center");
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setDemoLoading(false);
    }
  };

  const roleMeta = {
    member: {
      title: "Member",
      badge: "Team Member",
      tagline: "Joins an existing Organization & collaborates on daily operations.",
      icon: UserCheck,
      color: "from-blue-500/20 to-cyan-500/10 border-blue-500/30 text-blue-500",
      accentBg: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    },
    owner: {
      title: "Enterprise Owner",
      badge: "Max Controls",
      tagline: "Max controls within an organization — manages team, money, sales & workspace settings.",
      icon: Building2,
      color: "from-violet-500/20 to-purple-500/10 border-violet-500/30 text-violet-500",
      accentBg: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    },
    admin: {
      title: "Admin",
      badge: "Full Backend Access",
      tagline: "Full backend preview of the site and access to all data collected in a clean manner.",
      icon: ShieldCheck,
      color: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-500",
      accentBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    },
  };

  const ActiveRoleIcon = roleMeta[roleMode].icon;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Left Column: Product Branding & Role Capabilities Showcase */}
      <div className="hidden w-5/12 flex-col justify-between bg-gradient-to-br from-card via-background to-accent/20 p-12 lg:flex border-r border-border/60">
        <div>
          <div className="flex items-center gap-3">
            <img src="/six6fix-logo.png" alt="Six6Fix" className="h-10 w-auto object-contain" />
            <Badge variant="outline" className="font-mono text-xs text-primary border-primary/30">
              v2.4 SME OS
            </Badge>
          </div>

          <div className="mt-12 space-y-6">
            <h1 className="font-heading text-4xl font-black leading-tight tracking-tight">
              Simple on the surface. <br />
              <span className="bg-gradient-to-r from-primary via-violet-400 to-emerald-400 bg-clip-text text-transparent">
                Deep underneath.
              </span>
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-md">
              Six6Fix connects Customers → Sales → Money → Operations → People → Communications → Automation → Insights into one unified Operating System.
            </p>

            {/* Role Capabilities Card */}
            <div className="rounded-xl border border-border/70 bg-card/80 p-5 shadow-sm space-y-4 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ActiveRoleIcon className="h-5 w-5 text-primary" />
                  <span className="font-bold text-sm">{roleMeta[roleMode].title} Role Mode</span>
                </div>
                <Badge variant="outline" className={roleMeta[roleMode].accentBg}>
                  {roleMeta[roleMode].badge}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{roleMeta[roleMode].tagline}</p>

              <div className="space-y-2 pt-2 border-t border-border/50">
                {roleMode === "member" && [
                  "Joins an existing Organization with assigned role",
                  "Access to tasks, leads, customers & chat messages",
                  "Personalized 'My Work' dashboard view",
                ].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
                    <span>{f}</span>
                  </div>
                ))}

                {roleMode === "owner" && [
                  "Complete workspace governance & team role management",
                  "Executive overview, profit margins & cashflow forecasting",
                  "Financial approval gates & custom multi-currency settings",
                ].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-violet-500" />
                    <span>{f}</span>
                  </div>
                ))}

                {roleMode === "admin" && [
                  "Full backend data preview across all collected records",
                  "Access all database collections, system logs & audit trails",
                  "Multi-tenant isolation management & system health inspection",
                ].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-6 border-t border-border/50">
          <span>© 2026 Six6Fix Business Platform</span>
          <span className="font-mono text-[10px]">Strict Multi-Tenant Isolation</span>
        </div>
      </div>

      {/* Right Column: Authentication Card & Role Controls */}
      <div className="flex w-full items-center justify-center p-6 lg:w-7/12">
        <Card className="w-full max-w-xl border-border/80 bg-card p-8 shadow-xl">
          {/* Mobile Header Logo */}
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <img src="/six6fix-logo.png" alt="Six6Fix" className="h-8 w-auto object-contain" />
            <Badge variant="outline" className="text-xs">SME OS</Badge>
          </div>

          {/* REQUIRED BY USER PROMPT: ON/OFF ROLE TOGGLES FOR "Member", "Enterprise Owner", "Admin" */}
          <div className="mb-6 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-primary" /> Select Role View Toggle
              </Label>
              <span className="text-[11px] text-muted-foreground font-medium">Switch view mode</span>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-xl bg-accent/30 p-1.5 border border-border/60" data-testid="role-toggles">
              <button
                type="button"
                onClick={() => { setRoleMode("member"); setError(""); }}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all ${
                  roleMode === "member"
                    ? "bg-card text-blue-400 shadow-sm border border-blue-500/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
                data-testid="toggle-role-member"
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>Member</span>
              </button>

              <button
                type="button"
                onClick={() => { setRoleMode("owner"); setError(""); }}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all ${
                  roleMode === "owner"
                    ? "bg-card text-violet-400 shadow-sm border border-violet-500/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
                data-testid="toggle-role-owner"
              >
                <Building2 className="h-3.5 w-3.5" />
                <span>Enterprise Owner</span>
              </button>

              <button
                type="button"
                onClick={() => { setRoleMode("admin"); setError(""); }}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all ${
                  roleMode === "admin"
                    ? "bg-card text-emerald-400 shadow-sm border border-emerald-500/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
                data-testid="toggle-role-admin"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Admin</span>
              </button>
            </div>
          </div>

          {/* Mode Tabs: Sign In vs Request Access vs Create Workspace */}
          <div className="mb-6 flex border-b border-border/60">
            <button
              type="button"
              onClick={() => { setAuthMode("login"); setError(""); }}
              className={`pb-3 text-sm font-semibold transition-colors relative mr-6 ${
                authMode === "login" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="tab-sign-in"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode("request_access"); setError(""); }}
              className={`pb-3 text-sm font-semibold transition-colors relative mr-6 ${
                authMode === "request_access" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="tab-request-access"
            >
              Request Access
            </button>
            {roleMode === "owner" && (
              <button
                type="button"
                onClick={() => { setAuthMode("register"); setError(""); }}
                className={`pb-3 text-sm font-semibold transition-colors relative ${
                  authMode === "register" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-create-workspace"
              >
                Create Workspace
              </button>
            )}
          </div>

          {/* Subtitle description matching selected role & mode */}
          <div className="mb-6 rounded-lg bg-accent/20 p-3 text-xs text-muted-foreground border border-border/50">
            {roleMode === "member" && (
              <span>
                <strong>Member Mode:</strong> {authMode === "login" ? "Sign in to access your team workspace." : "Request access to join an existing organization."}
              </span>
            )}
            {roleMode === "owner" && (
              <span>
                <strong>Enterprise Owner Mode:</strong> {authMode === "login" ? "Sign in with maximum control over your organization." : authMode === "request_access" ? "Request enterprise owner access for your business." : "Register a brand new organization workspace."}
              </span>
            )}
            {roleMode === "admin" && (
              <span>
                <strong>Admin System Mode:</strong> Full backend preview of the site and access to all data collected in a clean manner.
              </span>
            )}
          </div>

          {/* Admin Live Backend Preview Data Widget */}
          {roleMode === "admin" && (
            <div className="mb-6 space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4" data-testid="admin-data-preview-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Backend Data Preview</span>
                </div>
                <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400 font-mono">
                  CLEAN DATA VIEW
                </Badge>
              </div>

              {statsLoading ? (
                <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-emerald-400" /> Loading collected system data...
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-4">
                  <div className="rounded-lg bg-card/60 p-2.5 border border-border/50 text-center">
                    <span className="text-[10px] text-muted-foreground block font-medium">Orgs</span>
                    <span className="font-mono text-base font-extrabold text-foreground">{previewStats?.total_organizations || 1}</span>
                  </div>
                  <div className="rounded-lg bg-card/60 p-2.5 border border-border/50 text-center">
                    <span className="text-[10px] text-muted-foreground block font-medium">Customers</span>
                    <span className="font-mono text-base font-extrabold text-foreground">{previewStats?.total_customers || 0}</span>
                  </div>
                  <div className="rounded-lg bg-card/60 p-2.5 border border-border/50 text-center">
                    <span className="text-[10px] text-muted-foreground block font-medium">Invoices</span>
                    <span className="font-mono text-base font-extrabold text-foreground">{previewStats?.total_invoices || 0}</span>
                  </div>
                  <div className="rounded-lg bg-card/60 p-2.5 border border-border/50 text-center">
                    <span className="text-[10px] text-muted-foreground block font-medium">Audit Logs</span>
                    <span className="font-mono text-base font-extrabold text-emerald-400">{previewStats?.total_audit_logs || 0}</span>
                  </div>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-xs font-semibold"
                onClick={() => handleDemoSignIn("admin")}
                disabled={demoLoading}
                data-testid="enter-admin-preview-btn"
              >
                {demoLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Eye className="mr-2 h-3.5 w-3.5" />}
                Launch Full Backend Data Preview
              </Button>
            </div>
          )}

          {/* Primary Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {authMode === "request_access" && (
              <>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Full Name</Label>
                  <div className="relative mt-1.5">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Sarah Jenkins"
                      className="pl-9"
                      required
                      data-testid="access-name"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Organization Name / Code to Join</Label>
                  <div className="relative mt-1.5">
                    <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={form.organization_name}
                      onChange={(e) => setForm({ ...form, organization_name: e.target.value })}
                      placeholder="Acme Operations Ltd"
                      className="pl-9"
                      data-testid="access-org-name"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Reason / Access Requirements (Optional)</Label>
                  <Textarea
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder="Briefly state your role or reason for requesting access to this workspace..."
                    className="mt-1.5 min-h-[70px] text-xs"
                    data-testid="access-reason"
                  />
                </div>
              </>
            )}

            {authMode === "register" && (
              <>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Full Name</Label>
                  <div className="relative mt-1.5">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Jane Cooper"
                      className="pl-9"
                      required
                      data-testid="auth-name"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Company / Workspace Name</Label>
                  <div className="relative mt-1.5">
                    <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={form.organization_name}
                      onChange={(e) => setForm({ ...form, organization_name: e.target.value })}
                      placeholder="Six6Fix Enterprise Corp"
                      className="pl-9"
                      required
                      data-testid="auth-org-name"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <Label className="text-xs font-medium text-muted-foreground">Work Email Address</Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="name@company.com"
                  className="pl-9"
                  required
                  data-testid="auth-email"
                />
              </div>
            </div>

            {authMode !== "request_access" && (
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Password</Label>
                <div className="relative mt-1.5">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••••"
                    className="pl-9"
                    required
                    data-testid="auth-password"
                  />
                </div>
              </div>
            )}

            {error && <p className="text-sm font-medium text-rose-500" data-testid="auth-error">{error}</p>}

            <Button type="submit" className="w-full font-semibold" disabled={loading} data-testid="auth-submit">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {authMode === "request_access" ? (
                <>
                  <Send className="mr-2 h-4 w-4" /> Submit Access Request
                </>
              ) : authMode === "register" ? (
                <>Create Enterprise Workspace</>
              ) : (
                <>Sign in to {roleMeta[roleMode].title}</>
              )}
            </Button>
          </form>

          {/* Quick Role Demo Switches / Instant Sign-In */}
          <div className="mt-6 border-t border-border/60 pt-5 space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block text-center">
              Quick Role Preview Sign-In
            </span>

            <Button
              type="button"
              variant="outline"
              className="w-full text-xs font-medium justify-between hover:bg-accent border-dashed border-border"
              onClick={() => handleDemoSignIn(roleMode === "admin" ? "admin" : roleMode === "member" ? "member" : "owner")}
              disabled={demoLoading}
              data-testid="quick-role-demo-btn"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>Quick Sign-In as {roleMeta[roleMode].title}</span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
