import { ApiError } from "./errors";

/**
 * Parses `?sort=-created_at` style params (rest-api-design skill) into a
 * Prisma orderBy, restricted to an allowlist mapping API field names to
 * Prisma field names.
 */
export function parseSort(
  sort: string | undefined,
  allowed: Record<string, string>,
  fallback: { field: string; dir: "asc" | "desc" }
): Record<string, "asc" | "desc"> {
  if (!sort) return { [fallback.field]: fallback.dir };
  const desc = sort.startsWith("-");
  const key = desc ? sort.slice(1) : sort;
  const prismaField = allowed[key];
  if (!prismaField) {
    throw new ApiError("VALIDATION_ERROR", "Invalid sort field", [
      { field: "sort", issue: `must be one of: ${Object.keys(allowed).join(", ")}` },
    ]);
  }
  return { [prismaField]: desc ? "desc" : "asc" };
}
