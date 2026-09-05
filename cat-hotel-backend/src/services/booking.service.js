const crypto = require('crypto');
const { query, getClient } = require('../config/db');
const ApiError = require('../utils/ApiError');
const roomService = require('./room.service');
const petService = require('./pet.service');
const { calculatePendingPoints } = require('../config/points-rules');

const MAX_STAY_NIGHTS = 30; // sanity ceiling against fat-finger / abuse (e.g. 2099-12-31 checkout)
const ACTIVE_STATUSES = ['pending', 'confirmed', 'checked_in'];

// Shared SELECT shape for every booking read: exposes check_in/check_out
// as plain dates (rather than the raw Postgres `daterange` text form
// node-pg returns by default) and joins the room's display info, so the
// frontend never has to make a second request just to show "Room R3".
const BOOKING_READ_COLUMNS = `
  b.id, b.booking_code, b.user_id, b.pet_id, b.room_id,
  lower(b.date_range) AS check_in, upper(b.date_range) AS check_out,
  b.status, b.nightly_rate, b.total_price, b.special_requests,
  b.created_at, b.updated_at,
  r.room_number, r.room_type
`;

function generateBookingCode() {
  // "CH" + 6 random uppercase base36 chars = 8 chars total, well
  // under the booking_code VARCHAR(12) column limit, with enough
  // entropy (36^6 ≈ 2.2 billion) that collisions are rare - and we
  // still handle a collision explicitly below via retry, since
  // "rare" is not "impossible" and booking_code is UNIQUE.
  const random = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `CH${random}`;
}

/** Parses 'YYYY-MM-DD' into a UTC-midnight Date for date-only arithmetic. */
function parseDateOnly(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError(400, `Invalid date: ${dateStr}`);
  }
  return d;
}

function nightsBetween(checkIn, checkOut) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((parseDateOnly(checkOut) - parseDateOnly(checkIn)) / MS_PER_DAY);
}

/**
 * Shared date-range validation used by both the availability search
 * and booking creation. Centralized so the two endpoints can never
 * silently disagree on what counts as a valid range.
 */
function validateDateRange(checkIn, checkOut, { disallowPast = false } = {}) {
  const checkInDate = parseDateOnly(checkIn);
  const checkOutDate = parseDateOnly(checkOut);

  if (checkOutDate <= checkInDate) {
    throw new ApiError(400, 'check_out must be after check_in');
  }

  const nights = nightsBetween(checkIn, checkOut);
  if (nights > MAX_STAY_NIGHTS) {
    throw new ApiError(400, `Maximum stay is ${MAX_STAY_NIGHTS} nights`);
  }

  if (disallowPast) {
    // Compare against today at UTC midnight. NOTE: for a Thailand-only
    // hotel, pin this to Asia/Bangkok "today" instead of server/UTC
    // "today" in production - a booking submitted at 00:30 Bangkok
    // time (17:30 UTC previous day) should not be rejected as "in
    // the past" due to a UTC/local day-boundary mismatch.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (checkInDate < today) {
      throw new ApiError(400, 'check_in cannot be in the past');
    }
  }

  return { nights };
}

/**
 * "Get Available Slots" - returns every active room with an
 * is_available flag for the requested date range. See
 * room.service.getAvailabilityForRange for the overlap query itself.
 */
async function getAvailability({ check_in: checkIn, check_out: checkOut }) {
  validateDateRange(checkIn, checkOut);
  return roomService.getAvailabilityForRange(checkIn, checkOut);
}

/**
 * Price/availability preview without creating anything - lets the
 * frontend show a total before the user commits.
 */
async function quoteBooking({ room_id: roomId, check_in: checkIn, check_out: checkOut }) {
  const { nights } = validateDateRange(checkIn, checkOut, { disallowPast: true });
  const room = await roomService.assertRoomBookable(roomId);
  const available = await roomService.isRoomAvailable(
    { query: (text, params) => query(text, params) }, // read-only, no transaction needed for a quote
    roomId,
    checkIn,
    checkOut
  );

  const nightlyRate = Number(room.base_price_per_night);
  const totalPrice = Number((nightlyRate * nights).toFixed(2));

  return {
    room_id: roomId,
    nights,
    nightly_rate: nightlyRate,
    total_price: totalPrice,
    is_available: available,
  };
}

