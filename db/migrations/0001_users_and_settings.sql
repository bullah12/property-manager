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
