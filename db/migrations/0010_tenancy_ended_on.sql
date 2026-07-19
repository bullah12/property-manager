BEGIN;

-- The contractual end date is not necessarily the date the tenancy actually
-- ended. Rent expectations must stop at the latter when a tenancy is ended
-- early. Existing ended rows are backfilled from the transition timestamp;
-- end_date remains the upper bound for tenancies ended after their term.
ALTER TABLE tenancies ADD COLUMN ended_on date;

UPDATE tenancies
SET ended_on = LEAST(end_date, (updated_at AT TIME ZONE 'UTC')::date)
WHERE status = 'ended';

ALTER TABLE tenancies
  ADD CONSTRAINT tenancies_ended_on_status_check
  CHECK (status <> 'ended' OR ended_on IS NOT NULL),
  ADD CONSTRAINT tenancies_ended_on_end_date_check
  CHECK (ended_on IS NULL OR ended_on <= end_date);

COMMIT;
