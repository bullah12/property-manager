import { Prisma } from "@prisma/client";
import { ApiError, conflict, notFound } from "@/lib/api/errors";
import { prisma, requireWorkspaceId } from "@/lib/db";
import { parseDateOnly, toDateOnly } from "@/lib/dates";
import type { PaymentInput, TransferInput } from "@/lib/schemas/ownership";
import type { PropertyOwnershipInput } from "@/lib/schemas/property";

export const eventInclude = {
  allocations: { include: { owner: true }, orderBy: [{ isMainLandlord: "desc" }, { owner: { fullName: "asc" } }] },
  seller: true,
  buyer: true,
  recordedBy: true,
  documentFile: true,
  payments: { include: { payer: true, recipient: true, documentFile: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.OwnershipEventInclude;

export const ownershipInclude = {
  ownershipEvents: {
    where: { effectiveDate: { lte: new Date() } },
    take: 1,
    orderBy: [{ effectiveDate: "desc" }, { recordedAt: "desc" }],
    include: eventInclude,
  },
} satisfies Prisma.PropertyInclude;

type OwnershipTransaction = Pick<
  typeof prisma,
  "owner" | "ownershipEvent" | "ownershipPayment" | "ownershipNote" | "transaction" | "file" | "$queryRaw"
>;

/** Deterministically allocates indivisible pennies using owner-id order. */
export function allocateCentsByOwnership(
  totalCents: number,
  allocations: Array<{ ownerId: string; ownershipPercentage: number }>
): Array<{ ownerId: string; amountCents: number }> {
  const totalPercentage = allocations.reduce(
    (sum, row) => sum + Math.round(row.ownershipPercentage * 100),
    0
  );
  if (totalPercentage !== 10_000) throw new Error("Ownership must total 100% before allocating money");
  const sign = totalCents < 0 ? -1 : 1;
  const absolute = Math.abs(totalCents);
  const ordered = [...allocations].sort((a, b) => a.ownerId.localeCompare(b.ownerId));
  const result = ordered.map((row) => ({
    ownerId: row.ownerId,
    amountCents: Math.floor((absolute * Math.round(row.ownershipPercentage * 100)) / 10_000),
  }));
  let remainder = absolute - result.reduce((sum, row) => sum + row.amountCents, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % result.length) {
    result[index].amountCents += 1;
    remainder--;
  }
  return result.map((row) => ({ ...row, amountCents: row.amountCents * sign }));
}

export function findMainLandlord<T extends { isMainLandlord: boolean; owner: { fullName: string; address: string; phone: string | null; email: string | null } }>(
  ownerships: T[]
): T["owner"] | null {
  return ownerships.find((row) => row.isMainLandlord)?.owner ?? null;
}

function snapshot(allocations: Array<{
  ownerId: string;
  ownershipPercentage: number | Prisma.Decimal;
  isMainLandlord: boolean;
  owner: { fullName: string; address: string; phone: string | null; email: string | null };
}>) {
  return allocations.map((row) => ({
    ownerId: row.ownerId,
    fullName: row.owner.fullName,
    address: row.owner.address,
    phone: row.owner.phone,
    email: row.owner.email,
    ownershipPercentage: Number(row.ownershipPercentage),
    isMainLandlord: row.isMainLandlord,
  }));
}

async function lockProperty(tx: OwnershipTransaction, propertyId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM properties WHERE id = ${propertyId}::uuid FOR UPDATE`
  );
  if (rows.length === 0) throw notFound("Property");
}

async function latestEvent(tx: OwnershipTransaction, propertyId: string, asOf?: Date) {
  return tx.ownershipEvent.findFirst({
    where: { propertyId, ...(asOf ? { effectiveDate: { lte: asOf } } : {}) },
    orderBy: [{ effectiveDate: "desc" }, { recordedAt: "desc" }],
    include: eventInclude,
  });
}

async function assertAppendable(
  tx: OwnershipTransaction,
  propertyId: string,
  effectiveDate: Date,
  expectedCurrentEventId?: string | null
) {
  await lockProperty(tx, propertyId);
  const current = await latestEvent(tx, propertyId);
  if (!current) throw conflict("Property has no opening ownership event");
  if (expectedCurrentEventId && current.id !== expectedCurrentEventId) {
    throw conflict("Ownership changed after this form was opened. Refresh and review the latest allocation.");
  }
  if (current.effectiveDate > effectiveDate) {
    throw conflict(
      `A later ownership event already exists on ${toDateOnly(current.effectiveDate)}. Resolve that timeline before recording a backdated event.`
    );
  }
  return current;
}

async function assertReadyDocument(tx: OwnershipTransaction, fileId?: string | null) {
  if (!fileId) return;
  const file = await tx.file.findUnique({ where: { id: fileId } });
  if (!file || file.status !== "ready" || file.purpose !== "ownership-doc") {
    throw new ApiError("VALIDATION_ERROR", "Supporting document must be a ready ownership upload");
  }
}

async function appendEvent(
  tx: OwnershipTransaction,
  data: Omit<
    Prisma.OwnershipEventUncheckedCreateInput,
    "workspaceId" | "allocations" | "afterSnapshot"
  >,
  allocations: Array<{ ownerId: string; ownershipPercentage: number; isMainLandlord: boolean; owner: { fullName: string; address: string; phone: string | null; email: string | null } }>
) {
  const workspaceId = requireWorkspaceId();
  return tx.ownershipEvent.create({
    data: {
      ...data,
      workspaceId,
      afterSnapshot: snapshot(allocations),
      allocations: {
        create: allocations.map((row) => ({
          workspaceId,
          ownerId: row.ownerId,
          ownershipPercentage: row.ownershipPercentage,
          isMainLandlord: row.isMainLandlord,
        })),
      },
    },
    include: eventInclude,
  });
}

export async function createInitialOwnershipEvent(
  tx: OwnershipTransaction,
  propertyId: string,
  input: PropertyOwnershipInput,
  recordedByUserId: string
) {
  await lockProperty(tx, propertyId);
  const allocations = [];
  for (const item of input.owners) {
    const owner = await tx.owner.create({
      data: {
        workspaceId: requireWorkspaceId(),
        fullName: item.fullName,
        address: item.address,
        phone: item.phone || null,
        email: item.email || null,
      },
    });
    allocations.push({
      ownerId: owner.id,
      owner,
      ownershipPercentage: item.ownershipPercentage,
      isMainLandlord: item.isMainLandlord,
    });
  }
  return appendEvent(
    tx,
    {
      propertyId,
      eventType: "initial",
      effectiveDate: parseDateOnly(input.effectiveFrom),
      recordedByUserId,
      beforeSnapshot: [],
      reason: "Opening ownership allocation",
    },
    allocations
  );
}

/** Records a complete corrective/allocation snapshot; prior events are untouched. */
export async function recordAllocationEvent(
  tx: OwnershipTransaction,
  propertyId: string,
  input: import("@/lib/schemas/ownership").AllocationInput,
  recordedByUserId: string
) {
  const effectiveDate = parseDateOnly(input.effectiveFrom);
  const current = await assertAppendable(tx, propertyId, effectiveDate, input.expectedCurrentEventId);
  await assertReadyDocument(tx, input.documentFileId);
  const currentOwnerIds = new Set(current.allocations.map((row) => row.ownerId));
  const allocations = [];
  for (const item of input.owners) {
    let owner;
    if (item.ownerId) {
      if (!currentOwnerIds.has(item.ownerId)) throw conflict("Use the transfer workflow to add a new owner");
      owner = await tx.owner.update({
        where: { id: item.ownerId },
        data: { fullName: item.fullName, address: item.address, phone: item.phone || null, email: item.email || null },
      });
    } else {
      throw conflict("Use the transfer workflow to add a new owner");
    }
    allocations.push({ ownerId: owner.id, owner, ownershipPercentage: item.ownershipPercentage, isMainLandlord: item.isMainLandlord });
  }
  const currentByOwner = new Map(current.allocations.map((row) => [row.ownerId, row]));
  const mainOnlyChange = allocations.length === current.allocations.length && allocations.every((row) => {
    const prior = currentByOwner.get(row.ownerId);
    return prior && Number(prior.ownershipPercentage) === row.ownershipPercentage;
  });
  return appendEvent(tx, {
    propertyId,
    eventType: mainOnlyChange ? "main_landlord_change" : "allocation_change",
    effectiveDate,
    recordedByUserId,
    beforeSnapshot: snapshot(current.allocations),
    reason: input.reason,
    notes: input.notes,
    documentFileId: input.documentFileId,
  }, allocations);
}

function paymentStatus(input: { amountDueCents: number; amountPaidCents: number; dueOn?: string | null }) {
  if (input.amountPaidCents >= input.amountDueCents) return "paid";
  if (input.amountPaidCents > 0) return "partially_paid";
  if (input.dueOn && input.dueOn < new Date().toISOString().slice(0, 10)) return "overdue";
  return input.dueOn ? "due" : "scheduled";
}

async function createPaymentRow(
  tx: OwnershipTransaction,
  propertyId: string,
  input: PaymentInput,
  defaultEventId?: string,
  defaultPayerId?: string,
  defaultRecipientId?: string
) {
  await assertReadyDocument(tx, input.documentFileId);
  let transactionId: string | null = null;
  if (input.throughPropertyFunds && input.amountPaidCents > 0) {
    if (input.amountPaidCents > 2_147_483_647) {
      throw new ApiError("VALIDATION_ERROR", "A property-fund payment exceeds the transaction ledger limit");
    }
    const direction = input.propertyFundDirection === "into_property" ? "income" : "expense";
    const category = input.kind === "capital_contribution" ||
      (input.kind === "property_funded_purchase" && direction === "income")
      ? "capital_contribution"
      : input.kind === "capital_withdrawal"
        ? "capital_withdrawal"
        : input.kind === "distribution"
          ? "distribution"
          : "share_redemption";
    const transaction = await tx.transaction.create({
      data: {
        workspaceId: requireWorkspaceId(), propertyId, direction, category,
        amountCents: input.amountPaidCents,
        occurredOn: parseDateOnly(input.paidOn ?? new Date().toISOString().slice(0, 10)),
        description: input.notes || "Ownership-related property-fund payment",
        receiptFileId: input.documentFileId || null,
      },
    });
    transactionId = transaction.id;
  }
  return tx.ownershipPayment.create({
    data: {
      workspaceId: requireWorkspaceId(), propertyId,
      eventId: input.eventId ?? defaultEventId ?? null,
      kind: input.kind,
      payerOwnerId: input.payerOwnerId ?? defaultPayerId ?? null,
      recipientOwnerId: input.recipientOwnerId ?? defaultRecipientId ?? null,
      amountDueCents: BigInt(input.amountDueCents), amountPaidCents: BigInt(input.amountPaidCents),
      currency: input.currency,
      dueOn: input.dueOn ? parseDateOnly(input.dueOn) : null,
      paidOn: input.paidOn ? parseDateOnly(input.paidOn) : null,
      status: paymentStatus(input), paymentMethod: input.paymentMethod, reference: input.reference,
      throughPropertyFunds: input.throughPropertyFunds,
      propertyFundDirection: input.propertyFundDirection,
      allowOverpayment: input.allowOverpayment, notes: input.notes,
      documentFileId: input.documentFileId, transactionId,
    },
    include: { payer: true, recipient: true, documentFile: true },
  });
}

export async function recordTransfer(
  tx: OwnershipTransaction,
  propertyId: string,
  input: TransferInput,
  recordedByUserId: string
) {
  const effectiveDate = parseDateOnly(input.effectiveDate);
  const current = await assertAppendable(tx, propertyId, effectiveDate, input.expectedCurrentEventId);
  await assertReadyDocument(tx, input.documentFileId);
  const sellerRow = current.allocations.find((row) => row.ownerId === input.sellerOwnerId);
  if (!sellerRow) throw conflict("Seller is not an owner on the effective date");
  const sellerPercentage = Math.round(Number(sellerRow.ownershipPercentage) * 100);
  const transferPercentage = Math.round(input.percentageTransferred * 100);
  if (transferPercentage > sellerPercentage) throw conflict("Seller cannot transfer more than they own");

  let buyer = input.buyer.ownerId
    ? await tx.owner.findUnique({ where: { id: input.buyer.ownerId } })
    : null;
  if (input.buyer.ownerId && !buyer) throw notFound("Buyer");
  if (!buyer) {
    buyer = await tx.owner.create({
      data: { workspaceId: requireWorkspaceId(), fullName: input.buyer.fullName, address: input.buyer.address, phone: input.buyer.phone || null, email: input.buyer.email || null },
    });
  }
  if (buyer.id === input.sellerOwnerId) throw conflict("Buyer and seller must be different owners");

  const allocations = current.allocations
    .filter((row) => row.ownerId !== input.sellerOwnerId && row.ownerId !== buyer!.id)
    .map((row) => ({ ownerId: row.ownerId, owner: row.owner, ownershipPercentage: Number(row.ownershipPercentage), isMainLandlord: row.isMainLandlord }));
  const sellerRemainder = sellerPercentage - transferPercentage;
  if (sellerRemainder > 0) {
    allocations.push({ ownerId: sellerRow.ownerId, owner: sellerRow.owner, ownershipPercentage: sellerRemainder / 100, isMainLandlord: sellerRow.isMainLandlord });
  }
  const existingBuyer = current.allocations.find((row) => row.ownerId === buyer!.id);
  allocations.push({ ownerId: buyer.id, owner: buyer, ownershipPercentage: ((existingBuyer ? Math.round(Number(existingBuyer.ownershipPercentage) * 100) : 0) + transferPercentage) / 100, isMainLandlord: existingBuyer?.isMainLandlord ?? false });

  const requestedMain = input.makeBuyerMainLandlord
    ? buyer.id
    : input.mainLandlordOwnerId ?? current.allocations.find((row) => row.isMainLandlord)?.ownerId;
  if (!requestedMain || !allocations.some((row) => row.ownerId === requestedMain)) {
    throw conflict("Select a replacement main landlord because the current main landlord is leaving");
  }
  for (const row of allocations) row.isMainLandlord = row.ownerId === requestedMain;

  const event = await appendEvent(tx, {
    propertyId, eventType: "transfer", transferType: input.transferType,
    effectiveDate, legalCompletionDate: input.legalCompletionDate ? parseDateOnly(input.legalCompletionDate) : null,
    recordedByUserId, sellerOwnerId: input.sellerOwnerId, buyerOwnerId: buyer.id,
    percentageTransferred: input.percentageTransferred,
    agreedValueCents: input.agreedValueCents == null ? null : BigInt(input.agreedValueCents),
    currency: input.currency, paymentTreatment: input.paymentTreatment,
    effectiveAfterFullPayment: input.effectiveAfterFullPayment,
    beforeSnapshot: snapshot(current.allocations), reason: input.reason, notes: input.notes,
    documentFileId: input.documentFileId,
  }, allocations);

  for (const payment of input.payments) {
    await createPaymentRow(tx, propertyId, {
      ...payment,
      eventId: event.id,
      kind: input.paymentTreatment === "private" ? "private_transfer" : "property_funded_purchase",
      payerOwnerId: buyer.id,
      recipientOwnerId: input.sellerOwnerId,
      currency: input.currency,
    }, event.id, buyer.id, input.sellerOwnerId);
  }
  return tx.ownershipEvent.findUniqueOrThrow({ where: { id: event.id }, include: eventInclude });
}

export async function recordPayment(tx: OwnershipTransaction, propertyId: string, input: PaymentInput) {
  await lockProperty(tx, propertyId);
  if (input.eventId) {
    const event = await tx.ownershipEvent.findUnique({
      where: { id: input.eventId },
      include: { payments: true },
    });
    if (!event || event.propertyId !== propertyId) throw notFound("Ownership event");
    if (event.agreedValueCents != null && !input.allowOverpayment) {
      const alreadyPaid = event.payments.reduce(
        (sum, payment) => sum + payment.amountPaidCents,
        BigInt(0)
      );
      if (alreadyPaid + BigInt(input.amountPaidCents) > event.agreedValueCents) {
        throw conflict("Payment exceeds the transfer's remaining agreed balance");
      }
    }
  }
  return createPaymentRow(tx, propertyId, input);
}

export async function reverseOwnershipEvent(
  tx: OwnershipTransaction,
  propertyId: string,
  eventId: string,
  effectiveDate: string,
  reason: string,
  notes: string | null | undefined,
  recordedByUserId: string
) {
  const current = await assertAppendable(tx, propertyId, parseDateOnly(effectiveDate));
  if (current.id !== eventId) throw conflict("Only the latest ownership event can be reversed; later events must be resolved first");
  const previous = await tx.ownershipEvent.findFirst({
    where: { propertyId, id: { not: eventId } },
    orderBy: [{ effectiveDate: "desc" }, { recordedAt: "desc" }],
    include: eventInclude,
  });
  if (!previous) throw conflict("The opening ownership event cannot be reversed");
  const allocations = previous.allocations.map((row) => ({ ownerId: row.ownerId, owner: row.owner, ownershipPercentage: Number(row.ownershipPercentage), isMainLandlord: row.isMainLandlord }));
  return appendEvent(tx, {
    propertyId, eventType: "reversal", effectiveDate: parseDateOnly(effectiveDate),
    recordedByUserId, beforeSnapshot: snapshot(current.allocations), reversesEventId: eventId,
    reason, notes,
  }, allocations);
}

export async function ownershipOverview(propertyId: string, asOf?: string) {
  const asOfDate = asOf ? parseDateOnly(asOf) : undefined;
  const [position, events, payments, notes] = await Promise.all([
    latestEvent(prisma, propertyId, asOfDate),
    prisma.ownershipEvent.findMany({ where: { propertyId }, orderBy: [{ effectiveDate: "desc" }, { recordedAt: "desc" }], include: eventInclude }),
    prisma.ownershipPayment.findMany({ where: { propertyId }, orderBy: [{ dueOn: "desc" }, { createdAt: "desc" }], include: { payer: true, recipient: true, documentFile: true } }),
    prisma.ownershipNote.findMany({ where: { propertyId }, orderBy: [{ noteDate: "desc" }, { createdAt: "desc" }], include: { owner: true, author: true, documentFile: true } }),
  ]);
  if (!position) throw notFound("Ownership history");
  return { position, events, payments, notes };
}
