// Room lookups and the availability query shared by both:
//   - GET /api/v1/rooms/availability  (browsing, read-only, no lock)
//   - booking.service.js's createBooking  (authoritative, run inside
//     a transaction against a locked row - see there for why)
const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');

async function listActiveRooms() {
  const { rows } = await query(
    `SELECT id, room_number, room_type, capacity_pets, base_price_per_night, description
     FROM rooms
     WHERE is_active = TRUE
     ORDER BY room_number`
  );
  return rows;
}

async function getRoomById(id) {
  const { rows } = await query('SELECT * FROM rooms WHERE id = $1', [id]);
  return rows[0] || null;
}

async function assertRoomBookable(roomId) {
  const room = await getRoomById(roomId);
  if (!room) {
    throw new ApiError(404, 'Room not found');
  }
  if (!room.is_active) {
    throw new ApiError(400, 'This room is not currently available for booking');
  }
  return room;
}

/**
 * Availability for ALL active rooms over a date range, checked against:
 *   1. Existing ACTIVE bookings (pending/confirmed/checked_in) that
 *      overlap the range - "validate against existing bookings".
 *   2. room_blockouts - staff-created maintenance/cleaning windows -
 *      this is the "service provider availability" side of the check:
 *      the room (our bookable resource) can be taken off the market
 *      by the hotel itself independent of any customer booking.
 *
 * Uses Postgres range-overlap (`&&`) directly against the `daterange`
 * columns, so this is a single indexed query rather than N+1 lookups
 * per room. `[)` = check-in inclusive, check-out exclusive, matching
 * how bookings.date_range is stored (a guest checking out on day X
 * doesn't block day X for the next guest).
 */
async function getAvailabilityForRange(checkIn, checkOut) {
  const { rows } = await query(
    `SELECT
       r.id,
       r.room_number,
       r.room_type,
       r.capacity_pets,
       r.base_price_per_night,
       NOT EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.room_id = r.id
           AND b.status IN ('pending', 'confirmed', 'checked_in')
           AND b.date_range && daterange($1::date, $2::date, '[)')
       )
       AND NOT EXISTS (
         SELECT 1 FROM room_blockouts bo
         WHERE bo.room_id = r.id
           AND bo.date_range && daterange($1::date, $2::date, '[)')
       ) AS is_available
     FROM rooms r
     WHERE r.is_active = TRUE
     ORDER BY r.room_number`,
    [checkIn, checkOut]
  );
  return rows;
}

/**
 * Same overlap check, scoped to a single room - used as the
 * fast/friendly pre-check inside the booking transaction (see
 * booking.service.js). NOT the final authority on its own; the
 * database's EXCLUDE constraint on `bookings` is what actually
 * guarantees no double-booking can be committed, even under race
 * conditions. This function just lets us return a clean 409 instead
 * of a raw constraint-violation error in the common case.
 *
 * `client` is passed in so this can run INSIDE the same transaction
 * (and see the same locked/consistent view of the data) as the
 * INSERT that follows it.
 */
async function isRoomAvailable(client, roomId, checkIn, checkOut) {
  const { rows } = await client.query(
    `SELECT
       NOT EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.room_id = $1
           AND b.status IN ('pending', 'confirmed', 'checked_in')
           AND b.date_range && daterange($2::date, $3::date, '[)')
       )
       AND NOT EXISTS (
         SELECT 1 FROM room_blockouts bo
         WHERE bo.room_id = $1
           AND bo.date_range && daterange($2::date, $3::date, '[)')
       ) AS is_available`,
    [roomId, checkIn, checkOut]
  );
  return rows[0].is_available;
}

module.exports = {
  listActiveRooms,
  getRoomById,
  assertRoomBookable,
  getAvailabilityForRange,
  isRoomAvailable,
};
