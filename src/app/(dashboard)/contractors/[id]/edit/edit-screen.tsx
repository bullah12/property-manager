"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import type { ContractorDetailDto } from "@/lib/types";
import { ContractorForm } from "../../contractor-form";

export function EditContractorScreen({ id }: { id: string }) {
  const { data: contractor, isLoading, isError, refetch } = useQuery({
    queryKey: ["contractor", id],
    queryFn: async () => (await api.get<ContractorDetailDto>(`/api/v1/contractors/${id}`)).data,
  });
  if (isLoading) return <Skeleton className="h-96 w-full max-w-3xl" />;
  if (isError || !contractor) return <div className="text-sm text-muted-foreground">Failed to load contractor. <button className="underline" onClick={() => refetch()}>Retry</button></div>;
  return <ContractorForm contractor={contractor} />;
}
