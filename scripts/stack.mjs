// Starts a local Postgres, a fake Vercel Blob API and a fake email API for development and automated tests.
// Usage: node scripts/stack.mjs [--reset]
//   --reset  drops and recreates the "eventdeliver" database first (clean slate for tests)
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { startFakeBlob } from './fake-blob.mjs';
import { startFakeEmail } from './fake-email.mjs';

export const STACK = {
  pgPort: 54329,
  blobPort: 54400,
  db: 'eventdeliver',
  user: 'postgres',
  password: 'localdev',
  rwToken: 'vercel_blob_rw_localstore_localsecret0123456789',
  emailPort: 54500,
  emailKey: 're_local_test_key',
};

export function stackEnv() {
  return {
    DATABASE_URL: `postgres://${STACK.user}:${STACK.password}@127.0.0.1:${STACK.pgPort}/${STACK.db}`,
    BLOB_READ_WRITE_TOKEN: STACK.rwToken,
    VERCEL_BLOB_API_URL: `http://127.0.0.1:${STACK.blobPort}/api/blob`,
    NEXT_PUBLIC_VERCEL_BLOB_API_URL: `http://127.0.0.1:${STACK.blobPort}/api/blob`,
    BLOB_ACCESS: 'private',
    // Emails go to a local outbox: http://127.0.0.1:54500/outbox
    RESEND_API_KEY: STACK.emailKey,
    RESEND_API_URL: `http://127.0.0.1:${STACK.emailPort}`,
    EMAIL_FROM: 'Event Delivery <invites@ukcw.test>',
  };
}

export async function startStack({ reset = false, root = process.cwd() } = {}) {
  const dataDir = path.join(root, '.local', 'pg');
  const fresh = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
  if (fresh) {
    fs.mkdirSync(dataDir, { recursive: true });
    // Postgres refuses to run as root; embedded-postgres switches to the "postgres" user, which must own the data dir.
    if (process.getuid && process.getuid() === 0) execSync(`chown -R postgres:postgres "${dataDir}"`);
  }
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: STACK.user,
    password: STACK.password,
    port: STACK.pgPort,
    persistent: true,
    onLog: () => {},
    onError: (e) => console.error('[pg]', String(e).trim()),
  });
  if (fresh) await pg.initialise();
  await pg.start();
  const client = pg.getPgClient('postgres', '127.0.0.1');
  await client.connect();
  const exists = await client.query('select 1 from pg_database where datname = $1', [STACK.db]);
  if (reset && exists.rowCount) {
    await client.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`, [STACK.db]);
    await client.query(`drop database ${STACK.db}`);
  }
  if (reset || !exists.rowCount) await client.query(`create database ${STACK.db}`);
  await client.end();

  const blobDir = path.join(root, '.local', 'blob');
  if (reset) fs.rmSync(blobDir, { recursive: true, force: true });
  const blobServer = await startFakeBlob({ port: STACK.blobPort, dir: blobDir, rwToken: STACK.rwToken });
  const emailServer = await startFakeEmail({ port: STACK.emailPort, apiKey: STACK.emailKey });
  return {
    async stop() {
      await new Promise((r) => blobServer.close(() => r()));
      await new Promise((r) => emailServer.close(() => r()));
      await pg.stop();
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const reset = process.argv.includes('--reset');
  const s = await startStack({ reset });
  console.log('Local stack ready');
  for (const [k, v] of Object.entries(stackEnv())) console.log(`${k}=${v}`);
  const shutdown = async () => { await s.stop(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
