import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parseQuery } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { todayInTimezone, toDateOnly } from "@/lib/dates";
import { getPortfolioInvestmentSummary } from "@/lib/investment-service";
import { investmentQuerySchema } from "@/lib/schemas/investment";

export const GET = apiHandler(async (req) => {
  const { user } = await requireAdmin();
  const query = parseQuery(req, investmentQuerySchema);
  const summary = await getPortfolioInvestmentSummary({
    preset: query.preset,
    from: query.from,
    to: query.to,
    today: toDateOnly(todayInTimezone(user.timezone)),
  });
  return ok(summary);
});
