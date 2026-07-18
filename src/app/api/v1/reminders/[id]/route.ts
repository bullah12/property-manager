import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { overrideReminderLeadDays } from "@/lib/reminders";
import { serializeReminder } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

const patchSchema = z.object({
  leadDays: z
    .array(z.number().int().min(1).max(365))
    .min(1)
    .max(6)
    .refine((a) => new Set(a).size === a.length, "lead days must be unique"),
});

/** Override lead_days per item (PLAN.md §6); resets the notified ladder. */
export const PATCH = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, patchSchema);
  const existing = await prisma.reminder.findUnique({ where: { id } });
  if (!existing) throw notFound("Reminder");
  const updated = await overrideReminderLeadDays(id, body.leadDays);
  return ok(serializeReminder(updated));
});
