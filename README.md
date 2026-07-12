# property-manager

A dashboard for a single owner managing multiple rental properties:
properties, tenants, lease contracts (stored and auto-generated), rent
income, expenses, and deadline reminders (certificates, inspections, lease
expiry).

This repo currently contains **planning material only** — no application
code yet.

- [`docs/spec/PROJECT_SPEC.md`](docs/spec/PROJECT_SPEC.md) — the locked
  product spec (data model, screens, key flows, API surface, phasing
  assumptions), plus [`docs/spec/skills/`](docs/spec/skills/), the eight
  shared conventions (auth, database schema design, REST API design, file
  storage/uploads, notifications/scheduling, payments/billing, PDF/document
  generation, dashboard UI patterns) this project is built from. Both were
  extracted from earlier Fable planning work in a shared template-library
  repo.
- [`docs/FABLE_KICKOFF_PROMPT.md`](docs/FABLE_KICKOFF_PROMPT.md) — a
  ready-to-paste prompt for Fable that turns the spec above into a full
  `docs/PLAN.md` (detailed data model, algorithms, granular phased roadmap)
  and a `docs/FABLE_PROMPTS.md` (one build prompt per phase) — the next
  step before any code gets written.
