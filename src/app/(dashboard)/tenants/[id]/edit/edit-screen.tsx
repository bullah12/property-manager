"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import type { TenantDetailDto } from "@/lib/types";
import { TenantForm } from "../../tenant-form";

export function EditTenantScreen({ id }: { id: string }) {
  const { data: tenant, isLoading, isError, refetch } = useQuery({
    queryKey: ["tenant", id],
    queryFn: async () => (await api.get<TenantDetailDto>(`/api/v1/tenants/${id}`)).data,
  });

  if (isLoading) return <Skeleton className="h-96 w-full max-w-xl" />;
  if (isError || !tenant) {
    return (
      <div className="text-sm text-muted-foreground">
        Failed to load tenant.{" "}
        <button className="underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }
  return <TenantForm tenant={tenant} />;
}
