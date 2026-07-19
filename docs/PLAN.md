# PLAN — Property Management Dashboard

> Derived from `docs/spec/PROJECT_SPEC.md` (locked) and the eight shared
> skills in `docs/spec/skills/`. This document adds depth, sequencing, and
> buildable detail; it does not redesign the spec. Anything that looked
> wrong or underspecified in the spec is raised in §8, not silently changed.
> Companion document: `docs/FABLE_PROMPTS.md` (one paste-ready prompt per
> §7 phase).

---

## §1 Product Concept

**Elevator pitch.** A private web dashboard for one landlord managing a
handful of rental properties end-to-end: the properties themselves, the
tenants and tenancies, the lease contracts (uploaded scans *and*
auto-generated PDFs from a version-controlled template), every pound in
(rent) and out (repairs, insurance, mortgage interest…), and the deadlines
that carry legal or financial risk — gas certificates, EICRs, EPCs,
inspections, lease expiries — with reminders that fire at 60/30/7 days so
nothing lapses.

**Primary user.** A single owner-landlord ("the admin"). They log in a few
times a week: record a rent payment, check what's due soon, add an expense
with a receipt photo, generate or file a lease. At tax time they export a
year of categorised expenses as CSV. This is a real operating tool, not a
demo.

**What the product is NOT (v1 non-goals):**

- **No tenant-facing portal.** One login, the owner. The `auth` skill's
  role/status pattern is kept intact so tenant logins can be added later
  without schema surgery — but no tenant-facing screen, route, or
  permission is built in v1.
- **No native mobile app.** Web-first, responsive enough to record a rent
  payment or read a notification from a phone browser. No React Native, no
  PWA install flow.
- **Single currency (GBP).** All money is integer pence (`_cents` columns
  per the shared convention); API responses include `currency: "gbp"`. No
  FX, no multi-currency reporting.
- **Single jurisdiction flavour (UK) for defaults and copy.** Gas cert
  12 months, EICR 5 years, EPC 10 years — seeded as defaults,
  *configurable per item*, never hardcoded in logic (see §8 Q3).
