-- ============================================================
-- 005: Payments & Purchases
-- ============================================================
CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id),
    gateway             VARCHAR(20) NOT NULL,                  -- omise_promptpay | omise_card | stripe
    gateway_charge_id   VARCHAR(120) UNIQUE,
    amount              NUMERIC(10,2) NOT NULL,
    currency            VARCHAR(3) NOT NULL DEFAULT 'THB',
    status              VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|paid|failed|refunded|expired
    paid_at             TIMESTAMPTZ,
    raw_response        JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchases (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),
    payment_id      UUID REFERENCES payments(id),
    purchase_type   VARCHAR(20) NOT NULL,                      -- booking | addon | product
    reference_id    UUID NOT NULL,
    amount          NUMERIC(10,2) NOT NULL,
    points_earned   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_purchases_user ON purchases(user_id);
