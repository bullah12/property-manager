import { conflict, notFound } from "@/lib/api/errors";
import { prisma } from "@/lib/db";
import { deleteReminder, syncTenancyReminder } from "@/lib/reminders";

export async function getTenancyOr404(id: string) {
  const tenancy = await prisma.tenancy.findUnique({
    where: { id },
    include: { tenant: true, property: true },
  });
  if (!tenancy) throw notFound("Tenancy");
  return tenancy;
}

/**
 * State machine (PLAN.md §3): draft → active. Assured periodic tenancies do
 * not renew into successor fixed terms, so any active tenancy on the same
 * property must be ended before a new one can be activated.
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
  if (conflicting) {
    throw conflict(
      "Another assured periodic tenancy is already active on this property — end it before activating a new tenancy"
    );
  }

  const overlappingPast = await prisma.tenancy.findFirst({
    where: {
      propertyId: tenancy.propertyId,
      id: { not: id },
      OR: [
        { status: "ended", endedOn: { gte: tenancy.startDate } },
        { status: "renewed", endDate: { not: null, gte: tenancy.startDate } },
      ],
    },
  });
  if (overlappingPast) {
    throw conflict(
      "The new tenancy overlaps a previous tenancy — set its start date after the previous tenancy ended"
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.tenancy.update({
      where: { id },
      data: { status: "active" },
      include: { tenant: true, property: true },
    });
    await syncTenancyReminder(tx, updated);
    return updated;
  });
}

/** active → ended, recording the date on which rent expectations stop. */
export async function endTenancy(id: string, endedOn: Date) {
  const tenancy = await getTenancyOr404(id);
  if (tenancy.status !== "active") {
    throw conflict(`Only an active tenancy can be ended (status: ${tenancy.status})`);
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.tenancy.update({
      where: { id },
      data: {
        status: "ended",
        endedOn,
      },
      include: { tenant: true, property: true },
    });
    await deleteReminder(tx, "tenancy", id);
    return updated;
  });
}

export interface RenewOverrides {
  startDate?: string;
  endDate?: string | null;
  rentAmountCents?: number;
  rentDueDay?: number;
  depositAmountCents?: number | null;
  depositScheme?: string | null;
  depositReference?: string | null;
}

/**
 * Kept as a compatibility endpoint for older clients. APTs do not renew into
 * successor fixed terms, so callers receive a clear compliance-safe error.
 */
export async function renewTenancy(id: string, overrides: RenewOverrides): Promise<never> {
  const predecessor = await getTenancyOr404(id);
  if (predecessor.status !== "active") {
    throw conflict(`Only an active tenancy can be renewed (status: ${predecessor.status})`);
  }
  void overrides;
  throw conflict(
    "Assured periodic tenancies do not renew or have replacement fixed terms. Use the statutory Section 13 process for a rent change, or end this tenancy before creating a genuinely new letting."
  );
}
