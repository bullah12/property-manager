import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Consistent status→colour mapping across all entities. */
const STYLES: Record<string, string> = {
  // properties
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  archived: "bg-muted text-muted-foreground",
  // tenancies / contracts
  draft: "bg-sky-100 text-sky-800 border-sky-200",
  ended: "bg-muted text-muted-foreground",
  renewed: "bg-violet-100 text-violet-800 border-violet-200",
  issued: "bg-amber-100 text-amber-800 border-amber-200",
  signed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  superseded: "bg-muted text-muted-foreground",
  // compliance chips
  ok: "bg-emerald-100 text-emerald-800 border-emerald-200",
  "due soon": "bg-amber-100 text-amber-800 border-amber-200",
  overdue: "bg-red-100 text-red-800 border-red-200",
  completed: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("capitalize", STYLES[status], className)}>
      {status}
    </Badge>
  );
}
