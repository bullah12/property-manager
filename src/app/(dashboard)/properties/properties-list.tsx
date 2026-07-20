"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { DataTable, type SortState } from "@/components/data-table";
import { Money } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api-client";
import type { ListMetaDto, PropertyDto } from "@/lib/types";

const columns: ColumnDef<PropertyDto, unknown>[] = [
  {
    header: "Nickname",
    meta: { sortField: "nickname" },
    cell: ({ row }) => (
      <span className="font-medium">{row.original.nickname}</span>
    ),
  },
  {
    header: "Address",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.addressLine1}, {row.original.city} {row.original.postcode}
      </span>
    ),
  },
  {
    header: "Landlord",
    cell: ({ row }) => row.original.mainLandlord?.fullName ?? "—",
  },
  {
    header: "Type",
    meta: { sortField: "property_type" },
    cell: ({ row }) => <span className="capitalize">{row.original.propertyType}</span>,
  },
  {
    header: "Beds",
    cell: ({ row }) => row.original.bedrooms ?? "—",
  },
  {
    header: "Purchase price",
    cell: ({ row }) => <Money cents={row.original.purchasePriceCents} />,
  },
  {
    header: "Status",
    meta: { sortField: "status" },
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

/** List screen (pattern #1): table state lives in the URL. */
export function PropertiesList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = searchParams.get("status") ?? "active";
  const propertyType = searchParams.get("propertyType") ?? "all";
  const sortParam = searchParams.get("sort") ?? "-created_at";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const apiQuery = new URLSearchParams({ page: String(page), perPage: "25", sort: sortParam });
  if (status !== "all") apiQuery.set("status", status);
  if (propertyType !== "all") apiQuery.set("propertyType", propertyType);

  const query = useQuery({
    queryKey: ["properties", apiQuery.toString()],
    queryFn: () =>
      api.get<PropertyDto[]>(`/api/v1/properties?${apiQuery.toString()}`),
    placeholderData: keepPreviousData,
  });

  const sort: SortState = sortParam.startsWith("-")
    ? { field: sortParam.slice(1), desc: true }
    : { field: sortParam, desc: false };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => setParams({ status: v, page: null })}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={propertyType}
          onValueChange={(v) => setParams({ propertyType: v, page: null })}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="house">House</SelectItem>
            <SelectItem value="flat">Flat</SelectItem>
            <SelectItem value="hmo">HMO</SelectItem>
            <SelectItem value="commercial">Commercial</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button asChild>
          <Link href="/properties/new">
            <Plus className="size-4" /> New property
          </Link>
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={query.data?.data}
        meta={query.data?.meta as ListMetaDto | undefined}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        emptyMessage="No properties match these filters."
        sort={sort}
        onSortChange={(s) =>
          setParams({ sort: s.desc ? `-${s.field}` : s.field, page: null })
        }
        onPageChange={(p) => setParams({ page: String(p) })}
        onRowClick={(row) => router.push(`/properties/${row.id}`)}
      />
    </div>
  );
}
