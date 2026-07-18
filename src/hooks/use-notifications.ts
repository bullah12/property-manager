"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { NotificationDto } from "@/lib/types";

export function useUnreadCount() {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () => {
      const res = await api.get<NotificationDto[]>(
        "/api/v1/notifications?unread=true&perPage=1"
      );
      return res.meta?.total ?? 0;
    },
    refetchInterval: 30_000, // polled inbox — no live push (PLAN.md §1)
  });
}
