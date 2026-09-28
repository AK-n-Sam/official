import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TableSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-3 p-4" data-testid="loading-state">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div
      data-testid="error-state"
      className="flex flex-col items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/5 px-6 py-14 text-center"
    >
      <AlertTriangle className="mb-3 h-8 w-8 text-rose-500" />
      <h3 className="text-base font-semibold">Something went wrong</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {message || "We couldn't load this data. Please try again."}
      </p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry} data-testid="error-retry">
          Retry
        </Button>
      )}
    </div>
  );
}
