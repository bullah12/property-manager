# PROGRESS — Property Management Dashboard build log

Running log of the autonomous build (PLAN.md §7 phases 0–9). Updated after
every phase.

## Final status (2026-07-18)

**All ten phases (0–9) are green.** Every phase's proof passed (details in
the Proof log below); the final commit typechecks, lints, and builds clean.
The app runs fully offline against the local Supabase stack — see "How to run
locally". Sample generated lease: [`artifacts/sample-lease.pdf`](../artifacts/sample-lease.pdf)
(pets + garden clauses on, produced by the §5.4 pipeline end-to-end).
Deferred scope (Stripe rent collection, bank-CSV import, e-signature) was
kept out per §8 Q2. Nothing is blocked; the only thing waiting on the owner
is a real `RESEND_API_KEY` if real email delivery is wanted (mock mode logs
payloads until then).

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
| 7 | Compliance + reminders data | ✅ green | ✅ see below | Overview "deadlines ≤30d" counts reminder rows (compliance **and** lease-expiry), since reminders are the deadline-as-data table |
| 8 | Notification engine | ✅ green | ✅ see below | Email templates are typed HTML render functions behind `sendEmail()` (mock mode logs payloads — no Resend key in this environment); `GET /api/v1/reminders` added to power the inbox's "All upcoming deadlines" section (§4); `ALLOW_TEST_CLOCK=1` lets a production build honour `?today=` for local proofs |
| 9 | Auto contract generation | ✅ green | ✅ see below | Lease PDFs are written directly in TypeScript with no HTML, Playwright, Chromium, or browser runtime dependency |

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

- **Nothing is blocked.** Optional follow-ups for the owner:
  - **Real email:** set `RESEND_API_KEY` (+ `EMAIL_FROM`) in `.env` — until
    then `sendEmail()` runs in mock mode and logs each payload.
  - **Deployment (§8 Q11):** everything here runs locally. For Vercel +
    Supabase cloud, point the env vars at the hosted project and schedule the
    two cron routes (daily-scan 08:00 Europe/London + run-jobs sweep). The PDF
    renderer has no external runtime dependency.
- Note on seed state after the Phase 9 proof: the Quay Flat draft tenancy now
  carries the seeded uploaded lease as **superseded** plus a **generated**
  draft lease (and Maple has a generated renewal draft) — the four contract
  statuses all remain represented. Re-running `npm run db:seed` resets the
  uploaded contract back to draft.

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

### Phase 7 — Compliance Items + Reminders Data

Migration: `db/migrations/0006_compliance_and_reminders.sql` (verbatim, incl.
`UNIQUE(subject_type, subject_id)`). Compliance CRUD +
`POST /compliance-items/:id/complete` with the §5.2/§8-Q7 rollover (new due =
completed_on + recurrence, **same row**, reminder ladder reset; one-off items
keep completed_on and lose their reminder). Reminder upsert hooks in the same
transaction on compliance writes AND all tenancy writes (create, PATCH
end-date change resets the ladder, activate keeps armed, end/renew-supersede
deletes) — lease-expiry reminders armed and backfilled for seed tenancies.
`GET /properties/:id/compliance` includes per-item reminder + next-fire
preview; `PATCH /reminders/:id` lead-day override. Property Notifications
tab: status chips (ok / due soon ≤30d / overdue / completed), mark-complete
dialog with certificate upload, edit with lead-day override, add with kind
presets. Flow 1: property create → "Add compliance items?" dialog pre-filled
with UK defaults (gas 12 / EICR 60 / EPC 120). `nextDeadline` mini-stat and
Overview deadlines card now live. Seed: overdue gas cert (+stored 2025 scan),
EICR due ≤30d, future EPC, completed smoke/CO check, 5 reminders.
typecheck/lint/build green.

Proof (2026-07-18, curl as admin):

```
GET /properties/:maple/compliance →
  gas_certificate due 2026-06-20 (overdue; all leads past → nextFire null)
  electrical_eicr due 2026-08-05 → nextFire {lead:7, fireOn:2026-07-29} ✓
POST /compliance-items/:gas/complete {completedOn:2026-07-18}
  → dueOn 2026-06-20 → **2027-07-18** (completed_on + 12mo, same row,
    completedOn back to null); reminder row: due_on=2027-07-18,
    last_notified_lead=NULL ✓
POST /tenancies (draft, end 2027-08-31) → reminder row (tenancy, 2027-08-31) ✓
PATCH endDate → 2027-12-31 → reminder follows, ladder reset ✓
PATCH /reminders/:id {leadDays:[45,14,3]} → override applied ✓
GET /stats/overview → deadlinesDueSoon=1 (EICR) ; property nextDeadline=2026-08-05 ✓
```
**PASS** (seed re-run afterwards to restore the canonical dataset)

### Phase 8 — Notification Engine

