import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LifeBuoy, X, ArrowRight } from "lucide-react";
import { PALETTE_SHORTCUT } from "@/components/layout/CommandPalette";
import { Button } from "@/components/ui/button";

const STORAGE = "bmp_welcome_dismissed";

const readDismissed = () => {
  try { return localStorage.getItem(STORAGE) === "1"; } catch { return false; }
};

/** Dismissible getting-started pointer on the dashboard; dismissal is remembered per browser. */
export function WelcomeBanner() {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(readDismissed);
  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem(STORAGE, "1"); } catch { /* private mode: hide for this session only */ }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 sm:flex-row sm:items-center" data-testid="welcome-banner">
      <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary sm:flex"><LifeBuoy className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">New here? The Help Center walks you through everything.</p>
        <p className="mt-0.5 text-muted-foreground">
          Press <kbd className="rounded border border-border bg-muted px-1 font-mono text-[11px]">{PALETTE_SHORTCUT}</kbd> to search or create from anywhere,
          and <kbd className="rounded border border-border bg-muted px-1 font-mono text-[11px]">?</kbd> on any page for its guide.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => navigate("/help#getting-started")} data-testid="welcome-open-help">
          Getting started <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={dismiss} aria-label="Dismiss" data-testid="welcome-dismiss">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
