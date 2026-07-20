# Property Management Dashboard

Private web dashboard for landlords and property teams: properties, tenants & tenancies,
lease contracts (uploaded + generated PDFs), income/expense tracking, and
compliance deadlines with reminders.

- Plan: [docs/PLAN.md](docs/PLAN.md) · Build log: [docs/PROGRESS.md](docs/PROGRESS.md)
- Stack: Next.js (App Router) + TypeScript + Prisma + Supabase (local via
  `docker/docker-compose.yml`) + Tailwind/shadcn-ui + TanStack Query.

## Quick start

```bash
npm install
cp .env.example .env
./scripts/dev-bootstrap.sh   # docker stack + migrate + seed
npm run dev                  # http://localhost:3000
```

See docs/PROGRESS.md → "How to run locally" for details and the seeded login.

## Account and portfolio isolation

Every account receives an isolated portfolio (workspace) on first sign-in.
Properties, tenants, tenancies, transactions, files, compliance records,
contractors, notifications and background jobs are all scoped to that
portfolio. Workspace owners can link another existing account from Settings;
linked accounts can switch portfolios there without combining their data.

After pulling the workspace-isolation change, apply the forward-only migration
before starting the application:

```bash
npm run db:migrate
npm run db:generate
```
