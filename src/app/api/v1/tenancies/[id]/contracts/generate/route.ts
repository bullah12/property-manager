import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { requestContractGeneration } from "@/lib/contract-generation";
import { kickJobRunner } from "@/lib/jobs";

const paramsSchema = z.object({ id: z.uuid() });

const bodySchema = z.object({
  kind: z.enum(["lease", "renewal"]).default("lease"),
  reletLevyCents: z.number().int().min(0).max(10_000_000).optional(),
  clauses: z
    .object({
      pets: z.boolean().default(false),
      petsDescription: z.string().trim().max(500).optional(),
      garden: z.boolean().default(false),
    })
    .default({ pets: false, garden: false }),
});

/** §5.4 pipeline entry → 202 + job id; 409 if a live contract of that kind exists. */
export const POST = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, bodySchema);
  const job = await requestContractGeneration({
    tenancyId: id,
    kind: body.kind,
    clauses: body.clauses,
    reletLevyCents: body.reletLevyCents,
  });
  kickJobRunner();
  return ok({ jobId: job.id, status: "queued" }, 202);
});
