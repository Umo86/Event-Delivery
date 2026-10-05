import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkSelfTestToken } from '@/lib/setup';
import { runSystemCheck } from '@/lib/selftest';

export const dynamic = 'force-dynamic';

// Each check uploads a small file, and Vercel's free plan counts uploads, so allow one run every few minutes.
const MIN_INTERVAL_SECONDS = 300;

// End-to-end system check (database + file storage + sign-off engine). Protected by a token.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!checkSelfTestToken(token)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = await db();
  const claimed = await sql`
    insert into app_settings (key, value) values ('selftest_last_run', now()::text)
    on conflict (key) do update set value = excluded.value, updated_at = now()
      where app_settings.updated_at < now() - make_interval(secs => ${MIN_INTERVAL_SECONDS})
    returning key`;
  if (!claimed.length) {
    return NextResponse.json({ ok: false, error: `A check ran in the last ${MIN_INTERVAL_SECONDS / 60} minutes. Try again later.` },
      { status: 429, headers: { 'cache-control': 'no-store', 'retry-after': String(MIN_INTERVAL_SECONDS) } });
  }
  const result = await runSystemCheck();
  return NextResponse.json({ ...result, at: new Date().toISOString() }, { status: result.ok ? 200 : 500, headers: { 'cache-control': 'no-store' } });
}
