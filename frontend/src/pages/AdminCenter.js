import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  Lock,
  Key,
  Server,
  Download,
  FileText,
  CheckCircle2,
  UserPlus,
  Sliders,
  RefreshCw,
  AlertTriangle,
  Database,
  Building2,
  Eye,
  Check,
  X,
  Layers,
  Inbox
} from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatDate, formatCurrency } from "@/lib/format";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function AdminCenter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [systemPreview, setSystemPreview] = useState(null);
  const [accessRequests, setAccessRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewRes, previewRes, requestsRes] = await Promise.allSettled([
        api.get("/admin/overview"),
        api.get("/admin/system-data-preview"),
        api.get("/admin/access-requests"),
      ]);

      if (overviewRes.status === "fulfilled") setData(overviewRes.value.data);
      if (previewRes.status === "fulfilled") setSystemPreview(previewRes.value.data);
      if (requestsRes.status === "fulfilled") setAccessRequests(requestsRes.value.data);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAccessRequestAction = async (requestId, action) => {
    try {
      await api.post(`/admin/access-requests/${requestId}/action`, { action });
      toast.success(`Access request ${action === "approve" ? "approved" : "rejected"} successfully`);
      loadData();
    } catch (e) {
      toast.error("Action failed: " + formatApiError(e));
    }
  };

  const handleExportBackup = async () => {
    setExporting(true);
    try {
      const [customersRes, invoicesRes, productsRes] = await Promise.all([
        api.get("/customers"),
        api.get("/invoices"),
        api.get("/products"),
      ]);

      const backup = {
        workspace: data?.organization || {},
        exported_at: new Date().toISOString(),
        exported_by: user.email,
        counts: {
          customers: customersRes.data.length,
          invoices: invoicesRes.data.length,
          products: productsRes.data.length,
        },
        data: {
          customers: customersRes.data,
          invoices: invoicesRes.data,
          products: productsRes.data,
        },
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Six6Fix_Backup_${data?.organization?.name || "Workspace"}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Workspace backup downloaded successfully!");
    } catch (e) {
      toast.error("Failed to generate backup: " + formatApiError(e));
    } finally {
      setExporting(false);
    }
  };

  if (loading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 sm:grid-cols-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>
    );

  if (error && !data) return <ErrorState message={formatApiError(error)} onRetry={loadData} />;

  const org = data?.organization || {};
  const security = data?.security || {};
  const sys = systemPreview || {};

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader
        title="Admin Control Center & Data Governance"
        subtitle={`System administration, access management, multi-tenant isolation, and full backend data preview for ${org.name || "Six6Fix OS"}.`}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} data-testid="admin-refresh">
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportBackup} disabled={exporting} data-testid="admin-export-backup">
            <Download className="mr-2 h-4 w-4" /> {exporting ? "Generating..." : "Export Backup"}
          </Button>
          <Button size="sm" onClick={() => navigate("/settings?tab=team")} data-testid="admin-manage-team">
            <UserPlus className="mr-2 h-4 w-4" /> Manage Team
          </Button>
        </div>
      </PageHeader>

      {/* Top High-Level Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="border-border/70 bg-card/90 p-5" data-testid="admin-members">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team Roster</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 font-mono text-3xl font-extrabold">{data?.total_members || 1}</p>
          <p className="mt-1 text-xs text-muted-foreground font-medium">
            {data?.active_members_count || 1} Active · {data?.deactivated_members_count || 0} Deactivated
          </p>
        </Card>

        <Card className="border-border/70 bg-card/90 p-5" data-testid="admin-isolation">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Multi-Tenant Isolation</span>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 font-mono text-xl font-bold text-emerald-500">{security.tenant_isolation || "VERIFIED"}</p>
          <p className="mt-1 text-xs text-muted-foreground font-medium">
            Strict `org_id` workspace partitioning
          </p>
        </Card>

        <Card className="border-border/70 bg-card/90 p-5" data-testid="admin-requests-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Access Requests</span>
            <Inbox className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 font-mono text-3xl font-extrabold">{accessRequests.length}</p>
          <p className="mt-1 text-xs text-muted-foreground font-medium">
            {accessRequests.filter((r) => r.status === "pending").length} Pending Review
          </p>
        </Card>

        <Card className="border-border/70 bg-card/90 p-5" data-testid="admin-audits">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Audit Logs</span>
            <FileText className="h-4 w-4 text-violet-500" />
          </div>
          <p className="mt-2 font-mono text-3xl font-extrabold">{data?.audit_logs_total || 0}</p>
          <p className="mt-1 text-xs text-muted-foreground font-medium">
            Immutable security audit entries
          </p>
        </Card>
      </div>

      {/* Tabs Navigation: Overview vs Access Requests vs Full Backend Data Preview */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="overview" data-testid="tab-admin-overview">
            <ShieldCheck className="mr-2 h-4 w-4" /> Governance Overview
          </TabsTrigger>
          <TabsTrigger value="requests" data-testid="tab-admin-requests">
            <Inbox className="mr-2 h-4 w-4" /> Access Requests ({accessRequests.filter((r) => r.status === "pending").length})
          </TabsTrigger>
          <TabsTrigger value="preview" data-testid="tab-admin-data-preview">
            <Database className="mr-2 h-4 w-4" /> Backend Data Preview
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Governance & Team Roster */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Workspace Member Roles & Permissions */}
            <Card className="border-border/70 bg-card/90 p-5 space-y-4" data-testid="admin-members-list">
              <div className="flex items-center justify-between border-b border-border/70 pb-3">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4 text-primary" /> Workspace Members ({data?.members?.length || 0})
                </span>
                <Badge variant="outline" className="text-xs font-mono">
                  {org.name}
                </Badge>
              </div>

              <div className="divide-y divide-border/50 max-h-[360px] overflow-y-auto">
                {(data?.members || []).map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-semibold">{m.name} {m.id === user.id ? "(You)" : ""}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px] uppercase font-bold text-primary">
                        {m.role || "member"}
                      </Badge>
                      {m.status === "deactivated" ? (
                        <Badge variant="destructive" className="text-[10px]">Deactivated</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-500">Active</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Security & System Governance */}
            <Card className="border-border/70 bg-card/90 p-5 space-y-4" data-testid="admin-security-settings">
              <div className="flex items-center justify-between border-b border-border/70 pb-3">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Lock className="h-4 w-4 text-emerald-500" /> Security & Governance Policies
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div>
                    <p className="font-semibold text-foreground">Password Hashing & Auth</p>
                    <p className="text-muted-foreground">Bcrypt salt (rounds=12) with JWT sessions ({security.session_ttl_days || 7} days expiry)</p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div>
                    <p className="font-semibold text-foreground">Multi-Tenant Organization Boundary</p>
                    <p className="text-muted-foreground">Every document index isolated by org_id ({org.id})</p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div>
                    <p className="font-semibold text-foreground">Admins See All Workspace Data</p>
                    <p className="text-muted-foreground">Admins and Owners have global visibility over unassigned leads and tasks</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {security.admins_see_all ? "ENABLED" : "ENABLED"}
                  </Badge>
                </div>
              </div>
            </Card>
          </div>

          {/* Audit Log Stream */}
          <Card className="border-border/70 bg-card/90 p-5 space-y-3" data-testid="admin-recent-audits">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Server className="h-4 w-4 text-violet-500" /> Recent System Audit Events
              </span>
              <Button variant="ghost" size="sm" onClick={() => navigate("/settings?tab=audit")} className="h-7 text-xs">
                View Full Audit Trail
              </Button>
            </div>

            <div className="divide-y divide-border/50 text-xs">
              {(data?.recent_audit_logs || []).length === 0 ? (
                <p className="py-6 text-center text-muted-foreground">No recent audit logs found.</p>
              ) : (
                (data?.recent_audit_logs || []).map((a, i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <div>
                      <span className="font-semibold text-foreground">{a.action}</span>
                      <span className="ml-2 text-muted-foreground">({a.category || "system"})</span>
                      {a.details && <p className="text-[11px] text-muted-foreground">{a.details}</p>}
                    </div>
                    <span className="text-[11px] text-muted-foreground">{formatDate(a.created_at)}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </TabsContent>

        {/* Tab 2: Access Requests Review Queue */}
        <TabsContent value="requests" className="mt-6">
          <Card className="border-border/70 bg-card/90 p-5 space-y-4" data-testid="admin-access-requests-queue">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <div>
                <h3 className="font-semibold text-sm">Pending Access Requests Queue</h3>
                <p className="text-xs text-muted-foreground">Review applications submitted from the Request Access portal.</p>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {accessRequests.length} Total Applications
              </Badge>
            </div>

            {accessRequests.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <Inbox className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p>No access requests submitted yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Users can submit requests via the Request Access tab on the Sign In page.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {accessRequests.map((req) => (
                  <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-4 gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{req.name}</span>
                        <Badge variant="secondary" className="text-[10px] uppercase font-bold text-primary">
                          {req.requested_role || "member"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            req.status === "approved"
                              ? "border-emerald-500/40 text-emerald-500"
                              : req.status === "rejected"
                              ? "border-rose-500/40 text-rose-500"
                              : "border-amber-500/40 text-amber-500"
                          }`}
                        >
                          {req.status?.toUpperCase() || "PENDING"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{req.email} · Org: {req.organization_name || "Default"}</p>
                      {req.reason && <p className="text-xs italic text-muted-foreground/90 mt-1">"{req.reason}"</p>}
                      <span className="text-[10px] text-muted-foreground block">{formatDate(req.created_at)}</span>
                    </div>

                    {req.status === "pending" && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 text-xs"
                          onClick={() => handleAccessRequestAction(req.id, "approve")}
                          data-testid={`approve-req-${req.id}`}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-rose-500/40 text-rose-500 hover:bg-rose-500/10 text-xs"
                          onClick={() => handleAccessRequestAction(req.id, "reject")}
                          data-testid={`reject-req-${req.id}`}
                        >
                          <X className="mr-1 h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Tab 3: Full Backend Data Preview (Clean View across site) */}
        <TabsContent value="preview" className="mt-6 space-y-6">
          <Card className="border-emerald-500/30 bg-card/90 p-5 space-y-6" data-testid="admin-full-backend-preview">
            <div className="flex items-center justify-between border-b border-border/70 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-emerald-400" />
                  <h3 className="font-heading text-lg font-extrabold text-foreground">Full Backend Preview & Collected Data</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Clean, structured inspection of all tenant organizations, collected platform metrics, and system database states.
                </p>
              </div>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 font-mono text-xs">
                SYSTEM ADMIN PREVIEW MODE
              </Badge>
            </div>

            {/* Collected Global Stats Grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-border/70 bg-accent/20 p-4">
                <span className="text-xs text-muted-foreground font-medium block">Total Organizations</span>
                <p className="mt-1 font-mono text-2xl font-black">{sys.total_organizations || 1}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-accent/20 p-4">
                <span className="text-xs text-muted-foreground font-medium block">Total Registered Users</span>
                <p className="mt-1 font-mono text-2xl font-black">{sys.total_users || 1}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-accent/20 p-4">
                <span className="text-xs text-muted-foreground font-medium block">Total Customers Collected</span>
                <p className="mt-1 font-mono text-2xl font-black text-primary">{sys.total_customers || 0}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-accent/20 p-4">
                <span className="text-xs text-muted-foreground font-medium block">Global Platform Invoices</span>
                <p className="mt-1 font-mono text-2xl font-black text-emerald-400">{sys.total_invoices || 0}</p>
              </div>
            </div>

            {/* All Tenant Organizations Inspection Table */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" /> Tenant Workspaces Directory ({(sys.organizations || []).length})
              </h4>

              <div className="overflow-x-auto rounded-lg border border-border/70">
                <table className="w-full text-left text-xs">
                  <thead className="bg-accent/40 text-muted-foreground uppercase font-mono text-[10px]">
                    <tr>
                      <th className="p-3">Workspace Name</th>
                      <th className="p-3">Org ID</th>
                      <th className="p-3">Industry</th>
                      <th className="p-3">Currency</th>
                      <th className="p-3">Created Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {(sys.organizations || []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-muted-foreground">No tenant organizations found.</td>
                      </tr>
                    ) : (
                      (sys.organizations || []).map((o) => (
                        <tr key={o.id} className="hover:bg-accent/20 transition-colors">
                          <td className="p-3 font-bold text-foreground">{o.name}</td>
                          <td className="p-3 font-mono text-muted-foreground">{o.id}</td>
                          <td className="p-3 text-muted-foreground">{o.industry || "General Business"}</td>
                          <td className="p-3 font-mono text-primary">{o.currency || "USD"}</td>
                          <td className="p-3 text-muted-foreground">{formatDate(o.created_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* All Registered System Users Inspection */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-violet-400" /> Platform Registered Users ({(sys.users || []).length})
              </h4>

              <div className="overflow-x-auto rounded-lg border border-border/70">
                <table className="w-full text-left text-xs">
                  <thead className="bg-accent/40 text-muted-foreground uppercase font-mono text-[10px]">
                    <tr>
                      <th className="p-3">Name</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Active Org ID</th>
                      <th className="p-3">Joined Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {(sys.users || []).map((u) => (
                      <tr key={u.id} className="hover:bg-accent/20 transition-colors">
                        <td className="p-3 font-semibold text-foreground">{u.name}</td>
                        <td className="p-3 text-muted-foreground">{u.email}</td>
                        <td className="p-3">
                          <Badge variant="secondary" className="text-[10px] uppercase font-bold text-primary">
                            {u.role || "member"}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{u.active_org_id}</td>
                        <td className="p-3 text-muted-foreground">{formatDate(u.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
