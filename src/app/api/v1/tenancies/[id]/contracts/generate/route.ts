import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { requestContractGeneration } from "@/lib/contract-generation";
import { kickJobRunner } from "@/lib/jobs";

const paramsSchema = z.object({ id: z.uuid() });

const clausesSchema = z
  .object({
    pets: z.boolean().default(false),
    petsDescription: z.string().trim().max(500).optional(),
    garden: z.boolean().default(false),
    gasSafetyApplies: z.boolean().default(true),
    billsIncluded: z.boolean().default(false),
    billsDescription: z.string().trim().max(500).optional(),
  })
  .superRefine((clauses, ctx) => {
    if (clauses.pets && !clauses.petsDescription) {
      ctx.addIssue({
        code: "custom",
        path: ["petsDescription"],
        message: "Describe the pet when recording consent",
      });
    }
    if (clauses.billsIncluded && !clauses.billsDescription) {
      ctx.addIssue({
        code: "custom",
        path: ["billsDescription"],
        message: "List the bills included in the rent",
      });
    }
  });

const bodySchema = z.object({
  kind: z.literal("lease").default("lease"),
  clauses: clausesSchema.default({
    pets: false,
    garden: false,
    gasSafetyApplies: true,
    billsIncluded: false,
  }),
});

/** §5.4 pipeline entry → 202 + job id; 409 if a live contract of that kind exists. */
export const POST = apiHandler<{ id: string }>(async (req, { params }) => {
  const { user } = await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, bodySchema);
  const job = await requestContractGeneration({
    tenancyId: id,
    kind: body.kind,
    clauses: body.clauses,
    requestedByUserId: user.id,
  });
  kickJobRunner();
  return ok({ jobId: job.id, status: "queued" }, 202);
});
