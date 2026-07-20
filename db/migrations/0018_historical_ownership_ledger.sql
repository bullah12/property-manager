BEGIN;

CREATE TABLE ownership_events (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                 uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id                  uuid NOT NULL,
  event_type                   text NOT NULL CHECK (event_type IN
                                 ('initial','transfer','allocation_change','main_landlord_change',
                                  'correction','reversal','cancellation')),
  transfer_type                text CHECK (transfer_type IS NULL OR transfer_type IN
                                 ('sale','gift','inheritance','correction','other')),
  effective_date               date NOT NULL,
  legal_completion_date        date,
  recorded_at                  timestamptz NOT NULL DEFAULT now(),
  recorded_by_user_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  seller_owner_id              uuid,
  buyer_owner_id               uuid,
  percentage_transferred       numeric(5,2)
                                 CHECK (percentage_transferred IS NULL OR
                                        (percentage_transferred > 0 AND percentage_transferred <= 100)),
  agreed_value_cents           bigint CHECK (agreed_value_cents IS NULL OR agreed_value_cents >= 0),
  currency                     varchar(3) NOT NULL DEFAULT 'GBP',
  payment_treatment            text CHECK (payment_treatment IS NULL OR payment_treatment IN ('private','property_funds')),
  effective_after_full_payment boolean NOT NULL DEFAULT false,
  before_snapshot              jsonb NOT NULL DEFAULT '[]'::jsonb,
  after_snapshot               jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason                       text,
  notes                        text,
  reverses_event_id            uuid REFERENCES ownership_events(id) ON DELETE RESTRICT,
  document_file_id             uuid,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ownership_events_id_workspace UNIQUE (id, workspace_id),
  CONSTRAINT fk_ownership_events_property_workspace
    FOREIGN KEY (property_id, workspace_id) REFERENCES properties(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT fk_ownership_events_seller_workspace
    FOREIGN KEY (seller_owner_id, workspace_id) REFERENCES owners(id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ownership_events_buyer_workspace
    FOREIGN KEY (buyer_owner_id, workspace_id) REFERENCES owners(id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ownership_events_document_workspace
    FOREIGN KEY (document_file_id, workspace_id) REFERENCES files(id, workspace_id) ON DELETE SET NULL (document_file_id)
);

CREATE TABLE ownership_event_allocations (
  event_id                  uuid NOT NULL,
  workspace_id              uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id                  uuid NOT NULL,
  ownership_percentage      numeric(5,2) NOT NULL
                              CHECK (ownership_percentage > 0 AND ownership_percentage <= 100),
  is_main_landlord          boolean NOT NULL DEFAULT false,
  PRIMARY KEY (event_id, owner_id),
  CONSTRAINT fk_ownership_allocations_event_workspace
    FOREIGN KEY (event_id, workspace_id) REFERENCES ownership_events(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT fk_ownership_allocations_owner_workspace
    FOREIGN KEY (owner_id, workspace_id) REFERENCES owners(id, workspace_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX uq_ownership_event_allocations_one_main
  ON ownership_event_allocations (event_id) WHERE is_main_landlord;
CREATE INDEX idx_ownership_events_property_date
  ON ownership_events (workspace_id, property_id, effective_date DESC, recorded_at DESC);
CREATE INDEX idx_ownership_event_allocations_owner
  ON ownership_event_allocations (workspace_id, owner_id);

-- Convert the mutable 0017 allocation into an immutable opening snapshot.
INSERT INTO ownership_events (
  id, workspace_id, property_id, event_type, effective_date, recorded_at,
  before_snapshot, after_snapshot, notes
)
SELECT p.id, p.workspace_id, p.id, 'initial', p.created_at::date, p.created_at,
       '[]'::jsonb,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'ownerId', po.owner_id,
           'ownershipPercentage', po.ownership_percentage,
           'isMainLandlord', po.is_main_landlord
         ) ORDER BY po.is_main_landlord DESC, po.created_at)
         FROM property_ownerships po WHERE po.property_id = p.id
       ), '[]'::jsonb),
       'Opening ownership migrated from the previous property landlord record.'
FROM properties p;

INSERT INTO ownership_event_allocations (
  event_id, workspace_id, owner_id, ownership_percentage, is_main_landlord
)
SELECT property_id, workspace_id, owner_id, ownership_percentage, is_main_landlord
FROM property_ownerships;

DROP TRIGGER property_requires_valid_ownership ON properties;
DROP TRIGGER property_ownerships_must_balance ON property_ownerships;
DROP FUNCTION validate_property_ownership_trigger();
DROP FUNCTION validate_property_ownership(uuid);
DROP TABLE property_ownerships;

CREATE OR REPLACE FUNCTION validate_ownership_event_allocation(p_event_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  allocation_count integer;
  main_count integer;
  percentage_total numeric(7,2);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ownership_events WHERE id = p_event_id) THEN RETURN; END IF;
  SELECT count(*), count(*) FILTER (WHERE is_main_landlord),
         COALESCE(sum(ownership_percentage), 0)
    INTO allocation_count, main_count, percentage_total
  FROM ownership_event_allocations WHERE event_id = p_event_id;
  IF allocation_count = 0 OR main_count <> 1 OR percentage_total <> 100.00 THEN
    RAISE EXCEPTION 'Ownership event % must contain allocations totalling 100.00 and exactly one main landlord', p_event_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_ownership_event_allocation_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'ownership_events' THEN
    PERFORM validate_ownership_event_allocation(NEW.id);
  ELSE
    PERFORM validate_ownership_event_allocation(COALESCE(NEW.event_id, OLD.event_id));
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ownership_event_requires_valid_allocation
AFTER INSERT ON ownership_events DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_ownership_event_allocation_trigger();
CREATE CONSTRAINT TRIGGER ownership_event_allocations_must_balance
AFTER INSERT OR UPDATE OR DELETE ON ownership_event_allocations DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_ownership_event_allocation_trigger();

CREATE OR REPLACE FUNCTION prevent_ownership_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Ownership history is immutable; append a correction or reversal event instead'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER ownership_events_are_immutable
BEFORE UPDATE OR DELETE ON ownership_events
FOR EACH ROW EXECUTE FUNCTION prevent_ownership_history_mutation();
CREATE TRIGGER ownership_event_allocations_are_immutable
BEFORE UPDATE OR DELETE ON ownership_event_allocations
FOR EACH ROW EXECUTE FUNCTION prevent_ownership_history_mutation();

ALTER TABLE transactions ADD CONSTRAINT uq_transactions_id_workspace UNIQUE (id, workspace_id);

CREATE TABLE ownership_payments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id             uuid NOT NULL,
  event_id                uuid,
  kind                    text NOT NULL CHECK (kind IN
                            ('private_transfer','capital_contribution','capital_withdrawal',
                             'distribution','property_funded_purchase')),
  payer_owner_id          uuid,
  recipient_owner_id      uuid,
  amount_due_cents        bigint NOT NULL CHECK (amount_due_cents >= 0),
  amount_paid_cents       bigint NOT NULL DEFAULT 0 CHECK (amount_paid_cents >= 0),
  currency                varchar(3) NOT NULL DEFAULT 'GBP',
  due_on                  date,
  paid_on                 date,
  status                  text NOT NULL DEFAULT 'scheduled' CHECK (status IN
                            ('scheduled','due','partially_paid','paid','cancelled','overdue')),
  payment_method          text,
  reference               text,
  through_property_funds  boolean NOT NULL DEFAULT false,
  property_fund_direction text CHECK (property_fund_direction IS NULL OR property_fund_direction IN ('into_property','out_of_property')),
  allow_overpayment       boolean NOT NULL DEFAULT false,
  notes                   text,
  document_file_id        uuid,
  transaction_id          uuid UNIQUE,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ownership_payments_id_workspace UNIQUE (id, workspace_id),
  CONSTRAINT uq_ownership_payments_transaction_workspace UNIQUE (transaction_id, workspace_id),
  CONSTRAINT ck_ownership_payment_overpayment CHECK (allow_overpayment OR amount_paid_cents <= amount_due_cents),
  CONSTRAINT ck_ownership_payment_property_funds CHECK
    ((through_property_funds AND property_fund_direction IS NOT NULL) OR
     (NOT through_property_funds AND property_fund_direction IS NULL)),
  CONSTRAINT fk_ownership_payments_property_workspace
    FOREIGN KEY (property_id, workspace_id) REFERENCES properties(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT fk_ownership_payments_event_workspace
    FOREIGN KEY (event_id, workspace_id) REFERENCES ownership_events(id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ownership_payments_payer_workspace
    FOREIGN KEY (payer_owner_id, workspace_id) REFERENCES owners(id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ownership_payments_recipient_workspace
    FOREIGN KEY (recipient_owner_id, workspace_id) REFERENCES owners(id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ownership_payments_document_workspace
    FOREIGN KEY (document_file_id, workspace_id) REFERENCES files(id, workspace_id) ON DELETE SET NULL (document_file_id),
  CONSTRAINT fk_ownership_payments_transaction_workspace
    FOREIGN KEY (transaction_id, workspace_id) REFERENCES transactions(id, workspace_id) ON DELETE RESTRICT
);

CREATE INDEX idx_ownership_payments_property_due
  ON ownership_payments (workspace_id, property_id, due_on);

CREATE TABLE ownership_notes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id      uuid NOT NULL,
  owner_id         uuid,
  event_id         uuid,
  payment_id       uuid,
  title            text NOT NULL CHECK (length(trim(title)) > 0),
  note_text        text NOT NULL CHECK (length(trim(note_text)) > 0),
  note_date        date NOT NULL,
  author_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  sensitivity      text NOT NULL DEFAULT 'workspace' CHECK (sensitivity IN ('workspace','admins')),
  review_on        date,
  document_file_id uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_ownership_notes_property_workspace
    FOREIGN KEY (property_id, workspace_id) REFERENCES properties(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT fk_ownership_notes_owner_workspace
    FOREIGN KEY (owner_id, workspace_id) REFERENCES owners(id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ownership_notes_event_workspace
    FOREIGN KEY (event_id, workspace_id) REFERENCES ownership_events(id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ownership_notes_payment_workspace
    FOREIGN KEY (payment_id, workspace_id) REFERENCES ownership_payments(id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ownership_notes_document_workspace
    FOREIGN KEY (document_file_id, workspace_id) REFERENCES files(id, workspace_id) ON DELETE SET NULL (document_file_id)
);

CREATE INDEX idx_ownership_notes_property_date
  ON ownership_notes (workspace_id, property_id, note_date DESC);

-- Property money is visible in property cash flow; private owner-to-owner
-- payments never create transaction rows and remain excluded.
ALTER TABLE transactions DROP CONSTRAINT transactions_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_category_check CHECK (
  (direction = 'income' AND category IN ('rent','deposit','capital_contribution','other')) OR
  (direction = 'expense' AND category IN ('repairs','maintenance','insurance',
    'mortgage_interest','certificates','agent_fees','utilities',
    'capital_withdrawal','distribution','share_redemption','other'))
);

ALTER TABLE ownership_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ownership_event_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ownership_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ownership_notes ENABLE ROW LEVEL SECURITY;

COMMIT;
