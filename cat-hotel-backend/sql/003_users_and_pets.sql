-- ============================================================
-- 003: Users & Pets
-- ============================================================
CREATE TABLE users (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    line_user_id      VARCHAR(64) UNIQUE NOT NULL,          -- LINE's stable user ID
    display_name      VARCHAR(120) NOT NULL,
    picture_url       TEXT,
    email             VARCHAR(255) UNIQUE,
    phone             VARCHAR(30),
    points_balance    INTEGER NOT NULL DEFAULT 0,            -- denormalized cache, see points_ledger (006)
    tier_id           UUID REFERENCES reward_tiers(id),
    role              VARCHAR(20) NOT NULL DEFAULT 'customer', -- customer | staff | admin
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_points_balance_non_negative CHECK (points_balance >= 0),
    CONSTRAINT chk_role_valid CHECK (role IN ('customer', 'staff', 'admin'))
);

CREATE TABLE pets (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                  VARCHAR(80) NOT NULL,
    species               VARCHAR(40) NOT NULL DEFAULT 'cat',
    breed                 VARCHAR(80),
    weight_kg             NUMERIC(5,2),
    notes                 TEXT,
    vaccination_doc_url   TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pets_user ON pets(user_id);
