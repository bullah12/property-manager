BEGIN;

-- From 1 May 2026, new assured tenancies in England are periodic and cannot
-- have a contractual end date. Existing values are retained for historical
-- records, but new assured-periodic records may leave end_date null.
ALTER TABLE tenancies
  ALTER COLUMN end_date DROP NOT NULL;

-- Assured periodic tenancies do not expire. Remove reminders created from the
-- former fixed-term model; actual endings are recorded in tenancies.ended_on.
DELETE FROM reminders WHERE subject_type = 'tenancy';

-- Selective licensing is property-specific and administered by local councils.
ALTER TABLE compliance_items
  DROP CONSTRAINT IF EXISTS compliance_items_kind_check;

ALTER TABLE compliance_items
  ADD CONSTRAINT compliance_items_kind_check CHECK (kind IN (
    'gas_certificate',
    'electrical_eicr',
    'epc',
    'smoke_co_check',
    'selective_licence',
    'inspection',
    'insurance',
    'custom'
  ));

COMMIT;
