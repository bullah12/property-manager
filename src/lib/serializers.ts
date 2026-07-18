import type { User, UserSettings } from "@prisma/client";

/** API JSON is camelCase; timestamps ISO-8601 UTC (PLAN.md §6). */

export function serializeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    timezone: user.timezone,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function serializeSettings(s: UserSettings) {
  return {
    defaultLeadDays: s.defaultLeadDays,
    rentOverdueGraceDays: s.rentOverdueGraceDays,
    emailEnabled: s.emailEnabled,
    clausePetsDefault: s.clausePetsDefault,
    clauseGardenDefault: s.clauseGardenDefault,
    updatedAt: s.updatedAt.toISOString(),
  };
}
