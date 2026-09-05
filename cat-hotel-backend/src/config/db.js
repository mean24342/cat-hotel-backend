// PostgreSQL connection pooling.
//
// Why pooling matters here: Express handles many concurrent requests on a
// single Node process. Opening a fresh TCP+auth connection to Postgres per
// request is slow and will exhaust Postgres' max_connections under load.
// `pg.Pool` maintains a set of warm, reusable connections and queues
// requests when all are busy, instead of failing or opening unbounded
// new connections.
const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.pool.max,                                   // hard ceiling on concurrent DB connections
  idleTimeoutMillis: env.pool.idleTimeoutMillis,        // close idle clients after this long
  connectionTimeoutMillis: env.pool.connectionTimeoutMillis, // fail fast if pool is exhausted
});

// A pool-level error (e.g. a backend connection dying) should never crash
// the whole process silently - log it so it surfaces in monitoring.
pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected error on idle PostgreSQL client', err);
});

/**
 * Simple query helper for single-statement operations that don't need
 * an explicit transaction. Always prefer this over pool.query() directly
 * elsewhere so query logging/instrumentation stays in one place.
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Acquire a dedicated client for multi-statement transactions
 * (BEGIN/COMMIT/ROLLBACK). Callers MUST release the client when done -
 * see src/services/points.service.js for the canonical usage pattern
 * (row locking + atomic ledger insert + balance update).
 */
async function getClient() {
  return pool.connect();
}

module.exports = { pool, query, getClient };
