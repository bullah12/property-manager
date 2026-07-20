import { Skeleton } from "@/components/ui/skeleton";

export default function PropertyLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-80 max-w-full" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex h-9 w-fit items-center gap-1 rounded-lg bg-muted p-[3px]">
          {["Tenancy", "Contracts", "Monthly Income", "Expenses", "Compliance"].map(
            (label) => (
              <span key={label} className="rounded-md px-2 py-1 text-sm text-muted-foreground">
                {label}
              </span>
            )
          )}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
