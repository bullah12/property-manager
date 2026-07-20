BEGIN;

CREATE TABLE workspaces (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (length(trim(name)) > 0),
  status     text NOT NULL DEFAULT 'active'
             CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_memberships (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member'
               CHECK (role IN ('owner','admin','member','viewer')),
  status       text NOT NULL DEFAULT 'active'
               CHECK (status IN ('invited','active','suspended')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_workspace_memberships_user
  ON workspace_memberships (user_id, status);

-- Give every existing login a portfolio. Reusing the user UUID makes this
-- migration deterministic and lets account provisioning remain idempotent.
INSERT INTO workspaces (id, name)
SELECT id, display_name || '''s portfolio'
FROM users;

INSERT INTO workspace_memberships (workspace_id, user_id, role, status)
SELECT id, id,
       CASE WHEN role = 'admin' THEN 'owner' ELSE 'viewer' END,
       'active'
FROM users;

ALTER TABLE properties           ADD COLUMN workspace_id uuid;
ALTER TABLE tenants              ADD COLUMN workspace_id uuid;
ALTER TABLE tenancies            ADD COLUMN workspace_id uuid;
ALTER TABLE transactions         ADD COLUMN workspace_id uuid;
ALTER TABLE compliance_items     ADD COLUMN workspace_id uuid;
ALTER TABLE reminders            ADD COLUMN workspace_id uuid;
ALTER TABLE files                ADD COLUMN workspace_id uuid;
ALTER TABLE contracts            ADD COLUMN workspace_id uuid;
ALTER TABLE generated_documents ADD COLUMN workspace_id uuid;
ALTER TABLE contractors          ADD COLUMN workspace_id uuid;
ALTER TABLE contractor_reviews   ADD COLUMN workspace_id uuid;
ALTER TABLE notifications        ADD COLUMN workspace_id uuid;
ALTER TABLE jobs                 ADD COLUMN workspace_id uuid;

-- The application was single-portfolio before this migration. Preserve that
-- portfolio under the same owner selected by the legacy getOwner() helper.
DO $$
DECLARE
  legacy_workspace_id uuid;
BEGIN
  SELECT id INTO legacy_workspace_id
  FROM users
  WHERE role = 'admin' AND status = 'active'
  ORDER BY created_at ASC
  LIMIT 1;

  IF legacy_workspace_id IS NULL THEN
    SELECT id INTO legacy_workspace_id FROM users ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF legacy_workspace_id IS NULL AND EXISTS (SELECT 1 FROM properties LIMIT 1) THEN
    RAISE EXCEPTION 'Cannot assign legacy data: no user exists';
  END IF;

  UPDATE properties           SET workspace_id = legacy_workspace_id;
  UPDATE tenants              SET workspace_id = legacy_workspace_id;
  UPDATE tenancies            SET workspace_id = legacy_workspace_id;
  UPDATE transactions         SET workspace_id = legacy_workspace_id;
  UPDATE compliance_items     SET workspace_id = legacy_workspace_id;
  UPDATE reminders            SET workspace_id = legacy_workspace_id;
  UPDATE contracts            SET workspace_id = legacy_workspace_id;
  UPDATE generated_documents SET workspace_id = legacy_workspace_id;
  UPDATE contractors          SET workspace_id = legacy_workspace_id;
  UPDATE contractor_reviews   SET workspace_id = legacy_workspace_id;
  UPDATE jobs                 SET workspace_id = legacy_workspace_id;

  -- Files were part of the same legacy portfolio even when another account
  -- performed the upload, so keep their workspace aligned with their
  -- contracts, receipts and compliance records.
  UPDATE files
  SET workspace_id = legacy_workspace_id;

  UPDATE notifications n
  SET workspace_id = COALESCE(n.user_id, legacy_workspace_id);
END $$;

ALTER TABLE properties           ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE tenants              ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE tenancies            ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE transactions         ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE compliance_items     ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE reminders            ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE files                ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE contracts            ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE generated_documents ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE contractors          ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE contractor_reviews   ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE notifications        ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE jobs                 ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE properties           ADD CONSTRAINT fk_properties_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE tenants              ADD CONSTRAINT fk_tenants_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE tenancies            ADD CONSTRAINT fk_tenancies_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE transactions         ADD CONSTRAINT fk_transactions_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE compliance_items     ADD CONSTRAINT fk_compliance_items_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE reminders            ADD CONSTRAINT fk_reminders_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE files                ADD CONSTRAINT fk_files_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE contracts            ADD CONSTRAINT fk_contracts_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE generated_documents ADD CONSTRAINT fk_generated_documents_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE contractors          ADD CONSTRAINT fk_contractors_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE contractor_reviews   ADD CONSTRAINT fk_contractor_reviews_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE notifications        ADD CONSTRAINT fk_notifications_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE jobs                 ADD CONSTRAINT fk_jobs_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

-- Make parent ids addressable together with their workspace, then replace
-- relationship FKs with workspace-aware versions. This makes cross-portfolio
-- links impossible even if an application check is accidentally omitted.
ALTER TABLE properties           ADD CONSTRAINT uq_properties_id_workspace UNIQUE (id, workspace_id);
ALTER TABLE tenants              ADD CONSTRAINT uq_tenants_id_workspace UNIQUE (id, workspace_id);
ALTER TABLE tenancies            ADD CONSTRAINT uq_tenancies_id_workspace UNIQUE (id, workspace_id);
ALTER TABLE files                ADD CONSTRAINT uq_files_id_workspace UNIQUE (id, workspace_id);
ALTER TABLE generated_documents ADD CONSTRAINT uq_generated_documents_id_workspace UNIQUE (id, workspace_id);
ALTER TABLE contractors          ADD CONSTRAINT uq_contractors_id_workspace UNIQUE (id, workspace_id);

ALTER TABLE tenancies DROP CONSTRAINT tenancies_property_id_fkey;
ALTER TABLE tenancies DROP CONSTRAINT tenancies_tenant_id_fkey;
ALTER TABLE tenancies
  ADD CONSTRAINT fk_tenancies_property_workspace
  FOREIGN KEY (property_id, workspace_id) REFERENCES properties(id, workspace_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_tenancies_tenant_workspace
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES tenants(id, workspace_id) ON DELETE RESTRICT;

ALTER TABLE transactions DROP CONSTRAINT transactions_property_id_fkey;
ALTER TABLE transactions DROP CONSTRAINT transactions_tenancy_id_fkey;
ALTER TABLE transactions DROP CONSTRAINT transactions_receipt_file_id_fkey;
ALTER TABLE transactions
  ADD CONSTRAINT fk_transactions_property_workspace
  FOREIGN KEY (property_id, workspace_id) REFERENCES properties(id, workspace_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_transactions_tenancy_workspace
  FOREIGN KEY (tenancy_id, workspace_id) REFERENCES tenancies(id, workspace_id) ON DELETE SET NULL (tenancy_id),
  ADD CONSTRAINT fk_transactions_receipt_workspace
  FOREIGN KEY (receipt_file_id, workspace_id) REFERENCES files(id, workspace_id) ON DELETE SET NULL (receipt_file_id);

ALTER TABLE compliance_items DROP CONSTRAINT compliance_items_property_id_fkey;
ALTER TABLE compliance_items DROP CONSTRAINT compliance_items_document_file_id_fkey;
ALTER TABLE compliance_items
  ADD CONSTRAINT fk_compliance_items_property_workspace
  FOREIGN KEY (property_id, workspace_id) REFERENCES properties(id, workspace_id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_compliance_items_document_workspace
  FOREIGN KEY (document_file_id, workspace_id) REFERENCES files(id, workspace_id) ON DELETE SET NULL (document_file_id);

ALTER TABLE generated_documents DROP CONSTRAINT generated_documents_file_id_fkey;
ALTER TABLE generated_documents
  ADD CONSTRAINT fk_generated_documents_file_workspace
  FOREIGN KEY (file_id, workspace_id) REFERENCES files(id, workspace_id) ON DELETE RESTRICT;

ALTER TABLE contracts DROP CONSTRAINT contracts_tenancy_id_fkey;
ALTER TABLE contracts DROP CONSTRAINT contracts_file_id_fkey;
ALTER TABLE contracts DROP CONSTRAINT fk_contracts_generated_document_id;
ALTER TABLE contracts
  ADD CONSTRAINT fk_contracts_tenancy_workspace
  FOREIGN KEY (tenancy_id, workspace_id) REFERENCES tenancies(id, workspace_id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_contracts_file_workspace
  FOREIGN KEY (file_id, workspace_id) REFERENCES files(id, workspace_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_contracts_generated_document_workspace
  FOREIGN KEY (generated_document_id, workspace_id) REFERENCES generated_documents(id, workspace_id) ON DELETE SET NULL (generated_document_id);

ALTER TABLE contractor_reviews DROP CONSTRAINT contractor_reviews_contractor_id_fkey;
ALTER TABLE contractor_reviews
  ADD CONSTRAINT fk_contractor_reviews_contractor_workspace
  FOREIGN KEY (contractor_id, workspace_id) REFERENCES contractors(id, workspace_id) ON DELETE CASCADE;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_membership
  FOREIGN KEY (workspace_id, user_id)
  REFERENCES workspace_memberships(workspace_id, user_id) ON DELETE CASCADE;

CREATE INDEX idx_properties_workspace           ON properties (workspace_id, created_at DESC);
CREATE INDEX idx_tenants_workspace              ON tenants (workspace_id, created_at DESC);
CREATE INDEX idx_tenancies_workspace            ON tenancies (workspace_id, created_at DESC);
CREATE INDEX idx_transactions_workspace         ON transactions (workspace_id, occurred_on DESC);
CREATE INDEX idx_compliance_items_workspace     ON compliance_items (workspace_id, due_on);
CREATE INDEX idx_reminders_workspace            ON reminders (workspace_id, due_on);
CREATE INDEX idx_files_workspace                ON files (workspace_id, created_at DESC);
CREATE INDEX idx_contracts_workspace            ON contracts (workspace_id, created_at DESC);
CREATE INDEX idx_generated_documents_workspace  ON generated_documents (workspace_id, created_at DESC);
CREATE INDEX idx_contractors_workspace          ON contractors (workspace_id, status, trade);
CREATE INDEX idx_contractor_reviews_workspace   ON contractor_reviews (workspace_id, reviewed_on DESC);
CREATE INDEX idx_notifications_workspace        ON notifications (workspace_id, created_at DESC);
CREATE INDEX idx_jobs_workspace                 ON jobs (workspace_id, status, run_at);

-- Notification deduplication must be isolated too: two portfolios can have
-- the same reminder/period without suppressing each other's notification.
DROP INDEX IF EXISTS idx_notifications_dedupe_key;
CREATE UNIQUE INDEX idx_notifications_workspace_dedupe_key
  ON notifications (workspace_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Supabase exposes the public schema through PostgREST. The application uses
-- the direct server-side Prisma connection, so leave the API-facing roles
-- with deny-all RLS (no policies) on every application table.
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants               ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE files                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_reviews    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs                  ENABLE ROW LEVEL SECURITY;

COMMIT;
