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
| 4 | File uploads + contract upload | ✅ green | ✅ see below | — |
| 5 | Expenses | ✅ green | ✅ see below | Transaction routes are the full §6 shape (direction-aware validation); the UI stays expense-only per the phase scope |
| 6 | Monthly Income + Overview | ✅ green | ✅ see below | Overview's "deadlines ≤30d" card reads 0 until the compliance table lands in Phase 7 (by design) |
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

### Phase 4 — File Uploads + Contract Upload

Migration: `db/migrations/0004_files_and_contracts.sql` (verbatim; the
`generated_document_id` FK stays deferred to 0008). Private Supabase Storage
bucket `files`; `POST /api/v1/uploads` (multipart, per-purpose size/type
policies, magic-byte sniffing — declared content type is never trusted,
server-generated storage keys, sha256 checksum, pending→ready);
`GET /api/v1/files/:id/download` → 10-minute signed URL. Uploaded contracts:
attach via `POST /tenancies/:id/contracts`, issue/sign/supersede transitions;
Contracts tab (upload dialog, download, status badges, mark-issued/signed
with optional signed-copy upload). Activation rule wired: activate requires a
signed contract or `{override:true}` (UI shows an override confirm).
Seed: 4 PDFs in storage + contracts in all four states.
typecheck/lint/build green.

Proof (2026-07-18, curl as admin):

```
POST /uploads (valid PDF, lease-doc)     → 201 {status:"ready", checksum, …}
POST /uploads (text renamed .pdf)        → 400 VALIDATION_ERROR "File type not allowed"
POST /uploads (26 MB PDF)                → 400 VALIDATION_ERROR "File is too large" (max 25 MB)
POST /tenancies/:id/contracts {fileId}   → 201 kind=addendum source=uploaded status=draft
POST /contracts/:id/issue                → status=issued
POST /contracts/:id/sign {signedOn}      → status=signed, signedOn=2026-07-18
GET  /files/:id/download                 → signed URL via kong /storage/v1/object/sign/…
curl <signed url>                        → returns the original PDF bytes ✓
POST /tenancies/:quayDraft/activate      → 409 "No signed contract … or activate with override"
POST /tenancies/:temp/activate {override:true} → status=active ✓
```
**PASS** (proof rows removed; canonical seed remains)

### Phase 5 — Expenses

Migration: `db/migrations/0005_transactions.sql` (verbatim, incl. the three
CHECKs and indexes). Transactions GET/POST/PATCH/DELETE with the DB's
direction/category and rent-row rules mirrored in Zod (PATCH re-validates the
merged row); DELETE is a hard delete. Expenses tab: year+category filters,
table with receipt links (signed URLs), inline add-expense form with receipt
upload, Recharts category donut, Export CSV. `GET /api/v1/reports/expenses`
CSV (with TOTAL row) + `format=json`. Property mini-stat `ytdExpensesCents`
now live. Seed: 24 expenses across 2025–2026 covering all 8 categories, one
with a stored receipt PDF. typecheck/lint/build green.

Proof (2026-07-18, curl as admin):

```
POST /uploads (PNG receipt) + POST /transactions {expense, receiptFileId}
  → 201, receipt attached ✓
GET /transactions?propertyId&category=repairs&year=2026 → the 2 repairs rows ✓
POST /transactions {direction:expense, category:rent}
  → 400 VALIDATION_ERROR "direction 'expense' allows: repairs, …" ✓
GET /reports/expenses?year=2026&format=csv
  → text/csv attachment; rows + TOTAL,,,,2291.00 ✓ (receipt column yes/no)
PATCH /transactions/:id {amountCents:4800} → 200 ✓ ; DELETE → {"deleted":true} ✓
GET /properties/:maple → stats.ytdExpensesCents = 114000 (2026 sum) ✓
```
**PASS**

### Phase 6 — Monthly Income + Overview

No migration. §5.1 implemented verbatim in `src/lib/income.ts`
(`deriveRentPeriods`, `monthStatus` with grace window, compute-on-read grid,
`findOverdueRentPeriods` limited to current+previous period for active
tenancies — reused by the Phase 8 scan). `GET /properties/:id/income?year=`
(dev-only `?today=` test clock); Monthly Income tab per §4 wireframe 2: 12-
month grid with the five cell states, record-payment popover (POST rent
transaction with `rentPeriod`), corrections on paid cells, per-month and
per-year totals, expected-vs-received bar chart. `GET /stats/overview` +
Overview screen (4 stat cards + overdue list + recent activity). Seed: rent
rows making May 2026 partial, June 2026 overdue, July 2026 paid.
typecheck/lint/build green.

Proof (2026-07-18, curl as admin, grace=3):

```
GET /properties/:maple/income?year=2026 →
  Tom Field (active): Jan–Apr paid · May PARTIAL (45000/95000) ·
  Jun OVERDUE (0 received, 47d late) · Jul PAID · Aug upcoming
POST /transactions {category:rent, rentPeriod:2026-06-01, 95000}
  → June cell flips to paid ✓ (then deleted → reverts; correction flow ✓)
POST rent without rentPeriod → 400 "rent rows require a rentPeriod" ✓
GET /stats/overview →
  monthRent 95000/95000 · overdueRent count=1 [Tom Field 2026-06, 47d late]
  (May partial is outside the current+previous-period §5.1 scope — by design)
  ytdExpensesCents=224600 · recentActivity 10 items
?today= test clock ignored in production build ✓ (honoured in dev)
```
**PASS**

### Phase 0 — details

Scaffolded: Next.js 15 App Router + TS strict + Tailwind v4 + shadcn/ui;
Prisma 6 initialised (empty schema, mirrors SQL migrations); forward-only SQL
migration runner (`db/migrations/NNNN_*.sql` → `schema_migrations`); shared
API layer (envelope, stable error codes, `X-Request-Id`, Zod edge validation);
app shell (config-driven sidebar, topbar, toaster, error boundaries, mobile
drawer) with placeholder pages; `GET /api/v1/health`; GitHub Actions CI
(typecheck + lint + build). **PASS**
