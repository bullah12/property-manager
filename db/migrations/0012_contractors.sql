BEGIN;

CREATE TABLE contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  contact_name text,
  trade text NOT NULL,
  email citext,
  phone text,
  website text,
  service_area text,
  registration_number text,
  notes text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contractors_business_name_not_blank CHECK (btrim(business_name) <> ''),
  CONSTRAINT contractors_trade_valid CHECK (trade IN (
    'plumber', 'electrician', 'gas_engineer', 'heating_engineer', 'builder',
    'handyman', 'roofer', 'decorator', 'locksmith', 'cleaner', 'gardener',
    'pest_control', 'drainage', 'appliance_repair', 'other'
  )),
  CONSTRAINT contractors_status_valid CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX idx_contractors_status_trade ON contractors (status, trade);
CREATE INDEX idx_contractors_business_name ON contractors (lower(business_name));

CREATE TABLE contractor_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  rating integer NOT NULL,
  reviewed_on date NOT NULL DEFAULT CURRENT_DATE,
  work_description text NOT NULL,
  comments text,
  would_hire_again boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contractor_reviews_rating_valid CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT contractor_reviews_work_description_not_blank CHECK (btrim(work_description) <> '')
);

CREATE INDEX idx_contractor_reviews_contractor_reviewed
  ON contractor_reviews (contractor_id, reviewed_on DESC);

COMMIT;
