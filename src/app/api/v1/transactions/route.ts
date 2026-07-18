import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError, notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok, okList, listMeta } from "@/lib/api/respond";
import { paginationQuery, parseBody, parseQuery } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseDateOnly } from "@/lib/dates";
import {
  createTransactionSchema,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from "@/lib/schemas/transaction";
import { serializeTransaction } from "@/lib/serializers";

const listQuery = paginationQuery.extend({
  propertyId: z.uuid().optional(),
  direction: z.enum(["income", "expense"]).optional(),
  category: z.enum([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]).optional(),
  year: z.coerce.number().int().min(1970).max(2100).optional(),
  sort: z.string().optional(),
});

export const GET = apiHandler(async (req) => {
  await requireAdmin();
  const q = parseQuery(req, listQuery);
  const where: Prisma.TransactionWhereInput = {
    ...(q.propertyId ? { propertyId: q.propertyId } : {}),
    ...(q.direction ? { direction: q.direction } : {}),
    ...(q.category ? { category: q.category } : {}),
    ...(q.year
      ? {
          occurredOn: {
            gte: parseDateOnly(`${q.year}-01-01`),
            lte: parseDateOnly(`${q.year}-12-31`),
          },
        }
      : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
      include: {
        property: true,
        tenancy: { include: { tenant: true } },
        receiptFile: true,
      },
    }),
  ]);
  return okList(rows.map(serializeTransaction), listMeta(q.page, q.perPage, total));
});

/** Record income/expense (rent rows require tenancyId + rentPeriod) — §6. */
export const POST = apiHandler(async (req) => {
  await requireAdmin();
  const body = await parseBody(req, createTransactionSchema);

  const property = await prisma.property.findUnique({ where: { id: body.propertyId } });
  if (!property) throw notFound("Property");
  if (body.tenancyId) {
    const tenancy = await prisma.tenancy.findUnique({ where: { id: body.tenancyId } });
    if (!tenancy) throw notFound("Tenancy");
    if (tenancy.propertyId !== body.propertyId) {
      throw new ApiError("VALIDATION_ERROR", "Tenancy does not belong to this property", [
        { field: "tenancyId", issue: "property mismatch" },
      ]);
    }
  }
  if (body.receiptFileId) {
    const file = await prisma.file.findUnique({ where: { id: body.receiptFileId } });
    if (!file || file.status !== "ready" || file.purpose !== "receipt") {
      throw new ApiError("VALIDATION_ERROR", "Receipt must be a ready 'receipt' upload", [
        { field: "receiptFileId", issue: "invalid receipt file" },
      ]);
    }
  }

  const created = await prisma.transaction.create({
    data: {
      ...body,
      occurredOn: parseDateOnly(body.occurredOn),
      rentPeriod: body.rentPeriod ? parseDateOnly(body.rentPeriod) : null,
    },
    include: { property: true, tenancy: { include: { tenant: true } }, receiptFile: true },
  });
  return ok(serializeTransaction(created), 201);
});
