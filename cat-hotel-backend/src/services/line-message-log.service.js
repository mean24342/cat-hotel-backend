// Persists inbound/outbound LINE messages to line_message_log.
// Purely observational (support/debugging/audit) - never gates any
// business logic, so a logging failure should never break the bot.
const { query } = require('../config/db');

async function logMessage({ userId, direction, messageType, payload }) {
  try {
    await query(
      `INSERT INTO line_message_log (user_id, direction, message_type, payload)
       VALUES ($1, $2, $3, $4)`,
      [userId ?? null, direction, messageType, JSON.stringify(payload)]
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to write line_message_log entry (non-fatal):', err.message);
  }
}

module.exports = { logMessage };
