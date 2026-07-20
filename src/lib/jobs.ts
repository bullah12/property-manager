import type { Job, Prisma } from "@prisma/client";
import { prisma, requireWorkspaceId, runInWorkspace } from "@/lib/db";
import { renderEmail, sendEmail } from "@/lib/email";
import { removeFromStorage } from "@/lib/storage";

/**
 * Durable DB-backed job queue (PLAN.md §2/§5.3): claim with
 * FOR UPDATE SKIP LOCKED, idempotent handlers, retries with backoff up to
 * max_attempts, then 'dead' (surfaced on Settings).
 */

type JobHandler = (job: Job) => Promise<void>;

interface HandlerEntry {
  run: JobHandler;
  /** Invoked once when the job exhausts its retries and goes dead. */
  onDead?: JobHandler;
}

const handlers: Record<string, HandlerEntry> = {
  "email.send": { run: handleEmailSend },
  "files.orphan_sweep": { run: handleOrphanSweep },
};

/** Heavier handlers (contract.generate) register themselves on first load. */
export function registerJobHandler(type: string, run: JobHandler, onDead?: JobHandler) {
  handlers[type] = { run, onDead };
}

let extraHandlersLoaded = false;
async function ensureExtraHandlers() {
  if (extraHandlersLoaded) return;
  extraHandlersLoaded = true;
  await import("@/lib/contract-generation");
}

export async function enqueueJob(
  type: string,
  payload: Prisma.InputJsonValue,
  runAt: Date = new Date()
): Promise<Job> {
  return prisma.job.create({
    data: { workspaceId: requireWorkspaceId(), type, payload, runAt },
  });
}

const BACKOFF_BASE_SECONDS = 30;

/**
 * Claims and runs due jobs. Invoked right after enqueue (route handlers call
 * it via kickJobRunner) and by the cron sweep — safe to run concurrently
 * thanks to SKIP LOCKED.
 */
export async function runJobs(limit = 10): Promise<{ ran: number }> {
  await ensureExtraHandlers();
  let ran = 0;
  for (;;) {
    const claimed = await prisma.$queryRaw<Job[]>`
      UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = now()
      WHERE id IN (
        SELECT id FROM jobs
        WHERE status = 'pending' AND run_at <= now()
        ORDER BY run_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, type, payload, status, run_at AS "runAt", attempts,
                max_attempts AS "maxAttempts", last_error AS "lastError",
                workspace_id AS "workspaceId", created_at AS "createdAt",
                updated_at AS "updatedAt"
    `;
    if (claimed.length === 0 || ran >= limit) break;
    const job = claimed[0];
    const entry = handlers[job.type];
    try {
      if (!entry) throw new Error(`No handler for job type '${job.type}'`);
      await runInWorkspace(job.workspaceId, () => entry.run(job));
      await prisma.job.update({ where: { id: job.id }, data: { status: "succeeded" } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (job.attempts >= job.maxAttempts) {
        const deadJob = await prisma.job.update({
          where: { id: job.id },
          data: { status: "dead", lastError: message },
        });
        console.error(`[jobs] ${job.type} ${job.id} DEAD after ${job.attempts} attempts: ${message}`);
        if (entry?.onDead) {
          await runInWorkspace(deadJob.workspaceId, () => entry.onDead!(deadJob));
        }
      } else {
        const backoffSeconds = BACKOFF_BASE_SECONDS * 2 ** (job.attempts - 1);
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: "pending",
            lastError: message,
            runAt: new Date(Date.now() + backoffSeconds * 1000),
          },
        });
        console.warn(`[jobs] ${job.type} ${job.id} retry in ${backoffSeconds}s: ${message}`);
      }
    }
    ran++;
  }
  return { ran };
}

/** Fire-and-forget runner kick after an enqueue inside a request. */
export function kickJobRunner() {
  void runJobs().catch((err) => console.error("[jobs] runner kick failed:", err));
}

/** email.send — idempotent via a sentAt marker on the payload (skill rule). */
async function handleEmailSend(job: Job) {
  const payload = job.payload as { notificationId?: string; sentAt?: string };
  if (payload.sentAt) return; // already delivered on a previous attempt
  if (!payload.notificationId) throw new Error("email.send: missing notificationId");

  const notification = await prisma.notification.findUnique({
    where: { id: payload.notificationId },
    include: { user: true },
  });
  if (!notification) throw new Error("email.send: notification not found");

  const result = await sendEmail({
    to: notification.user.email,
    subject: notification.title,
    html: renderEmail({
      title: notification.title,
      body: notification.body ?? "",
      linkPath: notification.linkPath,
    }),
  });

  await prisma.job.update({
    where: { id: job.id },
    data: {
      payload: {
        ...payload,
        sentAt: new Date().toISOString(),
        mode: result.mode,
      } as Prisma.InputJsonValue,
    },
  });
}

/** files.orphan_sweep — pending files older than 24h are deleted (skill rule). */
async function handleOrphanSweep() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const orphans = await prisma.file.findMany({
    where: { status: "pending", createdAt: { lt: cutoff } },
  });
  if (orphans.length === 0) return;
  await removeFromStorage(orphans.map((f) => f.storageKey));
  await prisma.file.deleteMany({ where: { id: { in: orphans.map((f) => f.id) } } });
  console.log(`[jobs] orphan sweep removed ${orphans.length} pending file(s)`);
}
