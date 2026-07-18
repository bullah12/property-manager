import type { User, UserSettings } from "@prisma/client";
import { forbidden, unauthenticated } from "@/lib/api/errors";
import { prisma } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthedUser {
  user: User;
  settings: UserSettings;
}

/**
 * Auth-skill guard: Supabase session → users row → reject unless
 * status='active'. A suspended user with a valid session is rejected.
 * Throws ApiError, so it can only be used inside apiHandler routes (or
 * callers that catch ApiError themselves).
 */
export async function requireAuth(): Promise<AuthedUser> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw unauthenticated();

  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
    include: { settings: true },
  });
  if (!user) throw unauthenticated("No account for this session");
  if (user.status !== "active") throw forbidden("Account is not active");

  // Settings row is created with the user; self-heal if it's ever missing.
  const settings =
    user.settings ??
    (await prisma.userSettings.create({ data: { userId: user.id } }));

  const { settings: _drop, ...bare } = user;
  void _drop;
  return { user: bare as User, settings };
}

/** v1: every API route requires the admin role (PLAN.md §6). */
export async function requireAdmin(): Promise<AuthedUser> {
  const authed = await requireAuth();
  if (authed.user.role !== "admin") throw forbidden("Admin role required");
  return authed;
}
