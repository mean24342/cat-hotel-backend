-- ============================================================
-- 006: Reward Points Ledger & LINE Message Log
--
-- POINT INTEGRITY DESIGN:
-- points_ledger is APPEND-ONLY. We never UPDATE a row here to
-- change a balance - every earn/redeem/expire/adjustment is a
-- new row, and balance_after is a snapshot of the running total
-- at that moment. This gives a full, tamper-evident audit trail.
--
-- users.points_balance is a denormalized CACHE of the ledger sum,
-- kept in sync inside a DB transaction every time a ledger row is
-- inserted (see src/services/points.service.js). This keeps reads
-- fast (no SUM() over the whole ledger on every balance check)
-- while the ledger remains the source of truth for history/audit.
-- ============================================================
CREATE TABLE points_ledger (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),
    points          INTEGER NOT NULL,                          -- positive = earn, negative = redeem/expire
    entry_type      VARCHAR(20) NOT NULL,                       -- earn | redeem | expire | adjustment
    reference_type  VARCHAR(20),                                -- purchase | booking | manual
    reference_id    UUID,
    balance_after   INTEGER NOT NULL,                           -- snapshot for fast history display
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_entry_type_valid CHECK (
        entry_type IN ('earn', 'redeem', 'expire', 'adjustment')
    ),
    CONSTRAINT chk_balance_after_non_negative CHECK (balance_after >= 0)
);

CREATE INDEX idx_points_ledger_user ON points_ledger(user_id, created_at DESC);

CREATE TABLE line_message_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id),
    direction       VARCHAR(10) NOT NULL,                       -- inbound | outbound
    message_type    VARCHAR(30) NOT NULL,                        -- text | flex | postback
    payload         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
