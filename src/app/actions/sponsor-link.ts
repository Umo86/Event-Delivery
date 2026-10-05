'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { required, run, str, UserError, type ActionResult } from '@/lib/action';
import { sha256 } from '@/lib/auth/password';
import { loadItem } from '@/lib/data/load';
import { logActivity } from '@/lib/activity';
import { shareLinkStatus, type ShareLinkRow } from '@/lib/domain/share-link';
import { sponsorLinksEnabled } from '@/lib/settings';

const REFUSED: Record<string, string> = {
  off: 'Approval links are switched off at the moment. Ask your contact for help.',
  closed: 'This link is no longer active. Ask your contact for a new one.',
  stale: 'A newer version of this artwork has been uploaded. Ask your contact for a new link.',
  done: 'Your response has already been recorded. Thank you.',
  not_waiting: 'This proof isn’t waiting for your approval any more.',
};

/** Public action used from the sponsor approval link page. The token is the only credential. */
export async function submitSponsorDecision(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const token = required(fd, 'token', 'Link', 200);
    const decision = str(fd, 'decision', 30);
    if (decision !== 'approved' && decision !== 'changes_requested') throw new UserError('Choose approve or request changes.');
    const name = required(fd, 'name', 'Your name', 120);
    const comment = str(fd, 'comment', 2000);
    if (decision === 'changes_requested' && !comment) throw new UserError('Tell us what needs to change.');
    if (!(await sponsorLinksEnabled())) throw new UserError(REFUSED.off);
    const sql = await db();
    const [link] = await sql<(ShareLinkRow & { id: string; item_id: string })[]>`
      select id, item_id, stage_id, version, expires_at, revoked_at, used_at from share_links where token_hash = ${sha256(token)}`;
    if (!link) throw new UserError(REFUSED.closed);
    const detail = await loadItem(link.item_id);
    if (!detail) throw new UserError('This proof is no longer available.');
    const { state, item } = detail.row;
    const status = shareLinkStatus(link, state, item.cancelled);
    if (status !== 'open') throw new UserError(REFUSED[status]);
    // Single use: claim the link first so a double click can't record two decisions.
    const claimed = await sql`update share_links set used_at = now() where id = ${link.id} and used_at is null returning id`;
    if (!claimed.length) throw new UserError(REFUSED.done);
    await sql`insert into decisions (item_id, event_id, stage_id, version, decision, comment, decided_by, decided_by_name, via)
              values (${item.id}, ${item.event_id}, ${link.stage_id}, ${link.version}, ${decision}, ${comment}, null, ${`${name} (sponsor)`}, 'sponsor_link')`;
    const stage = detail.bundle.stages.find((s) => s.id === link.stage_id);
    await logActivity(sql, { eventId: item.event_id, itemId: item.id, userId: null, actorName: `${name} (sponsor)`, kind: 'decision',
      message: `${stage?.name ?? 'Sponsor'}: ${decision === 'approved' ? 'Approved' : 'Changes requested'} v${link.version} through the approval link${comment ? ` – ${comment}` : ''}` });
    revalidatePath('/', 'layout');
    return { ok: true, message: decision === 'approved' ? 'Thank you. Your approval has been recorded.' : 'Thank you. We’ll send a revised proof.' };
  });
}
