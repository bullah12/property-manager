"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  Loader2,
  Receipt,
} from "lucide-react";
import Link from "next/link";
import { DateDisplay } from "@/components/date-display";
import { Money } from "@/components/money";
import { PanelLoading } from "@/components/panel-loading";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api-client";
import type { TransactionDto } from "@/lib/types";

interface OverviewSummaryDto {
  today: string;
  currency: string;
  monthRent: { period: string; expectedCents: number; receivedCents: number };
  deadlinesDueSoon: number;
  ytdExpensesCents: number;
}

interface OverdueRentDto {
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
}

interface RecentActivityDto {
  items: TransactionDto[];
}

export function OverviewScreen() {
  const summaryQuery = useQuery({
    queryKey: ["stats", "overview", "summary"],
    queryFn: async () =>
      (await api.get<OverviewSummaryDto>("/api/v1/stats/overview")).data,
    staleTime: 30_000,
  });
  const overdueQuery = useQuery({
    queryKey: ["stats", "overview", "overdue"],
    queryFn: async () =>
      (await api.get<OverdueRentDto>("/api/v1/stats/overview/overdue")).data,
    staleTime: 30_000,
  });
  const activityQuery = useQuery({
    queryKey: ["stats", "overview", "activity"],
    queryFn: async () =>
      (await api.get<RecentActivityDto>("/api/v1/stats/overview/activity")).data,
    staleTime: 30_000,
  });

  const summary = summaryQuery.data;
  const overdue = overdueQuery.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Banknote className="size-4" />}
          label="This month's rent"
          value={
            summaryQuery.isLoading ? (
              <MetricLoading />
            ) : summaryQuery.isError || !summary ? (
              <MetricError onRetry={() => summaryQuery.refetch()} />
            ) : (
              <>
                <Money cents={summary.monthRent.receivedCents} />{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  of <Money cents={summary.monthRent.expectedCents} /> expected
                </span>
              </>
            )
          }
        />
        <StatCard
          icon={<AlertTriangle className="size-4" />}
          label="Overdue rent"
          value={
            overdueQuery.isLoading ? (
              <MetricLoading />
            ) : overdueQuery.isError || !overdue ? (
              <MetricError onRetry={() => overdueQuery.refetch()} />
            ) : (
              <span className={overdue.count > 0 ? "text-red-600" : undefined}>
                {overdue.count}
              </span>
            )
          }
          sub={
            overdue
              ? overdue.count === 1
                ? "period overdue"
                : "periods overdue"
              : undefined
          }
        />
        <StatCard
          icon={<CalendarClock className="size-4" />}
          label="Deadlines ≤ 30 days"
          value={
            summaryQuery.isLoading ? (
              <MetricLoading />
            ) : summaryQuery.isError || !summary ? (
              <MetricError onRetry={() => summaryQuery.refetch()} />
            ) : (
              summary.deadlinesDueSoon
            )
          }
          sub={summary ? "compliance items due" : undefined}
        />
        <StatCard
          icon={<Receipt className="size-4" />}
          label="YTD expenses"
          value={
            summaryQuery.isLoading ? (
              <MetricLoading />
            ) : summaryQuery.isError || !summary ? (
              <MetricError onRetry={() => summaryQuery.refetch()} />
            ) : (
              <Money cents={summary.ytdExpensesCents} />
            )
          }
        />
      </div>

      {overdueQuery.isLoading ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Overdue rent</CardTitle>
            <CardDescription>Checking current and previous rent periods.</CardDescription>
          </CardHeader>
          <CardContent>
            <PanelLoading
              className="min-h-24 border-0 bg-transparent"
              label="Checking overdue rent…"
            />
          </CardContent>
        </Card>
      ) : overdueQuery.isError ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Overdue rent</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Could not load overdue rent.{" "}
            <button className="underline" onClick={() => overdueQuery.refetch()}>
              Retry
            </button>
          </CardContent>
        </Card>
      ) : overdue && overdue.items.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-red-700">Overdue rent</CardTitle>
            <CardDescription>Current and previous rent periods, active tenancies.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdue.items.map((item) => (
              <Link
                key={`${item.tenancyId}:${item.period}`}
                href={`/properties/${item.propertyId}?tab=income`}
                className="flex items-center justify-between rounded-md border border-red-200 bg-red-50/60 px-3 py-2 text-sm hover:bg-red-50"
              >
                <span>
                  <span className="font-medium">{item.tenantName}</span> ·{" "}
                  {item.propertyNickname} · {item.period.slice(0, 7)}
                </span>
                <span className="text-red-700">
                  <Money cents={item.expectedCents - item.receivedCents} /> outstanding ·{" "}
                  {item.daysLate}d late
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
          {activityQuery.isLoading ? (
            <PanelLoading
              className="min-h-32 border-0 bg-transparent"
              label="Loading recent activity…"
            />
          ) : activityQuery.isError || !activityQuery.data ? (
            <p className="text-sm text-muted-foreground">
              Could not load recent activity.{" "}
              <button className="underline" onClick={() => activityQuery.refetch()}>
                Retry
              </button>
            </p>
          ) : activityQuery.data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y">
              {activityQuery.data.items.map((transaction) => (
                <li
                  key={transaction.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium capitalize">
                      {transaction.category.replace(/_/g, " ")}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      · {transaction.property?.nickname ?? ""}
                      {transaction.tenancy?.tenant
                        ? ` · ${transaction.tenancy.tenant.fullName}`
                        : ""}
                      {transaction.description ? ` — ${transaction.description}` : ""}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={
                        transaction.direction === "income"
                          ? "text-emerald-700"
                          : "text-foreground"
                      }
                    >
                      {transaction.direction === "income" ? "+" : "−"}
                      <Money cents={transaction.amountCents} />
                    </span>{" "}
                    <span className="text-xs text-muted-foreground">
                      <DateDisplay iso={transaction.occurredOn} />
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

function MetricLoading() {
  return (
    <span
      className="inline-flex items-center gap-2 text-sm font-normal text-muted-foreground"
      role="status"
      aria-label="Loading value"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      Loading…
    </span>
  );
}

function MetricError({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      className="text-sm font-normal text-muted-foreground underline"
      onClick={onRetry}
    >
      Retry
    </button>
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
