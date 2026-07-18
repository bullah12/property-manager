# PROGRESS — Property Management Dashboard build log

Running log of the autonomous build (PLAN.md §7 phases 0–9). Updated after
every phase.

## Phase status

| Phase | Deliverable | Status | Proof | Deviation from PLAN.md |
|---|---|---|---|---|
| 0 | Scaffold + CI | ✅ green | ✅ see below | Local Supabase stack composed directly from upstream images (no Supabase CLI) — see Decisions D1 |
| 1 | Auth + settings | ✅ green | ✅ see below | — |
| 2 | Properties | ✅ green | ✅ see below | — |
| 3 | Tenants & tenancies | ✅ green | ✅ see below | Renewal chain: predecessor → `renewed` when the successor (same property+tenant) is activated; different tenant still active → 409 (single-occupancy, §8 Q13) |
| 4 | File uploads + contract upload | — | — | — |
| 5 | Expenses | — | — | — |
| 6 | Monthly Income + Overview | — | — | — |
| 7 | Compliance + reminders data | — | — | — |
| 8 | Notification engine | — | — | — |
| 9 | Auto contract generation | — | — | — |

## Decisions

- **D1 — Local Supabase without the CLI.** This build environment's network
  proxy blocks GitHub release downloads (only this repo is in scope), so the
  Supabase CLI binary cannot be installed. Docker works, so
  `docker/docker-compose.yml` runs the same stack `supabase start` would:
  `supabase/postgres` (:54322), GoTrue auth, PostgREST, `storage-api`
  (file-backed), and Kong (:54321) routing `/auth/v1`, `/rest/v1`,
  `/storage/v1`. The app-facing contract (SUPABASE_URL + anon/service keys,
  `@supabase/ssr`, storage API) is identical to CLI-local Supabase, and the
  well-known `supabase-demo` local JWT keys are used (dev-only, not secrets).
- **D2 — No Google-hosted fonts.** create-next-app's Geist import fetches
  from Google at build time, which this sandbox (and any offline CI) can't
  rely on. The app uses the system font stack instead.
- All PLAN.md §8 items adopted as resolved per the build instructions:
  Next.js+Prisma+Supabase (Q1); Stripe/bank-CSV/e-sign out (Q2); UK defaults
  (Q3); no tenant portal, role column unused (Q4); 3-day rent grace (Q12);
  recurrence rolls from completed_on on the same row (Q7); deposit_scheme
  free text (Q8); single-occupancy tenancies (Q13).

## Blocked / needs me

- Nothing blocking. Notes for later phases:
  - **Resend (Phase 8):** will run in mock mode (logs payloads). Add a real
    `RESEND_API_KEY` to `.env` to send real email.

## How to run locally

```bash
npm install
cp .env.example .env          # local-dev values work as-is
./scripts/dev-bootstrap.sh    # starts docker stack, migrates, seeds
npm run dev                   # app on http://localhost:3000
```

Individual pieces: `npm run db:start` / `db:stop` / `db:nuke` (drop volumes),
`npm run db:migrate`, `npm run db:seed`, `npm run typecheck|lint|build`.
Log in as the seeded admin (from Phase 1 onward): `admin@example.com` /
`admin-password-123` (see `SEED_ADMIN_*` in `.env.example`).

## Proof log

### Phase 0 — Scaffold + CI

Commands and results (2026-07-18):

```
$ npm run typecheck   # tsc --noEmit → clean
$ npm run lint        # eslint . → clean
$ npm run build       # next build → ✓ Compiled successfully; 10 routes
$ npm run db:migrate  # Already up to date. (runner + schema_migrations work)

$ docker compose -f docker/docker-compose.yml ps
  db (healthy) · auth (healthy) · rest (up) · storage (healthy) · kong (healthy)

$ curl -si http://localhost:3000/api/v1/health
HTTP/1.1 200 OK
x-request-id: c5b663ca-6f6e-4ee3-a36b-9ec706c9a0bf
{"data":{"status":"ok","version":"v1","time":"2026-07-18T01:47:48.342Z"}}
```

### Phase 1 — Auth + Settings

Migration: `db/migrations/0001_users_and_settings.sql` (users + user_settings,
verbatim from PLAN.md §3). Supabase Auth email+password via `@supabase/ssr`
(session cookie, middleware refresh + page-level login redirect);
`requireAuth` = session → users row → `status='active'` check; login/logout
routes + login page; `GET /api/v1/me`, `PATCH /api/v1/settings`; Settings
screen (react-hook-form + Zod); seeded admin (`admin@example.com`) and a
suspended user. typecheck/lint/build: all green.

Proof (2026-07-18, `npm run start` + curl):

