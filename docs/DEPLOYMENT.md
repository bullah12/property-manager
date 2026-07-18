# Deploying to Vercel

Everything so far has run against the local Docker Supabase stack
(`docker/docker-compose.yml`). To open the app from a phone or anywhere off
your machine, deploy the Next.js app to Vercel and point it at a **hosted**
Supabase project instead of the local stack.

## 1. Create a hosted Supabase project

1. Create a free project at supabase.com.
2. In **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret)
3. In **Project Settings → Database**, copy the **connection pooling**
   (pgbouncer, port 6543) URI, not the direct one — Vercel's serverless
   functions open/close connections per invocation and will exhaust
   Postgres's connection limit against the direct URI. Use it as
   `DATABASE_URL`, e.g.
   `postgresql://postgres.xxxx:PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true`.

## 2. Run the schema against the hosted DB

From your machine (not this sandbox), with `DATABASE_URL` in `.env` pointed
at the hosted project's **direct** connection (port 5432, migrations don't
go through pgbouncer):

```bash
npm run db:migrate
```

This applies `db/migrations/*.sql` in order. Skip `npm run db:seed` — it
seeds local dev fixtures (sample properties/tenants); the seeded admin login
it creates is also handy for a first login, so run it once if you want
sample data, otherwise create your own user via Supabase Auth.

The app also needs a private storage bucket named `files`. It's normally
created by `ensureBucket()` (called from the dev bootstrap) — either run
that once against the hosted project, or create a private bucket named
`files` manually in the Supabase dashboard.

## 3. Deploy to Vercel

1. Import the GitHub repo into Vercel (New Project → pick
   `bullah12/property-manager`). Vercel auto-detects Next.js — no build
   command changes needed.
2. In **Project Settings → Environment Variables**, set:
   - `DATABASE_URL` (pooler URI from step 1)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_URL` → your Vercel deployment URL (e.g.
     `https://property-manager.vercel.app`)
   - `CRON_SECRET` → a random string you generate (e.g.
     `openssl rand -hex 32`) — Vercel Cron automatically sends this as
     `Authorization: Bearer <CRON_SECRET>` to the routes below
   - `RESEND_API_KEY` + `EMAIL_FROM` if you want real email delivery
     (leave `RESEND_API_KEY` unset to keep mock mode, which just logs)
   - Leave `ALLOW_TEST_CLOCK` unset in production
3. Deploy.

## 4. Cron jobs

`vercel.json` at the repo root schedules the two internal cron routes
(`daily-scan` at 07:00 UTC, `run-jobs` at 07:30 UTC as a backup sweep —
`daily-scan` already sweeps jobs inline). Vercel Cron sends `GET`; the
routes now export a `GET` alias of their `POST` handler for this. On the
free Hobby plan each cron job can run at most once a day, which is why
they're both scheduled daily rather than hourly — tighten `run-jobs` to
run more often in `vercel.json` if you're on a paid plan.

## 5. PDF contract generation on Vercel

Locally the app uses the sandbox's pre-installed Chromium via
`playwright-core`. That binary doesn't exist on Vercel's serverless
runtime, so `printPdf()` (`src/lib/contract-generation/render.ts`) uses
`@sparticuz/chromium` instead whenever `process.env.VERCEL` is set (set
automatically by Vercel) — no extra configuration needed.

## Known gaps

- Real email delivery needs a `RESEND_API_KEY`; without one, `sendEmail()`
  logs payloads instead of sending (fine for testing the UI).
- Rent collection (Stripe), bank-CSV import, and e-signature are out of
  scope per `docs/PLAN.md` §8 Q2 — nothing to configure there.
