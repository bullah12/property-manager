# FABLE_AUTONOMOUS_PROMPT — Unattended Full Build

A single paste-ready prompt for building the entire app end-to-end in one
unattended run (phases 0–9), with no human in the loop. Use this **instead
of** pasting `docs/FABLE_PROMPTS.md` phase-by-phase when you want a
fire-and-forget overnight build.

## What to expect from an unattended run

- **Outcome:** a complete, committed, locally-runnable and tested codebase
  through as many of the 10 phases as it reaches — **not** a live deployed
  website. Deployment needs your own Supabase project + host + real API
  keys, done later while awake.
- **Externals are mocked/local:** local Supabase (Docker) for
  Postgres/Auth/Storage; email logged instead of sent; Chromium PDF runs
  locally. No secrets from you are required for the build to run.
- **Branch:** builds on `claude/rental-dashboard-plan-3nsmk8`, committing +
  pushing after each phase, so PR #1 grows incrementally.
- **Open questions:** PLAN.md §8's assumed answers are treated as final; the
  agent never stops to ask.
- **Resumable:** if it doesn't reach Phase 9 in your window,
  `docs/PROGRESS.md` says exactly where to resume — paste
  "continue from PLAN.md §7 Phase N".

---

## The prompt (copy everything in the fenced block)

````
Build the Property Management Dashboard end-to-end, autonomously, in one
unattended run. I am asleep and CANNOT answer questions — make every
decision yourself using the rules below and keep going until you finish or
are genuinely blocked. Do not stop for confirmation between phases.

## Source of truth
Read these two files in this repo IN FULL before writing any code, and treat
them as binding:
- docs/PLAN.md — the product/technical plan (data model §3, screens §4,
  algorithms §5, API §6, the 10-phase roadmap §7, open questions §8).
- docs/FABLE_PROMPTS.md — one prompt per phase; each phase's Scope, "Do NOT",
  and proof checklist are binding for that phase.

## Decisions are already made — do NOT ask me anything
Every item in PLAN.md §8 is RESOLVED: adopt the stated assumed/decided answer
as final. In particular: stack = Next.js + Prisma + Supabase (§8 Q1);
Stripe rent collection, bank-CSV import, and e-signature are OUT of scope
(§8 Q2); UK defaults everywhere (§8 Q3); no tenant portal in v1, role column
present but unused (§8 Q4); rent-overdue grace = 3 days (§8 Q12); recurrence
rolls from completed_on on the same row (§8 Q7); deposit_scheme is free text
(§8 Q8); single-occupancy tenancies (§8 Q13). If you hit any other ambiguity,
pick the simplest choice consistent with PLAN.md, record it in
docs/PROGRESS.md under "Decisions", and continue — never block on it.

## How to run the build
Work through PLAN.md §7 phases 0 → 1 → 2 → … → 9 strictly in order. For each
phase, execute the corresponding prompt in docs/FABLE_PROMPTS.md.

After EACH phase, in this order:
1. Run typecheck, lint, and build. All three MUST pass before you start the
   next phase. If any fails, diagnose and fix it yourself and re-run until
   green — do not advance on a red build.
2. Run that phase's proof from its FABLE_PROMPTS.md checklist. Instead of
   showing it to me interactively, append the result (commands + output +
   pass/fail) to docs/PROGRESS.md.
3. Commit with message "Phase N: <deliverable>" and push to the branch
   claude/rental-dashboard-plan-3nsmk8 (this updates PR #1). Only ever commit
   a green, building state. Never force-push.

## Running unattended without my credentials
You have no access to my third-party accounts, so never block waiting for a
secret:
- Postgres + Auth + Storage: use LOCAL Supabase via the Supabase CLI/Docker.
  Everything must run and be verifiable locally with no secrets from me.
- Email (Resend): implement it behind the sendEmail() wrapper but run in a
  dev/mock mode that LOGS the email payload instead of sending. Add the real
  env var to .env.example and note it in PROGRESS.md. Do not attempt to send
  real email.
- PDF (Phase 9): run headless Chromium LOCALLY (Playwright). Produce a real
  sample PDF into the repo's artifacts and reference it in PROGRESS.md.
- Seed data must make every phase's proof runnable offline (per PLAN.md §3
  seed spec), including the test-clock ?today= path for the daily scan.

## Error handling (unattended)
- Fix your own failures: iterate on typecheck/lint/build and proof failures
  until they pass.
- If you are truly blocked on something you cannot self-provision: commit the
  last green state, write in docs/PROGRESS.md EXACTLY what is blocked and what
  you need from me, then — if the blocked piece is not a hard dependency for
  later phases — stub it cleanly behind its interface and continue to the next
  phase. Prefer completing as many phases as possible. Only stop entirely if a
  blocker prevents all further progress.
- Never leave the repo non-building at a pushed commit (a single final commit
  clearly labelled "WIP: blocked — see PROGRESS.md" is the only exception).

## Scope discipline
Build exactly what PLAN.md §7 phases 0–9 specify — no more. Deferred scope
(Stripe, bank CSV, e-sign) stays out. Do not pull work forward from a later
phase into an earlier one; respect each phase's "Do NOT" line.

## Keep docs/PROGRESS.md as a running log
Create it in Phase 0 and update it after every phase: a phase-by-phase table
(phase / status / proof result / any deviation from PLAN.md), a "Decisions"
section for choices you made, a "Blocked / needs me" section, and a
"How to run locally" section (exact commands to start the app + seed + log in
as the seeded admin). If you ever have to change a plan decision, edit
docs/PLAN.md first, then note it here — never let code and plan disagree.

## When you finish (or run out of runway)
Leave docs/PROGRESS.md as the complete status: which phases are green, the
local run commands, which proofs passed, any sample artifacts (e.g. the
generated lease PDF), and anything waiting on me. If not all phases are done,
state the exact next step ("resume at PLAN.md §7 Phase N"). Confirm the whole
repo typechecks, lints, and builds at the final commit.

Begin with Phase 0 now and proceed autonomously through Phase 9.
````
