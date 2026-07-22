BEGIN;

ALTER TABLE properties
  ADD COLUMN current_monthly_income_cents integer
    CHECK (current_monthly_income_cents IS NULL OR current_monthly_income_cents >= 0),
  ADD COLUMN potential_monthly_income_cents integer
    CHECK (potential_monthly_income_cents IS NULL OR potential_monthly_income_cents >= 0),
  ADD COLUMN income_basis text NOT NULL DEFAULT 'gross_property'
    CHECK (income_basis IN ('gross_property', 'owner_share')),
  ADD COLUMN ownership_status text NOT NULL DEFAULT 'verified'
    CHECK (ownership_status IN ('verified', 'inferred', 'pending'));

COMMIT;
