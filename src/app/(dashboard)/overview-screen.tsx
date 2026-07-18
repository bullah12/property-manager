"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, CalendarClock, Receipt } from "lucide-react";
import Link from "next/link";
import { DateDisplay } from "@/components/date-display";
import { Money } from "@/components/money";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import type { TransactionDto } from "@/lib/types";

interface OverviewDto {
  today: string;
  currency: string;
  monthRent: { period: string; expectedCents: number; receivedCents: number };
  overdueRent: {
    count: number;
    items: Array<{
      tenancyId: string;
      propertyId: string;
      propertyNickname: string;
      tenantName: string;
      period: string;
      dueDate: string;
      expectedCents: number;
      receivedCents: number;
      status: string;
      daysLate: number;
    }>;
  };
  deadlinesDueSoon: number;
  ytdExpensesCents: number;
  recentActivity: TransactionDto[];
}

export function OverviewScreen() {
  const query = useQuery({
    queryKey: ["stats", "overview"],
    queryFn: async () => (await api.get<OverviewDto>("/api/v1/stats/overview")).data,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="text-sm text-muted-foreground">
        Failed to load overview.{" "}
        <button className="underline" onClick={() => query.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const d = query.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Banknote className="size-4" />}
          label="This month's rent"
          value={
            <>
              <Money cents={d.monthRent.receivedCents} />{" "}
              <span className="text-sm font-normal text-muted-foreground">
                of <Money cents={d.monthRent.expectedCents} /> expected
              </span>
            </>
          }
        />
        <StatCard
          icon={<AlertTriangle className="size-4" />}
          label="Overdue rent"
          value={
            <span className={d.overdueRent.count > 0 ? "text-red-600" : undefined}>
              {d.overdueRent.count}
            </span>
          }
          sub={d.overdueRent.count === 1 ? "period overdue" : "periods overdue"}
        />
        <StatCard
          icon={<CalendarClock className="size-4" />}
          label="Deadlines ≤ 30 days"
          value={d.deadlinesDueSoon}
          sub="compliance items due"
        />
        <StatCard
          icon={<Receipt className="size-4" />}
          label="YTD expenses"
          value={<Money cents={d.ytdExpensesCents} />}
        />
      </div>

      {d.overdueRent.items.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-red-700">Overdue rent</CardTitle>
            <CardDescription>Current and previous rent periods, active tenancies.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.overdueRent.items.map((o) => (
              <Link
                key={`${o.tenancyId}:${o.period}`}
                href={`/properties/${o.propertyId}?tab=income`}
                className="flex items-center justify-between rounded-md border border-red-200 bg-red-50/60 px-3 py-2 text-sm hover:bg-red-50"
              >
                <span>
                  <span className="font-medium">{o.tenantName}</span> · {o.propertyNickname} ·{" "}
                  {o.period.slice(0, 7)}
                </span>
                <span className="text-red-700">
                  <Money cents={o.expectedCents - o.receivedCents} /> outstanding ·{" "}
                  {o.daysLate}d late
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
          <CardDescription>Latest recorded transactions across the portfolio.</CardDescription>
        </CardHeader>
        <CardContent>
          {d.recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y">
              {d.recentActivity.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium capitalize">
                      {t.category.replace(/_/g, " ")}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      · {t.property?.nickname ?? ""}
                      {t.tenancy?.tenant ? ` · ${t.tenancy.tenant.fullName}` : ""}
                      {t.description ? ` — ${t.description}` : ""}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={
                        t.direction === "income" ? "text-emerald-700" : "text-foreground"
                      }
                    >
                      {t.direction === "income" ? "+" : "−"}
                      <Money cents={t.amountCents} />
                    </span>{" "}
                    <span className="text-xs text-muted-foreground">
                      <DateDisplay iso={t.occurredOn} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {icon} {label}
        </div>
        <div className="mt-2 text-xl font-semibold">{value}</div>
        {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
