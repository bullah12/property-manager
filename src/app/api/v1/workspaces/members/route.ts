import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

const addSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.literal("admin").default("admin"),
});

export const GET = apiHandler(async () => {
  const { workspace } = await requireAdmin();
  const memberships = await prisma.workspaceMembership.findMany({
    where: { workspaceId: workspace.id },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  return ok(
    memberships.map((membership) => ({
      userId: membership.userId,
      email: membership.user.email,
      displayName: membership.user.displayName,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.createdAt.toISOString(),
    }))
  );
});

export const POST = apiHandler(async (req) => {
  const { workspace } = await requireAdmin();
  const body = await parseBody(req, addSchema);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user || user.status !== "active") throw notFound("Active user account");
  const membership = await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    update: { role: body.role, status: "active" },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: body.role,
      status: "active",
    },
  });
  return ok({
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    role: membership.role,
    status: membership.status,
  }, 201);
});
