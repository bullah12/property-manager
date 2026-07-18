BEGIN;

-- notifications-scheduling skill schema + one flagged addition: dedupe_key,
-- so "one rent-overdue notification per tenancy per period" is enforced by
-- the database, not by hope (deviation noted in PLAN.md §8 Q10).
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL,     -- event catalog in PLAN.md §5.4
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
-- internal tables because this deploy has no long-lived worker — PLAN.md §2).
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
