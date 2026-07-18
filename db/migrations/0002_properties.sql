BEGIN;

CREATE TABLE properties (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname             text NOT NULL,
  address_line1        text NOT NULL,
  address_line2        text,
  city                 text NOT NULL,
  postcode             text NOT NULL,
  property_type        text NOT NULL
                       CHECK (property_type IN ('house','flat','hmo','commercial')),
  bedrooms             integer CHECK (bedrooms >= 0),
  purchase_price_cents integer CHECK (purchase_price_cents >= 0),  -- NULL = unknown
  notes                text,
  status               text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','archived')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_properties_status ON properties (status);

COMMIT;
