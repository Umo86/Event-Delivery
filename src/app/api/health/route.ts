import { NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { LATEST_VERSION } from '@/lib/db/migrations';
import { blobAccess, blobSetupProblem, isBlobConfigured } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  const out: Record<string, unknown> = { app: 'Event Delivery', time: new Date().toISOString() };
  const dbInfo: Record<string, unknown> = { configured: isDatabaseConfigured() };
  if (dbInfo.configured) {
    const t = Date.now();
    try {
      const sql = await db();
      const [r] = await sql<{ v: number; users: number }[]>`
        select (select coalesce(max(version), 0)::int from schema_migrations) as v, (select count(*)::int from users) as users`;
      dbInfo.ok = true;
      dbInfo.schemaVersion = r.v;
      dbInfo.schemaUpToDate = r.v === LATEST_VERSION;
      dbInfo.setupComplete = r.users > 0;
      dbInfo.latencyMs = Date.now() - t;
    } catch (e) {
      dbInfo.ok = false;
      dbInfo.error = (e as Error).message;
    }
  }
  out.database = dbInfo;
  out.fileStorage = { configured: isBlobConfigured(), access: blobAccess(), ...(blobSetupProblem() ? { problem: blobSetupProblem() } : {}) };
  const ok = dbInfo.ok === true && isBlobConfigured();
  return NextResponse.json({ ok, ...out }, { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
