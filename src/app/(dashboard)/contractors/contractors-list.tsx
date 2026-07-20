"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Star } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DataTable, type SortState } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api-client";
import { CONTRACTOR_TRADE_LABELS, CONTRACTOR_TRADE_VALUES, contractorTradeLabel } from "@/lib/contractors";
import type { ContractorListItemDto, ListMetaDto } from "@/lib/types";

const columns: ColumnDef<ContractorListItemDto, unknown>[] = [
  {
    header: "Business",
    meta: { sortField: "business_name" },
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.businessName}</div>
        {row.original.contactName ? <div className="text-xs text-muted-foreground">{row.original.contactName}</div> : null}
      </div>
    ),
  },
  {
    header: "Trade",
    meta: { sortField: "trade" },
    cell: ({ row }) => contractorTradeLabel(row.original.trade),
  },
  {
    header: "Contact",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {[row.original.phone, row.original.email].filter(Boolean).join(" · ") || "—"}
      </span>
    ),
  },
  {
    header: "Service area",
    cell: ({ row }) => row.original.serviceArea || "—",
  },
  {
    header: "Rating",
    cell: ({ row }) => row.original.averageRating === null ? "—" : (
      <span className="inline-flex items-center gap-1">
        <Star className="size-3.5 fill-amber-400 text-amber-400" />
        {row.original.averageRating.toFixed(1)}
        <span className="text-muted-foreground">({row.original.reviewCount})</span>
      </span>
    ),
  },
  {
    header: "Status",
    meta: { sortField: "status" },
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

export function ContractorsList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const trade = searchParams.get("trade") ?? "all";
  const status = searchParams.get("status") ?? "active";
  const sortParam = searchParams.get("sort") ?? "business_name";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const [search, setSearch] = useState(q);

  const setParams = useCallback((updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    router.replace(`${pathname}?${next.toString()}`);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (search !== q) setParams({ q: search, page: null });
    }, 300);
    return () => clearTimeout(timeout);
  }, [q, search, setParams]);

  const apiQuery = new URLSearchParams({ page: String(page), perPage: "25", sort: sortParam });
  if (q) apiQuery.set("q", q);
  if (trade !== "all") apiQuery.set("trade", trade);
  if (status !== "all") apiQuery.set("status", status);
  const query = useQuery({
    queryKey: ["contractors", apiQuery.toString()],
    queryFn: () => api.get<ContractorListItemDto[]>(`/api/v1/contractors?${apiQuery.toString()}`),
    placeholderData: keepPreviousData,
  });
  const sort: SortState = sortParam.startsWith("-")
    ? { field: sortParam.slice(1), desc: true }
    : { field: sortParam, desc: false };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search business, contact, email or phone…"
          className="w-72"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select value={trade} onValueChange={(value) => setParams({ trade: value, page: null })}>
          <SelectTrigger><SelectValue placeholder="All trades" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All trades</SelectItem>
            {CONTRACTOR_TRADE_VALUES.map((value) => (
              <SelectItem key={value} value={value}>{CONTRACTOR_TRADE_LABELS[value]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(value) => setParams({ status: value, page: null })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button asChild>
          <Link href="/contractors/new"><Plus className="size-4" /> New contractor</Link>
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={query.data?.data}
        meta={query.data?.meta as ListMetaDto | undefined}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        emptyMessage="No contractors found."
        sort={sort}
        onSortChange={(next) => setParams({ sort: next.desc ? `-${next.field}` : next.field, page: null })}
        onPageChange={(next) => setParams({ page: String(next) })}
        onRowClick={(row) => router.push(`/contractors/${row.id}`)}
      />
    </div>
  );
}
