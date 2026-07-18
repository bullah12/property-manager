import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const POST = apiHandler(async () => {
  const { user } = await requireAdmin();
  const result = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return ok({ markedRead: result.count });
});
