"use client";

import { useMe } from "@/hooks/use-me";

export function formatDate(
  iso: string,
  timezone: string,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }
): string {
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: timezone }).format(
    new Date(iso)
  );
}

/**
 * The single date renderer (dashboard-ui-patterns): ISO string in, formatted
 * in the owner's timezone. `dateOnly` values (YYYY-MM-DD) render as-is
 * without timezone shifting.
 */
export function DateDisplay({
  iso,
  withTime = false,
  className,
}: {
  iso: string | null | undefined;
  withTime?: boolean;
  className?: string;
}) {
  const { data: me } = useMe();
  if (!iso) return <span className={className}>—</span>;
  const timezone = me?.user.timezone ?? "Europe/London";
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const value = isDateOnly
    ? formatDate(`${iso}T00:00:00Z`, "UTC")
    : formatDate(
        iso,
        timezone,
        withTime
          ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
          : undefined
      );
  return <span className={className}>{value}</span>;
}
