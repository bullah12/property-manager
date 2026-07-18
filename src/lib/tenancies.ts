import { conflict, notFound } from "@/lib/api/errors";
import { prisma } from "@/lib/db";
import { addDays, addMonths, diffDays, parseDateOnly, toDateOnly } from "@/lib/dates";

export async function getTenancyOr404(id: string) {
  const tenancy = await prisma.tenancy.findUnique({
    where: { id },
    include: { tenant: true, property: true },
  });
  if (!tenancy) throw notFound("Tenancy");
  return tenancy;
}

/**
 * State machine (PLAN.md §3): draft → active. On activation any still-active
 * tenancy on the same property is resolved: same tenant → predecessor becomes
 * 'renewed' (the renewal chain); different tenant → 409, end it first
 * (single-occupancy, §8 Q13).
 *
 * `contractGate` is invoked before the transition; Phase 4 wires the
 * "signed contract or explicit override" rule through it.
 */
export async function activateTenancy(
  id: string,
  contractGate?: (tenancyId: string) => Promise<void>
) {
  const tenancy = await getTenancyOr404(id);
  if (tenancy.status !== "draft") {
    throw conflict(`Only a draft tenancy can be activated (status: ${tenancy.status})`);
  }
  if (contractGate) await contractGate(id);

  const conflicting = await prisma.tenancy.findFirst({
    where: { propertyId: tenancy.propertyId, status: "active", id: { not: id } },
  });
  if (conflicting && conflicting.tenantId !== tenancy.tenantId) {
    throw conflict(
      "Another tenant's tenancy is still active on this property — end it first"
    );
  }

  return prisma.$transaction(async (tx) => {
    if (conflicting) {
      // Renewal chain: predecessor → 'renewed' on successor activation.
      await tx.tenancy.update({
        where: { id: conflicting.id },
        data: { status: "renewed" },
      });
    }
    return tx.tenancy.update({
      where: { id },
      data: { status: "active" },
      include: { tenant: true, property: true },
    });
  });
}

/** active → ended. */
export async function endTenancy(id: string) {
  const tenancy = await getTenancyOr404(id);
  if (tenancy.status !== "active") {
    throw conflict(`Only an active tenancy can be ended (status: ${tenancy.status})`);
  }
  return prisma.tenancy.update({
    where: { id },
    data: { status: "ended" },
    include: { tenant: true, property: true },
  });
}

export interface RenewOverrides {
  startDate?: string;
  endDate?: string;
  rentAmountCents?: number;
  rentDueDay?: number;
  depositAmountCents?: number | null;
  depositScheme?: string | null;
  depositReference?: string | null;
}

/**
 * Creates the successor draft (same property + tenant), pre-filled from the
 * predecessor: starts the day after it ends, same term length, same rent —
 * all overridable. The predecessor keeps its status until the successor is
 * activated (then → 'renewed', see activateTenancy).
 */
export async function renewTenancy(id: string, overrides: RenewOverrides) {
  const predecessor = await getTenancyOr404(id);
  if (predecessor.status !== "active") {
    throw conflict(`Only an active tenancy can be renewed (status: ${predecessor.status})`);
  }

  const defaultStart = addDays(predecessor.endDate, 1);
  const termDays = diffDays(predecessor.startDate, predecessor.endDate);
  const startDate = overrides.startDate
    ? parseDateOnly(overrides.startDate)
    : defaultStart;
  const endDate = overrides.endDate
    ? parseDateOnly(overrides.endDate)
    : termDays >= 360
      ? addDays(addMonths(startDate, 12), -1)
      : addDays(startDate, termDays);
  if (toDateOnly(endDate) <= toDateOnly(startDate)) {
    throw conflict("Renewal endDate must be after startDate");
  }

  return prisma.tenancy.create({
    data: {
      propertyId: predecessor.propertyId,
      tenantId: predecessor.tenantId,
      startDate,
      endDate,
      rentAmountCents: overrides.rentAmountCents ?? predecessor.rentAmountCents,
      rentDueDay: overrides.rentDueDay ?? predecessor.rentDueDay,
      depositAmountCents:
        overrides.depositAmountCents !== undefined
          ? overrides.depositAmountCents
          : predecessor.depositAmountCents,
      depositScheme:
        overrides.depositScheme !== undefined
          ? overrides.depositScheme
          : predecessor.depositScheme,
      depositReference:
        overrides.depositReference !== undefined
          ? overrides.depositReference
          : predecessor.depositReference,
      status: "draft",
    },
    include: { tenant: true, property: true },
  });
}
