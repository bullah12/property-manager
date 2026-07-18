import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { okList, listMeta } from "@/lib/api/respond";
import { paginationQuery, parseQuery } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeNotification } from "@/lib/serializers";

const listQuery = paginationQuery.extend({
  unread: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

/** Polled inbox (PLAN.md §6): ?unread=true&page=. */
export const GET = apiHandler(async (req) => {
  const { user } = await requireAdmin();
  const q = parseQuery(req, listQuery);
  const where: Prisma.NotificationWhereInput = {
    userId: user.id,
    ...(q.unread ? { readAt: null } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
    }),
  ]);
  return okList(rows.map(serializeNotification), listMeta(q.page, q.perPage, total));
});
