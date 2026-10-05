import 'server-only';
import postgres from 'postgres';
import { MIGRATIONS, LATEST_VERSION } from './migrations';
import { bootstrapAdmin, ensureDemoAccount } from '@/lib/bootstrap';

export type Sql = postgres.Sql<Record<string, never>>;

/** Finds the database connection string. Vercel's Neon integration may add a custom prefix. */
export function resolveDatabaseUrl(preferUnpooled = false): string | null {
  const env = process.env;
  const entries = Object.entries(env).filter(([, v]) => typeof v === 'string' && v.startsWith('postgres'));
  const pick = (re: RegExp) => entries.find(([k]) => re.test(k))?.[1] ?? null;
  if (preferUnpooled) {
    const u = pick(/(^|_)DATABASE_URL_UNPOOLED$/) ?? pick(/(^|_)POSTGRES_URL_NON_POOLING$/);
    if (u) return u;
  }
  return (
    env.DATABASE_URL ||
    pick(/(^|_)DATABASE_URL$/) ||
    env.POSTGRES_URL ||
    pick(/(^|_)POSTGRES_URL$/) ||
    pick(/(^|_)DATABASE_URL_UNPOOLED$/) ||
    null
  );
}

function cleanUrl(url: string): string {
  // postgres.js forwards unknown query params to the server; libpq-only options must be removed.
  try {
    const u = new URL(url);
    u.searchParams.delete('channel_binding');
    return u.toString();
  } catch {
    return url;
  }
}

function makeClient(url: string, max: number) {
  return postgres(cleanUrl(url), {
    max,
    prepare: false, // required for transaction-mode poolers (Neon/PgBouncer)
    idle_timeout: 20,
    connect_timeout: 20,
    onnotice: () => {},
    types: {
      // Keep calendar dates as 'YYYY-MM-DD' strings: no time-zone surprises.
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  }) as unknown as Sql;
}

type GlobalWithDb = typeof globalThis & { __edSql?: Sql; __edMigrated?: Promise<void> | null };
const g = globalThis as GlobalWithDb;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('No database is connected. Add a Neon database to this project in Vercel (Storage tab), then redeploy.');
  }
}

function getSql(): Sql {
  if (!g.__edSql) {
    const url = resolveDatabaseUrl();
    if (!url) throw new DatabaseNotConfiguredError();
    g.__edSql = makeClient(url, 5);
  }
  return g.__edSql;
}

async function migrate(): Promise<void> {
  const sql = getSql();
  let current = 0;
  try {
    const r = await sql<{ v: number }[]>`select coalesce(max(version), 0)::int as v from schema_migrations`;
    current = r[0].v;
  } catch (e) {
    if ((e as { code?: string }).code !== '42P01') throw e; // undefined_table -> fresh database
  }
  if (current >= LATEST_VERSION) return;
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(4242001)`;
    await tx`create table if not exists schema_migrations (
      version int primary key, name text not null, applied_at timestamptz not null default now())`;
    const r = await tx<{ v: number }[]>`select coalesce(max(version), 0)::int as v from schema_migrations`;
    for (const m of MIGRATIONS) {
      if (m.version <= r[0].v) continue;
      await tx.unsafe(m.sql);
      await tx`insert into schema_migrations (version, name) values (${m.version}, ${m.name})`;
    }
  });
}

/**
 * Returns the database client, applying any pending migrations first (once per server instance).
 * Then creates the first admin, and a demo account if one is configured, from the deployment settings (see bootstrap.ts).
 */
export async function db(): Promise<Sql> {
  const sql = getSql();
  if (!g.__edMigrated) {
    g.__edMigrated = migrate()
      .then(() => bootstrapAdmin(sql).catch((e) => console.error('Bootstrap admin failed', e)))
      .then(() => ensureDemoAccount(sql).catch((e) => console.error('Demo account failed', e)))
      .catch((e) => {
        g.__edMigrated = null;
        throw e;
      });
  }
  await g.__edMigrated;
  return sql;
}

export function isDatabaseConfigured(): boolean {
  return resolveDatabaseUrl() !== null;
}
