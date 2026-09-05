const { query, getClient } = require('../config/db');
const ApiError = require('../utils/ApiError');

/**
 * Read-only balance lookup, joined with tier info for display.
 * Safe to read from `users.points_balance` directly (no lock needed)
 * since this is a point-in-time snapshot for the UI, not part of a
 * money-moving operation.
 */
async function getBalance(userId) {
  const { rows } = await query(
    `SELECT
       u.id,
       u.points_balance,
       u.tier_id,
       t.name AS tier_name,
       t.point_multiplier,
       t.min_lifetime_points
     FROM users u
     LEFT JOIN reward_tiers t ON t.id = u.tier_id
     WHERE u.id = $1`,
    [userId]
  );

  if (rows.length === 0) {
    throw new ApiError(404, 'User not found');
  }
  return rows[0];
}

async function getHistory(userId, { page, limit }) {
  const offset = (page - 1) * limit;

  const { rows } = await query(
    `SELECT id, points, entry_type, reference_type, reference_id, balance_after, note, created_at
     FROM points_ledger
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  const { rows: countRows } = await query(
    'SELECT COUNT(*)::int AS total FROM points_ledger WHERE user_id = $1',
    [userId]
  );

  return { data: rows, page, limit, total: countRows[0].total };
}

/**
 * Atomically adjust a user's point balance and append a ledger entry.
 *
 * ============================================================
 * HOW POINT INTEGRITY IS MAINTAINED (read this before changing)
 * ============================================================
 * 1. TRANSACTION: the row lock, ledger insert, and balance update all
 *    happen inside a single BEGIN/COMMIT. If anything fails partway,
 *    ROLLBACK guarantees we never end up with a ledger entry that has
 *    no matching balance update, or vice versa.
 *
 * 2. ROW LOCK (`SELECT ... FOR UPDATE`): if two requests try to adjust
 *    the same user's points concurrently (e.g. a purchase-earn job and
 *    a manual staff correction firing at the same moment), the second
 *    transaction blocks until the first COMMITs or ROLLBACKs. Without
 *    this lock, both transactions could read the same starting balance
 *    and one update would silently overwrite the other (a classic
 *    lost-update race condition).
 *
 * 3. NON-NEGATIVE CHECK (app layer + DB CHECK constraint as defense in
 *    depth): a redemption/expiry that would push the balance below
 *    zero is rejected with a 400 before anything is written. The DB
 *    also enforces `points_balance >= 0` and `balance_after >= 0` as a
 *    second line of defense against a future bug in this function.
 *
 * 4. APPEND-ONLY LEDGER: we always INSERT a new points_ledger row,
 *    never UPDATE an existing one. `balance_after` captures the exact
 *    running total at that moment, so the ledger alone is enough to
 *    reconstruct full history/audit trail even if the cached
 *    `users.points_balance` were ever wrong and needed reconciling
 *    (`SELECT points FROM points_ledger WHERE user_id = ... ORDER BY
 *    created_at` should always sum to the latest balance_after).
 *
 * COMPOSABILITY: pass an already-open transaction client as
 * `externalClient` to fold this adjustment into a larger atomic
 * operation - e.g. the Stripe webhook handler updates the payment row,
 * confirms the booking, AND credits points in one transaction, so a
 * crash between steps can never leave "payment confirmed but points
 * never credited". When `externalClient` is omitted (the normal case,
 * e.g. the REST /points/:userId/adjust endpoint), this function manages
 * its own BEGIN/COMMIT/ROLLBACK/release exactly as before.
 */
async function adjustPoints(userId, { points, entry_type, reference_type, reference_id, note }, externalClient = null) {
  const client = externalClient || (await getClient());
  const ownsTransaction = !externalClient; // only manage BEGIN/COMMIT/release if we opened the connection ourselves

  try {
    if (ownsTransaction) await client.query('BEGIN');

    // Lock the user row for the duration of this transaction.
    const { rows: userRows } = await client.query(
      'SELECT points_balance FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (userRows.length === 0) {
      throw new ApiError(404, 'User not found');
    }

    const currentBalance = userRows[0].points_balance;
    const newBalance = currentBalance + points;

    if (newBalance < 0) {
      throw new ApiError(
        400,
        `Insufficient points balance: current balance is ${currentBalance}, requested change is ${points}`
      );
    }

    const { rows: ledgerRows } = await client.query(
      `INSERT INTO points_ledger
         (user_id, points, entry_type, reference_type, reference_id, balance_after, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, points, entry_type, reference_type, reference_id, balance_after, note, created_at`,
      [userId, points, entry_type, reference_type ?? null, reference_id ?? null, newBalance, note ?? null]
    );

    await client.query(
      'UPDATE users SET points_balance = $1, updated_at = now() WHERE id = $2',
      [newBalance, userId]
    );

    if (ownsTransaction) await client.query('COMMIT');

    return { balance: newBalance, ledgerEntry: ledgerRows[0] };
  } catch (err) {
    if (ownsTransaction) await client.query('ROLLBACK');
    throw err; // if we don't own the transaction, the caller's catch block handles ROLLBACK
  } finally {
    // Only release a client we acquired ourselves - a caller-supplied
    // externalClient is the caller's responsibility to release.
    if (ownsTransaction) client.release();
  }
}

module.exports = { getBalance, getHistory, adjustPoints };
