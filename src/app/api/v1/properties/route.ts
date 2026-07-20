import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { ok, okList, listMeta } from "@/lib/api/respond";
import { parseSort } from "@/lib/api/sort";
import { paginationQuery, parseBody, parseQuery } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma, requireWorkspaceId } from "@/lib/db";
import { createPropertySchema, PROPERTY_TYPES } from "@/lib/schemas/property";
import { serializeProperty } from "@/lib/serializers";
import { ownershipInclude, replacePropertyOwnerships } from "@/lib/property-ownership";

const listQuery = paginationQuery.extend({
  status: z.enum(["active", "archived"]).optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  sort: z.string().optional(),
});

const SORT_FIELDS: Record<string, string> = {
  created_at: "createdAt",
  nickname: "nickname",
  city: "city",
  status: "status",
  property_type: "propertyType",
};

export const GET = apiHandler(async (req) => {
  await requireAdmin();
  const q = parseQuery(req, listQuery);
  const where: Prisma.PropertyWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.propertyType ? { propertyType: q.propertyType } : {}),
  };
  const orderBy = parseSort(q.sort, SORT_FIELDS, { field: "createdAt", dir: "desc" });

  const [total, rows] = await prisma.$transaction([
    prisma.property.count({ where }),
    prisma.property.findMany({
      where,
      include: ownershipInclude,
      orderBy,
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
    }),
  ]);

  return okList(rows.map(serializeProperty), listMeta(q.page, q.perPage, total));
});

export const POST = apiHandler(async (req) => {
  await requireAdmin();
  const body = await parseBody(req, createPropertySchema);
  const { ownership, ...propertyData } = body;
  const property = await prisma.$transaction(async (tx) => {
    const created = await tx.property.create({
      data: { ...propertyData, workspaceId: requireWorkspaceId() },
    });
    await replacePropertyOwnerships(tx, created.id, ownership);
    return tx.property.findUniqueOrThrow({ where: { id: created.id }, include: ownershipInclude });
  });
  return ok(serializeProperty(property), 201);
});