- **No automated money movement in the core roadmap.** Rent arrives by
  bank transfer outside the app; the app only *records* it. Stripe rent
  collection, bank CSV import, and e-signature are deferred (§7 "Deferred
  scope", §8 Q2).
- **No accounting-grade ledger.** Transactions are a categorised cash log
  for the owner's visibility and a tax-time CSV export — not double-entry
  bookkeeping, no reconciliation, no MTD/HMRC filing integration.
- **No multi-owner / multi-tenancy (SaaS) support.** One account, one
  portfolio. No organisations, teams, or per-property permissions.
- **No document e-signing.** Generated leases have wet-signature blocks;
  the signed scan is uploaded back. E-sign providers are deferred scope.
- **No live push.** In-app notifications are a polled inbox per the
  `notifications-scheduling` skill; no WebSockets/SSE.
- **No public API / third-party integrations** beyond the email provider
  and object storage the app itself needs.

---

## §2 Tech Stack

Per the build owner's decision, this project uses the **Next.js + Prisma +
Supabase monolith** pattern (already proven end-to-end on a sibling
project) rather than `PROJECT_SPEC.md`'s Fastify + Vite split. This is a
deliberate, flagged deviation — the tradeoff analysis and the option to
revert live in **§8 Q1**. Every *shared-skill convention* (envelope, error
codes, schema idioms, reminder pattern, PDF pipeline, UI patterns) is kept
exactly; only the framework carrying them changes.

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript**, single repo, Route Handlers under `/app/api/v1/*` | One deployable, one dev server; the pattern already proven with an AI coding agent on the sibling project |
| API conventions | `rest-api-design` skill verbatim (envelope, error codes, pagination, transition endpoints) | Route Handlers speak the same dialect as the Fastify siblings — the frontend client is identical |
| Validation | **Zod** at every edge (params, query, body) + shared schemas reused by react-hook-form | Same skill requirement, framework-agnostic |
| Database | **Postgres** (Supabase-hosted; local via Supabase CLI/Docker) | `database-schema-design` skill target |
| Migrations | **Forward-only SQL files** (`db/migrations/NNNN_*.sql`, §3) as the contract; Prisma schema mirrors them (`prisma db pull` after each migration) | Skill rule: "plain SQL is the contract; the runner is swappable." Prisma Migrate's generated SQL is acceptable *only if* each generated file is reviewed and never edited after apply |
| Query layer | **Prisma Client** | Typed queries; the skill allows the ORM as long as SQL migrations stay the source of truth |
| Auth | **Supabase Auth** (email+password, session cookie via `@supabase/ssr`) + a public `users` row mirroring the `auth` skill's shape (`role`, `status`) | Managed sessions with the skill's role/status pattern preserved so tenant logins remain possible later |
| Row security | RLS **enabled deny-all** on every public table; the app reads/writes via server-side Prisma (direct connection) after its own auth check | Supabase exposes PostgREST by default; deny-all keeps the only door the API layer |
| File storage | **Supabase Storage**, private buckets only, short-lived signed GET URLs (5–15 min) | `file-storage-uploads` skill: private files, presigned GET; simple multipart upload through the API is explicitly allowed for this internal tool |
| Jobs & cron | Postgres **`jobs` table** (durable queue per the skill's stack-agnostic core) + a runner invoked by **Vercel Cron** (or node-cron if self-hosted) hitting a secret-guarded internal route; daily 08:00 scan is a cron entry | pg-boss needs a long-lived worker, which a serverless Next.js deploy doesn't have; the skill's core ("durable queue in the database + idempotent handlers") is kept. See §8 Q11 (deployment target) |
| Email | **Resend** via a thin `sendEmail()` wrapper; React Email templates | `notifications-scheduling` skill default, swappable provider |
| PDF generation | **Direct TypeScript PDF writer** with deterministic A4 layout, wrapping, pagination, searchable text, and standard PDF fonts | No browser executable or platform-specific binary is required; wording remains versioned as `lease/v1` |
| Frontend UI | **shadcn/ui + Tailwind CSS**, **TanStack Query** (server state), **TanStack Table** (`<DataTable>` wrapper), **react-hook-form + Zod**, **Recharts** | `dashboard-ui-patterns` skill defaults, unchanged — only Vite/React Router are replaced by Next.js routing |
| Payments (deferred) | Stripe per `payments-billing` skill | Only if the deferred rent-collection phase is ever activated |

**Explicitly not chosen:** Fastify/Vite (see §8 Q1), pg-boss (no persistent
worker in the chosen deploy model), MinIO/S3 SDK (Supabase Storage replaces
it — same private-bucket + signed-GET semantics), sharp image variants
(uploads here are PDFs and receipt images viewed full-size; add variants
only if receipt thumbnails ever matter).

---

## §3 Data Model

Conventions applied throughout (from `database-schema-design`):
`snake_case` plural tables; `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`;
`created_at`/`updated_at timestamptz NOT NULL DEFAULT now()` on every table
(**`updated_at` is maintained in the app layer via Prisma `@updatedAt`** —
the "pick one per project" decision); money as integer cents with `_cents`
suffix; enum-ish state as `text` + `CHECK`; every FK has explicit
`ON DELETE` and an index; forward-only numbered migrations, one concern per
file. Extensions required: `citext` (and `pgcrypto`/`gen_random_uuid()`,
built-in on PG16/Supabase).

Migration files map to build phases (§7). Numbering below is the planned
sequence.

### 0001_users_and_settings.sql — Phase 1

```sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;

-- Mirrors the auth skill's users shape. id is set equal to the Supabase
-- auth.users id at signup (no cross-schema FK: Prisma doesn't model the
-- auth schema; the app enforces the 1:1 at creation).
-- password_hash lives in Supabase Auth, not here.
CREATE TABLE users (
  id           uuid PRIMARY KEY,
  email        citext UNIQUE NOT NULL,
  display_name text NOT NULL,
  role         text NOT NULL DEFAULT 'admin'
               CHECK (role IN ('admin','tenant')),   -- 'tenant' reserved for a future portal; unused in v1
  status       text NOT NULL DEFAULT 'active'
               CHECK (status IN ('pending','active','suspended')),
  timezone     text NOT NULL DEFAULT 'Europe/London', -- drives all due-date evaluation
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Per the auth skill: extend users via a 1:1 profile/settings table,
-- never by widening users.
CREATE TABLE user_settings (
  user_id                 uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_lead_days       integer[] NOT NULL DEFAULT '{60,30,7}',
  rent_overdue_grace_days integer NOT NULL DEFAULT 3 CHECK (rent_overdue_grace_days >= 0),
  email_enabled           boolean NOT NULL DEFAULT true,
  clause_pets_default     boolean NOT NULL DEFAULT false,
  clause_garden_default   boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMIT;
```

### 0002_properties.sql — Phase 2

```sql
BEGIN;

CREATE TABLE properties (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname             text NOT NULL,
  address_line1        text NOT NULL,
  address_line2        text,
  city                 text NOT NULL,
  postcode             text NOT NULL,
  property_type        text NOT NULL
                       CHECK (property_type IN ('house','flat','hmo','commercial')),
  bedrooms             integer CHECK (bedrooms >= 0),
  purchase_price_cents integer CHECK (purchase_price_cents >= 0),  -- NULL = unknown
  notes                text,
  status               text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','archived')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_properties_status ON properties (status);

COMMIT;
```

### 0003_tenants_tenancies.sql — Phase 3

```sql
BEGIN;

CREATE TABLE tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name  text NOT NULL,
  email      citext,          -- nullable; not unique (see §8 Q9 — becomes the portal login key later)
  phone      text,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenants_email ON tenants (email);

CREATE TABLE tenancies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id          uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  start_date           date NOT NULL,
  end_date             date NOT NULL,                 -- fixed term; periodic tenancies: §8 Q6
  rent_amount_cents    integer NOT NULL CHECK (rent_amount_cents > 0),
  rent_due_day         integer NOT NULL CHECK (rent_due_day BETWEEN 1 AND 28),
  deposit_amount_cents integer CHECK (deposit_amount_cents >= 0),
  deposit_scheme       text,                          -- free text; enum candidates in §8 Q8
  deposit_reference    text,
  status               text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','active','ended','renewed')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);

-- "active tenancies by property" is the hot lookup (income grid, overdue scan)
CREATE INDEX idx_tenancies_property_id_status ON tenancies (property_id, status);
CREATE INDEX idx_tenancies_tenant_id          ON tenancies (tenant_id);
CREATE INDEX idx_tenancies_end_date_active    ON tenancies (end_date) WHERE status = 'active';

COMMIT;
```

State machine `tenancies.status`:
`draft → active` (via `POST /tenancies/:id/activate`, requires a signed
contract or explicit override); `active → ended` (lapse) or
`active → renewed` (a new tenancy row is created; the old row is marked
`renewed`). `draft` rows may be edited/deleted; other states may not be
deleted.

### 0004_files_and_contracts.sql — Phase 4

```sql
BEGIN;

-- files: file-storage-uploads skill schema, verbatim shape.
-- All files in this project are private (is_public stays false).
CREATE TABLE files (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  purpose         text NOT NULL
                  CHECK (purpose IN ('lease-doc','certificate','receipt','generated-lease')),
  storage_key     text NOT NULL UNIQUE,   -- '<purpose>/<uuid>/<sanitized-name>'
  content_type    text NOT NULL,
  size_bytes      bigint NOT NULL,
  checksum_sha256 text,
  is_public       boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','ready','failed')),
  variants        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_files_owner_id ON files (owner_id);
CREATE INDEX idx_files_status_pending ON files (created_at) WHERE status = 'pending'; -- orphan sweep

CREATE TABLE contracts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id            uuid NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  kind                  text NOT NULL CHECK (kind IN ('lease','renewal','addendum')),
  source                text NOT NULL CHECK (source IN ('generated','uploaded')),
  file_id               uuid NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  generated_document_id uuid,   -- FK added in 0008 when generated_documents exists
  signed_on             date,
  status                text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','issued','signed','superseded')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'signed' OR signed_on IS NOT NULL),
  CHECK (source = 'generated' OR generated_document_id IS NULL)
);

CREATE INDEX idx_contracts_tenancy_id ON contracts (tenancy_id);
CREATE INDEX idx_contracts_file_id    ON contracts (file_id);

COMMIT;
```

State machine `contracts.status`: `draft → issued → signed`;
any of those `→ superseded` when a newer contract of the same kind replaces
it. Signed/issued documents are never regenerated in place
(`pdf-document-generation` rule) — a new contract row supersedes.

### 0005_transactions.sql — Phase 5

```sql
BEGIN;

CREATE TABLE transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  tenancy_id      uuid REFERENCES tenancies(id) ON DELETE SET NULL,
  direction       text NOT NULL CHECK (direction IN ('income','expense')),
  category        text NOT NULL,
  amount_cents    integer NOT NULL CHECK (amount_cents > 0),
  occurred_on     date NOT NULL,
  description     text,
  receipt_file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  rent_period     date,        -- first-of-month marker, rent rows only
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- category vocabulary depends on direction:
  CHECK (
    (direction = 'income'  AND category IN ('rent','deposit','other')) OR
    (direction = 'expense' AND category IN ('repairs','maintenance','insurance',
                                            'mortgage_interest','certificates',
                                            'agent_fees','utilities','other'))
  ),
  -- rent rows must point at a tenancy and a normalized period; nothing else uses rent_period:
  CHECK (rent_period IS NULL OR EXTRACT(DAY FROM rent_period) = 1),
  CHECK (NOT (direction = 'income' AND category = 'rent')
         OR (tenancy_id IS NOT NULL AND rent_period IS NOT NULL))
);

-- "a property's transactions by year" (Expenses tab, income grid, CSV export):
CREATE INDEX idx_transactions_property_id_occurred_on
  ON transactions (property_id, occurred_on DESC);
-- expected-vs-actual rent matching:
CREATE INDEX idx_transactions_tenancy_id_rent_period
  ON transactions (tenancy_id, rent_period);
CREATE INDEX idx_transactions_receipt_file_id ON transactions (receipt_file_id);

COMMIT;
```

### 0006_compliance_and_reminders.sql — Phase 7

```sql
BEGIN;

CREATE TABLE compliance_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id       uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  kind              text NOT NULL
                    CHECK (kind IN ('gas_certificate','electrical_eicr','epc',
                                    'smoke_co_check','inspection','insurance','custom')),
  label             text NOT NULL,
  due_on            date NOT NULL,
  completed_on      date,
  document_file_id  uuid REFERENCES files(id) ON DELETE SET NULL,
  recurrence_months integer CHECK (recurrence_months > 0),  -- UK defaults seeded: gas 12, EICR 60, EPC 120
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_items_property_id ON compliance_items (property_id);
CREATE INDEX idx_compliance_items_due_on_open
  ON compliance_items (due_on) WHERE completed_on IS NULL;

-- reminders: notifications-scheduling skill's deadline-as-data pattern.
-- subject is polymorphic (compliance_item | tenancy) so no hard FK;
-- integrity is enforced by the upsert helpers (§5.2) and a cleanup on delete.
CREATE TABLE reminders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type       text NOT NULL CHECK (subject_type IN ('compliance_item','tenancy')),
  subject_id         uuid NOT NULL,
  due_on             date NOT NULL,
  lead_days          integer[] NOT NULL DEFAULT '{60,30,7}',
  last_notified_lead integer,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id)          -- makes the lifecycle upsert (§5.2) possible
);

-- "reminders due soon" — the daily scan's query:
CREATE INDEX idx_reminders_due_on ON reminders (due_on);

COMMIT;
```

### 0007_notifications_and_jobs.sql — Phase 8

```sql
BEGIN;

-- notifications-scheduling skill schema + one flagged addition: dedupe_key,
-- so "one rent-overdue notification per tenancy per period" is enforced by
-- the database, not by hope (deviation noted in §8 Q10).
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL,     -- event catalog in §5.4
  title      text NOT NULL,
  body       text,
  link_path  text,              -- e.g. '/properties/<id>?tab=notifications'
  dedupe_key text,              -- e.g. 'rent.overdue:<tenancy_id>:2026-07-01'
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread
  ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE UNIQUE INDEX idx_notifications_dedupe_key
  ON notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Durable DB-backed queue (skill's stack-agnostic core; replaces pg-boss's
-- internal tables because this deploy has no long-lived worker — §2).
CREATE TABLE jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL,             -- 'email.send' | 'contract.generate' | 'files.orphan_sweep'
  payload      jsonb NOT NULL DEFAULT '{}',
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','running','succeeded','failed','dead')),
  run_at       timestamptz NOT NULL DEFAULT now(),
  attempts     integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_status_run_at ON jobs (status, run_at);  -- runner's claim query

COMMIT;
```

### 0008_generated_documents.sql — Phase 9

```sql
BEGIN;

-- pdf-document-generation skill schema, verbatim.
CREATE TABLE generated_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type         text NOT NULL,           -- 'lease'
  template_version text NOT NULL,           -- 'lease/v1'
  subject_type     text NOT NULL,           -- 'tenancy'
  subject_id       uuid NOT NULL,
  file_id          uuid NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  input_snapshot   jsonb NOT NULL,          -- the exact view model used (auditability)
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_generated_documents_subject ON generated_documents (subject_type, subject_id);
CREATE INDEX idx_generated_documents_file_id ON generated_documents (file_id);

-- Complete the FK deferred from 0004:
ALTER TABLE contracts
  ADD CONSTRAINT fk_contracts_generated_document_id
  FOREIGN KEY (generated_document_id) REFERENCES generated_documents(id) ON DELETE SET NULL;
CREATE INDEX idx_contracts_generated_document_id ON contracts (generated_document_id);

COMMIT;
```

### Deferred (only if the Stripe phase is ever activated — §8 Q2)

`payments` and `stripe_events` exactly as written in the `payments-billing`
skill, with `subject_type = 'rent_invoice'` and `subject_id` = the tenancy.
Not part of the §7 roadmap.

### Seed data (`db/seed.ts`)

Per the schema skill checklist, the seed exercises **every status value**:
1 admin user (+settings); 3 properties (2 `active` — a house and a flat —
1 `archived`); 4 tenants; tenancies in all four states (incl. one
`renewed → active` chain on the same property, and one tenant renting two
different properties over time); contracts in all four states; ~30
transactions across two calendar years covering every category, including
rent rows that make one month **paid**, one **partial**, and one clearly
**overdue** against today's date; compliance items for gas/EICR/EPC with one
overdue, one due within 30 days, one comfortably future, one completed;
matching reminders; a handful of notifications (read and unread); one
`dead` job.

---

## §4 Screens

All screens live in the `dashboard-ui-patterns` app shell: config-driven
sidebar (Overview, Properties, Tenants, Notifications with unread badge,
Settings), topbar with page title and user menu, global toaster, error
boundary, mobile drawer. All server state via TanStack Query with query
keys mirroring API paths; money through one `<Money cents currency>`;
dates through one `<DateTime>` in the owner's timezone; every list ships
empty/error/loading states first.

| Screen | Route | Core pattern(s) | Notes |
|---|---|---|---|
| Overview | `/` | **#4 Stats row** + recent-activity list | Stat cards: month's rent (actual vs expected), overdue rent count, deadlines due ≤30d, YTD expenses. Values from `GET /api/v1/stats/overview` — never computed client-side |
| Properties list | `/properties` | **#1 List screen** | `<DataTable>`: nickname, address, type, active tenancy (tenant + rent), next deadline, status badge. Filter by status/type; URL holds table state; "New property" primary action |
| Property create/edit | `/properties/new`, `/properties/:id/edit` | **#3 Form screen** | Route (not modal — >4 fields). On create success: "Add compliance items?" prompt (flow 1) pre-filled with UK defaults |
| **Property detail** | `/properties/:id` | **#2 Detail screen** (the spec's canonical example) | Wireframe below. Tabs lazy-load their queries |
| Tenants list | `/tenants` | **#1 List screen** | Name, contact, current property/ies, tenancy count |
| Tenant detail | `/tenants/:id` | **#2 Detail screen** | Header: name + contact actions. Sections: details card; **cross-property tenancy history** table (property, dates, rent, status badge) |
| Tenant create/edit | `/tenants/new`, `/tenants/:id/edit` | **#3 Form screen** | |
| New tenancy | `/tenancies/new?propertyId=` | **#3 Form screen** | One route-based form: pick property, pick-or-create tenant, dates, rent + due day, deposit (amount/scheme/reference), clause toggles (pets/garden, defaults from settings). Creates `draft`; offers "Generate contract" (flow 2) |
| Notifications inbox | `/notifications` | **#1 List** + **#5 Review queue** manners | Two sections: unread feed (mark-read is an optimistic small action, undo toast) and "All upcoming deadlines" across properties sorted by due date |
| Settings | `/settings` | **#3 Form screen** | Timezone, default lead days, rent-overdue grace days, clause defaults, email on/off. Also shows failed-job count (dead-letter visibility per skill) |

### Wireframe-in-words 1: Property detail (`/properties/:id`)

**Header band:** nickname as title; address line under it; status badge
(`active` green / `archived` grey); action buttons right-aligned: "Edit",
"New tenancy", overflow menu ("Archive property" with confirm dialog naming
the property). Below the header, three inline mini-stats: current rent
(from the active tenancy, or "Vacant"), next deadline (soonest open
compliance `due_on`), YTD expenses.

**Tab strip** (each tab is a lazy-loaded query, URL-addressable via
`?tab=`):

1. **Contracts** — table of contracts across this property's tenancies:
   kind badge, source (generated/uploaded), tenant, status badge
   (draft/issued/signed/superseded), signed-on, row actions: Download
   (signed GET URL), Mark issued, Upload signed copy → Mark signed.
   Primary action "Generate contract" (enabled when a draft/active tenancy
   exists) shows a "Generating…" row until the job completes (poll query).
2. **Monthly Income** — the grid (wireframe 2 below).
3. **Expenses** — `<DataTable>` of expense transactions (date, category
   badge, description, amount, receipt icon → signed URL); filter by year +
   category; inline "Add expense" form panel (category, amount, date,
   description, receipt upload); Recharts category-breakdown donut for the
   selected year; "Export CSV" button (tax time) hitting the reports route.
4. **Notifications** — this property's compliance items: kind icon, label,
   due date, status chip computed client-side from dates (`ok` /
   `due soon` ≤30d / `overdue`), recurrence ("every 12 months"), document
   link. Row actions: "Mark complete" (dialog: completion date + upload new
   certificate → due date rolls forward per §5.2), "Edit" (due date, lead
   days override, recurrence). Primary action "Add compliance item" with
   kind presets. Below: the reminder rows' next-fire preview ("next
   notification: 30-day lead on 12 Aug").
5. **Tenancy** — current tenancy card (tenant + contact, dates, rent, due
   day, deposit amount/scheme/reference, status) with actions "Activate"
   (draft), "End tenancy", "Renew" (pre-fills a new tenancy form); past
   tenancies table beneath.

### Wireframe-in-words 2: Monthly Income grid

Top bar: year selector (defaults to current year) ·
legend (green = paid, amber = partial, red = overdue, grey = not yet due,
hollow = no tenancy) · yearly Recharts bar chart (expected vs received per
month) collapsed above or beside the grid.

The grid: **one row per tenancy overlapping the selected year** (usually
one; two+ rows when a changeover or renewal happened), **12 month columns**
Jan–Dec. Row header: tenant name + monthly rent. Each cell shows the
period's state from the §5.1 algorithm:

- **Paid** (green): amount received + received date.
- **Partial** (amber): "£450 / £950".
- **Overdue** (red): expected amount + "due 5 Jul" + days late.
- **Due/upcoming** (grey outline): expected amount, muted.
- **No tenancy** (empty cell): month outside the tenancy's term.

Clicking any unpaid/partial cell opens the inline **"Record payment"**
popover: amount (pre-filled with remainder), date received (defaults
today), note — submits `POST /api/v1/transactions` with
`category='rent'`, `rent_period` = that month; on success the cell turns
green (mutation invalidates the income query). Clicking a paid cell shows
the underlying transaction(s) with edit/delete for corrections. A footer
row totals expected vs received per month; a trailing column totals the
year per tenancy.

---

## §5 Key Algorithms

All date logic takes `today` as a parameter (skill's test-clock rule) and
evaluates dates in the owner's timezone.

### 5.1 Rent-overdue detection (expected vs actual)

No expected-rent rows are ever written; expectations are computed on read
from `tenancies`, actuals come from `transactions`.

```
derive_rent_periods(tenancy, year):
  # periods are first-of-month dates
  from = max(first_of_month(tenancy.start_date), jan 1 of year)
  to   = min(first_of_month(tenancy.end_date),   dec 1 of year)
  for period in months(from..to):
    due_date = period + (tenancy.rent_due_day - 1) days     # due_day ∈ 1..28, always valid
    # only periods where the due date falls inside the tenancy term count:
    if tenancy.start_date <= due_date <= tenancy.end_date:
      yield { period, due_date, expected_cents: tenancy.rent_amount_cents }

month_status(tenancy, period, today, grace_days):          # grace from user_settings (default 3)
  received = SUM(amount_cents) FROM transactions
             WHERE tenancy_id = tenancy.id AND direction='income'
               AND category='rent' AND rent_period = period    # uses idx_transactions_tenancy_id_rent_period
  if received >= expected:                    return PAID
  if today <= due_date:                       return UPCOMING
  if today <= due_date + grace_days:          return DUE          # inside grace window
  if received == 0:                           return OVERDUE
  else:                                       return PARTIAL      # late and short

# GET /properties/:id/income?year= returns this per active+ended tenancy
# overlapping the year; the grid renders it directly.
```

**Daily overdue notification** (runs inside the 08:00 scan, §5.3): for
every `active` tenancy, evaluate only the current and previous period
(older gaps were already notified when they crossed the line); for each
period whose status is OVERDUE or PARTIAL-late, call
`notify(owner, 'rent.overdue', …, dedupe_key = 'rent.overdue:{tenancy_id}:{period}')`.
The unique partial index on `dedupe_key` makes this idempotent — at most
one notification per tenancy per rent period, no matter how often the scan
runs. (Statuses are for display; only the notification is persisted —
consistent with the spec's "nothing is written until money arrives".)

### 5.2 Reminder lifecycle (deadline-as-data, from `notifications-scheduling`)

**Upsert on write** — in the same transaction as the domain write:

```
on create/update of compliance_item C:
  if C.completed_on IS NULL:
    UPSERT reminders (subject_type='compliance_item', subject_id=C.id)   # UNIQUE(subject_type,subject_id)
      SET due_on = C.due_on,
          lead_days = COALESCE(item_override, user_settings.default_lead_days),
          last_notified_lead = NULL WHERE due_on changed
  else: DELETE its reminder row

on create/update of tenancy T:
  if T.status IN ('draft','active'):
    UPSERT reminders (subject_type='tenancy', subject_id=T.id)
      SET due_on = T.end_date, …same reset rule…
  if T.status IN ('ended','renewed'): DELETE its reminder row

on delete of subject: DELETE its reminder row   # app-level, since the FK is polymorphic
```

**Recurrence rollover on completion**
(`POST /compliance-items/:id/complete` with `{ completedOn, fileId? }`):

```
set C.completed_on = completedOn; C.document_file_id = fileId if given
if C.recurrence_months IS NOT NULL:
  C.due_on       = completedOn + recurrence_months months   # base choice flagged in §8 Q7
  C.completed_on = NULL                                     # same row rolls forward (spec); history question in §8 Q7
  upsert reminder with new due_on, last_notified_lead = NULL
else:
  delete the reminder (one-off item, now done)
```

**Daily scan (08:00 owner-local, cron)** — the skill's pattern verbatim:

```
scan(today):
  for r in SELECT * FROM reminders WHERE due_on <= today + max_lead:   # idx_reminders_due_on
    days_until = r.due_on - today
    for lead in sort_desc(r.lead_days):
      if days_until <= lead and (r.last_notified_lead IS NULL or r.last_notified_lead > lead):
        notify(owner, type_for(r.subject_type), title/body/link from subject,
               dedupe_key = '{type}:{r.id}:{lead}')
        r.last_notified_lead = lead
        break                      # at most one lead fires per scan; edits reset it
  run rent-overdue pass (§5.1)
  enqueue files.orphan_sweep      # pending files >24h, per file-storage-uploads
```

Editing a due date resets `last_notified_lead`, so the next scan simply
re-derives — nothing breaks if the worker was down a day (skill guarantee).

### 5.3 `notify()` and delivery

```
notify(user_id, type, {title, body, link_path, dedupe_key}):
  INSERT notifications … ON CONFLICT (dedupe_key) DO NOTHING; if conflict → stop
  if user_settings.email_enabled and type is email-worthy (catalog below):
    enqueue jobs(type='email.send', payload={notification_id})     # never inline (skill rule)
```

The jobs runner (invoked right after enqueue via `after()`, and swept by
cron) claims with
`UPDATE … SET status='running' WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`;
handlers are idempotent (`email.send` re-checks a sent marker on the
payload before sending); failures retry up to `max_attempts` with backoff,
then land in `dead` — surfaced as a count on Settings.

**Event catalog:**

| type | Trigger | In-app | Email |
|---|---|---|---|
| `cert.expiring` | compliance reminder lead crossed | ✅ | ✅ |
| `lease.expiring` | tenancy reminder lead crossed | ✅ | ✅ |
| `rent.overdue` | §5.1 daily pass | ✅ | ✅ |
| `contract.generated` | pipeline success | ✅ | — |
| `contract.generation_failed` | pipeline dead | ✅ | ✅ |

### 5.4 Contract-generation pipeline (from `pdf-document-generation`, verbatim)

`POST /tenancies/:id/contracts/generate` `{ kind, clauses: { pets, petsDescription?, garden } }`
→ validates tenancy exists & has no non-superseded contract of that kind
(409 CONFLICT otherwise) → enqueues `jobs(type='contract.generate')` →
`202` with the job id. UI polls the contracts list.

Job handler:

```
1. LOAD    owner (users), property, tenancy(+tenant) rows
2. BUILD   view model — ALL formatting happens here, never in the template:
     landlord.fullName            = owner.display_name
     tenant.fullName
     property.addressLine1 / .city / .postcode
     tenancy.startDateLong        = "1 September 2026"
     tenancy.endDateLong          = "31 August 2027"
     tenancy.termMonthsWords      = "twelve months"
     tenancy.rentAmountLegal      = "nine hundred and fifty pounds (£950.00)"
     tenancy.rentDueDayOrdinal    = "1st"
     tenancy.depositAmountLegal   = "one thousand and ninety-five pounds (£1,095.00)"
     tenancy.depositSchemeName / .depositReference
     clauses.pets / .petsDescription / .garden          # explicit booleans
3. VALIDATE with the Zod schema for template version 'lease/v1' —
   a missing/empty field fails the job loudly; a blank never renders
4. LAYOUT  lease/v1 directly into A4 pages (wrapping + pagination)
5. WRITE   a searchable PDF buffer with no browser/runtime process
6. STORE   via the files pattern: purpose='generated-lease', private,
           storage_key='generated-lease/<uuid>/lease-<tenancy-short-id>.pdf',
           checksum recorded, status='ready'
7. INSERT  generated_documents { doc_type:'lease', template_version:'lease/v1',
           subject_type:'tenancy', subject_id, file_id, input_snapshot: <view model> }
8. INSERT  contracts { tenancy_id, kind, source:'generated', file_id,
           generated_document_id, status:'draft' }
9. notify(owner, 'contract.generated', link to the Contracts tab)
```

Rules carried over verbatim: generation always runs in a background job
for durable retries and storage; signed/issued documents are never regenerated —
generate a new row, supersede the old; template changes bump the version
directory (`lease/v2/…`) and old versions stay in the repo;
`input_snapshot` makes every contract reproducible; standard PDF fonts are used;
golden-file test renders `lease/v1` with fixture data and diffs the PDF
text layer.

---

## §6 API Surface

`rest-api-design` conventions apply verbatim: JSON only; plural kebab-case
paths under `/api/v1`; UUIDs only; PATCH for partial update; state
transitions are POST verb sub-resources; page-based pagination
(`?page=1&perPage=25`, max 100, stable default sort); flat filter params;
`?sort=-created_at`; timestamps ISO-8601 UTC; money integer cents +
`currency`; `X-Request-Id` on every response.

**Response envelope (verbatim):**

```jsonc
// Single resource
{ "data": { "id": "…", "name": "…" } }

// List
{ "data": [ … ], "meta": { "page": 2, "perPage": 25, "total": 143, "totalPages": 6 } }

// Error (every non-2xx, no exceptions)
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ { "field": "…", "issue": "…" } ] } }
```

**Stable error codes (verbatim):** `VALIDATION_ERROR` (400),
`UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT`
(409), `RATE_LIMITED` (429), `INTERNAL` (500).

Permissions: single role in v1, so every route below requires the `admin`
role via a shared `requireAuth` wrapper (Supabase session → `users` row →
`status='active'` check — a suspended user with a valid session is
rejected, per the auth skill). The permission column exists so tenant-portal
permissions can be added later without restructuring.

| Method & Path | Permission | Purpose |
|---|---|---|
| `GET /api/v1/me` | any authenticated | Current user + settings |
| `PATCH /api/v1/settings` | admin | Timezone, lead-day defaults, grace days, clause defaults, email prefs |
| `GET /api/v1/stats/overview` | admin | Overview stat cards (dedicated stats endpoint per UI skill) |
| `GET /api/v1/properties` | admin | List; `?status=&propertyType=&page=&sort=` |
| `POST /api/v1/properties` | admin | Create |
| `GET /api/v1/properties/:id` | admin | Detail (incl. header mini-stats) |
| `PATCH /api/v1/properties/:id` | admin | Partial update |
| `POST /api/v1/properties/:id/archive` | admin | Transition `active → archived` |
| `POST /api/v1/properties/:id/unarchive` | admin | Transition back |
| `GET /api/v1/properties/:id/income?year=` | admin | §5.1 expected-vs-actual grid data |
| `GET /api/v1/properties/:id/compliance` | admin | Compliance items + reminder previews for the property |
| `GET /api/v1/tenants` | admin | List; `?q=` name/email search |
| `POST /api/v1/tenants` | admin | Create |
| `GET /api/v1/tenants/:id` | admin | Detail + cross-property tenancy history |
| `PATCH /api/v1/tenants/:id` | admin | Partial update |
| `GET /api/v1/tenancies` | admin | List; `?propertyId=&tenantId=&status=` |
| `POST /api/v1/tenancies` | admin | Create as `draft` (arms lease-expiry reminder per §5.2) |
| `GET /api/v1/tenancies/:id` | admin | Detail |
| `PATCH /api/v1/tenancies/:id` | admin | Edit while `draft` only (409 otherwise) |
| `POST /api/v1/tenancies/:id/activate` | admin | `draft → active` |
| `POST /api/v1/tenancies/:id/end` | admin | `active → ended` |
| `POST /api/v1/tenancies/:id/renew` | admin | Creates successor `draft` tenancy; old row → `renewed` on successor activation |
| `GET /api/v1/tenancies/:id/contracts` | admin | Contracts for a tenancy |
| `POST /api/v1/tenancies/:id/contracts` | admin | Attach an **uploaded** contract (`fileId`, kind, status) |
| `POST /api/v1/tenancies/:id/contracts/generate` | admin | §5.4 pipeline → 202 + job id |
| `GET /api/v1/contracts/:id` | admin | Detail |
| `POST /api/v1/contracts/:id/issue` | admin | `draft → issued` |
| `POST /api/v1/contracts/:id/sign` | admin | `issued → signed` (`signedOn`, optional signed-copy `fileId`) |
| `POST /api/v1/contracts/:id/supersede` | admin | Mark superseded |
| `GET /api/v1/transactions` | admin | List; `?propertyId=&direction=&category=&year=&page=` |
| `POST /api/v1/transactions` | admin | Record income/expense (rent rows require `tenancyId`+`rentPeriod`) |
| `PATCH /api/v1/transactions/:id` | admin | Correct a mis-entry |
| `DELETE /api/v1/transactions/:id` | admin | Remove a mis-entry (hard delete; it's a cash log, not a ledger) |
| `POST /api/v1/compliance-items` | admin | Create (upserts reminder per §5.2) |
| `PATCH /api/v1/compliance-items/:id` | admin | Edit due date / label / recurrence (resets reminder) |
| `POST /api/v1/compliance-items/:id/complete` | admin | §5.2 rollover; body `{ completedOn, fileId? }` |
| `DELETE /api/v1/compliance-items/:id` | admin | Remove item + its reminder |
| `PATCH /api/v1/reminders/:id` | admin | Override `lead_days` per item |
| `GET /api/v1/notifications` | admin | Inbox; `?unread=true&page=` |
| `POST /api/v1/notifications/:id/read` | admin | Mark read |
| `POST /api/v1/notifications/read-all` | admin | Mark all read |
| `GET /api/v1/reports/expenses?year=&format=csv` | admin | Tax-time export (also `propertyId=` filter) |
| `POST /api/v1/uploads` | admin | Multipart upload (internal-tool simplification the file skill allows): validates type/size/magic bytes per `purpose`, stores, returns `files` row |
| `GET /api/v1/files/:id/download` | admin (owner check later for tenants) | 302/JSON short-lived signed GET URL |
| `GET /api/v1/jobs?status=` | admin | Dead-letter visibility |
| `POST /api/v1/jobs/:id/retry` | admin | Re-queue a dead job |
| `POST /api/internal/cron/daily-scan` | `CRON_SECRET` header | 08:00 scan (§5.2/5.1) |
| `POST /api/internal/cron/run-jobs` | `CRON_SECRET` header | Jobs-runner sweep |

Upload policies (write into the spec per the file skill): `lease-doc`
PDF ≤ 25 MB; `certificate` PDF/JPEG/PNG ≤ 25 MB; `receipt` PDF/JPEG/PNG
≤ 10 MB; `generated-lease` server-side only. Magic-byte verification,
server-generated storage keys, never client filenames.

---

## §7 Phased Build Roadmap

Ten phases, each independently shippable, each one prompt in
`docs/FABLE_PROMPTS.md`. "Shippable" means: migrations applied, typecheck/
lint/build green, the phase's screens usable against real API routes with
seed data.

| Phase | Deliverable | Depends on |
|---|---|---|
| **0** | **Scaffold + CI.** Next.js App Router + TS strict + Tailwind + shadcn/ui; Prisma initialised (empty schema); local Supabase via CLI/Docker + `.env.example`; migration runner wired (`db/migrations/`, applied on `db:migrate`); shared API helpers (envelope, error map, `X-Request-Id`, Zod edge-validation wrapper); app shell (sidebar/topbar/toaster/error boundary) with placeholder pages; `GET /api/v1/health`; CI running typecheck+lint+build. **Not included:** any domain table, auth, or real screen. | — |
| **1** | **Auth + settings.** Migration 0001; Supabase Auth email+password; `requireAuth` (session → `users` row → `status='active'`); login/logout pages; `GET /me`, `PATCH /settings`; Settings screen; seeded admin user. **Not included:** any domain entity; tenant role behaviour (column exists, unused). | 0 |
| **2** | **Properties.** Migration 0002; properties CRUD + archive/unarchive transitions; Properties list (pattern #1, URL-held table state) + form (#3) + detail shell (#2) with empty tab placeholders; property seed. **Not included:** tenants, compliance prompts, stats. | 1 |
| **3** | **Tenants & tenancies.** Migration 0003; tenants CRUD; tenancies create/edit-while-draft + activate/end/renew transitions (renew = successor draft row, predecessor → `renewed`); New-tenancy form; Tenancy tab; Tenants list/detail with cross-property history; seed for all four tenancy states. **Not included:** contracts, rent tracking, lease-expiry reminders (§5.2 arming lands in Phase 7). | 2 |
| **4** | **File uploads + contract upload.** Migration 0004; private Supabase Storage bucket; `POST /uploads` (multipart, per-purpose validation, magic bytes) + `GET /files/:id/download` (signed URL); contracts CRUD for `source='uploaded'` + issue/sign/supersede transitions; Contracts tab (upload, download, status badges); activation rule "signed contract or explicit override". **Not included:** generated contracts, receipts UI (arrives with expenses), orphan sweep (needs jobs, Phase 8). | 3 |
| **5** | **Expenses.** Migration 0005; transactions POST/GET/PATCH/DELETE (expense paths); Expenses tab (table + filters + add-expense form with receipt upload + category donut); `GET /reports/expenses` CSV; expense seed across two years. **Not included:** rent/income rows in the UI, income grid, overview stats. | 4 |
| **6** | **Monthly Income + Overview.** §5.1 compute-on-read; `GET /properties/:id/income?year=`; Monthly Income grid per §4 wireframe 2 (record-payment popover → rent transaction, corrections on paid cells, yearly chart); `GET /stats/overview` + Overview screen (stats row #4 + recent activity). **Not included:** overdue *notifications* (display-only statuses here; alerts land in Phase 8). | 5 |
| **7** | **Compliance items + reminders data.** Migration 0006; compliance CRUD + complete-with-rollover (§5.2, including document upload); reminder upsert hooks on compliance *and* tenancy writes (lease-expiry reminders now armed, backfilled for existing seed tenancies); property Notifications tab (status chips, mark-complete dialog, lead-day override); add-compliance prompt after property create (flow 1, UK-default presets); compliance seed. **Not included:** the daily scan, notifications table, email — nothing *fires* yet. | 3 (tenancy hooks), 4 (cert upload); UI slots into 2's detail shell |
| **8** | **Notification engine.** Migration 0007; `notify()` + dedupe; jobs table + runner (claim via `FOR UPDATE SKIP LOCKED`, retries, dead state) + cron routes with `CRON_SECRET`; daily 08:00 scan wired to §5.2 leads + §5.1 rent-overdue pass; Resend email via queued `email.send`; Notifications inbox screen + sidebar badge; files orphan sweep; failed-job count on Settings; test-clock support (`?today=` on the internal scan route, dev only). **Not included:** contract generation. | 5+6 (overdue pass), 7 (reminders to scan) |
| **9** | **Auto contract generation.** Migration 0008; `templates/documents/lease/v1/` preserves the versioned wording; §5.4 pipeline end-to-end (view-model builder with legal formatting, Zod-per-template-version, direct A4 PDF layout/write, store, `generated_documents`, contract `draft`, notify); generate action + "Generating…" state in Contracts tab; clause toggles from tenancy/settings; golden-file PDF test; renewal generation (`kind='renewal'`) off the expiry flow. **Not included:** e-signature; template `v2`+. | 4 (files/contracts), 8 (jobs + notify) |

**Deferred scope (not in the roadmap, no prompts written):** Stripe rent
collection (`payments-billing` skill, auto-writing rent transactions via
`invoice.paid`), bank CSV import, e-signature integration. Per §8 Q2 these
stay out until explicitly requested; the schema already leaves room
(`payments.subject_type='rent_invoice'`, transactions unchanged).

Sequencing rationale: 0–6 is the spec's "Phase 1" (a fully usable manual
tracker — you could run the portfolio on it), 7–9 is the spec's "Phase 2"
split into data (7), engine (8), and the one feature needing both plus
the background-job/storage pipeline (9). Riskier external integrations
land last and remain isolated.

---

## §8 Open Questions for You

**Q1. Stack: Fastify+Vite (spec/siblings) vs Next.js+Prisma+Supabase (this
plan).** Your prompt's §2 instruction locked Next.js+Prisma+Supabase, and
that is what §2–§7 assume. For the record, the explicit recommendation and
tradeoffs: **I'd stay with Next.js+Prisma+Supabase for this project.**
For a single-admin internal tool built primarily by an AI coding agent,
one deployable with managed auth/storage removes the failure modes that
actually burn build time (CORS, cookie domains across two origins, two
dev servers, hand-rolled session code, MinIO setup), and you've proven the
pattern end-to-end once already. The costs are real but bounded: (a) this
project diverges from the three sibling projects' Fastify+Vite family, so
skill snippets (Fastify middleware, pg-boss) need light translation —
though everything contractual (envelope, error codes, SQL, algorithms,
UI patterns) transfers unchanged; (b) pg-boss is replaced by a cron-driven
jobs table (§2), slightly weaker than a persistent worker (max ~1-min
sweep latency vs instant pickup — irrelevant at this scale); (c) if the
tenant portal someday becomes a real multi-user product, Fastify's
separated API would have been marginally cleaner, but Next.js route
handlers scale fine to that. Revert to the spec stack only if family-wide
consistency matters more to you than build friction. **Decision assumed:
Next.js+Prisma+Supabase** — say so if you want this flipped before Phase 0.

**Q2. Roadmap tail.** The spec's optional Phase 3 (Stripe rent collection,
bank CSV import, e-signature) is **excluded from the §7 roadmap and has no
prompts** — listed only as "Deferred scope". Confirm that's what you want,
or I'll add phases 10–12.

**Q3. Jurisdiction.** UK defaults assumed throughout: seed compliance
cadences (gas 12mo / EICR 60mo / EPC 120mo), GBP, `Europe/London` default
timezone, AST language in the lease template, deposit-scheme copy. All are
data/config, not logic. Confirm UK.

**Q4. Tenant portal.** Assumed **no portal in v1**, per spec. Defensive
build-out is deliberately minimal: `users.role` CHECK includes `'tenant'`,
permissions gate every route, files carry `owner_id` — and nothing more
(no tenant auth flows, no RLS policies, no per-tenant scoping). Confirm
this level is right; building more now would be speculative.

**Q5. Working title.** Kept generic: **"Property Management Dashboard"**
(repo `property-manager`). Rename any time before Phase 0 makes it sticky
in package names.

**Q6. Periodic tenancies.** The spec's `end_date` is a hard column and the
sketch implies NOT NULL — but UK ASTs commonly roll into a **statutory
periodic tenancy** with no end date after the fixed term. v1 models this
as "extend `end_date`" or "renew". If you want a real
`is_periodic`/nullable-`end_date` representation (affects expiry reminders
and the income grid's far edge), say so before Phase 3 locks the migration.

**Q7. Recurrence rollover semantics.** Two sub-decisions in §5.2 I made
that the spec leaves open: (a) the new due date is **`completed_on` +
recurrence** (matches how UK cert expiry actually works — dated from
inspection), not `due_on` + recurrence; (b) rollover reuses the **same
row** (spec wording: "rolls due_on forward"), so per-cycle history isn't
kept as rows — old certificate *files* remain in storage but are unlinked
when a new cert is attached. If you want an auditable per-cycle history
(one row per certificate ever held), flag before Phase 7.

**Q8. `deposit_scheme` is free text.** The three UK TDP schemes (DPS,
TDS, mydeposits) would make a clean CHECK/dropdown, but custodial vs
insured variants and non-UK future use argue for text + UI suggestions.
Went with free text; cheap to tighten later (additive CHECK).

**Q9. Tenant email uniqueness.** `tenants.email` is nullable and
**non-unique** (spec doesn't constrain it; a couple could share an email).
When the tenant portal arrives, email becomes the login key and will need
dedupe/uniqueness — acceptable to defer?

**Q10. Skill deviation — `notifications.dedupe_key`.** One column added to
the skill's notifications schema (plus a partial unique index) so
rent-overdue and lead notifications are idempotent at the DB level rather
than by query-before-insert. Flagging since the skill schema was otherwise
adopted verbatim.

**Q11. Deployment target.** Vercel + Supabase cloud is assumed (Vercel
Cron for the two internal routes). PDF generation is direct TypeScript and
has no browser or platform binary dependency. If you'd rather self-host (a
Docker box you control), node-cron and pg-boss become viable again — it
changes Phase 8/9 implementation details but no interfaces. Decide by end
of Phase 6 (first phase that doesn't care is 0–6).

**Q12. Rent-overdue grace period.** Spec says "N days past due". Defaulted
to **3 days**, configurable in Settings (`rent_overdue_grace_days`).
Confirm the default.

**Q13. Joint tenancies.** `tenancies.tenant_id` is single-occupancy by
spec — two names on one AST can't be modelled (workaround: notes field, or
one tenant record per household). Fine for v1? A `tenancy_tenants` join
table later is an additive migration, but the lease template's
`{{tenant.fullName}}` would also need a v2.
