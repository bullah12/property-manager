"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useProperty } from "@/hooks/use-property";
import { PropertyForm } from "../../property-form";

export function EditPropertyScreen({ id }: { id: string }) {
  const { data: property, isLoading, isError, refetch } = useProperty(id);

  if (isLoading) return <Skeleton className="h-96 w-full max-w-2xl" />;
  if (isError || !property) {
    return (
      <div className="text-sm text-muted-foreground">
        Failed to load property.{" "}
        <button className="underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }
  return <PropertyForm property={property} />;
}
