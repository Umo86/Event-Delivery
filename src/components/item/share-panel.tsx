import type { ItemDetail } from '@/lib/data/load';
import { fmtDateTime } from '@/lib/dates';
import { ShareLinkCreator } from './share-link-creator';
import { RevokeLinkButton } from './revoke-link';

export function SharePanel({ detail, stageId }: { detail: ItemDetail; stageId: string }) {
  const { state, sponsor } = detail.row;
  const links = detail.shareLinks.filter((l) => l.stage_id === stageId && l.version === state.version);
  const now = Date.now();
  return (
    <div className="mt-3 rounded-md border border-line bg-white p-3">
      <p className="text-[14px] font-semibold text-ink">Ask {sponsor?.name ?? 'the sponsor'} to approve it themselves</p>
      <p className="mt-0.5 text-[13px] text-muted">
        Creates a private link to this proof. The sponsor can approve or ask for changes without an account. Links last 30 days and only work for this version.
      </p>
      <ShareLinkCreator itemId={detail.row.item.id} />
      {links.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-2.5 text-[13px]">
          {links.map((l) => {
            const status = l.revoked_at ? 'Turned off' : new Date(l.expires_at).getTime() < now ? 'Expired' : l.used_at ? 'Used' : 'Active';
            return (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink-2">
                  Link{l.recipient_name ? ` for ${l.recipient_name}` : ''}, created {fmtDateTime(l.created_at)}: <b>{status}</b>
                </span>
                {status === 'Active' && <RevokeLinkButton linkId={l.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
