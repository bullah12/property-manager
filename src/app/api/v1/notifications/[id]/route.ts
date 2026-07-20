import { z } from "zod";
import { conflict, notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

const paramsSchema = z.object({ id: z.uuid() });

/** Remove a notification after the signed-in user has read it. */
export const DELETE = apiHandler<{ id: string }>(async (_req, { params }) => {
  const { user } = await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const notification = await prisma.notification.findFirst({
    where: { id, userId: user.id },
    select: { id: true, readAt: true },
  });

  if (!notification) throw notFound("Notification");
  if (!notification.readAt) {
    throw conflict("Mark this notification as read before removing it");
  }

  await prisma.notification.delete({ where: { id: notification.id } });
  return ok({ deleted: true });
});
