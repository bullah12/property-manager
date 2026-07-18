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
