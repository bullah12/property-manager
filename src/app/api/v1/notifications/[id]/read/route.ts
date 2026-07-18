import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeNotification } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

export const POST = apiHandler<{ id: string }>(async (_req, { params }) => {
  const { user } = await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const notification = await prisma.notification.findFirst({
    where: { id, userId: user.id },
  });
  if (!notification) throw notFound("Notification");
  const updated = await prisma.notification.update({
    where: { id },
    data: { readAt: notification.readAt ?? new Date() },
  });
  return ok(serializeNotification(updated));
});
