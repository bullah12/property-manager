BEGIN;

-- Keep cancelled jobs for auditability instead of deleting queue history.
-- Only pending jobs may transition to cancelled; the API enforces that rule.
ALTER TABLE jobs DROP CONSTRAINT jobs_status_check;
ALTER TABLE jobs
  ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'dead', 'cancelled'));

COMMIT;
