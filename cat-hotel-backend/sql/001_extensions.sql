-- ============================================================
-- 001: Extensions required by later migrations
--   uuid-ossp   -> uuid_generate_v4() for primary keys
--   btree_gist  -> required for the EXCLUDE USING gist constraint
--                  that prevents overlapping room bookings (004)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
