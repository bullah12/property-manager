"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock3, ExternalLink, RefreshCw } from "lucide-react";
import Link from "next/link";
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

function statusLabel(job: JobDto) {
  if (job.status === "running") return "Running";
  if (job.status === "dead" || job.status === "failed") return "Failed";
  if (job.attempts > 0) return "Waiting to retry";
  return "Waiting to start";
}

function JobRow({
  job,
  retrying,
  onRetry,
}: {
  job: JobDto;
  retrying: boolean;
  onRetry: (id: string) => void;
}) {
  const context = job.context?.kind === "contract-generation" ? job.context : null;
  const missingFields = context?.missingFields ?? [];
  const needsInput = missingFields.length > 0;
  const isFailed = job.status === "dead" || job.status === "failed";
  const subject = context
    ? [context.tenantName, context.propertyNickname].filter(Boolean).join(" at ")
    : job.type;

  return (
    <li className="rounded-md border p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {needsInput ? (
              <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
            ) : (
              <Clock3 className="size-4 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="font-medium">
              {context
                ? `${context.contractKind === "renewal" ? "Renewal" : "Lease"} contract`
                : job.type}
            </span>
            <Badge variant={isFailed ? "destructive" : needsInput ? "outline" : "secondary"}>
              {statusLabel(job)}
            </Badge>
          </div>

          {subject ? <p className="text-sm text-muted-foreground">{subject}</p> : null}

          {needsInput ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <div className="font-medium">Information required</div>
              <ul className="mt-1 list-disc pl-5">
                {missingFields.map((field) => (
                  <li key={field.path}>{field.label}</li>
                ))}
              </ul>
              {context && !context.canEditTenancy ? (
                <p className="mt-2 text-xs">
                  This tenancy is {context.tenancyStatus ?? "not available"} and cannot currently
                  be edited from the tenancy form.
                </p>
              ) : null}
            </div>
          ) : context && job.lastError ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              The required information is now complete. This job is waiting to retry.
            </p>
          ) : job.lastError ? (
            <p className="break-words text-xs text-destructive">{job.lastError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Scheduled for <DateDisplay iso={job.runAt} withTime />
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Attempt {job.attempts} of {job.maxAttempts} · updated{" "}
            <DateDisplay iso={job.updatedAt} withTime />
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {context?.editPath ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={context.editPath}>
                {context.canEditTenancy && needsInput ? "Complete details" : "View tenancy"}
                <ExternalLink className="size-4" />
              </Link>
            </Button>
          ) : null}
          {isFailed ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRetry(job.id)}
              disabled={retrying || needsInput}
              title={needsInput ? "Complete the missing information before retrying" : undefined}
            >
              <RefreshCw className="size-4" /> Retry
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function JobsHealthCard() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["jobs", "actionable"],
    queryFn: async () => {
      const [pending, running, failed, dead] = await Promise.all([
        api.get<JobDto[]>("/api/v1/jobs?status=pending&perPage=50"),
        api.get<JobDto[]>("/api/v1/jobs?status=running&perPage=50"),
        api.get<JobDto[]>("/api/v1/jobs?status=failed&perPage=50"),
        api.get<JobDto[]>("/api/v1/jobs?status=dead&perPage=50"),
      ]);
      return [...pending.data, ...running.data, ...failed.data, ...dead.data].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    },
    refetchInterval: 10_000,
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

  const jobs = query.data ?? [];
  const activeCount = jobs.filter(
    (job) => job.status === "pending" || job.status === "running"
  ).length;
  const needsInputCount = jobs.filter(
    (job) => (job.context?.missingFields.length ?? 0) > 0
  ).length;
  const failedCount = jobs.filter(
    (job) => job.status === "dead" || job.status === "failed"
  ).length;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Background jobs
          {needsInputCount > 0 ? (
            <Badge variant="outline" className="border-amber-300 text-amber-800 dark:text-amber-200">
              {needsInputCount} need information
            </Badge>
          ) : null}
          {activeCount > 0 ? <Badge variant="secondary">{activeCount} active</Badge> : null}
          {failedCount > 0 ? <Badge variant="destructive">{failedCount} failed</Badge> : null}
          {jobs.length === 0 && !query.isLoading ? (
            <Badge variant="secondary">healthy</Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          Pending and failed work is shown here, including any information needed before it can
          complete.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading background jobs…</p>
        ) : query.isError ? (
          <div className="text-sm text-muted-foreground">
            Failed to load background jobs.{" "}
            <button className="underline" onClick={() => query.refetch()}>
              Retry
            </button>
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending or failed jobs.</p>
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                retrying={retry.isPending}
                onRetry={(id) => retry.mutate(id)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
