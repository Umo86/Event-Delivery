import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { sha256 } from '@/lib/auth/password';
import { getAppName, loadItem } from '@/lib/data/load';
import { ProofSheet } from '@/components/proof-sheet';
import { SponsorDecisionForm } from '@/components/sponsor-decision-form';
import { Mark } from '@/components/brand';
import { Notice } from '@/components/ui';
import { shareLinkStatus, type ShareLinkRow } from '@/lib/domain/share-link';
import { sponsorLinksEnabled } from '@/lib/settings';

export const metadata: Metadata = { title: 'Artwork approval', robots: { index: false, follow: false } };

export default async function SponsorProofPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const appName = await getAppName();
  const linksOn = await sponsorLinksEnabled();
  const sql = await db();
  const [link] = !linksOn ? [] : await sql<(ShareLinkRow & { item_id: string; recipient_name: string | null })[]>`
    select item_id, stage_id, version, expires_at, revoked_at, used_at, recipient_name from share_links where token_hash = ${sha256(token.slice(0, 200))}`;
  const detail = link ? await loadItem(link.item_id) : null;

  const shell = (body: React.ReactNode) => (
    <div className="min-h-screen bg-paper">
      <header className="bg-ink px-4 py-3 text-white">
        <div className="mx-auto flex max-w-[860px] items-center gap-2.5"><Mark /> <span className="font-display text-[19px] font-semibold">{appName}</span></div>
      </header>
      <main className="mx-auto max-w-[860px] px-4 py-6">{body}</main>
    </div>
  );

  if (!linksOn) return shell(<Notice tone="warn">Approval links are switched off at the moment. Ask your contact for help.</Notice>);
  if (!link || !detail) return shell(<Notice tone="warn">This approval link isn’t valid. Check you copied all of it, or ask your contact for a new one.</Notice>);
  if (link.revoked_at || new Date(link.expires_at) < new Date()) return shell(<Notice tone="warn">This approval link has expired or been turned off. Ask your contact for a new one.</Notice>);

  const { row } = detail;
  const version = detail.versions.find((v) => v.version === link.version) ?? null;
  const status = shareLinkStatus(link, row.state, row.item.cancelled);
  const stale = status === 'stale';
  const waiting = status === 'open';
  const img = version && (version.preview_url || version.mime_type.startsWith('image/')) ? `/api/files/${version.id}/preview?s=${encodeURIComponent(token)}` : null;

  return shell(
    <>
      <div className="mb-5">
        <h1 className="font-display text-[26px] font-semibold text-ink">Please review this artwork</h1>
        <p className="mt-1 text-ink-2">
          {row.sponsor?.name ? `For ${row.sponsor.name}. ` : ''}Check the spelling, logos, colours, size and position, then approve it or tell us what to change.
        </p>
        {version && (
          <p className="mt-2 text-[14px]">
            <a href={`/api/files/${version.id}/original?s=${encodeURIComponent(token)}`} target="_blank" rel="noopener" className="font-semibold text-ink underline">
              Open the full file ({version.file_name})
            </a>
          </p>
        )}
      </div>
      {stale && <div className="mb-4"><Notice tone="warn">A newer version of this artwork has been uploaded since this link was sent. Ask your contact for a new link.</Notice></div>}
      {status === 'done' && <div className="mb-4"><Notice tone="ok">Thank you. Your response has been recorded.</Notice></div>}
      {status === 'not_waiting' && <div className="mb-4"><Notice tone="info">This proof isn’t waiting for your approval at the moment.</Notice></div>}
      <div className="rounded-[10px] border border-line bg-white p-5">
        <ProofSheet row={row} event={detail.bundle.event} version={version} imageSrc={img} stages={detail.bundle.stages} appName={appName} showSignatures={false} external />
      </div>
      {waiting && (
        <div className="mt-6 rounded-[10px] border-2 border-signal bg-white p-4">
          <h2 className="mb-3 font-display text-[20px] font-semibold text-ink">Your decision</h2>
          <SponsorDecisionForm token={token} defaultName={link.recipient_name ?? ''} />
        </div>
      )}
    </>,
  );
}
