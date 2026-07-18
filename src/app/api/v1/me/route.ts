import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { requireAuth } from "@/lib/auth";
import { serializeSettings, serializeUser } from "@/lib/serializers";

export const GET = apiHandler(async () => {
  const { user, settings } = await requireAuth();
  return ok({ user: serializeUser(user), settings: serializeSettings(settings) });
});
