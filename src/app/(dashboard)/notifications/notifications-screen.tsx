"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarClock, Check, CheckCheck } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiClientError } from "@/lib/api-client";
import type { NotificationDto, UpcomingDeadlineDto } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  "cert.expiring": "Certificate",
  "lease.expiring": "Lease",
  "rent.overdue": "Rent",
  "contract.generated": "Contract",
  "contract.generation_failed": "Contract",
};

export function NotificationsScreen() {
  const queryClient = useQueryClient();

  const inbox = useQuery({
    queryKey: ["notifications", "inbox"],
    queryFn: async () => api.get<NotificationDto[]>("/api/v1/notifications?perPage=50"),
  });
  const deadlines = useQuery({
    queryKey: ["reminders", "upcoming"],
    queryFn: async () =>
      (
        await api.get<{ today: string; reminders: UpcomingDeadlineDto[] }>(
          "/api/v1/reminders"
        )
      ).data,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markRead = useMutation({
    mutationFn: async (id: string) => api.post(`/api/v1/notifications/${id}/read`),
    onSuccess: invalidate,
    onError: (err) =>
      toast.error(err instanceof ApiClientError ? err.message : "Failed to mark read"),
  });
  const markAll = useMutation({
    mutationFn: async () => api.post("/api/v1/notifications/read-all"),
    onSuccess: (res) => {
      invalidate();
      const count = (res as { data?: { markedRead?: number } }).data?.markedRead ?? 0;
      toast.success(`Marked ${count} notification${count === 1 ? "" : "s"} read`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiClientError ? err.message : "Failed"),
  });

  const notifications = inbox.data?.data ?? [];
  const unread = notifications.filter((n) => !n.readAt);
  const read = notifications.filter((n) => n.readAt);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="size-4" /> Inbox
              </CardTitle>
              <CardDescription>
                In-app alerts from the daily scan (certificates, lease expiries,
                overdue rent, contracts).
              </CardDescription>
            </div>
            {unread.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
              >
                <CheckCheck className="size-4" /> Mark all read
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {inbox.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : inbox.isError ? (
            <p className="text-sm text-muted-foreground">
              Failed to load.{" "}
              <button className="underline" onClick={() => inbox.refetch()}>
                Retry
              </button>
            </p>
          ) : notifications.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No notifications yet — the daily scan creates them as deadlines
              approach.
            </p>
          ) : (
            <div className="space-y-4">
              {unread.length > 0 ? (
                <NotificationList
                  items={unread}
                  onMarkRead={(id) => markRead.mutate(id)}
                  unread
                />
              ) : (
                <p className="text-sm text-muted-foreground">All caught up 🎉</p>
              )}
              {read.length > 0 ? (
                <>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Earlier
                  </div>
                  <NotificationList items={read} />
                </>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4" /> All upcoming deadlines
          </CardTitle>
          <CardDescription>
            Every armed reminder across the portfolio, soonest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deadlines.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : deadlines.isError || !deadlines.data ? (
            <p className="text-sm text-muted-foreground">Failed to load deadlines.</p>
          ) : deadlines.data.reminders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No armed reminders.</p>
          ) : (
            <ul className="divide-y">
              {deadlines.data.reminders.map((r) => {
                const overdue = r.dueOn < deadlines.data!.today;
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <Link href={r.subject.linkPath} className="font-medium hover:underline">
                        {r.subject.label}
                      </Link>{" "}
                      <span className="text-muted-foreground">
                        · {r.subject.propertyNickname}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {r.nextFire
                          ? `next reminder: ${r.nextFire.lead}-day lead on ${r.nextFire.fireOn}`
                          : "all leads notified"}
                      </div>
                    </div>
                    <span className={overdue ? "font-medium text-red-600" : ""}>
                      due <DateDisplay iso={r.dueOn} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationList({
  items,
  onMarkRead,
  unread = false,
}: {
  items: NotificationDto[];
  onMarkRead?: (id: string) => void;
  unread?: boolean;
}) {
  return (
    <ul className="space-y-2">
      {items.map((n) => (
        <li
          key={n.id}
          className={`flex items-start justify-between gap-3 rounded-md border p-3 text-sm ${
            unread ? "bg-accent/40" : "opacity-75"
          }`}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{TYPE_LABELS[n.type] ?? n.type}</Badge>
              {n.linkPath ? (
                <Link href={n.linkPath} className="font-medium hover:underline">
                  {n.title}
                </Link>
              ) : (
                <span className="font-medium">{n.title}</span>
              )}
            </div>
            {n.body ? <p className="mt-1 text-muted-foreground">{n.body}</p> : null}
            <div className="mt-1 text-xs text-muted-foreground">
              <DateDisplay iso={n.createdAt} withTime />
            </div>
          </div>
          {unread && onMarkRead ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label="Mark read"
              onClick={() => onMarkRead(n.id)}
            >
              <Check className="size-4" />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
