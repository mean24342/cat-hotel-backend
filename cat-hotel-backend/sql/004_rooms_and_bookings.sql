-- ============================================================
-- 004: Rooms & Bookings
-- ============================================================
CREATE TABLE rooms (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_number           VARCHAR(10) UNIQUE NOT NULL,        -- "R1".."R8"
    room_type             VARCHAR(40) NOT NULL,
    capacity_pets         SMALLINT NOT NULL DEFAULT 1,
    base_price_per_night  NUMERIC(10,2) NOT NULL,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    description           TEXT
);

CREATE TABLE room_blockouts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    date_range  daterange NOT NULL,
    reason      VARCHAR(255),
    created_by  UUID REFERENCES users(id)
);

CREATE TABLE bookings (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_code      VARCHAR(12) UNIQUE NOT NULL,
    user_id           UUID NOT NULL REFERENCES users(id),
    pet_id            UUID NOT NULL REFERENCES pets(id),
    room_id           UUID NOT NULL REFERENCES rooms(id),
    date_range        daterange NOT NULL,                     -- [check_in, check_out)
    status            VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending|confirmed|checked_in|checked_out|cancelled|no_show
    nightly_rate      NUMERIC(10,2) NOT NULL,
    total_price       NUMERIC(10,2) NOT NULL,
    special_requests  TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Structural guarantee (enforced by Postgres, not app code):
    -- no two ACTIVE bookings may overlap on the same room.
    EXCLUDE USING gist (room_id WITH =, date_range WITH &&)
        WHERE (status IN ('pending', 'confirmed', 'checked_in'))
);

CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_room_daterange ON bookings USING gist (room_id, date_range);
