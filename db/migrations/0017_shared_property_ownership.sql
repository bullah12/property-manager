BEGIN;

CREATE TABLE owners (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  full_name    text NOT NULL,
  address      text NOT NULL,
  phone        text,
  email        citext,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_owners_id_workspace UNIQUE (id, workspace_id)
);

CREATE TABLE property_ownerships (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id              uuid NOT NULL,
  owner_id                 uuid NOT NULL,
  ownership_percentage     numeric(5,2) NOT NULL
                           CHECK (ownership_percentage > 0 AND ownership_percentage <= 100),
  is_main_landlord         boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_property_ownerships_property_owner UNIQUE (property_id, owner_id),
  CONSTRAINT uq_property_ownerships_id_workspace UNIQUE (id, workspace_id),
  CONSTRAINT fk_property_ownerships_property_workspace
    FOREIGN KEY (property_id, workspace_id)
    REFERENCES properties(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT fk_property_ownerships_owner_workspace
    FOREIGN KEY (owner_id, workspace_id)
    REFERENCES owners(id, workspace_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX uq_property_ownerships_one_main
  ON property_ownerships (property_id)
  WHERE is_main_landlord;
CREATE INDEX idx_owners_workspace_name
  ON owners (workspace_id, full_name);
CREATE INDEX idx_property_ownerships_workspace_property
  ON property_ownerships (workspace_id, property_id);
CREATE INDEX idx_property_ownerships_workspace_owner
  ON property_ownerships (workspace_id, owner_id);

-- Preserve every legacy landlord as a distinct legal owner. Deliberately do
-- not guess that matching names are the same person: owners can be merged in
-- a future owner-directory UI without risking an incorrect legal association.
INSERT INTO owners (id, workspace_id, full_name, address, phone, email)
SELECT id,
         workspace_id,
         COALESCE(trim(landlord_name), ''),
         COALESCE(trim(landlord_address), ''),
         landlord_phone,
         landlord_email
FROM properties;

INSERT INTO property_ownerships (
  workspace_id, property_id, owner_id, ownership_percentage, is_main_landlord
)
SELECT workspace_id, id, id, 100.00, true
FROM properties;

CREATE OR REPLACE FUNCTION validate_property_ownership(p_property_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  ownership_count integer;
  main_count integer;
  percentage_total numeric(7,2);
BEGIN
  -- A cascading property deletion has no invariant left to validate.
  IF NOT EXISTS (SELECT 1 FROM properties WHERE id = p_property_id) THEN
    RETURN;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE is_main_landlord),
         COALESCE(sum(ownership_percentage), 0)
    INTO ownership_count, main_count, percentage_total
  FROM property_ownerships
  WHERE property_id = p_property_id;

  IF ownership_count = 0 THEN
    RAISE EXCEPTION 'Property % must have at least one owner', p_property_id
      USING ERRCODE = '23514';
  END IF;
  IF main_count <> 1 THEN
    RAISE EXCEPTION 'Property % must have exactly one main landlord', p_property_id
      USING ERRCODE = '23514';
  END IF;
  IF percentage_total <> 100.00 THEN
    RAISE EXCEPTION 'Property % ownership percentages must total 100.00 (currently %)',
      p_property_id, percentage_total
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_property_ownership_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'properties' THEN
    PERFORM validate_property_ownership(NEW.id);
  ELSE
    PERFORM validate_property_ownership(COALESCE(NEW.property_id, OLD.property_id));
    IF TG_OP = 'UPDATE' AND OLD.property_id <> NEW.property_id THEN
      PERFORM validate_property_ownership(OLD.property_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER property_requires_valid_ownership
AFTER INSERT OR UPDATE ON properties
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_property_ownership_trigger();

CREATE CONSTRAINT TRIGGER property_ownerships_must_balance
AFTER INSERT OR UPDATE OR DELETE ON property_ownerships
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_property_ownership_trigger();

ALTER TABLE owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_ownerships ENABLE ROW LEVEL SECURITY;

COMMIT;
