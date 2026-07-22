/**
 * Forward-only SQL migration runner.
 *
 * Applies db/migrations/NNNN_*.sql in filename order, recording each applied
 * file in schema_migrations. Files are the contract and are executed verbatim
 * (they carry their own BEGIN/COMMIT); never edit a file after it has been
 * applied anywhere — add a new one.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import "dotenv/config";

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

function databaseSchema(url: string) {
  const schema = new URL(url).searchParams.get("schema") ?? "public";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(`Invalid database schema name: ${schema}`);
  }
  return schema;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/**
 * Production was originally provisioned before schema_migrations existed,
 * and some later migrations may also have been applied manually.
 * These markers let the runner adopt that existing schema instead of trying
 * to recreate its tables. Only a contiguous, positively detected prefix is
 * baselined; the first missing marker and everything after it still run as
 * normal migrations.
 */
const LEGACY_MIGRATION_MARKERS = [
  {
    filename: "0001_users_and_settings.sql",
    sql: "SELECT to_regclass('users') IS NOT NULL AND to_regclass('user_settings') IS NOT NULL AS present",
  },
  {
    filename: "0002_properties.sql",
    sql: "SELECT to_regclass('properties') IS NOT NULL AS present",
  },
  {
    filename: "0003_tenants_tenancies.sql",
    sql: "SELECT to_regclass('tenants') IS NOT NULL AND to_regclass('tenancies') IS NOT NULL AS present",
  },
  {
    filename: "0004_files_and_contracts.sql",
    sql: "SELECT to_regclass('files') IS NOT NULL AND to_regclass('contracts') IS NOT NULL AS present",
  },
  {
    filename: "0005_transactions.sql",
    sql: "SELECT to_regclass('transactions') IS NOT NULL AS present",
  },
  {
    filename: "0006_compliance_and_reminders.sql",
    sql: "SELECT to_regclass('compliance_items') IS NOT NULL AND to_regclass('reminders') IS NOT NULL AS present",
  },
  {
    filename: "0007_notifications_and_jobs.sql",
    sql: "SELECT to_regclass('notifications') IS NOT NULL AND to_regclass('jobs') IS NOT NULL AS present",
  },
  {
    filename: "0008_generated_documents.sql",
    sql: "SELECT to_regclass('generated_documents') IS NOT NULL AS present",
  },
  {
    filename: "0009_jobs_cancelled.sql",
    sql: `SELECT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = to_regclass('jobs')
              AND conname = 'jobs_status_check'
              AND pg_get_constraintdef(oid) LIKE '%cancelled%'
          ) AS present`,
  },
  {
    filename: "0010_tenancy_ended_on.sql",
    sql: `SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'tenancies'
              AND column_name = 'ended_on'
          ) AS present`,
  },
] as const;

async function baselineLegacySchema(client: Client, applied: Set<string>) {
  if (applied.size > 0) return;

  let baselined = 0;
  for (const marker of LEGACY_MIGRATION_MARKERS) {
    const result = await client.query<{ present: boolean }>(marker.sql);
    if (!result.rows[0]?.present) break;
    await client.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
      [marker.filename]
    );
    applied.add(marker.filename);
    baselined++;
  }
  if (baselined > 0) {
    console.log(`Baselined ${baselined} existing migration(s).`);
  }
}

async function backfillPrecedingMigrations(
  client: Client,
  files: string[],
  applied: Set<string>
) {
  const highestAppliedIndex = files.reduce(
    (highest, file, index) => (applied.has(file) ? index : highest),
    -1
  );
  if (highestAppliedIndex < 1) return;

  let backfilled = 0;
  for (const file of files.slice(0, highestAppliedIndex)) {
    if (applied.has(file)) continue;
    await client.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
      [file]
    );
    applied.add(file);
    backfilled++;
  }
  if (backfilled > 0) {
    console.log(`Backfilled ${backfilled} preceding migration record(s).`);
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const schema = databaseSchema(url);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const schemaExists = await client.query<{ present: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1) AS present",
      [schema]
    );
    if (!schemaExists.rows[0]?.present) {
      throw new Error(
        `Database schema "${schema}" does not exist. Check the schema query parameter in DATABASE_URL.`
      );
    }
    await client.query(
      `SET search_path TO ${quoteIdentifier(schema)}, public, extensions`
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename   text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`
    );
    const applied = new Set<string>(
      (await client.query("SELECT filename FROM schema_migrations")).rows.map(
        (r: { filename: string }) => r.filename
      )
    );
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort();
    await backfillPrecedingMigrations(client, files, applied);
    await baselineLegacySchema(client, applied);
    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      process.stdout.write(`Applying ${file}... `);
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      console.log("done");
      ran++;
    }
    console.log(ran === 0 ? "Already up to date." : `Applied ${ran} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
