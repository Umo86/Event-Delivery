'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { required, run, str, UserError, type ActionResult } from '@/lib/action';
import { sha256 } from '@/lib/auth/password';
import { loadItem } from '@/lib/data/load';
import { logActivity } from '@/lib/activity';

/** Public action used from the sponsor approval link page. The token is the only credential. */
export async function submitSponsorDecision(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const token = required(fd, 'token', 'Link', 200);
    const decision = str(fd, 'decision', 30);
    if (decision !== 'approved' && decision !== 'changes_requested') throw new UserError('Choose approve or request changes.');
    const name = required(fd, 'name', 'Your name', 120);
    const comment = str(fd, 'comment', 2000);
    if (decision === 'changes_requested' && !comment) throw new UserError('Tell us what needs to change.');
    const sql = await db();
    const [link] = await sql<{ id: string; item_id: string; stage_id: string; version: number; expires_at: Date; revoked_at: Date | null; used_at: Date | null }[]>`
      select id, item_id, stage_id, version, expires_at, revoked_at, used_at from share_links where token_hash = ${sha256(token)}`;
    if (!link || link.revoked_at || new Date(link.expires_at) < new Date()) throw new UserError('This link is no longer active. Ask your contact for a new one.');
    const detail = await loadItem(link.item_id);
    if (!detail) throw new UserError('This proof is no longer available.');
    const { state, item } = detail.row;
    if (state.version !== link.version) throw new UserError('A newer version of this artwork has been uploaded. Ask your contact for a new link.');
    if (state.currentStage?.id !== link.stage_id) throw new UserError('This proof isn’t waiting for your approval any more.');
    await sql`insert into decisions (item_id, event_id, stage_id, version, decision, comment, decided_by, decided_by_name, via)
              values (${item.id}, ${item.event_id}, ${link.stage_id}, ${link.version}, ${decision}, ${comment}, null, ${`${name} (sponsor)`}, 'sponsor_link')`;
    await sql`update share_links set used_at = now() where id = ${link.id}`;
    const stage = detail.bundle.stages.find((s) => s.id === link.stage_id);
    await logActivity(sql, { eventId: item.event_id, itemId: item.id, userId: null, actorName: `${name} (sponsor)`, kind: 'decision',
      message: `${stage?.name ?? 'Sponsor'}: ${decision === 'approved' ? 'Approved' : 'Changes requested'} v${link.version} through the approval link${comment ? ` – ${comment}` : ''}` });
    revalidatePath('/', 'layout');
    return { ok: true, message: decision === 'approved' ? 'Thank you. Your approval has been recorded.' : 'Thank you. We’ll send a revised proof.' };
  });
}
