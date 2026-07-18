import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { todayInTimezone, toDateOnly } from "@/lib/dates";
import { nextFirePreview } from "@/lib/reminders";
import { serializeReminder } from "@/lib/serializers";

/**
 * All upcoming deadlines across properties, sorted by due date — powers the
 * inbox's second section (PLAN.md §4 Notifications screen).
 */
export const GET = apiHandler(async () => {
  const { user } = await requireAdmin();
  const today = toDateOnly(todayInTimezone(user.timezone));

  const reminders = await prisma.reminder.findMany({ orderBy: { dueOn: "asc" } });

  const complianceIds = reminders
    .filter((r) => r.subjectType === "compliance_item")
    .map((r) => r.subjectId);
  const tenancyIds = reminders
    .filter((r) => r.subjectType === "tenancy")
    .map((r) => r.subjectId);

  const [items, tenancies] = await Promise.all([
    prisma.complianceItem.findMany({
      where: { id: { in: complianceIds } },
      include: { property: true },
    }),
    prisma.tenancy.findMany({
      where: { id: { in: tenancyIds } },
      include: { property: true, tenant: true },
    }),
  ]);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const tenancyById = new Map(tenancies.map((t) => [t.id, t]));

  const data = reminders.flatMap((r) => {
    let subject: {
      label: string;
      propertyId: string;
      propertyNickname: string;
      linkPath: string;
    } | null = null;
    if (r.subjectType === "compliance_item") {
      const item = itemById.get(r.subjectId);
      if (item) {
        subject = {
          label: item.label,
          propertyId: item.propertyId,
          propertyNickname: item.property.nickname,
          linkPath: `/properties/${item.propertyId}?tab=notifications`,
        };
      }
    } else {
      const tenancy = tenancyById.get(r.subjectId);
      if (tenancy) {
        subject = {
          label: `Tenancy ends — ${tenancy.tenant.fullName}`,
          propertyId: tenancy.propertyId,
          propertyNickname: tenancy.property.nickname,
          linkPath: `/properties/${tenancy.propertyId}?tab=tenancy`,
        };
      }
    }
    if (!subject) return [];
    return [
      {
        ...serializeReminder(r),
        nextFire: nextFirePreview(r, today),
        subject,
      },
    ];
  });

  return ok({ today, reminders: data });
});
