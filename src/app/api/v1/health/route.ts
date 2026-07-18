import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";

export const GET = apiHandler(async () =>
  ok({ status: "ok", version: "v1", time: new Date().toISOString() })
);
