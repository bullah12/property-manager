import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { okList, listMeta } from "@/lib/api/respond";
import { parseQuery } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseDateOnly, toDateOnly } from "@/lib/dates";
import { serializeTransaction } from "@/lib/serializers";

const query = z.object({
  year: z.coerce.number().int().min(1970).max(2100),
  format: z.enum(["csv", "json"]).default("csv"),
  propertyId: z.uuid().optional(),
});

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Tax-time export (PLAN.md §6): a year of categorised expenses. */
export const GET = apiHandler(async (req) => {
  await requireAdmin();
  const q = parseQuery(req, query);

  const rows = await prisma.transaction.findMany({
    where: {
      direction: "expense",
      occurredOn: {
        gte: parseDateOnly(`${q.year}-01-01`),
        lte: parseDateOnly(`${q.year}-12-31`),
      },
      ...(q.propertyId ? { propertyId: q.propertyId } : {}),
    },
    orderBy: [{ occurredOn: "asc" }],
    include: { property: true, receiptFile: true },
  });

  if (q.format === "json") {
    return okList(rows.map(serializeTransaction), listMeta(1, Math.max(rows.length, 1), rows.length));
  }

  const header = "date,property,category,description,amount_gbp,receipt";
  const lines = rows.map((r) =>
    [
      toDateOnly(r.occurredOn),
      csvEscape(r.property.nickname),
      r.category,
      csvEscape(r.description ?? ""),
      (r.amountCents / 100).toFixed(2),
      r.receiptFile ? "yes" : "no",
    ].join(",")
  );
  const totalCents = rows.reduce((sum, r) => sum + r.amountCents, 0);
  const csv = [header, ...lines, `TOTAL,,,,${(totalCents / 100).toFixed(2)},`].join("\n") + "\n";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="expenses-${q.year}${q.propertyId ? "-property" : ""}.csv"`,
    },
  });
});
