# FABLE_PROMPTS — Phased Build Prompts

Paste-ready prompts for building the Property Management Dashboard, one per
phase in `docs/PLAN.md` §7. Companion to `docs/PLAN.md` (the plan) — this
file is just the prompts.

## How to use this file

- **Paste one phase at a time**, into the same coding-agent session, in
  order. Phase N assumes Phases 0…N-1 are already merged and working.
- **Wait for each phase to be confirmed working** (typecheck/lint/build
  green + the phase's proof) before sending the next. Don't queue them up.
- **Reference `docs/PLAN.md` by section number** in your own follow-ups
  instead of re-explaining the product — the agent should open the repo's
  PLAN.md and treat it as the source of truth. If a requirement changes
  mid-build, **edit `docs/PLAN.md` first**, then tell the agent what
  changed and point at the section.
- Each prompt names what it **does NOT** include so the agent doesn't pull
  work forward from a later phase. If it starts drifting, stop it (see
  "General prompting tips" at the bottom).
- Migration numbers, table shapes, route paths, and algorithms are all
  fixed in PLAN.md §3/§5/§6 — the agent should follow them exactly, not
  reinvent them.

---

## Phase 0 — Scaffold + CI

```
Continuing Property Management Dashboard (PLAN.md §7 Phase 0).

Read docs/PLAN.md first — especially §2 (Tech Stack), §6 (API envelope and
error codes), and this phase's row in §7. Follow it exactly; don't invent
structure it already specifies.

Scope:
- Scaffold a Next.js App Router + TypeScript (strict) monolith in this repo.
- Tailwind CSS + shadcn/ui installed and themeable.
- Prisma initialised with an empty schema; local Postgres via the Supabase
  CLI/Docker; commit a .env.example with every var named (no real secrets).
- Forward-only SQL migration runner wired: db/migrations/NNNN_*.sql applied
  by a `db:migrate` script; a `db:seed` script stub (seed content lands in
  later phases).
- Shared API layer per §6: a JSON response-envelope helper, the stable
  error-code map (VALIDATION_ERROR…INTERNAL), an X-Request-Id on every
  response, and a Zod edge-validation wrapper for route handlers.
- App shell per dashboard-ui-patterns: sidebar (Overview/Properties/
  Tenants/Notifications/Settings, config-driven), topbar, global toaster,
  top-level error boundary; placeholder pages for each nav item.
- GET /api/v1/health returning the envelope.
- CI (GitHub Actions): install, typecheck, lint, build on push/PR.

Do NOT: add any domain table, auth, real screens, or business logic — this
is scaffold only. No properties/tenants/etc. yet.

When done, give me:
- A 3–5 line summary of what you scaffolded and the repo layout.
- Confirmation that typecheck, lint, and build all pass locally and in CI.
- The GET /api/v1/health response body showing the envelope shape.
```

---

## Phase 1 — Auth + Settings

```
Continuing Property Management Dashboard (PLAN.md §7 Phase 1).

Read §3 (migration 0001), §2 (auth row), and the auth skill in
docs/spec/skills/auth/SKILL.md. Keep the users role/status pattern intact.

Scope:
- Apply migration 0001_users_and_settings.sql exactly as in §3 (users +
  user_settings). users.id equals the Supabase auth user id; role CHECK
  includes 'tenant' but it stays unused in v1.
- Supabase Auth email+password with a server-side session cookie
  (@supabase/ssr). Login and logout pages.
- requireAuth wrapper: session → users row → reject unless status='active'
  (a suspended user with a valid session is rejected — auth skill rule).
- GET /api/v1/me (user + settings) and PATCH /api/v1/settings (timezone,
  default lead days, rent-overdue grace days, clause defaults, email on/off)
  per §6.
- Settings screen (form-screen pattern) wired to those routes.
- Seed one admin user + user_settings so local dev can log in.

Do NOT: build any domain entity (properties, tenants, …); implement any
tenant-role behaviour beyond the column existing; add RLS policies for
tenants.

When done, give me:
- A short summary + the migration filename.
- Confirmation typecheck/lint/build pass.
- Proof: log in as the seeded admin, show GET /api/v1/me returning the
  user+settings envelope, and show a suspended user being rejected by
  requireAuth.
```

---

## Phase 2 — Properties

```
Continuing Property Management Dashboard (PLAN.md §7 Phase 2).

Read §3 (migration 0002), §4 (Properties list, form, detail shell), and §6
(properties routes).

Scope:
- Apply migration 0002_properties.sql exactly (properties + idx on status).
- Properties CRUD + archive/unarchive as POST verb sub-resources per §6
  (not PATCH status): GET/POST /properties, GET/PATCH /properties/:id,
  POST /properties/:id/archive, /unarchive.
- Properties list screen (pattern #1): DataTable with server-side
  pagination/sort/filter, URL-held state, "New property" action, empty/
  error/loading states.
- Property create/edit form (pattern #3) on routes, not modals.
- Property detail shell (pattern #2): header with mini-stats placeholders +
  empty tab strip (Contracts/Monthly Income/Expenses/Notifications/Tenancy
  as empty placeholders for now).
- Seed ~3 properties covering active and archived.

Do NOT: implement tenants, tenancies, any tab content, the add-compliance
prompt after create, or overview stats. Tabs are empty placeholders.

When done, give me:
- Summary + migration filename.
- Confirmation typecheck/lint/build pass.
- Proof: create a property via the UI, archive it, and show it filtered out
  of the default active list; show the list's URL holding filter/sort state.
```

---

## Phase 3 — Tenants & Tenancies

```
Continuing Property Management Dashboard (PLAN.md §7 Phase 3).

Read §3 (migration 0003), §4 (Tenants list/detail, New tenancy form,
Tenancy tab), §6 (tenants/tenancies routes), and the tenancy state machine
notes in §3.

Scope:
- Apply migration 0003_tenants_tenancies.sql exactly (tenants + tenancies +
  the three indexes).
- Tenants CRUD + list (pattern #1) + detail (pattern #2) with a
  cross-property tenancy-history table.
- Tenancies: POST create as 'draft'; PATCH edit allowed only while 'draft'
  (409 otherwise); transitions as POST sub-resources: /activate (draft→
  active), /end (active→ended), /renew (creates a successor draft, marks the
  predecessor 'renewed' on successor activation) — per §6.
- New-tenancy form (pattern #3): pick property, pick-or-create tenant,
  dates, rent + due day, deposit fields, clause toggles defaulting from
  settings.
- Tenancy tab on property detail: current tenancy card + past tenancies.
- Seed tenancies in all four states, including a renewed→active chain on one
  property and one tenant who rents two different properties over time.

Do NOT: build contracts, rent/income tracking, or reminders. The lease-
expiry reminder arming (§5.2) is Phase 7 — do not add reminder rows here.

When done, give me:
- Summary + migration filename.
- Confirmation typecheck/lint/build pass.
- Proof: walk a tenancy through draft→active→ended and draft→renew; show a
  tenant detail page listing tenancies across two different properties.
```

---

## Phase 4 — File Uploads + Contract Upload

```
Continuing Property Management Dashboard (PLAN.md §7 Phase 4).

Read §3 (migration 0004), §5.4 only for the contract data shape, §6
(uploads, files, contracts routes + upload policies), and the
file-storage-uploads skill. All files are private.

Scope:
- Apply migration 0004_files_and_contracts.sql exactly (files + contracts;
  contracts.generated_document_id stays FK-less until Phase 9 as noted).
- A private Supabase Storage bucket. POST /api/v1/uploads: multipart upload
  through the API (the internal-tool simplification the skill allows),
  validating content-type/size/magic-bytes per purpose ('lease-doc',
  'certificate', 'receipt') from §6, server-generated storage keys.
  GET /api/v1/files/:id/download returns a short-lived signed GET URL.
- Contracts for source='uploaded': attach via
  POST /tenancies/:id/contracts; issue/sign/supersede transitions per §6.
- Contracts tab on property detail: list across the property's tenancies,
  upload signed copies, download, status badges.
- Enforce the activation rule from §7: a tenancy activates only with a
  signed contract or an explicit override.

Do NOT: generate contracts (Phase 9), build the receipts UI (arrives with
expenses in Phase 5), or add the orphan-file sweep (needs jobs, Phase 8).

When done, give me:
- Summary + migration filename.
- Confirmation typecheck/lint/build pass.
- Proof: upload a PDF as an 'uploaded' lease contract, mark it issued then
  signed, and download it via a signed URL; show an oversized/wrong-type
  upload being rejected with a VALIDATION_ERROR envelope.
```

---

## Phase 5 — Expenses

```
Continuing Property Management Dashboard (PLAN.md §7 Phase 5).

Read §3 (migration 0005), §4 (Expenses tab), and §6 (transactions +
reports routes).

Scope:
- Apply migration 0005_transactions.sql exactly (transactions + all three
  indexes + the direction/category and rent_period CHECKs).
- Transactions POST/GET/PATCH/DELETE for the expense paths per §6; DELETE
  is a hard delete (it's a cash log, not a ledger, per §1).
- Expenses tab: DataTable filtered to expenses (year + category filters),
  add-expense form panel (category, amount, date, description, receipt
  upload reusing Phase 4 uploads), a Recharts category-breakdown donut for
  the selected year.
- GET /api/v1/reports/expenses?year=&format=csv (optional propertyId
  filter) — the tax-time export.
- Seed expense transactions across two calendar years covering every
  expense category.

Do NOT: touch rent/income rows in the UI, the Monthly Income grid, or
overview stats — those are Phase 6. Only direction='expense' here.

When done, give me:
- Summary + migration filename.
- Confirmation typecheck/lint/build pass.
- Proof: add an expense with a receipt, filter by category and year, and
  download the CSV export for a year; show the category donut rendering.
```

---

## Phase 6 — Monthly Income + Overview

```
Continuing Property Management Dashboard (PLAN.md §7 Phase 6).

Read §5.1 (rent-overdue detection, compute-on-read), §4 wireframe 2
(Monthly Income grid) and the Overview screen, and §6 (income + stats
routes). No new migration this phase.

Scope:
- Implement §5.1 expected-vs-actual exactly: derive_rent_periods and
  month_status, computed on read from tenancies vs transactions rent rows.
  Nothing is persisted as "expected" — statuses are display-only here.
- GET /api/v1/properties/:id/income?year= returning per-tenancy monthly
  status for the grid.
- Monthly Income tab per §4 wireframe 2: the tenancy×12-month grid with
  the five cell states (paid/partial/overdue/upcoming/no-tenancy), the
  record-payment popover (POST /transactions with category='rent',
  rent_period=that month), corrections on paid cells, expected-vs-received
  totals, and the yearly Recharts bar chart.
- GET /api/v1/stats/overview + Overview screen: stats row (pattern #4 —
  month's rent actual vs expected, overdue rent count, deadlines due ≤30d,
  YTD expenses) + recent-activity list. Numbers come from the stats
  endpoint, never computed client-side.
- Seed rent transactions so one month reads paid, one partial, one overdue
  against today.

Do NOT: send overdue *notifications* (statuses are display-only until the
engine exists in Phase 8); build compliance items or reminders.

When done, give me:
- Summary (note: no migration this phase).
- Confirmation typecheck/lint/build pass.
- Proof: three example rent-overdue detections against seed data (one paid,
  one partial, one overdue) shown in the grid, and the Overview stats row
  reading from GET /api/v1/stats/overview.
```

---

## Phase 7 — Compliance Items + Reminders Data

```
Continuing Property Management Dashboard (PLAN.md §7 Phase 7).

Read §3 (migration 0006), §5.2 (reminder lifecycle: upsert + recurrence
rollover — daily scan is Phase 8), §4 (Notifications tab, flow-1 add-
compliance prompt), §6 (compliance + reminders routes), and §8 Q7 for the
rollover semantics decided (new due = completed_on + recurrence; same row).

Scope:
- Apply migration 0006_compliance_and_reminders.sql exactly (compliance_
  items + reminders + indexes + the UNIQUE(subject_type,subject_id) that
  makes the upsert possible).
- Compliance CRUD + POST /compliance-items/:id/complete implementing the
  §5.2 rollover (roll due_on forward by recurrence_months from completed_on,
  reset the reminder, optional new-certificate upload).
- Reminder upsert hooks per §5.2 on BOTH compliance-item writes AND tenancy
  writes (tenancy reminder targets end_date) — arm lease-expiry reminders
  now and backfill them for existing seed tenancies. Delete the reminder on
  ended/renewed/completed/deleted subjects.
- Property Notifications tab: compliance list with client-computed status
  chips (ok / due-soon ≤30d / overdue), mark-complete dialog, lead-day
  override, add-compliance action with kind presets.
- Flow 1: after creating a property, prompt to add compliance items pre-
  filled with UK defaults (gas 12 / EICR 60 / EPC 120 months).
- Seed compliance items: one overdue, one due ≤30d, one future, one
  completed, with matching reminders.

Do NOT: build the daily scan, the notifications table, notify(), or any
email — nothing FIRES yet. This phase is reminder *data* and its upkeep
only. No contract generation.

When done, give me:
- Summary + migration filename.
- Confirmation typecheck/lint/build pass.
- Proof: complete a recurring gas certificate and show due_on rolling
  forward by 12 months with its reminder reset; show a tenancy's end_date
  producing an armed reminder row.
```

---

## Phase 8 — Notification Engine

```
Continuing Property Management Dashboard (PLAN.md §7 Phase 8).

Read §3 (migration 0007), §5.2 (daily scan), §5.1 (daily overdue pass),
§5.3 (notify + delivery + event catalog), §6 (notifications, jobs, cron
routes), and the notifications-scheduling skill. Reuse its daily-scan
pattern verbatim.

Scope:
- Apply migration 0007_notifications_and_jobs.sql exactly (notifications
  with dedupe_key + partial unique index; jobs table + idx).
- notify(user, type, {title, body, link_path, dedupe_key}) inserting the
  notification with ON CONFLICT (dedupe_key) DO NOTHING, then enqueuing an
  email.send job when the type is email-worthy and email is enabled (never
  send inline — skill rule).
- Jobs runner: claim with FOR UPDATE SKIP LOCKED, idempotent handlers,
  retries up to max_attempts with backoff, then 'dead'. Trigger it right
  after enqueue and via the cron sweep.
- Cron routes guarded by a CRON_SECRET header:
  POST /api/internal/cron/daily-scan (the 08:00 scan: §5.2 lead crossing +
  §5.1 rent-overdue pass) and POST /api/internal/cron/run-jobs. Support a
  dev-only ?today= test-clock param on the scan.
- Resend email via a thin sendEmail() wrapper + React Email templates for
  the email-worthy types in §5.3's catalog.
- Notifications inbox screen + sidebar unread badge; mark-read / read-all.
- Files orphan sweep job (pending files >24h). Failed-job count on Settings
  (dead-letter visibility).

Do NOT: build auto contract generation (Phase 9). No Stripe.

When done, give me:
- Summary + migration filename.
- Confirmation typecheck/lint/build pass.
- Proof: run the daily scan with a test-clock ?today= that crosses a 30-day
  cert lead and produces exactly one cert.expiring notification (and stays
  idempotent on a second run); show one rent.overdue notification generated
  from seed data with its dedupe_key.
```

---

## Phase 9 — Auto Contract Generation

```
Continuing Property Management Dashboard (PLAN.md §7 Phase 9).

Read §3 (migration 0008), §5.4 (the full pipeline, verbatim), §6
(generate route), the pdf-document-generation skill, and the lease template
at docs/spec/skills/pdf-document-generation/lease-agreement.template.html
(its merge fields and pets/garden clause toggles).

Scope:
- Apply migration 0008_generated_documents.sql exactly (generated_documents
  + completing the contracts.generated_document_id FK deferred from 0004).
- Adopt the spec's example template into templates/documents/lease/v1/
  (template + styles). Keep the exact merge fields; formatting happens in
  the view model, never in the template.
- Implement the §5.4 pipeline as a background job: view-model builder with
  legal formatting (dates spelled out, money as "nine hundred and fifty
  pounds (£950.00)", ordinals), a Zod schema for template version 'lease/v1'
  that fails loudly on any missing field, Handlebars render, headless
  Chromium print-to-PDF (A4 + the template's @page margins, embedded fonts),
  store via the files pattern (purpose='generated-lease', private), insert
  the generated_documents row with input_snapshot, insert the contracts
  'draft' row, then notify(owner, 'contract.generated').
- POST /api/v1/tenancies/:id/contracts/generate → 202 + job id; 409 if a
  non-superseded contract of that kind already exists.
- Contracts tab: "Generate contract" action, a "Generating…" row that polls
  until the job completes, clause toggles from the tenancy/settings.
- Renewal generation off the expiry flow (kind='renewal').
- Golden-file test: render lease/v1 with fixture data and diff the PDF text
  layer to catch layout breaks.

Do NOT: add e-signature or a template v2 — signed docs are wet/manual-
signed then uploaded (Phase 4 path). Never regenerate a signed/issued
document in place; supersede with a new row.

When done, give me:
- Summary + migration filename.
- Confirmation typecheck/lint/build pass.
- Proof: a sample generated lease PDF for a seed tenancy (with pets +
  garden clauses toggled on), the matching generated_documents row showing
  its input_snapshot, and the golden-file test passing.
```

---

## General prompting tips

- **Flag scope drift immediately.** If the agent starts building something
  that belongs to a later phase (or contradicts PLAN.md), stop it in one
  short message — "that's Phase 8, drop it for now" — rather than letting it
  compound across a big diff that's painful to unpick.
- **Report a bug as its own short message**, not by re-pasting the whole
  phase prompt. "The record-payment popover posts rent_period as the due
  date, not the first of the month — see §5.1" is faster and clearer than a
  wall of context the agent already has.
- **Keep `docs/PLAN.md` as the single edit point** if requirements change
  mid-build. Change the plan first, then point the agent at the section
  that moved. Never let the code and the plan disagree silently — the plan
  is what the next phase's prompt relies on.
- **Confirm the proof before advancing.** Each phase ends with a specific
  proof for a reason; a green build with a broken flow isn't done. Don't
  send Phase N+1 until Phase N's proof actually holds.
- **One phase per message, in order.** The dependencies in §7 are real;
  skipping ahead means the agent invents stubs for things a later phase
  defines properly, and you pay for it twice.
```
