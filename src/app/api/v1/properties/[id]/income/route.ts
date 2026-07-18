import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseQuery } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DATE_ONLY_RE, todayInTimezone, toDateOnly } from "@/lib/dates";
import { computeIncomeGrid } from "@/lib/income";

const paramsSchema = z.object({ id: z.uuid() });

const querySchema = z.object({
  year: z.coerce.number().int().min(1970).max(2100).optional(),
  // Dev-only test clock (skill rule: date logic takes `today` as a parameter).
  today: z.string().regex(DATE_ONLY_RE).optional(),
});

export const GET = apiHandler<{ id: string }>(async (req, { params }) => {
  const { user, settings } = await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const q = parseQuery(req, querySchema);

  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) throw notFound("Property");

  const today =
    q.today && process.env.NODE_ENV !== "production"
      ? q.today
      : toDateOnly(todayInTimezone(user.timezone));
  const year = q.year ?? parseInt(today.slice(0, 4), 10);

  const grid = await computeIncomeGrid({
    propertyId: id,
    year,
    today,
    graceDays: settings.rentOverdueGraceDays,
  });
  return ok({ ...grid, currency: "gbp" });
});
