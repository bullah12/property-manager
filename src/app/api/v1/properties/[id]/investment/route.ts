import { z } from "zod";
import { ApiError, notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody, parseQuery } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseDateOnly, todayInTimezone, toDateOnly } from "@/lib/dates";
import { getInvestmentDashboard } from "@/lib/investment-service";
import { investmentMutationSchema, investmentQuerySchema } from "@/lib/schemas/investment";

const paramsSchema = z.object({ id: z.uuid() });

export const GET = apiHandler<{ id: string }>(async (req, { params }) => {
  const { user } = await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const query = parseQuery(req, investmentQuerySchema);
  const today = toDateOnly(todayInTimezone(user.timezone));
  const dashboard = await getInvestmentDashboard({
    propertyId: id,
    preset: query.preset,
    from: query.from,
    to: query.to,
    today,
  });
  if (!dashboard) throw notFound("Property");
  return ok(dashboard);
});

export const POST = apiHandler<{ id: string }>(async (req, { params }) => {
  const { user, workspace } = await requireAdmin();
  const { id: propertyId } = parse(paramsSchema, params);
  const body = await parseBody(req, investmentMutationSchema);
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) throw notFound("Property");

  const ensureOwner = async (ownerId: string) => {
    const owner = await prisma.owner.findUnique({ where: { id: ownerId } });
    const allocation = owner ? await prisma.ownershipEventAllocation.findFirst({ where: { ownerId, event: { propertyId } } }) : null;
    if (!owner || !allocation) {
      throw new ApiError("VALIDATION_ERROR", "Owner does not belong to this property", [{ field: "ownerId", issue: "property mismatch" }]);
    }
    return owner;
  };

  switch (body.action) {
    case "acquisition": {
      const row = await prisma.property.update({ where: { id: propertyId }, data: { purchasePriceCents: body.purchasePriceCents, purchaseCompletionDate: parseDateOnly(body.purchaseCompletionDate) } });
      return ok({ purchasePriceCents: row.purchasePriceCents, purchaseCompletionDate: row.purchaseCompletionDate ? toDateOnly(row.purchaseCompletionDate) : null });
    }
    case "acquisition_cost": {
      if (body.ownerId) await ensureOwner(body.ownerId);
      const row = await prisma.acquisitionCost.create({ data: { workspaceId: workspace.id, propertyId, category: body.category, amountCents: BigInt(body.amountCents), occurredOn: parseDateOnly(body.occurredOn), fundingSource: body.fundingSource, ownerId: body.ownerId ?? null, description: body.description ?? null } });
      return ok({ id: row.id }, 201);
    }
    case "ledger": {
      await ensureOwner(body.ownerId);
      const row = await prisma.ownerInvestmentEntry.create({ data: { workspaceId: workspace.id, propertyId, ownerId: body.ownerId, entryType: body.entryType, amountCents: BigInt(body.amountCents), occurredOn: parseDateOnly(body.occurredOn), description: body.description ?? null, reason: body.reason ?? null, createdBy: user.id } });
      return ok({ id: row.id }, 201);
    }
    case "valuation": {
      if (body.evidenceFileId) {
        const file = await prisma.file.findUnique({ where: { id: body.evidenceFileId } });
        if (!file || file.status !== "ready") throw new ApiError("VALIDATION_ERROR", "Evidence file must be ready", [{ field: "evidenceFileId", issue: "invalid file" }]);
      }
      const row = await prisma.propertyValuation.create({ data: { workspaceId: workspace.id, propertyId, valueCents: BigInt(body.valueCents), valuedOn: parseDateOnly(body.valuedOn), source: body.source, notes: body.notes ?? null, evidenceFileId: body.evidenceFileId ?? null } });
      return ok({ id: row.id }, 201);
    }
    case "loan": {
      const row = await prisma.propertyLoan.create({ data: { workspaceId: workspace.id, propertyId, name: body.name, lender: body.lender ?? null, originalBalanceCents: BigInt(body.originalBalanceCents), openingBalanceCents: BigInt(body.openingBalanceCents), interestRateBps: body.interestRateBps ?? null, repaymentType: body.repaymentType, monthlyPaymentCents: body.monthlyPaymentCents == null ? null : BigInt(body.monthlyPaymentCents), startedOn: parseDateOnly(body.startedOn), endsOn: body.endsOn ? parseDateOnly(body.endsOn) : null, secured: body.secured, notes: body.notes ?? null } });
      return ok({ id: row.id }, 201);
    }
    case "loan_event": {
      const loan = await prisma.propertyLoan.findUnique({ where: { id: body.loanId } });
      if (!loan || loan.propertyId !== propertyId) throw new ApiError("VALIDATION_ERROR", "Loan does not belong to this property", [{ field: "loanId", issue: "property mismatch" }]);
      const row = await prisma.loanEvent.create({ data: { workspaceId: workspace.id, loanId: body.loanId, eventType: body.eventType, amountCents: BigInt(body.amountCents), occurredOn: parseDateOnly(body.occurredOn), description: body.description ?? null } });
      return ok({ id: row.id }, 201);
    }
    case "forecast": {
      const { action: _action, targetRecoveryDate, expectedMonthlyRentCents, monthlyRepaymentCents, ...values } = body;
      void _action;
      const forecastValues = { ...values, expectedMonthlyRentCents: expectedMonthlyRentCents == null ? null : BigInt(expectedMonthlyRentCents), monthlyRepaymentCents: monthlyRepaymentCents == null ? null : BigInt(monthlyRepaymentCents), targetRecoveryDate: targetRecoveryDate ? parseDateOnly(targetRecoveryDate) : null };
      const existing = await prisma.investmentForecast.findFirst({ where: { propertyId } });
      const row = existing
        ? await prisma.investmentForecast.update({ where: { id: existing.id }, data: forecastValues })
        : await prisma.investmentForecast.create({ data: { workspaceId: workspace.id, propertyId, ...forecastValues } });
      return ok({ id: row.id });
    }
    case "planned_cost": {
      const row = await prisma.plannedInvestmentCost.create({ data: { workspaceId: workspace.id, propertyId, category: body.category, amountCents: BigInt(body.amountCents), plannedOn: parseDateOnly(body.plannedOn), description: body.description ?? null } });
      return ok({ id: row.id }, 201);
    }
  }
});
