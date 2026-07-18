import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs";

/**
 * §5.3 event catalog: which types also go out by email (when the owner has
 * email enabled). contract.generated is in-app only.
 */
const EMAIL_WORTHY = new Set([
  "cert.expiring",
  "lease.expiring",
  "rent.overdue",
  "contract.generation_failed",
]);

export interface NotifyInput {
  title: string;
  body?: string;
  linkPath?: string;
  dedupeKey?: string;
}

/**
 * §5.3 notify(): INSERT … ON CONFLICT (dedupe_key) DO NOTHING — the partial
 * unique index makes repeated scans idempotent. Email is NEVER sent inline;
 * an email.send job is enqueued (skill rule).
 *
 * Returns the notification id, or null when deduped.
 */
export async function notify(
  userId: string,
  type: string,
  input: NotifyInput
): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO notifications (user_id, type, title, body, link_path, dedupe_key)
    VALUES (${userId}::uuid, ${type}, ${input.title}, ${input.body ?? null},
            ${input.linkPath ?? null}, ${input.dedupeKey ?? null})
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id
  `;
  const id = rows[0]?.id ?? null;
  if (!id) return null; // deduped — stop (no email either)

  if (EMAIL_WORTHY.has(type)) {
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (settings?.emailEnabled ?? true) {
      await enqueueJob("email.send", { notificationId: id });
    }
  }
  return id;
}

/** The single owner-admin (v1: one account, PLAN.md §1). */
export async function getOwner() {
  const owner = await prisma.user.findFirst({
    where: { role: "admin", status: "active" },
    orderBy: { createdAt: "asc" },
    include: { settings: true },
  });
  if (!owner) throw new Error("No active admin user found");
  return owner;
}
