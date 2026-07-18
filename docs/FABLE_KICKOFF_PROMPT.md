# Fable Kickoff Prompt — Property Management Dashboard

## What this is

Everything Fable already produced for this project (during earlier planning
work in the shared template-library repo) lives in `docs/spec/`:

- `docs/spec/PROJECT_SPEC.md` — the locked product spec: data model, screens,
  key flows, API surface, phasing assumptions.
- `docs/spec/skills/*/SKILL.md` — eight shared conventions this project must
  follow (auth, database-schema-design, rest-api-design,
  file-storage-uploads, notifications-scheduling, payments-billing,
  pdf-document-generation, dashboard-ui-patterns), each with its own default
  stack, schema, and best-practices/pitfalls list.
- `docs/spec/skills/pdf-document-generation/lease-agreement.template.html` —
  a worked example lease template (Handlebars merge fields, pets/garden
  clause toggles).

That spec is intentionally **compact** — it names tables and screens but
doesn't spell out migrations, algorithms, or a granular build sequence. The
prompt below asks Fable to do exactly that: turn the spec into a full plan
(`docs/PLAN.md`) plus a phase-by-phase prompt pack (`docs/FABLE_PROMPTS.md`)
that you can then paste into a coding agent one phase at a time — the same
two-document pattern already used successfully for a sibling project
(Ascent Ledger: `docs/PLAN.md` + `docs/FABLE_PROMPTS.md`, phases 0–7, each
independently shippable and independently promptable).

**How to use it:** paste the fenced prompt block below into a fresh Fable
session pointed at this repo (so it can read `docs/spec/` directly). The
prompt also repeats the essential content inline, so it still works if
Fable can't read repo files in your setup.

---

## The prompt (copy everything in the fenced block)

````
I want a detailed product & technical plan for a new app, plus a set of
phased build prompts I can paste into a coding agent afterwards. This is a
PLANNING request only — do not write any application code, do not scaffold
a repo, do not pick package versions beyond what's already named below.

## Product

A dashboard for a single owner managing multiple rental properties:
properties, tenants, lease contracts (both stored uploads and
auto-generated from a template), rent income, expenses, and deadline
reminders (gas/electrical certificates, EPC, inspections, lease expiry).
Single admin user in v1, no tenant-facing portal — but don't design
anything that would block adding tenant logins later. Web-first, no
native mobile app. This is a real tool I intend to use, not a toy.

## Reference material — read in full if you can see this repo's files

- `docs/spec/PROJECT_SPEC.md` — the locked spec. Treat every table, field,
  and flow in it as a decided fact; your job is to add depth, sequencing,
  and buildable detail, not to redesign it. If you think something in it
  is wrong or underspecified, raise it in an "Open Questions" section
  instead of silently changing it.
- `docs/spec/skills/*/SKILL.md` — eight shared conventions this project
  must follow exactly, not reinvent: auth, database-schema-design,
  rest-api-design, file-storage-uploads, notifications-scheduling,
  payments-billing (phase 2 only), pdf-document-generation,
  dashboard-ui-patterns.
- `docs/spec/skills/pdf-document-generation/lease-agreement.template.html`
  — starting point for the Auto Contract Generation feature.

If you can't read repo files in this session, everything essential is
repeated below — treat it with the same authority as the files above.

### Condensed spec (fallback if you have no file access)

**Shared skills applied:**
| Skill | How it's used here |
|---|---|
| auth | Single admin (owner) today; standard pattern so tenant portal logins can be added later |
| database-schema-design | cents for money, date-typed due dates, text+CHECK statuses, forward-only migrations |
| rest-api-design | Small internal API, same conventions as every other project in this family |
| file-storage-uploads | Lease PDFs, certificates, receipts — all private, presigned GET |
| notifications-scheduling | Daily-scan reminder pattern, 60/30/7-day leads |
| pdf-document-generation | Auto Contract Generation: lease template → PDF on new tenancy |
| payments-billing | Phase 2 only: automated rent collection via Stripe invoices |
| dashboard-ui-patterns | The whole app: property detail page with tabs is the detail-screen pattern |

