import { z } from "zod";
import { conflict, notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

const paramsSchema = z.object({ userId: z.uuid() });

export const DELETE = apiHandler<{ userId: string }>(async (_req, { params }) => {
  const { user, workspace } = await requireAdmin();
  const { userId } = parse(paramsSchema, params);
  if (userId === user.id) throw conflict("You cannot remove your own membership");
  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
  });
  if (!membership) throw notFound("Workspace member");
  if (membership.role === "owner") throw conflict("The workspace owner cannot be removed");
  await prisma.workspaceMembership.delete({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
  });
  return ok({ removed: true });
});
