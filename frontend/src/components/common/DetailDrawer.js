import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

/** Universal Side Drawer for inspecting records without losing list context or scroll position. */
export function DetailDrawer({ open, onOpenChange, title, subtitle, badge, fullLink, children, actions }) {
  const navigate = useNavigate();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col justify-between border-l border-border bg-card shadow-xl">
        <div>
          <SheetHeader className="p-6 border-b border-border/70 bg-card/90">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <SheetTitle className="text-xl font-bold font-heading">{title}</SheetTitle>
                  {badge && <Badge variant="outline" className="text-xs uppercase font-semibold">{badge}</Badge>}
                </div>
                {subtitle && <SheetDescription className="text-xs text-muted-foreground mt-1">{subtitle}</SheetDescription>}
              </div>
            </div>
          </SheetHeader>

          <div className="p-6 space-y-4 max-h-[calc(100vh-140px)] overflow-y-auto">
            {children}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border/70 bg-muted/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {actions}
          </div>
          {fullLink && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                navigate(fullLink);
              }}
              className="text-xs gap-1.5"
              data-testid="open-full-details-btn"
            >
              <span>Full Details</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
