BEGIN;

-- Source records and assumptions for the investment dashboard. Ownership
-- percentages continue to come exclusively from the effective-dated
-- ownership_events ledger introduced in migration 0018.
ALTER TABLE properties ADD COLUMN purchase_completion_date date;

CREATE TABLE acquisition_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('deposit','purchase_tax','legal','survey_valuation','mortgage_fee','initial_refurbishment','furniture_setup','other')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  occurred_on date NOT NULL,
  funding_source text NOT NULL CHECK (funding_source IN ('owner','financed','property_funds')),
  owner_id uuid,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (property_id, workspace_id) REFERENCES properties(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id, workspace_id) REFERENCES owners(id, workspace_id) ON DELETE RESTRICT,
  CHECK ((funding_source = 'owner' AND owner_id IS NOT NULL) OR funding_source <> 'owner'),
  UNIQUE (id, workspace_id)
);
CREATE INDEX idx_acquisition_costs_workspace_property_date ON acquisition_costs(workspace_id, property_id, occurred_on);

CREATE TABLE owner_investment_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('initial_contribution','additional_contribution','owner_funded_expense','capital_return','profit_distribution','drawing','adjustment_in','adjustment_out')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  occurred_on date NOT NULL,
  description text,
  reason text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (property_id, workspace_id) REFERENCES properties(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id, workspace_id) REFERENCES owners(id, workspace_id) ON DELETE RESTRICT,
  CHECK (entry_type NOT IN ('adjustment_in','adjustment_out') OR length(trim(reason)) > 0),
  UNIQUE (id, workspace_id)
);
CREATE INDEX idx_owner_investment_workspace_property_date ON owner_investment_entries(workspace_id, property_id, occurred_on);
CREATE INDEX idx_owner_investment_workspace_owner_date ON owner_investment_entries(workspace_id, owner_id, occurred_on);

CREATE TABLE property_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id uuid NOT NULL,
  lender text,
  name text NOT NULL,
  original_balance_cents bigint NOT NULL CHECK (original_balance_cents >= 0),
  opening_balance_cents bigint NOT NULL CHECK (opening_balance_cents >= 0),
  interest_rate_bps integer CHECK (interest_rate_bps >= 0),
  repayment_type text NOT NULL CHECK (repayment_type IN ('interest_only','repayment')),
  monthly_payment_cents bigint CHECK (monthly_payment_cents >= 0),
  started_on date NOT NULL,
  ends_on date,
  secured boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (property_id, workspace_id) REFERENCES properties(id, workspace_id) ON DELETE CASCADE,
  CHECK (ends_on IS NULL OR ends_on >= started_on),
  UNIQUE (id, workspace_id)
);
CREATE INDEX idx_property_loans_workspace_property ON property_loans(workspace_id, property_id);

CREATE TABLE loan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  loan_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('additional_borrowing','principal_repayment','interest','finance_cost','refinance_in','refinance_out','balance_adjustment')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  occurred_on date NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (loan_id, workspace_id) REFERENCES property_loans(id, workspace_id) ON DELETE CASCADE,
  UNIQUE (id, workspace_id)
);
CREATE INDEX idx_loan_events_workspace_loan_date ON loan_events(workspace_id, loan_id, occurred_on);

CREATE TABLE property_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id uuid NOT NULL,
  value_cents bigint NOT NULL CHECK (value_cents > 0),
  valued_on date NOT NULL,
  source text NOT NULL CHECK (source IN ('purchase','user','professional','estimated')),
  notes text,
  evidence_file_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (property_id, workspace_id) REFERENCES properties(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (evidence_file_id, workspace_id) REFERENCES files(id, workspace_id) ON DELETE NO ACTION,
  UNIQUE (id, workspace_id)
);
CREATE INDEX idx_property_valuations_workspace_property_date ON property_valuations(workspace_id, property_id, valued_on DESC);

CREATE TABLE investment_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id uuid NOT NULL,
  expected_monthly_rent_cents bigint CHECK (expected_monthly_rent_cents >= 0),
  rent_growth_bps integer CHECK (rent_growth_bps >= -10000),
  occupancy_bps integer CHECK (occupancy_bps BETWEEN 0 AND 10000),
  expense_inflation_bps integer CHECK (expense_inflation_bps >= -10000),
  appreciation_bps integer CHECK (appreciation_bps >= -10000),
  mortgage_interest_bps integer CHECK (mortgage_interest_bps >= 0),
  monthly_repayment_cents bigint CHECK (monthly_repayment_cents >= 0),
  horizon_months integer NOT NULL DEFAULT 60 CHECK (horizon_months BETWEEN 1 AND 600),
  target_return_bps integer,
  target_recovery_date date,
  target_ltv_bps integer CHECK (target_ltv_bps BETWEEN 0 AND 10000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (property_id, workspace_id) REFERENCES properties(id, workspace_id) ON DELETE CASCADE,
  UNIQUE (property_id, workspace_id),
  UNIQUE (id, workspace_id)
);

CREATE TABLE planned_investment_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id uuid NOT NULL,
  category text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  planned_on date NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (property_id, workspace_id) REFERENCES properties(id, workspace_id) ON DELETE CASCADE,
  UNIQUE (id, workspace_id)
);
CREATE INDEX idx_planned_costs_workspace_property_date ON planned_investment_costs(workspace_id, property_id, planned_on);

COMMIT;
