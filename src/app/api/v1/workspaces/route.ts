import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/validate";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const createSchema = z.object({ name: z.string().trim().min(1).max(200) });

export const GET = apiHandler(async () => {
  const { user, workspace } = await requireAuth();
  const memberships = await prisma.workspaceMembership.findMany({
    where: { userId: user.id, status: "active", workspace: { status: "active" } },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  return ok({
    activeWorkspaceId: workspace.id,
    workspaces: memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      role: membership.role,
      createdAt: membership.workspace.createdAt.toISOString(),
    })),
  });
});

export const POST = apiHandler(async (req) => {
  const { user } = await requireAuth();
  const body = await parseBody(req, createSchema);
  const workspace = await prisma.workspace.create({
    data: {
      name: body.name,
      memberships: { create: { userId: user.id, role: "owner" } },
    },
  });
  return ok({ id: workspace.id, name: workspace.name, role: "owner" }, 201);
});