/**
 * ============================================================
 * CREATE BOOKING - the core of the module. Read this end to end
 * before modifying; the ordering of these steps is what gives the
 * double-booking and points guarantees described below.
 * ============================================================
 *
 * DOUBLE-BOOKING PREVENTION (defense in depth, two independent layers):
 *   1. APPLICATION LOCK: `SELECT ... FOR UPDATE` on the target room row,
 *      taken at the start of the transaction. If two requests try to
 *      book the SAME room concurrently, the second blocks here until
 *      the first commits or rolls back - which serializes booking
 *      attempts per room and makes the overlap check below race-free
 *      in practice (the second request's check runs against data that
 *      already includes the first request's committed booking).
 *   2. DATABASE CONSTRAINT: the `bookings` table has a Postgres
 *      EXCLUDE USING gist constraint (see sql/004) that makes an
 *      overlapping active booking on the same room STRUCTURALLY
 *      impossible to commit, no matter what path inserted it. This is
 *      the real guarantee; the row lock above is what makes the
 *      *application-level error message* reliable instead of racy -
 *      if anything ever slips past both, Postgres itself will reject
 *      the INSERT and we translate that into a clean 409 (see catch
 *      block for error code '23P01').
 *
 * PENDING POINTS: we compute and store `points_earned` on a new
 * `purchases` row in the SAME transaction as the booking, but we do
 * NOT write to `points_ledger` or touch `users.points_balance` here.
 * Those only happen once payment is confirmed (a later module) via
 * points.service.adjustPoints(). This is deliberate: crediting
 * spendable points before payment would let someone create a booking,
 * bank the points, and abandon/cancel the booking without ever
 * paying. `purchases.points_earned` is the authoritative "pending"
 * amount the Payment module will read and credit once payment clears.
 */
