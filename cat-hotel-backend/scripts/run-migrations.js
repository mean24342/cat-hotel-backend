// Minimal migration runner: executes every .sql file in /sql, in
// filename order, inside a single transaction. Good enough for a
// foundation project; swap for a proper tool (node-pg-migrate,
// Prisma Migrate, Flyway) once the schema starts changing frequently
// and you need up/down migrations and a tracked migration history table.
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

async function run() {
  const sqlDir = path.join(__dirname, '..', 'sql');
  const files = fs.readdirSync(sqlDir).filter((f) => f.endsWith('.sql')).sort();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const file of files) {
      const filePath = path.join(sqlDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`Applying ${file}...`);
      await client.query(sql);
    }
    await client.query('COMMIT');
    console.log('All migrations applied successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed, rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
