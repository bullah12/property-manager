import type { Prisma } from "@prisma/client";
import { conflict } from "@/lib/api/errors";
import { prisma, requireWorkspaceId } from "@/lib/db";
import type { PropertyOwnershipInput } from "@/lib/schemas/property";

export const ownershipInclude = {
  ownerships: {
    include: { owner: true },
    orderBy: [{ isMainLandlord: "desc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.PropertyInclude;

type OwnershipTransaction = Pick<typeof prisma, "owner" | "propertyOwnership">;

export function findMainLandlord<
  T extends { isMainLandlord: boolean; owner: { fullName: string; address: string; phone: string | null; email: string | null } },
>(ownerships: T[]): T["owner"] | null {
  return ownerships.find((row) => row.isMainLandlord)?.owner ?? null;
}

/**
 * Replace a property's complete ownership allocation inside the caller's
 * transaction. A complete-set write lets percentage changes, main-landlord
 * changes and removals satisfy the deferred database invariants atomically.
 */
export async function replacePropertyOwnerships(
  tx: OwnershipTransaction,
  propertyId: string,
  input: PropertyOwnershipInput
) {
  const workspaceId = requireWorkspaceId();
  const existing = await tx.propertyOwnership.findMany({
    where: { propertyId, workspaceId },
    include: { owner: true },
  });
  const existingOwnerIds = new Set(existing.map((row) => row.ownerId));
  const requestedExistingIds = input.owners.flatMap((owner) =>
    owner.ownerId ? [owner.ownerId] : []
  );

  for (const ownerId of requestedExistingIds) {
    if (!existingOwnerIds.has(ownerId)) {
      throw conflict("An existing owner can only be edited through a property they already own");
    }
  }

  // Avoid the immediate partial-unique-index conflict while switching main.
  await tx.propertyOwnership.updateMany({
    where: { propertyId, workspaceId },
    data: { isMainLandlord: false },
  });

  const retainedOwnerIds: string[] = [];
  for (const item of input.owners) {
    const contact = {
      fullName: item.fullName,
      address: item.address,
      phone: item.phone || null,
      email: item.email || null,
    };
    if (item.ownerId) {
      await tx.owner.update({ where: { id: item.ownerId }, data: contact });
      await tx.propertyOwnership.update({
        where: { propertyId_ownerId: { propertyId, ownerId: item.ownerId } },
        data: {
          ownershipPercentage: item.ownershipPercentage,
          isMainLandlord: item.isMainLandlord,
        },
      });
      retainedOwnerIds.push(item.ownerId);
    } else {
      const owner = await tx.owner.create({ data: { workspaceId, ...contact } });
      await tx.propertyOwnership.create({
        data: {
          workspaceId,
          propertyId,
          ownerId: owner.id,
          ownershipPercentage: item.ownershipPercentage,
          isMainLandlord: item.isMainLandlord,
        },
      });
      retainedOwnerIds.push(owner.id);
    }
  }

  const removedOwnerIds = existing
    .map((row) => row.ownerId)
    .filter((ownerId) => !retainedOwnerIds.includes(ownerId));
  if (removedOwnerIds.length > 0) {
    await tx.propertyOwnership.deleteMany({
      where: { propertyId, ownerId: { in: removedOwnerIds } },
    });
    // Owner identities remain available for audit history, reuse on another
    // property, and future investment/contribution records.
  }
}