```
POST /api/v1/auth/login {admin@example.com}            → {"data":{"loggedIn":true}}
GET  /api/v1/me (admin cookie)                         → 200 user+settings envelope
  {"data":{"user":{"email":"admin@example.com","role":"admin","status":"active",
   "timezone":"Europe/London",…},"settings":{"defaultLeadDays":[60,30,7],
   "rentOverdueGraceDays":3,…}}}
POST /api/v1/auth/login {suspended@example.com}        → {"data":{"loggedIn":true}}
GET  /api/v1/me (suspended cookie — valid session)     → 403
  {"error":{"code":"FORBIDDEN","message":"Account is not active"}}
GET  /api/v1/me (no cookie)                            → 401 UNAUTHENTICATED
PATCH /api/v1/settings {rentOverdueGraceDays:5,defaultLeadDays:[7,30,90]}
  → 200, lead days normalised to [90,30,7]
PATCH /api/v1/settings {rentOverdueGraceDays:-1}       → 400 VALIDATION_ERROR envelope
GET  /settings unauthenticated                         → 307 → /login
```
**PASS**

### Phase 2 — Properties

Migration: `db/migrations/0002_properties.sql` (verbatim from PLAN.md §3).
Properties CRUD + archive/unarchive POST transitions; list screen (DataTable,
server-side pagination/sort/filter, state held in the URL:
`/properties?status=&propertyType=&sort=&page=`); create/edit form screens on
routes; detail shell (header band + status badge + Edit/New-tenancy/Archive
actions + 3 mini-stats + 5-tab strip with `?tab=` addressing, tabs are empty
placeholders). Seed: Maple House + Quay Flat (active), Old Mill Cottage
(archived). typecheck/lint/build green.

Proof (2026-07-18, curl as admin):

```
POST /api/v1/properties {Proof Terrace…}    → 201 status=active
GET  /api/v1/properties?status=active       → [Proof Terrace, Quay Flat, Maple House]
POST /api/v1/properties/:id/archive         → status=archived
GET  /api/v1/properties?status=active       → [Quay Flat, Maple House]      (filtered out)
GET  /api/v1/properties?status=archived     → [Proof Terrace, Old Mill Cottage]
POST /:id/archive again                     → 409 {"code":"CONFLICT",…}
GET  /api/v1/properties?sort=nickname       → alphabetical order (sort honoured)
GET  /properties?status=archived&sort=nickname (page, authed) → 200; the list
     screen reads/writes exactly these URL params (filter/sort/page state).
```
**PASS** (test row removed afterwards to keep the seed dataset canonical)

### Phase 3 — Tenants & Tenancies

Migration: `db/migrations/0003_tenants_tenancies.sql` (verbatim). Tenants
CRUD + list (search, sort, URL state) + detail with cross-property tenancy
history; tenancies create-as-draft, PATCH-while-draft-only, POST
activate/end/renew transitions; New-tenancy form (pick property,
pick-or-create tenant, dates, rent+due day, deposit, clause toggles from
settings — clauses feed contract generation in Phase 9); Tenancy tab (current
tenancy card with Activate/End/Renew + past tenancies). Seed: 4 tenants, 5
tenancies in all four states incl. Maple House renewed→active chain and
Marcus Webb across two properties. typecheck/lint/build green.

Proof (2026-07-18, curl as admin):

```
POST /tenancies {Elena on Old Mill Cottage}   → 201 status=draft
PATCH while draft {rent 82000}                → 200 (edit allowed)
POST /:id/activate                            → status=active
PATCH while active                            → 409 CONFLICT "Only a draft tenancy can be edited"
POST /:id/renew                               → 201 successor draft 2027-08-01→2028-07-31 (pre-filled)
POST /successor/activate                      → successor active; predecessor status=renewed ✓
POST /successor/end                           → status=ended
GET /tenants/:marcus                          → tenancies: [(Quay Flat, ended), (Old Mill Cottage, ended)]
                                                — one tenant across two properties ✓
```
**PASS** (walk-through rows removed afterwards; canonical seed remains)

### Phase 0 — details

Scaffolded: Next.js 15 App Router + TS strict + Tailwind v4 + shadcn/ui;
Prisma 6 initialised (empty schema, mirrors SQL migrations); forward-only SQL
migration runner (`db/migrations/NNNN_*.sql` → `schema_migrations`); shared
API layer (envelope, stable error codes, `X-Request-Id`, Zod edge validation);
app shell (config-driven sidebar, topbar, toaster, error boundaries, mobile
drawer) with placeholder pages; `GET /api/v1/health`; GitHub Actions CI
(typecheck + lint + build). **PASS**
