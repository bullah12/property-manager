import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeTransaction } from "@/lib/serializers";

export const GET = apiHandler(async () => {
  await requireAdmin();
  const recent = await prisma.transaction.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 10,
    include: { property: true, tenancy: { include: { tenant: true } } },
  });

  return ok({ items: recent.map(serializeTransaction) });
});
