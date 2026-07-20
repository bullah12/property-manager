import { AsyncLocalStorage } from "node:async_hooks";
import type { User, UserSettings, Workspace, WorkspaceMembership } from "@prisma/client";
import { cookies } from "next/headers";
import { forbidden, unauthenticated } from "@/lib/api/errors";
import { prisma } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthedUser {
  user: User;
  settings: UserSettings;
  workspace: Workspace;
  membership: WorkspaceMembership;
}

export const WORKSPACE_COOKIE = "pm_workspace_id";
const authStorage = new AsyncLocalStorage<AuthedUser>();

export function runWithAuth<T>(authed: AuthedUser, fn: () => T): T {
  return authStorage.run(authed, fn);
}

/**
 * Auth-skill guard: Supabase session → users row → reject unless
 * status='active'. A suspended user with a valid session is rejected.
 * Throws ApiError, so it can only be used inside apiHandler routes (or
 * callers that catch ApiError themselves).
 */
export async function requireAuth(): Promise<AuthedUser> {
  const cached = authStorage.getStore();
  if (cached) return cached;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw unauthenticated();

  let user = await prisma.user.findUnique({
    where: { id: authUser.id },
    include: { settings: true },
  });
  if (!user) {
    if (!authUser.email) throw unauthenticated("No email for this session");
    const metadata = authUser.user_metadata as { display_name?: string; full_name?: string };
    const displayName =
      metadata.display_name?.trim() ||
      metadata.full_name?.trim() ||
      authUser.email.split("@")[0];
    user = await prisma.user.create({
      data: {
        id: authUser.id,
        email: authUser.email,
        displayName,
        settings: { create: {} },
      },
      include: { settings: true },
    });
  }
  if (user.status !== "active") throw forbidden("Account is not active");

  // Settings row is created with the user; self-heal if it's ever missing.
  const settings =
    user.settings ??
    (await prisma.userSettings.create({ data: { userId: user.id } }));

  let memberships = await prisma.workspaceMembership.findMany({
    where: { userId: user.id, status: "active", workspace: { status: "active" } },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  // Existing or externally-created auth accounts get an isolated portfolio
  // on first authenticated use. The user UUID keeps this operation idempotent.
  if (memberships.length === 0) {
    await prisma.$transaction(async (tx) => {
      await tx.workspace.upsert({
        where: { id: user.id },
        update: {},
        create: { id: user.id, name: `${user.displayName}'s portfolio` },
      });
      await tx.workspaceMembership.upsert({
        where: { workspaceId_userId: { workspaceId: user.id, userId: user.id } },
        update: { role: "owner", status: "active" },
        create: { workspaceId: user.id, userId: user.id, role: "owner" },
      });
    });
    memberships = await prisma.workspaceMembership.findMany({
      where: { userId: user.id, status: "active" },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    });
  }

  const selectedId = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const selected = memberships.find((m) => m.workspaceId === selectedId) ?? memberships[0];
  if (!selected) throw forbidden("No active workspace membership");

  const { settings: _drop, ...bare } = user;
  void _drop;
  return {
    user: bare as User,
    settings,
    workspace: selected.workspace,
    membership: {
      workspaceId: selected.workspaceId,
      userId: selected.userId,
      role: selected.role,
      status: selected.status,
      createdAt: selected.createdAt,
      updatedAt: selected.updatedAt,
    },
  };
}

/** v1: every API route requires the admin role (PLAN.md §6). */
export async function requireAdmin(): Promise<AuthedUser> {
  const authed = await requireAuth();
  if (!new Set(["owner", "admin"]).has(authed.membership.role)) {
    throw forbidden("Workspace admin role required");
  }
  return authed;
}