**Data model (sketch — turn this into real migration-ready SQL, don't
change the shape without flagging it):**
```
users              (owner as admin; timezone setting drives due-date logic)
properties         nickname, address_line1, address_line2, city, postcode,
                   property_type CHECK(house|flat|hmo|commercial),
                   bedrooms int, purchase_price_cents NULL, notes,
                   status CHECK(active|archived)
tenants            full_name, email, phone, notes
                   -- a person; may rent different properties over time
tenancies          property_id FK, tenant_id FK,
                   start_date date, end_date date,
                   rent_amount_cents, rent_due_day int CHECK 1..28,
                   deposit_amount_cents, deposit_scheme, deposit_reference,
                   status CHECK(draft|active|ended|renewed)
contracts          tenancy_id FK, kind CHECK(lease|renewal|addendum),
                   source CHECK(generated|uploaded),
                   file_id FK files, generated_document_id FK NULL,
                   signed_on date NULL, status CHECK(draft|issued|signed|superseded)
transactions       property_id FK, tenancy_id FK NULL,
                   direction CHECK(income|expense),
                   category (income: rent|deposit|other;
                             expense: repairs|maintenance|insurance|mortgage_interest|
                                      certificates|agent_fees|utilities|other),
                   amount_cents, occurred_on date, description,
                   receipt_file_id FK NULL,
                   rent_period date NULL   -- first-of-month marker for rent rows
compliance_items   property_id FK,
                   kind CHECK(gas_certificate|electrical_eicr|epc|
                              smoke_co_check|inspection|insurance|custom),
                   label, due_on date, completed_on date NULL,
                   document_file_id FK NULL,
                   recurrence_months int NULL   -- gas: 12, EICR: 60, EPC: 120
reminders          subject_type CHECK(compliance_item|tenancy), subject_id,
                   due_on, lead_days int[] DEFAULT '{60,30,7}',
                   last_notified_lead int NULL
notifications, jobs, files, generated_documents    -- standard shape, see skills
payments           -- phase 2 only, subject='rent_invoice'
```

Rent tracking is v1-manual: the Monthly Income tab compares `tenancies`
(expected: active tenancy × rent_amount × due day) against `transactions`
rent rows (actual). "Overdue" = expected period with no matching
transaction N days past due → notification. Nothing is written until
money actually arrives — no separate "expected rent row" table.

Reminder lifecycle: creating/updating a `compliance_item` or `tenancy`
upserts its `reminders` row (tenancy reminder targets `end_date`).
Completing a compliance item with a `recurrence_months` rolls `due_on`
forward and resets the reminder. A daily 08:00 scan sends at 60/30/7-day
leads (per-item overridable).

**Screens:** Overview (stats row: income actual vs expected, overdue rent
count, upcoming deadlines, YTD expenses); Properties list → Property
detail (tabs: Contracts, Monthly Income, Expenses, Notifications,
Tenancy); Tenants list → detail (cross-property tenancy history);
Notifications inbox (global unread feed + all upcoming deadlines);
Settings (timezone, default lead times, lease clause toggles, email
preferences).

**Key flows:**
1. Add property → prompted to add compliance items (gas cert, EICR, EPC)
   → reminders auto-created.
2. Add tenant/start tenancy → tenancy `draft` → Auto Contract Generation
   (view-model from owner+property+tenancy, clause toggles) → background
   job renders PDF → contract `draft` → owner reviews → `issued` →
   upload/mark `signed` → tenancy `active` → lease-expiry reminder armed.
3. Record rent → Monthly Income inline action → transaction row → month
   turns green. Overdue detection is automatic (daily scan).
4. Certificate renewal → notification at 60/30/7 days → owner books
   engineer → marks complete + uploads new cert → due date rolls forward.
5. Renewal/expiry → lease-expiry reminder → owner generates a renewal
   contract (`kind='renewal'`) or lets it lapse (`ended`).

**API surface (representative):**
```
GET/POST/PATCH /api/v1/properties            /:id
GET/POST       /api/v1/tenants               /:id
POST /api/v1/tenancies                       POST /api/v1/tenancies/:id/activate
POST /api/v1/tenancies/:id/contracts/generate     # → job → generated_documents
GET  /api/v1/properties/:id/income?year=     POST /api/v1/transactions
GET  /api/v1/properties/:id/compliance       POST /api/v1/compliance-items/:id/complete
GET  /api/v1/notifications                   POST /api/v1/notifications/:id/read
GET  /api/v1/reports/expenses?year=&format=csv
```

**Tech stack (as specced — see "Open questions" #1 below before you lock
this in):** Node 22 + TypeScript, Fastify, Zod validation, Postgres 16
with forward-only SQL migrations (Drizzle or Kysely for queries), React 18
+ TypeScript + Vite SPA (shadcn/ui + Tailwind, TanStack Query/Table,
react-hook-form), pg-boss job queue, Resend/Postmark email, S3-compatible
storage (MinIO in dev) + sharp, Stripe for phase-2 rent collection,
HTML + headless Chromium for PDF generation.

## What to produce

### 1. `docs/PLAN.md`

- **§1 Product Concept** — elevator pitch, primary user, an explicit
  non-goals/non-features list (expand the spec's assumptions into a real
  list: no tenant portal in v1, no native app, single currency, etc).
- **§2 Tech Stack** — confirm or revise the stack above in a table with a
  one-line "why" per row.
- **§3 Data Model** — every table above turned into real, migration-ready
  SQL following the `database-schema-design` conventions exactly (full
  column lists, types, FK `ON DELETE` behavior, indexes for every FK and
  for the real query patterns: a property's transactions by year, active
  tenancies by property, reminders due soon).
- **§4 Screens** — expand the screens list into full detail, naming which
  of the `dashboard-ui-patterns` five core patterns each screen uses, plus
  a wireframe-in-words for the two most complex screens (Property detail
  tabs; the Monthly Income grid).
