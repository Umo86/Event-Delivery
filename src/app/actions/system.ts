'use server';

import { run, type ActionResult } from '@/lib/action';
import { actor } from '@/lib/auth/session';
import { runSystemCheck } from '@/lib/selftest';

export async function runCheck(_prev: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await actor('super_admin');
    const r = await runSystemCheck();
    const lines = r.steps.map((s) => `${s.ok ? '✓' : '✗'} ${s.step}${s.detail ? ` (${s.detail})` : ''}`).join('\n');
    if (!r.ok) return { ok: false, error: `Some checks failed:\n${lines}` };
    return { ok: true, message: `Everything works:\n${lines}` };
  });
}
