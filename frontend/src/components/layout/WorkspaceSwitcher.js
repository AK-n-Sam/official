import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function WorkspaceSwitcher() {
  const { user, refresh } = useAuth();
  const [orgs, setOrgs] = useState([]);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    api
      .get("/organizations")
      .then(({ data }) => setOrgs(Array.isArray(data) ? data : []))
      .catch(() => setOrgs([]));
  }, [user?.active_org_id]);

  const safeOrgs = Array.isArray(orgs) ? orgs : [];
  const active = safeOrgs.find((o) => o?.id === user?.active_org_id);
  const initials = (active?.name || user?.name || "Workspace")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleSwitch = async (orgId) => {
    if (orgId === user?.active_org_id) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      const { data } = await api.post("/organizations/switch", { org_id: orgId });
      await refresh();
      toast.success(`Switched to ${data.name}`);
      setOpen(false);
      window.location.reload();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSwitching(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-12 w-full flex items-center justify-between gap-2.5 bg-[#171920] border border-white/5 px-3 rounded-xl transition-colors hover:bg-[#1f222c] text-left"
          data-testid="workspace-switcher"
          disabled={switching}
        >
          <span className="flex items-center gap-2.5 truncate">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#273248] text-[#93c5fd] font-extrabold text-xs">
              {initials}
            </span>
            <span className="truncate leading-tight">
              <span className="block text-[8px] font-extrabold uppercase tracking-widest text-slate-500">WORKSPACE</span>
              <span className="block truncate text-xs font-bold text-white">{active?.name || "My Workspace"}</span>
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1.5 bg-[#171920] border-white/10 text-white" align="start">
        <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Switch Workspace</p>
        {safeOrgs.map((o) => (
          <button
            key={o.id}
            onClick={() => handleSwitch(o.id)}
            data-testid={`workspace-option-${o.id}`}
            className={cn(
              "flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs hover:bg-white/10 transition-colors",
              o.id === user?.active_org_id && "bg-white/10 font-bold"
            )}
          >
            <span className="flex items-center gap-2 truncate">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <span className="truncate">
                <span className="block font-semibold">{o.name}</span>
                <span className="block text-[10px] text-slate-400">{o.currency} · {o.industry}</span>
              </span>
            </span>
            {o.id === user?.active_org_id && <Check className="h-3.5 w-3.5 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
