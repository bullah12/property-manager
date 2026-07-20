BEGIN;

ALTER TABLE user_settings
  ADD COLUMN landlord_address text,
  ADD COLUMN landlord_phone text;

COMMIT;
