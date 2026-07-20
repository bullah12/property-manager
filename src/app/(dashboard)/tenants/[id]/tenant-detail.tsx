"use client";

import { useQuery } from "@tanstack/react-query";
import { Mail, Pencil, Phone } from "lucide-react";
import Link from "next/link";
import { DateDisplay } from "@/components/date-display";
import { Money } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
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
import { api } from "@/lib/api-client";
import type { TenantDetailDto } from "@/lib/types";

export function TenantDetail({ id }: { id: string }) {
  const { data: tenant, isLoading, isError, refetch } = useQuery({
    queryKey: ["tenant", id],
    queryFn: async () => (await api.get<TenantDetailDto>(`/api/v1/tenants/${id}`)).data,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full max-w-xl" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{tenant.fullName}</h2>
          <div className="mt-1 flex flex-wrap gap-4 text-sm text-muted-foreground">
            {tenant.email ? (
              <a href={`mailto:${tenant.email}`} className="inline-flex items-center gap-1 hover:underline">
                <Mail className="size-3.5" /> {tenant.email}
              </a>
            ) : null}
            {tenant.phone ? (
              <a href={`tel:${tenant.phone}`} className="inline-flex items-center gap-1 hover:underline">
                <Phone className="size-3.5" /> {tenant.phone}
              </a>
            ) : null}
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/tenants/${id}/edit`}>
            <Pencil className="size-4" /> Edit
          </Link>
        </Button>
      </div>

      {tenant.notes ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">{tenant.notes}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tenancy history</CardTitle>
          <CardDescription>Across all properties, most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          {tenant.tenancies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tenancies yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Rent</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenant.tenancies.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        {t.property ? (
                          <Link href={`/properties/${t.propertyId}?tab=tenancy`} className="font-medium hover:underline">
                            {t.property.nickname}
                          </Link>
                        ) : (
                          t.propertyId
                        )}
                      </TableCell>
                      <TableCell>
                        <DateDisplay iso={t.startDate} />
                      </TableCell>
                      <TableCell>
                        {t.status === "active" ? "Rolling" : <DateDisplay iso={t.endedOn ?? t.endDate} />}
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
    </div>
  );
}
