import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { UserPlus, Trash2, Loader2, Copy, ShieldCheck } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";

export function TeamTab() {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [saving, setSaving] = useState(false);
  const [invited, setInvited] = useState(null);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/team").then(({ data }) => setMembers(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const me = members.find((m) => m.is_you);
  const isPrivileged = me?.role === "owner" || me?.role === "admin";

  const invite = async () => {
    if (!name.trim() || !email.trim()) { toast.error("Enter a name and email"); return; }
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
              <SelectContent><SelectItem value="member">Member</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
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
            <p className="mt-1 text-xs text-muted-foreground">Share these credentials securely. They can change the password later.</p>
          </div>
        )}
      </Card>
      )}

      <Card className="border-border/70 bg-card/90">
        <div className="border-b border-border/70 px-5 py-4"><h3 className="font-heading text-base font-semibold">Workspace Members ({members.length})</h3></div>
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading team...</p>
        ) : members.length === 0 ? (
          <EmptyState title="No members yet" description="Invite teammates to collaborate in this workspace." />
        ) : (
          <div className="divide-y divide-border/50" data-testid="team-members">
            {members.map((m) => {
              const initials = (m.name || "?").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
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
                    {isPrivileged && !m.is_you && m.role !== "owner" && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => setRemoving(m)} data-testid={`remove-member-${m.id}`}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove member?" description={`${removing?.name} will lose access to this workspace.`} confirmLabel="Remove" onConfirm={remove} />
    </div>
  );
}
