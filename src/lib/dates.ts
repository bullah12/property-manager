/**
 * Date-only helpers. `date` columns come back from Prisma as JS Dates at UTC
 * midnight; the API speaks YYYY-MM-DD strings. All arithmetic is UTC-based so
 * date-only values never shift across timezones.
 */

export const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

export function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

export function addMonths(d: Date, months: number): Date {
  // Clamp to the last day of the target month (e.g. 31 Jan + 1mo = 28/29 Feb).
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

export function firstOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Whole days from a to b (b - a). */
export function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** "Today" as a UTC-midnight date in the given IANA timezone. */
export function todayInTimezone(timezone: string, now = new Date()): Date {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parseDateOnly(s);
}