async function createBooking(userId, { pet_id: petId, room_id: roomId, check_in: checkIn, check_out: checkOut, special_requests: specialRequests }) {
  const { nights } = validateDateRange(checkIn, checkOut, { disallowPast: true });

  // Ownership check happens before we open a transaction - no need to
  // hold any lock for this, it's just "does this pet belong to this user".
  await petService.assertPetBelongsToUser(petId, userId);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // --- Lock 1: the room row (see docstring above) ---
    const { rows: roomRows } = await client.query(
      'SELECT id, is_active, base_price_per_night, room_number, room_type FROM rooms WHERE id = $1 FOR UPDATE',
      [roomId]
    );
    if (roomRows.length === 0) {
      throw new ApiError(404, 'Room not found');
    }
    const room = roomRows[0];
    if (!room.is_active) {
      throw new ApiError(400, 'This room is not currently available for booking');
    }

    // --- Application-level overlap pre-check (fast, friendly error) ---
    const available = await roomService.isRoomAvailable(client, roomId, checkIn, checkOut);
    if (!available) {
      throw new ApiError(409, 'This room is not available for the selected dates');
    }

    const nightlyRate = Number(room.base_price_per_night);
    const totalPrice = Number((nightlyRate * nights).toFixed(2));

    // --- Insert the booking, with a couple of retries in the (very
    // rare) event of a booking_code collision. A real overlap
    // conflict (exclusion_violation, '23P01') is NOT retried - that
    // means someone else genuinely booked this room first, so we
    // surface a 409 immediately. ---
    let booking;
    const MAX_CODE_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_CODE_RETRIES; attempt += 1) {
      try {
        const { rows } = await client.query(
          `INSERT INTO bookings
             (booking_code, user_id, pet_id, room_id, date_range, status, nightly_rate, total_price, special_requests)
           VALUES ($1, $2, $3, $4, daterange($5::date, $6::date, '[)'), 'pending', $7, $8, $9)
           RETURNING id, booking_code, user_id, pet_id, room_id, status, nightly_rate, total_price, special_requests, created_at, updated_at`,
          [generateBookingCode(), userId, petId, roomId, checkIn, checkOut, nightlyRate, totalPrice, specialRequests ?? null]
        );
        booking = rows[0];
        // Attach fields the frontend needs that either came from input
        // (dates) or from the room row we already locked above - avoids
        // a second round-trip query just to re-read what we already know.
        booking.check_in = checkIn;
        booking.check_out = checkOut;
        booking.room_number = room.room_number;
        booking.room_type = room.room_type;
        break;
      } catch (err) {
        if (err.code === '23505' && attempt < MAX_CODE_RETRIES) {
          continue; // booking_code collision - regenerate and retry
        }
        if (err.code === '23P01') {
          // The EXCLUDE constraint caught what our pre-check missed -
          // this should be extremely rare given the room-row lock,
          // but it's the true source of truth, so we trust it.
          throw new ApiError(409, 'This room was just booked by someone else for overlapping dates');
        }
        throw err;
      }
    }
    if (!booking) {
      throw new ApiError(500, 'Failed to generate a unique booking code, please retry');
    }

    // --- Pending points: compute using the user's current tier, but
    // don't credit anything yet (see docstring above). ---
    const { rows: tierRows } = await client.query(
      `SELECT COALESCE(t.point_multiplier, 1.0) AS multiplier
       FROM users u
       LEFT JOIN reward_tiers t ON t.id = u.tier_id
       WHERE u.id = $1`,
      [userId]
    );
    const multiplier = tierRows.length > 0 ? Number(tierRows[0].multiplier) : 1.0;
    const pendingPoints = calculatePendingPoints(totalPrice, multiplier);

    const { rows: purchaseRows } = await client.query(
      `INSERT INTO purchases (user_id, payment_id, purchase_type, reference_id, amount, points_earned)
       VALUES ($1, NULL, 'booking', $2, $3, $4)
       RETURNING *`,
      [userId, booking.id, totalPrice, pendingPoints]
    );

    await client.query('COMMIT');

    return { booking, purchase: purchaseRows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getBookingById(id) {
  const { rows } = await query(
    `SELECT ${BOOKING_READ_COLUMNS}
     FROM bookings b
     JOIN rooms r ON r.id = b.room_id
     WHERE b.id = $1`,
    [id]
  );
  if (rows.length === 0) {
    throw new ApiError(404, 'Booking not found');
  }
  return rows[0];
}

function assertBookingOwnership(booking, requestingUser) {
  const isOwner = booking.user_id === requestingUser.sub;
  const isStaff = requestingUser.role === 'staff' || requestingUser.role === 'admin';
  if (!isOwner && !isStaff) {
    throw new ApiError(403, 'You do not have access to this booking');
  }
}

async function listBookingsForUser(userId, { page, limit, status }) {
  const offset = (page - 1) * limit;
  const params = [userId];
  let statusClause = '';

  if (status) {
    params.push(status);
    statusClause = `AND b.status = $${params.length}`;
  }

  params.push(limit, offset);
  const { rows } = await query(
    `SELECT ${BOOKING_READ_COLUMNS}
     FROM bookings b
     JOIN rooms r ON r.id = b.room_id
     WHERE b.user_id = $1 ${statusClause}
     ORDER BY b.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: rows, page, limit };
}

/**
 * Cancels a pending/confirmed booking. Does NOT touch points_ledger -
 * since pending points were never credited to the spendable balance
 * (see createBooking docstring), there's nothing to claw back here.
 * If payment had already been taken (future Payment module), that
 * module is responsible for refund + any already-earned-point
 * reversal; this function only owns the booking's own status.
 */
async function cancelBooking(id, requestingUser) {
  const booking = await getBookingById(id);
  assertBookingOwnership(booking, requestingUser);

  if (!ACTIVE_STATUSES.includes(booking.status)) {
    throw new ApiError(400, `Cannot cancel a booking with status '${booking.status}'`);
  }

  await query(
    `UPDATE bookings SET status = 'cancelled', updated_at = now()
     WHERE id = $1`,
    [id]
  );
  return getBookingById(id);
}

module.exports = {
  getAvailability,
  quoteBooking,
  createBooking,
  getBookingById,
  assertBookingOwnership,
  listBookingsForUser,
  cancelBooking,
};
