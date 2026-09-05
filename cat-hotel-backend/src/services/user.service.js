const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');

const PUBLIC_COLUMNS = `
  id, line_user_id, display_name, picture_url, email, phone,
  points_balance, tier_id, role, created_at, updated_at
`;

async function createUser(data) {
  const { line_user_id, display_name, picture_url, email, phone, role } = data;

  try {
    const { rows } = await query(
      `INSERT INTO users (line_user_id, display_name, picture_url, email, phone, role)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'customer'))
       RETURNING ${PUBLIC_COLUMNS}`,
      [line_user_id, display_name, picture_url ?? null, email ?? null, phone ?? null, role ?? null]
    );
    return rows[0];
  } catch (err) {
    // Postgres unique_violation - translate to a clean 409 instead of a raw DB error
    if (err.code === '23505') {
      throw new ApiError(409, 'A user with this line_user_id or email already exists');
    }
    throw err;
  }
}

async function getUserById(id) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`,
    [id]
  );
  if (rows.length === 0) {
    throw new ApiError(404, 'User not found');
  }
  return rows[0];
}

async function listUsers({ page, limit, search }) {
  const offset = (page - 1) * limit;
  const params = [];
  let where = '';

  if (search) {
    params.push(`%${search}%`);
    where = `WHERE display_name ILIKE $${params.length} OR email ILIKE $${params.length}`;
  }

  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS} FROM users
     ${where}
     ORDER BY created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  const countParams = search ? [`%${search}%`] : [];
  const countWhere = search ? 'WHERE display_name ILIKE $1 OR email ILIKE $1' : '';
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM users ${countWhere}`,
    countParams
  );

  return { data: rows, page, limit, total: countRows[0].total };
}

async function updateUser(id, updates) {
  const fields = Object.keys(updates);
  if (fields.length === 0) {
    throw new ApiError(400, 'No fields provided to update');
  }

  const setClauses = fields.map((field, idx) => `${field} = $${idx + 1}`);
  const values = fields.map((field) => updates[field]);

  const { rows } = await query(
    `UPDATE users
     SET ${setClauses.join(', ')}, updated_at = now()
     WHERE id = $${fields.length + 1}
     RETURNING ${PUBLIC_COLUMNS}`,
    [...values, id]
  );

  if (rows.length === 0) {
    throw new ApiError(404, 'User not found');
  }
  return rows[0];
}

async function deleteUser(id) {
  // NOTE on data integrity: this performs a hard delete. `pets` cascades
  // (ON DELETE CASCADE), but `bookings`, `payments`, `purchases`, and
  // `points_ledger` intentionally do NOT cascade, since those rows are
  // financial/audit records that should survive account deletion.
  // In production, prefer a soft-delete (e.g. an `is_active` flag or
  // anonymizing PII fields) over a hard delete so booking/payment/point
  // history remains queryable. Hard delete is kept here for a simple
  // foundation and will fail with a foreign-key error if the user has
  // any bookings/payments/purchases/points_ledger rows - which is the
  // correct, safe default until soft-delete is implemented.
  const { rowCount } = await query('DELETE FROM users WHERE id = $1', [id]);
  if (rowCount === 0) {
    throw new ApiError(404, 'User not found');
  }
}

async function getUserByLineId(lineUserId) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE line_user_id = $1`,
    [lineUserId]
  );
  return rows[0] || null; // null (not 404) - callers decide what "not found" means for their flow
}

/**
 * Called from the LINE Login callback on every sign-in, not just the
 * first one. Uses `INSERT ... ON CONFLICT (line_user_id) DO UPDATE`
 * so this is a single atomic upsert rather than a separate
 * SELECT-then-INSERT/UPDATE (which would race if the same user opened
 * two login tabs at once). We refresh display_name/picture_url on
 * every login since those can change on LINE's side; email is only
 * set if we don't already have a locally-provided one.
 */
async function upsertUserFromLine({ line_user_id, display_name, picture_url }) {
  const { rows } = await query(
    `INSERT INTO users (line_user_id, display_name, picture_url)
     VALUES ($1, $2, $3)
     ON CONFLICT (line_user_id) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           picture_url = EXCLUDED.picture_url,
           updated_at = now()
     RETURNING ${PUBLIC_COLUMNS}`,
    [line_user_id, display_name, picture_url ?? null]
  );
  return rows[0];
}

module.exports = {
  createUser,
  getUserById,
  listUsers,
  updateUser,
  deleteUser,
  getUserByLineId,
  upsertUserFromLine,
};
