"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { DateDisplay } from "@/components/date-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, ApiClientError } from "@/lib/api-client";
import type { JobDto } from "@/lib/types";

/** Dead-letter visibility on Settings (notifications-scheduling skill). */
export function JobsHealthCard() {
  const queryClient = useQueryClient();

  const dead = useQuery({
    queryKey: ["jobs", "dead"],
    queryFn: async () => api.get<JobDto[]>("/api/v1/jobs?status=dead&perPage=25"),
  });

  const retry = useMutation({
    mutationFn: async (id: string) => api.post(`/api/v1/jobs/${id}/retry`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Job re-queued");
    },
    onError: (err) =>
      toast.error(err instanceof ApiClientError ? err.message : "Retry failed"),
  });

  const count = dead.data?.meta?.total ?? 0;
  const jobs = dead.data?.data ?? [];

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Background jobs
          {count > 0 ? (
            <Badge className="bg-red-100 text-red-800">{count} dead</Badge>
          ) : (
            <Badge variant="secondary">healthy</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Failed jobs land here after {""}exhausting retries. Retry re-queues
          them immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dead jobs.</p>
        ) : (
          <ul className="space-y-2">
            {jobs.map((j) => (
              <li
                key={j.id}
                className="flex items-center justify-between gap-3 rounded-md border border-red-200 p-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium">{j.type}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {j.lastError ?? "unknown error"} · <DateDisplay iso={j.updatedAt} withTime />
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => retry.mutate(j.id)}
                  disabled={retry.isPending}
                >
                  <RefreshCw className="size-4" /> Retry
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
