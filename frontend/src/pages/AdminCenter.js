import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, ShieldAlert, Users, Lock, Key, Server, Download, FileText, CheckCircle2, UserPlus, Sliders, RefreshCw, AlertTriangle } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function AdminCenter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/admin/overview")
      .then(({ data }) => { setData(data); setError(null); })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleExportBackup = async () => {
    setExporting(true);
    try {
      const customersRes = await api.get("/customers");
      const invoicesRes = await api.get("/invoices");
      const productsRes = await api.get("/products");
      
      const backup = {
        workspace: data.organization,
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
        }
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Six6Fix_Backup_${data.organization?.name || "Workspace"}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Workspace backup downloaded successfully!");
    } catch (e) {
      toast.error("Failed to generate backup: " + formatApiError(e));
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><div className="grid gap-6 sm:grid-cols-3"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" /></div></div>;
  if (error) return <ErrorState message={formatApiError(error)} onRetry={load} />;

  const org = data.organization || {};
  const security = data.security || {};

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader
        title="Admin Control Center & Governance"
        subtitle={`System administration, user access management, multi-tenant isolation, and workspace security for ${org.name || "your business"}.`}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportBackup} disabled={exporting} data-testid="admin-export-backup">
            <Download className="mr-2 h-4 w-4" /> {exporting ? "Generating..." : "Export Data Backup"}
          </Button>
          <Button size="sm" onClick={() => navigate("/settings?tab=team")} data-testid="admin-manage-team">
            <UserPlus className="mr-2 h-4 w-4" /> Manage Team
          </Button>
        </div>
      </PageHeader>

      {/* Security & System Status */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border/70 bg-card/90 p-5" data-testid="admin-members">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team Roster</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 font-mono text-3xl font-extrabold">{data.total_members}</p>
          <p className="mt-1 text-xs text-muted-foreground font-medium">
            {data.active_members_count} Active · {data.deactivated_members_count} Deactivated
          </p>
        </Card>

        <Card className="border-border/70 bg-card/90 p-5" data-testid="admin-isolation">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Multi-Tenant Isolation</span>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 font-mono text-xl font-bold text-emerald-500">{security.tenant_isolation}</p>
          <p className="mt-1 text-xs text-muted-foreground font-medium">
            Strict `org_id` workspace partitioning
          </p>
        </Card>

        <Card className="border-border/70 bg-card/90 p-5" data-testid="admin-audits">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Audit Logs</span>
            <FileText className="h-4 w-4 text-violet-500" />
          </div>
          <p className="mt-2 font-mono text-3xl font-extrabold">{data.audit_logs_total}</p>
          <p className="mt-1 text-xs text-muted-foreground font-medium">
            Immutable audit record entries
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Workspace Member Roles & Permissions */}
        <Card className="border-border/70 bg-card/90 p-5 space-y-4" data-testid="admin-members-list">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-primary" /> Workspace Members ({data.members.length})
            </span>
            <Badge variant="outline" className="text-xs font-mono">
              {org.name}
            </Badge>
          </div>

          <div className="divide-y divide-border/50 max-h-[360px] overflow-y-auto">
            {data.members.map((m) => (
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
                <p className="text-muted-foreground">Bcrypt salt (rounds=12) with JWT sessions ({security.session_ttl_days} days expiry)</p>
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
                {security.admins_see_all ? "ENABLED" : "DISABLED"}
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
          {data.recent_audit_logs.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">No recent audit logs found.</p>
          ) : (
            data.recent_audit_logs.map((a, i) => (
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
    </div>
  );
}
