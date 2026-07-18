/**
 * Seed script. Content lands phase by phase (PLAN.md §3 seed spec).
 * Idempotent: safe to re-run against an existing local database.
 */
import "dotenv/config";

async function main() {
  console.log("Nothing to seed yet — seed content arrives with Phase 1+.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
