"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DataTable, type SortState } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import type { ListMetaDto, TenantListItemDto } from "@/lib/types";

const columns: ColumnDef<TenantListItemDto, unknown>[] = [
  {
    header: "Name",
    meta: { sortField: "full_name" },
    cell: ({ row }) => <span className="font-medium">{row.original.fullName}</span>,
  },
  {
    header: "Contact",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {[row.original.email, row.original.phone].filter(Boolean).join(" · ") || "—"}
      </span>
    ),
  },
  {
    header: "Current property",
    cell: ({ row }) =>
      row.original.currentProperties.length > 0
        ? row.original.currentProperties.join(", ")
        : "—",
  },
  {
    header: "Tenancies",
    cell: ({ row }) => row.original.tenancyCount,
  },
];

export function TenantsList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const sortParam = searchParams.get("sort") ?? "full_name";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const [search, setSearch] = useState(q);

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`);
    },
    [router, pathname, searchParams]
  );

  // Debounced search → URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== q) setParams({ q: search, page: null });
    }, 300);
    return () => clearTimeout(t);
  }, [search, q, setParams]);

  const apiQuery = new URLSearchParams({ page: String(page), perPage: "25", sort: sortParam });
  if (q) apiQuery.set("q", q);

  const query = useQuery({
    queryKey: ["tenants", apiQuery.toString()],
    queryFn: () => api.get<TenantListItemDto[]>(`/api/v1/tenants?${apiQuery.toString()}`),
    placeholderData: keepPreviousData,
  });

  const sort: SortState = sortParam.startsWith("-")
    ? { field: sortParam.slice(1), desc: true }
    : { field: sortParam, desc: false };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name or email…"
          className="w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1" />
        <Button asChild>
          <Link href="/tenants/new">
            <Plus className="size-4" /> New tenant
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
        emptyMessage="No tenants yet."
        sort={sort}
        onSortChange={(s) => setParams({ sort: s.desc ? `-${s.field}` : s.field, page: null })}
        onPageChange={(p) => setParams({ page: String(p) })}
        onRowClick={(row) => router.push(`/tenants/${row.id}`)}
      />
    </div>
  );
}
