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
