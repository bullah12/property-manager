# Property Management Dashboard

Private web dashboard for a single landlord: properties, tenants & tenancies,
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
