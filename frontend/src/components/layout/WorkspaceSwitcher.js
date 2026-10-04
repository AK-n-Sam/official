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
    api.get("/organizations").then(({ data }) => setOrgs(data)).catch(() => {});
  }, [user?.active_org_id]);

  const active = orgs.find((o) => o.id === user?.active_org_id);

  const handleSwitch = async (orgId) => {
    if (orgId === user?.active_org_id) { setOpen(false); return; }
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
        <Button
          variant="outline"
          className="h-11 w-full justify-between gap-2 bg-card/60 px-3 border-border/70 hover:bg-accent/50"
          data-testid="workspace-switcher"
          disabled={switching}
        >
          <span className="flex items-center gap-2.5 truncate">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
              {(active?.name || "W")[0].toUpperCase()}
            </span>
            <span className="truncate text-left leading-tight">
              <span className="block text-[9px] font-bold uppercase tracking-widest text-muted-foreground/80">WORKSPACE</span>
              <span className="block truncate text-xs font-bold text-foreground">{active?.name || "Select workspace"}</span>
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1.5" align="start">
        <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Workspaces</p>
        {orgs.map((o) => (
          <button
            key={o.id}
            onClick={() => handleSwitch(o.id)}
            data-testid={`workspace-option-${o.id}`}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
              o.id === user?.active_org_id && "bg-accent"
            )}
          >
            <span className="flex items-center gap-2 truncate">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">
                <span className="block font-medium">{o.name}</span>
                <span className="block text-xs text-muted-foreground">{o.currency} · {o.industry}</span>
              </span>
            </span>
            {o.id === user?.active_org_id && <Check className="h-4 w-4 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
