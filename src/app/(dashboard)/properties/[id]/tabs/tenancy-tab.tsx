"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { DateDisplay } from "@/components/date-display";
import { Money } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, ApiClientError } from "@/lib/api-client";
import type { PropertyDetailDto, TenancyDto } from "@/lib/types";

export function TenancyTab({ property }: { property: PropertyDetailDto }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["tenancies", { propertyId: property.id }],
    queryFn: async () =>
      (await api.get<TenancyDto[]>(`/api/v1/tenancies?propertyId=${property.id}&perPage=100`))
        .data,
  });

  const [overrideTarget, setOverrideTarget] = useState<string | null>(null);

  const transition = useMutation({
    mutationFn: async ({
      id,
      action,
      override,
    }: {
      id: string;
      action: "activate" | "end";
      override?: boolean;
    }) =>
      (
        await api.post<TenancyDto>(
          `/api/v1/tenancies/${id}/${action}`,
          action === "activate" && override ? { override: true } : undefined
        )
      ).data,
    onSuccess: (data, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["tenancies"] });
      queryClient.invalidateQueries({ queryKey: ["property", property.id] });
      toast.success(action === "activate" ? "Tenancy activated" : "Tenancy ended");
    },
    onError: (err, { id, action }) => {
      if (
        action === "activate" &&
        err instanceof ApiClientError &&
        err.code === "CONFLICT" &&
        err.message.includes("signed contract")
      ) {
        setOverrideTarget(id);
        return;
      }
      toast.error(err instanceof ApiClientError ? err.message : "Action failed");
    },
  });

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (query.isError) {
    return (
      <div className="text-sm text-muted-foreground">
        Failed to load tenancies.{" "}
        <button className="underline" onClick={() => query.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const tenancies = query.data ?? [];
  const current =
    tenancies.find((t) => t.status === "active") ??
    tenancies.find((t) => t.status === "draft");
  const past = tenancies.filter((t) => t.id !== current?.id);

  return (
    <div className="space-y-4">
      {current ? (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  {current.tenant?.fullName ?? "Tenant"}
                  <StatusBadge status={current.status} />
                </CardTitle>
                <CardDescription>
                  {[current.tenant?.email, current.tenant?.phone].filter(Boolean).join(" · ")}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {current.status === "draft" ? (
                  <>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/tenancies/${current.id}/edit`}>
                        <Pencil className="size-4" /> Edit draft
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      disabled={transition.isPending}
                      onClick={() => transition.mutate({ id: current.id, action: "activate" })}
                    >
                      Activate
                    </Button>
                  </>
                ) : null}
                {current.status === "active" ? (
                  <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" disabled={transition.isPending}>
                          End tenancy
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>End this tenancy?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Marks the tenancy as ended today and stops future rent from being
                            expected. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => transition.mutate({ id: current.id, action: "end" })}
                          >
                            End tenancy
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Tenancy</dt>
                <dd>
                  Assured periodic · monthly<br />
                  <span className="text-muted-foreground">Started <DateDisplay iso={current.startDate} /></span>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Rent</dt>
                <dd>
                  <Money cents={current.rentAmountCents} />
                  /month, due day {current.rentDueDay}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Deposit</dt>
                <dd>
                  {current.depositAmountCents != null ? (
                    <>
                      <Money cents={current.depositAmountCents} />
                      {current.depositScheme ? ` · ${current.depositScheme}` : ""}
                      {current.depositReference ? ` · ref ${current.depositReference}` : ""}
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-between py-6">
            <p className="text-sm text-muted-foreground">
              No current tenancy — this property is vacant.
            </p>
            <Button asChild size="sm">
              <Link href={`/tenancies/new?propertyId=${property.id}`}>
                <Plus className="size-4" /> New tenancy
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Past tenancies</CardTitle>
        </CardHeader>
        <CardContent>
          {past.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Rent</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {past.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        {t.tenant ? (
                          <Link href={`/tenants/${t.tenantId}`} className="hover:underline">
                            {t.tenant.fullName}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <DateDisplay iso={t.startDate} />
                      </TableCell>
                      <TableCell>
                        <DateDisplay iso={t.endedOn ?? t.endDate} />
                      </TableCell>
                      <TableCell>
                        <Money cents={t.rentAmountCents} />
                        <span className="text-muted-foreground">/mo</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!overrideTarget}
        onOpenChange={(open) => !open && setOverrideTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No signed contract on this tenancy</AlertDialogTitle>
            <AlertDialogDescription>
              The activation rule expects a signed contract first. You can
              override and activate anyway (e.g. contract handled outside the
              app).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (overrideTarget) {
                  transition.mutate({ id: overrideTarget, action: "activate", override: true });
                }
                setOverrideTarget(null);
              }}
            >
              Activate with override
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
