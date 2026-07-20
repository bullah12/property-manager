"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PropertyDetailDto } from "@/lib/types";

export function useProperty(id: string) {
  return useQuery({
    queryKey: ["property", id],
    queryFn: async () => (await api.get<PropertyDetailDto>(`/api/v1/properties/${id}`)).data,
    staleTime: 30_000,
  });
}
