import type { Property, User, UserSettings } from "@prisma/client";

export const CURRENCY = "gbp";

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

export function serializeProperty(p: Property) {
  return {
    id: p.id,
    nickname: p.nickname,
    addressLine1: p.addressLine1,
    addressLine2: p.addressLine2,
    city: p.city,
    postcode: p.postcode,
    propertyType: p.propertyType,
    bedrooms: p.bedrooms,
    purchasePriceCents: p.purchasePriceCents,
    currency: CURRENCY,
    notes: p.notes,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
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
