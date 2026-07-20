import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { requireAuth } from "@/lib/auth";
import { serializeSettings, serializeUser } from "@/lib/serializers";

export const GET = apiHandler(async () => {
  const { user, settings, workspace, membership } = await requireAuth();
  return ok({
    user: { ...serializeUser(user), role: membership.role },
    settings: serializeSettings(settings),
    workspace: { id: workspace.id, name: workspace.name, role: membership.role },
  });
});
