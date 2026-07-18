BEGIN;

-- pdf-document-generation skill schema, verbatim.
CREATE TABLE generated_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type         text NOT NULL,           -- 'lease'
  template_version text NOT NULL,           -- 'lease/v1'
  subject_type     text NOT NULL,           -- 'tenancy'
  subject_id       uuid NOT NULL,
  file_id          uuid NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  input_snapshot   jsonb NOT NULL,          -- the exact view model used (auditability)
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_generated_documents_subject ON generated_documents (subject_type, subject_id);
CREATE INDEX idx_generated_documents_file_id ON generated_documents (file_id);

-- Complete the FK deferred from 0004:
ALTER TABLE contracts
  ADD CONSTRAINT fk_contracts_generated_document_id
  FOREIGN KEY (generated_document_id) REFERENCES generated_documents(id) ON DELETE SET NULL;
CREATE INDEX idx_contracts_generated_document_id ON contracts (generated_document_id);

COMMIT;
