import { NextResponse } from 'next/server';
import { checkSelfTestToken } from '@/lib/setup';
import { runSystemCheck } from '@/lib/selftest';

export const dynamic = 'force-dynamic';

// End-to-end system check (database + file storage + sign-off engine). Protected by a token.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!checkSelfTestToken(token)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const result = await runSystemCheck();
  return NextResponse.json({ ...result, at: new Date().toISOString() }, { status: result.ok ? 200 : 500, headers: { 'cache-control': 'no-store' } });
}
