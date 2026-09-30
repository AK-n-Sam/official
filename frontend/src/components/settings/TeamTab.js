import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { UserPlus, Trash2, Loader2, Copy, ShieldCheck, UserCog, ArrowRightLeft, Shield, User } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { usePermissions } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { MoreHorizontal } from "lucide-react";

export function TeamTab() {
  const { isOwner, isManager: isPrivileged } = usePermissions();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [saving, setSaving] = useState(false);
  const [invited, setInvited] = useState(null);
  const [removing, setRemoving] = useState(null);

  // Admin scope toggle (owner only)
  const [org, setOrg] = useState(null);
  const [savingScope, setSavingScope] = useState(false);

  // Reassign workflow
  const [reassigning, setReassigning] = useState(null);
  const [reassignTo, setReassignTo] = useState("");
  const [reassignBusy, setReassignBusy] = useState(false);

  const [loadError, setLoadError] = useState("");
  const load = useCallback(() => {
    setLoading(true);
    api.get("/team").then(({ data }) => { setMembers(data); setLoadError(""); })
      .catch((e) => setLoadError(formatApiError(e))).finally(() => setLoading(false));
    api.get("/organizations/current").then(({ data }) => setOrg(data)).catch(() => {});
  }, []);
  useEffect(load, [load]);


  const invite = async () => {
    if (!name.trim() || !email.trim()) { toast.error("Enter a name and email"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast.error("Enter a valid email address"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/team/invite", { name, email, role });
      if (data.status === "invited") {
        setInvited(data);
        toast.success(`${data.name} added to the workspace`);
      } else {
        toast.success(`${data.name || email} added to the workspace`);
      }
      setName(""); setEmail(""); setRole("member"); load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try { await api.delete(`/team/${removing.id}`); toast.success(`${removing.name} removed`); setRemoving(null); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const toggleAdminScope = async (checked) => {
    setSavingScope(true);
    setOrg((o) => ({ ...o, admins_see_all: checked }));
    try {
      await api.put("/settings/organization", { admins_see_all: checked });
      toast.success(checked ? "Admins can now see all workspace records" : "Admins are limited to their own records");
    } catch (e) { toast.error(formatApiError(e)); setOrg((o) => ({ ...o, admins_see_all: !checked })); }
    finally { setSavingScope(false); }
  };

  const changeRole = async (m, role) => {
    try {
      await api.put(`/team/${m.id}/role`, { role });
      toast.success(`${m.name} is now ${role === "admin" ? "an admin" : "a member"}`);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const openReassign = (m) => { setReassigning(m); setReassignTo(""); };
  const doReassign = async () => {
    if (!reassignTo) { toast.error("Choose a teammate to reassign to"); return; }
    setReassignBusy(true);
    try {
      const { data } = await api.post(`/team/${reassigning.id}/reassign`, { to_member_id: reassignTo });
      toast.success(`Reassigned ${data.total} record(s) from ${data.from} to ${data.to}`);
      setReassigning(null);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setReassignBusy(false); }
  };

  const reassignTargets = members.filter((m) => m.id !== reassigning?.id);

  return (
    <div className="space-y-5">
      {isPrivileged && (
      <Card className="border-border/70 bg-card/90 p-6">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h3 className="font-heading text-base font-semibold">Invite a teammate</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-1"><Label className="text-xs text-muted-foreground">Full Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jamie Lee" className="mt-1.5" data-testid="invite-name" /></div>
          <div className="sm:col-span-2"><Label className="text-xs text-muted-foreground">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jamie@company.com" className="mt-1.5" data-testid="invite-email" /></div>
          <div><Label className="text-xs text-muted-foreground">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="mt-1.5" data-testid="invite-role"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="member">Member</SelectItem>{isOwner && <SelectItem value="admin">Admin</SelectItem>}</SelectContent>
            </Select></div>
        </div>
        <Button className="mt-4" onClick={invite} disabled={saving} data-testid="invite-submit">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send Invite
        </Button>

        {invited && (
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4" data-testid="invite-result">
            <p className="text-sm font-medium">{invited.name} can now sign in with:</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <code className="rounded bg-muted px-2 py-1 font-mono">{invited.email}</code>
              <span className="text-muted-foreground">/</span>
              <code className="rounded bg-muted px-2 py-1 font-mono">{invited.temp_password}</code>
              <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard?.writeText(`${invited.email} / ${invited.temp_password}`); toast.success("Copied"); }}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Share these securely. This password is shown only once; they'll be asked to choose their own after signing in.</p>
          </div>
        )}
      </Card>
      )}

      {isOwner && org && (
      <Card className="border-border/70 bg-card/90 p-6" data-testid="admin-scope-card">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><UserCog className="h-4.5 w-4.5" /></div>
            <div>
              <h3 className="font-heading text-base font-semibold">Admin data access</h3>
              <p className="mt-0.5 max-w-md text-sm text-muted-foreground">
                When off, admins only see records they created — just like members. Turn on to let all admins view every record across the workspace.
              </p>
            </div>
          </div>
          <Switch checked={!!org.admins_see_all} disabled={savingScope} onCheckedChange={toggleAdminScope} data-testid="admin-scope-toggle" />
        </div>
      </Card>
      )}

      <Card className="border-border/70 bg-card/90">
        <div className="border-b border-border/70 px-5 py-4"><h3 className="font-heading text-base font-semibold">Workspace Members ({members.length})</h3></div>
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading team...</p>
        ) : loadError ? (
          <div className="px-5 py-8 text-center text-sm"><p className="text-rose-500">{loadError}</p><Button variant="outline" size="sm" className="mt-3" onClick={load}>Retry</Button></div>
        ) : members.length === 0 ? (
          <EmptyState title="No members yet" description="Invite teammates to collaborate in this workspace." />
        ) : (
          <div className="divide-y divide-border/50" data-testid="team-members">
            {members.map((m) => {
              const initials = (m.name || "?").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
              const canManage = isPrivileged && !m.is_you && m.role !== "owner";
              return (
                <div key={m.id} className="flex items-center justify-between px-5 py-3" data-testid={`team-member-${m.id}`}>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 border border-border/60"><AvatarImage src={m.picture} /><AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials}</AvatarFallback></Avatar>
                    <div>
                      <p className="text-sm font-medium">{m.name} {m.is_you && <span className="text-xs text-muted-foreground">(you)</span>}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="capitalize gap-1">{m.role === "owner" && <ShieldCheck className="h-3 w-3" />}{m.role}</Badge>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`member-actions-${m.id}`}><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {isOwner && m.role === "member" && (
                            <DropdownMenuItem onClick={() => changeRole(m, "admin")} data-testid={`make-admin-${m.id}`}><Shield className="mr-2 h-4 w-4" /> Make admin</DropdownMenuItem>
                          )}
                          {isOwner && m.role === "admin" && (
                            <DropdownMenuItem onClick={() => changeRole(m, "member")} data-testid={`make-member-${m.id}`}><User className="mr-2 h-4 w-4" /> Make member</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => openReassign(m)} data-testid={`reassign-member-${m.id}`}><ArrowRightLeft className="mr-2 h-4 w-4" /> Reassign records</DropdownMenuItem>
                          {isOwner && (
                            <DropdownMenuItem onClick={() => setRemoving(m)} className="text-rose-500 focus:text-rose-500" data-testid={`remove-member-${m.id}`}><Trash2 className="mr-2 h-4 w-4" /> Remove from workspace</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove member?" description={`${removing?.name || "This member"} will lose access to this workspace. Consider reassigning their records first.`} confirmLabel="Remove" onConfirm={remove} />

      <Dialog open={!!reassigning} onOpenChange={(o) => !o && setReassigning(null)}>
        <DialogContent data-testid="reassign-dialog">
          <DialogHeader>
            <DialogTitle>Reassign {reassigning?.name}'s records</DialogTitle>
            <DialogDescription>
              Move all customers, invoices, expenses, tasks and leads created by {reassigning?.name} to another teammate. {reassigning?.name} stays on the team.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-xs text-muted-foreground">Reassign to</Label>
            <Select value={reassignTo} onValueChange={setReassignTo}>
              <SelectTrigger className="mt-1.5" data-testid="reassign-target"><SelectValue placeholder="Select a teammate" /></SelectTrigger>
              <SelectContent>
                {reassignTargets.map((m) => (
                  <SelectItem key={m.id} value={m.id} data-testid={`reassign-opt-${m.id}`}>{m.name}{m.is_you ? " (you)" : ""} · {m.role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassigning(null)} data-testid="reassign-cancel">Cancel</Button>
            <Button onClick={doReassign} disabled={reassignBusy} data-testid="reassign-confirm">
              {reassignBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reassign records
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
