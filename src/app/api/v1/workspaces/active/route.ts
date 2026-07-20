import { z } from "zod";
import { forbidden } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/validate";
import { requireAuth, WORKSPACE_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/db";

const schema = z.object({ workspaceId: z.uuid() });

export const PATCH = apiHandler(async (req) => {
  const { user } = await requireAuth();
  const { workspaceId } = await parseBody(req, schema);
  const membership = await prisma.workspaceMembership.findFirst({
    where: {
      workspaceId,
      userId: user.id,
      status: "active",
      workspace: { status: "active" },
    },
    include: { workspace: true },
  });
  if (!membership) throw forbidden("No access to that workspace");
  const response = ok({
    id: membership.workspace.id,
    name: membership.workspace.name,
    role: membership.role,
  });
  response.cookies.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
});
