import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function PanelLoading({
  label = "Loading data…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-64 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-2">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}
