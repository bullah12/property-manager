BEGIN;

CREATE TABLE tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name  text NOT NULL,
  email      citext,          -- nullable; not unique (see PLAN.md §8 Q9 — becomes the portal login key later)
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
  end_date             date NOT NULL,                 -- fixed term; periodic tenancies: PLAN.md §8 Q6
  rent_amount_cents    integer NOT NULL CHECK (rent_amount_cents > 0),
  rent_due_day         integer NOT NULL CHECK (rent_due_day BETWEEN 1 AND 28),
  deposit_amount_cents integer CHECK (deposit_amount_cents >= 0),
  deposit_scheme       text,                          -- free text; enum candidates in PLAN.md §8 Q8
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