- **§5 Key Algorithms** — pseudocode-level detail for: rent-overdue
  detection (expected-vs-actual matching described above); the reminder
  lifecycle (upsert/recurrence-rollover/daily-scan, reusing
  `notifications-scheduling`'s pattern verbatim); the contract-generation
  pipeline (view-model builder → Zod validate → render → Chromium → store
  via `file-storage-uploads` → `generated_documents` row, reusing
  `pdf-document-generation`'s pipeline verbatim against the lease
  template's actual merge fields).
- **§6 API Surface** — the full route table (method, path, permission,
  purpose) per `rest-api-design` conventions, including its response
  envelope and error-code list verbatim.
- **§7 Phased Build Roadmap** — THE MAIN DELIVERABLE. Explode the spec's
  three-phase sketch (Phase 1: properties/tenants/tenancies/contract
  upload/expenses/income; Phase 2: reminders+notifications+auto contract
  generation; Phase 3 optional: Stripe/bank-import/e-sign) into 6–10
  granular, independently shippable phases as a table (Phase | Deliverable
  | Depends on), starting from Phase 0 (repo scaffold + CI, no data model
  yet). Each phase must be small enough to become its own prompt in
  `docs/FABLE_PROMPTS.md` and must say what it explicitly does NOT include.
- **§8 Open Questions for You** — anything that needs a human decision
  before or during the build. Seed it with the list at the bottom of this
  prompt, and add anything else you notice.

### 2. `docs/FABLE_PROMPTS.md`

One paste-ready prompt per §7 phase, matching this shape exactly:

- A short top note: paste one phase at a time in the same session, wait
  for it to be confirmed working before sending the next, and reference
  `docs/PLAN.md` by section number rather than re-explaining the product.
- Each phase's prompt has: a "Continuing <project> (PLAN.md §7 Phase N)"
  opener, a bullet "Scope" section, an explicit "Do NOT:" line naming
  what belongs to later phases, and a "When done, give me:" checklist
  (short summary + confirm typecheck/lint/build pass + one phase-specific
  proof, e.g. "a sample generated lease PDF" or "three example
  rent-overdue detections against seed data").
- Close with a short "General prompting tips" section: flag scope drift
  immediately rather than letting it compound; describe a bug as its own
  short message instead of re-pasting a whole phase; keep `docs/PLAN.md`
  as the single edit point if requirements change mid-build.

## Open questions I already know about — put these in §8, and ask me
## directly first if any of them blocks you from finishing the plan

1. **Stack.** `PROJECT_SPEC.md` specifies a separate Fastify API + Vite
   SPA (above), matching three other projects in the same shared-skill
   family. A different, already-built project of mine used a Next.js App
   Router monolith instead (Prisma → Postgres, Supabase for
   Auth/Storage) and that pattern is proven to build smoothly end-to-end
   with an AI coding agent. Recommend one explicitly, with tradeoffs
   (mainly: consistency with sibling projects vs. fewer moving parts and
   a stack already proven in practice) — don't just silently pick one.
2. Is Phase 2 (reminders/notifications, auto contract generation) and
   Phase 3 (Stripe rent collection, bank CSV import, e-signature) both
   actually in scope for the roadmap, or should Phase 3 be dropped
   entirely until I ask for it?
3. Compliance defaults (gas certificate 12 months, EICR 5 years, EPC 10
   years) are UK-specific and marked configurable, not hardcoded — confirm
   UK is the right jurisdiction default for the seed data and UI copy.
4. Confirm no tenant portal in v1 remains true — it affects how much the
   `auth` skill's roles table is built out defensively now vs. later.
5. Working title for the project — fine to keep it generic ("Property
   Management Dashboard") if you'd rather not name it yet.

When done, give me both documents in full, plus a short summary of any
place you deviated from `PROJECT_SPEC.md` and why.
````

---

## Before you send this

Quick things worth deciding (or deliberately leaving for Fable to ask
about) before you paste the prompt:

- **Stack pick (open question #1 above)** — this is the one real fork in
  the road. If you already know you want to match your other project's
  Next.js + Prisma + Supabase setup, say so up front in the prompt and
  delete the "recommend one" framing — it'll save Fable a whole
  back-and-forth.
- **Phase 2/3 scope (#2)** — if Stripe rent collection, bank import, and
  e-signature are firmly "someday, not now," tell Fable to drop them from
  the roadmap table entirely rather than leaving them as a dangling
  optional phase.
- **Jurisdiction (#3)** — confirm UK compliance defaults, or say which
  country's certificate/inspection cadence to use instead.
- **Tenant portal (#4)** and **project name (#5)** — low-stakes, fine to
  let Fable ask or default.

## What happens after Fable replies

You'll have `docs/PLAN.md` and `docs/FABLE_PROMPTS.md` in hand — the same
pair the sibling project used. From there the workflow that already
worked once: paste `docs/FABLE_PROMPTS.md`'s Phase 0 prompt into a coding
agent (Fable itself, or Claude Code) in this repo, confirm it works, then
send Phase 1, and so on — one phase per message, never queued up front.
