import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { todayInTimezone, toDateOnly } from "@/lib/dates";
import { nextFirePreview } from "@/lib/reminders";
import { serializeComplianceItem, serializeReminder } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

/** Compliance items + reminder previews for a property (PLAN.md §6). */
export const GET = apiHandler<{ id: string }>(async (_req, { params }) => {
  const { user } = await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) throw notFound("Property");

  const today = toDateOnly(todayInTimezone(user.timezone));
  const items = await prisma.complianceItem.findMany({
    where: { propertyId: id },
    include: { documentFile: true },
    orderBy: { dueOn: "asc" },
  });
  const reminders = await prisma.reminder.findMany({
    where: { subjectType: "compliance_item", subjectId: { in: items.map((i) => i.id) } },
  });
  const byId = new Map(reminders.map((r) => [r.subjectId, r]));

  return ok({
    today,
    items: items.map((item) => {
      const reminder = byId.get(item.id);
      return {
        ...serializeComplianceItem(item),
        reminder: reminder
          ? {
              ...serializeReminder(reminder),
              nextFire: nextFirePreview(reminder, today),
            }
          : null,
      };
    }),
  });
});
