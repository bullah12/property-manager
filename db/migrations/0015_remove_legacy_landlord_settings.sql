BEGIN;

-- Landlord contract details now belong to each property. The former
-- account-wide fallback fields are no longer read or written by the app.
ALTER TABLE user_settings
  DROP COLUMN IF EXISTS landlord_address,
  DROP COLUMN IF EXISTS landlord_phone;

COMMIT;
