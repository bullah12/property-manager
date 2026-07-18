"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import type { TenancyDto } from "@/lib/types";
import { TenancyForm } from "../../tenancy-form";

export function EditTenancyScreen({ id }: { id: string }) {
  const { data: tenancy, isLoading, isError, refetch } = useQuery({
    queryKey: ["tenancy", id],
    queryFn: async () => (await api.get<TenancyDto>(`/api/v1/tenancies/${id}`)).data,
  });

  if (isLoading) return <Skeleton className="h-96 w-full max-w-2xl" />;
  if (isError || !tenancy) {
    return (
      <div className="text-sm text-muted-foreground">
        Failed to load tenancy.{" "}
        <button className="underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }
  return <TenancyForm tenancy={tenancy} />;
}