Migration: `db/migrations/0007_notifications_and_jobs.sql` (verbatim, incl.
the `dedupe_key` partial unique index — §8 Q10). `notify()` uses
`INSERT … ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`; email-worthy
types (cert.expiring / lease.expiring / rent.overdue /
contract.generation_failed) enqueue `email.send` jobs — never sent inline.
Jobs runner: claim via `FOR UPDATE SKIP LOCKED`, retries with exponential
backoff to `max_attempts`, then `dead`; `email.send` is idempotent via a
`sentAt` payload marker; `files.orphan_sweep` deletes >24h-pending files.
Cron routes guarded by `CRON_SECRET`: `POST /api/internal/cron/daily-scan`
(§5.2 lead ladder — one lead per scan, `last_notified_lead` +
dedupe-key guarded — plus the §5.1 rent-overdue pass and the orphan-sweep
enqueue; `?today=` test clock outside production or with ALLOW_TEST_CLOCK=1)
and `POST /api/internal/cron/run-jobs`. `sendEmail()` wrapper: Resend when
`RESEND_API_KEY` is set, dev mock mode (logs payload) otherwise. Notifications
inbox screen (unread feed + mark-read/read-all + all-upcoming-deadlines
section) and live sidebar unread badge (30s poll). Dead-letter card with
retry on Settings. Seed: 1 read + 1 unread notification, 1 dead job.
typecheck/lint/build green.

Proof (2026-07-18; production build with ALLOW_TEST_CLOCK=1):

```
POST /api/internal/cron/daily-scan (wrong secret)      → 401 UNAUTHENTICATED ✓
scan ?today=2026-06-10 → {leadNotifications:2 (gas+EICR 60-lead),
                          rentOverdueNotifications:2 (May partial + June), jobsRan:5}
scan ?today=2026-07-10 → EICR daysUntil=26 crosses the 30-day lead:
  exactly ONE new cert.expiring for the EICR
  (dedupe_key cert.expiring:<reminderId>:30); June rent DEDUPED (count 1) ✓
scan ?today=2026-07-10 again → EICR: nothing new ✓ (gas ladder continues to 7)
fourth identical run       → {leadNotifications:0, rentOverdue:0} — fully quiet ✓
rent.overdue rows: one per tenancy+period
  (…:2026-05-01, …:2026-06-01), duplicates impossible via unique index ✓
email.send jobs all succeeded, mode=mock, payload.sentAt set;
  server log shows "[email:mock] to=admin@example.com subject=…" ✓
Inbox API: unread count 8 → mark-read → read-all {markedRead:7} ✓
Dead job visible (GET /jobs?status=dead → 1) → POST retry → pending →
  runner processed it (mock email sent) ✓
GET /api/v1/reminders → 5 deadlines across properties sorted by due date ✓
```
**PASS** (notifications/jobs reset + reseeded to the canonical dataset after)

### Phase 9 — Auto Contract Generation

Migration: `db/migrations/0008_generated_documents.sql` (verbatim, completes
the `contracts.generated_document_id` FK deferred from 0004). The spec's
example template wording is preserved by the versioned direct renderer
(`templates/documents/lease/v1/` documents the implementation; v2+ would sit
alongside). §5.4 pipeline as a background `contract.generate` job:
view-model builder with all legal formatting (`formatDateLong`,
`numberToWords`, `moneyLegal` → "one thousand two hundred and fifty pounds
(£1,250.00)", `ordinal`, `termMonths`), a Zod schema for `lease/v1` that
fails loudly on any missing/empty field, then writes a searchable A4 PDF
directly with deterministic wrapping, pagination, standard fonts, and no
browser process. The result is stored via the files pattern
(`generated-lease/<uuid>/lease-<short-id>.pdf`, private, checksummed),
`generated_documents` row with the exact `input_snapshot`, `contracts` draft
row (`source='generated'`), then `notify(contract.generated)` (in-app only
per the §5.3 catalog; `contract.generation_failed` emails via the job's
onDead hook). `POST /tenancies/:id/contracts/generate` → 202 + jobId, 409
when a non-superseded contract of that kind exists. Contracts tab: Generate
dialog (kind lease/renewal, clause toggles defaulted from Settings, pets
description) + polling "Generating…" row. Golden-file test
(`npm run test:golden`) renders lease/v1 with fixture data and diffs the PDF
text layer against `tests/golden/lease-v1.txt`. typecheck/lint/build green.

Proof (2026-07-18):

```
POST /tenancies/:quayDraft/contracts/generate (seeded draft lease exists)
  → 409 CONFLICT "A non-superseded 'lease' contract already exists…" ✓
POST /contracts/:seeded/supersede → superseded; re-generate {pets+garden on}
  → 202 {"jobId":…}; job contract.generate → succeeded (1 attempt) ✓
generated_documents row: doc_type=lease, template_version=lease/v1,
  input_snapshot.clauses = {pets:true, petsDescription:"one small dog
  (terrier)", garden:true}, rentAmountLegal="one thousand two hundred and
  fifty pounds (£1,250.00)" ✓
contracts row: kind=lease source=generated status=draft, FK to the
  generated_documents row set ✓
notification "Lease generated for Priya Shah at Quay Flat" created;
  0 email jobs (contract.generated is in-app only) ✓
Renewal off the expiry flow: generate kind=renewal on the Maple active
  tenancy → renewal/generated/draft contract ✓
Sample PDF downloaded via signed URL → artifacts/sample-lease.pdf
  ("PDF document, version 1.4"; searchable text layer shows the AST with
  pets clause §4 and garden clause §5 present) ✓
npm run test:golden → "PASS golden-lease: PDF text layer matches
  tests/golden/lease-v1.txt" ✓
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
