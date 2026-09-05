-- ============================================================
-- 002: Reward tiers (no dependencies - created before users
--      since users.tier_id references this table)
-- ============================================================
CREATE TABLE reward_tiers (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                  VARCHAR(40) UNIQUE NOT NULL,       -- Bronze, Silver, Gold
    min_lifetime_points   INTEGER NOT NULL,
    point_multiplier      NUMERIC(3,2) NOT NULL DEFAULT 1.0, -- e.g. Gold earns 1.5x per purchase
    benefits              TEXT
);

-- Seed a sensible default tier so new users always have somewhere to belong
INSERT INTO reward_tiers (name, min_lifetime_points, point_multiplier, benefits)
VALUES ('Bronze', 0, 1.0, 'Base tier - standard point earning rate');
