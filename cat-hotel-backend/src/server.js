const app = require('./app');
const env = require('./config/env');
const { pool } = require('./config/db');

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Cat Hotel API listening on port ${env.port} [${env.nodeEnv}]`);
});

// Graceful shutdown: stop accepting new connections, let in-flight
// requests finish, then close the DB pool cleanly. Important for
// zero-downtime deploys and to avoid leaving Postgres connections
// dangling when the process is killed (e.g. by a container orchestrator).
async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`Received ${signal}, shutting down gracefully...`);

  server.close(async () => {
    try {
      await pool.end();
      // eslint-disable-next-line no-console
      console.log('Database pool closed. Exiting.');
      process.exit(0);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error while closing database pool', err);
      process.exit(1);
    }
  });

  // Force-exit if graceful shutdown hangs for too long.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
