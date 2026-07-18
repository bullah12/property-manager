BEGIN;

-- files: file-storage-uploads skill schema, verbatim shape.
-- All files in this project are private (is_public stays false).
CREATE TABLE files (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  purpose         text NOT NULL
                  CHECK (purpose IN ('lease-doc','certificate','receipt','generated-lease')),
  storage_key     text NOT NULL UNIQUE,   -- '<purpose>/<uuid>/<sanitized-name>'
  content_type    text NOT NULL,
  size_bytes      bigint NOT NULL,
  checksum_sha256 text,
  is_public       boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','ready','failed')),
  variants        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_files_owner_id ON files (owner_id);
CREATE INDEX idx_files_status_pending ON files (created_at) WHERE status = 'pending'; -- orphan sweep

CREATE TABLE contracts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id            uuid NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  kind                  text NOT NULL CHECK (kind IN ('lease','renewal','addendum')),
  source                text NOT NULL CHECK (source IN ('generated','uploaded')),
  file_id               uuid NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  generated_document_id uuid,   -- FK added in 0008 when generated_documents exists
  signed_on             date,
  status                text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','issued','signed','superseded')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'signed' OR signed_on IS NOT NULL),
  CHECK (source = 'generated' OR generated_document_id IS NULL)
);

CREATE INDEX idx_contracts_tenancy_id ON contracts (tenancy_id);
CREATE INDEX idx_contracts_file_id    ON contracts (file_id);

COMMIT;
