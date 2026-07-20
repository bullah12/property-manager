import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { requireAdmin } from "@/lib/auth";
import { todayInTimezone, toDateOnly } from "@/lib/dates";
import { findOverdueRentPeriods } from "@/lib/income";

export const GET = apiHandler(async () => {
  const { user, settings } = await requireAdmin();
  const today = toDateOnly(todayInTimezone(user.timezone));
  const overdue = await findOverdueRentPeriods(today, settings.rentOverdueGraceDays);

  return ok({
    count: overdue.length,
    items: overdue.map((item) => ({
      tenancyId: item.tenancy.id,
      propertyId: item.tenancy.propertyId,
      propertyNickname: item.tenancy.property.nickname,
      tenantName: item.tenancy.tenant.fullName,
      period: item.period,
      dueDate: item.dueDate,
      expectedCents: item.expectedCents,
      receivedCents: item.receivedCents,
      status: item.status,
      daysLate: item.daysLate,
    })),
  });
});
