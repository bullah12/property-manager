BEGIN;

-- The legal landlord belongs to the property. The authenticated app user may
-- instead be an agent or manager acting on the landlord's behalf.
ALTER TABLE properties
  ADD COLUMN landlord_name text,
  ADD COLUMN landlord_address text,
  ADD COLUMN landlord_phone text,
  ADD COLUMN landlord_email citext;

-- Preserve the former single-account contract details as the initial
-- property-level landlord for existing records. They remain editable per
-- property after this migration.
WITH default_landlord AS (
  SELECT
    u.display_name AS landlord_name,
    s.landlord_address,
    s.landlord_phone,
    u.email AS landlord_email
  FROM users u
  LEFT JOIN user_settings s ON s.user_id = u.id
  WHERE u.role = 'admin' AND u.status = 'active'
  ORDER BY u.created_at ASC
  LIMIT 1
)
UPDATE properties p
SET
  landlord_name = d.landlord_name,
  landlord_address = d.landlord_address,
  landlord_phone = d.landlord_phone,
  landlord_email = d.landlord_email
FROM default_landlord d;

COMMIT;
