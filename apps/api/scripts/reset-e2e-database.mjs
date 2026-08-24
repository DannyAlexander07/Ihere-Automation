import pg from 'pg';

const { Client } = pg;
const databaseName = 'ihere_e2e';
const adminUrl =
  process.env.E2E_DATABASE_ADMIN_URL ??
  'postgresql://ihere:ihere_local_only@localhost:54329/postgres';

if (!/^[a-z][a-z0-9_]{2,62}$/.test(databaseName)) {
  throw new Error('El nombre de la base E2E no es seguro.');
}

const client = new Client({ connectionString: adminUrl });
await client.connect();

try {
  await client.query(
    `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
      WHERE datname = $1
        AND pid <> pg_backend_pid()`,
    [databaseName],
  );
  await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await client.query(`CREATE DATABASE "${databaseName}"`);
  process.stdout.write(`Base E2E aislada recreada: ${databaseName}\n`);
} finally {
  await client.end();
}
