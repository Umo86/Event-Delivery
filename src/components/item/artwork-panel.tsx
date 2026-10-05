import Link from 'next/link';
import { Download, ExternalLink, FileText } from 'lucide-react';
import type { ItemDetail } from '@/lib/data/load';
import type { CurrentUser } from '@/lib/auth/session';
import { fmtDateTime } from '@/lib/dates';
import { canEdit, isAdmin } from '@/lib/domain/permissions';
import { blobAccess } from '@/lib/storage';
import { ActionForm, SubmitButton } from '../forms';
import { ButtonLink, cx, Panel } from '../ui';
import { ArtworkUploader } from './uploader';
import { deleteVersion } from '@/app/actions/items';

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ArtworkPanel({ detail, user, viewVersion }: { detail: ItemDetail; user: CurrentUser; viewVersion?: number }) {
  const { versions, row } = detail;
  const { item, state } = row;
  const current = versions[0] ?? null;
  const shown = versions.find((v) => v.version === viewVersion) ?? current;
  const names = detail.bundle.ctx.userNames;
  const editable = canEdit(user) && !item.cancelled;

  return (
    <Panel title="Artwork" actions={shown && (
      <>
        <ButtonLink href={`/api/files/${shown.id}/original`} plain small target="_blank" rel="noopener">
          <ExternalLink size={15} aria-hidden /> Open
        </ButtonLink>
        <ButtonLink href={`/api/files/${shown.id}/original?download=1`} plain small>
          <Download size={15} aria-hidden /> Download
        </ButtonLink>
      </>
    )}>
      {shown ? (
        <>
          <div className="relative flex min-h-[240px] items-center justify-center overflow-hidden rounded-md border border-line bg-[repeating-conic-gradient(#f3f5f8_0%_25%,#ffffff_0%_50%)] bg-[length:20px_20px]">
            {shown.preview_url || shown.mime_type.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${shown.id}/preview`} alt={`Artwork v${shown.version} for ${row.code}`}
                className="max-h-[520px] w-auto max-w-full object-contain" />
            ) : (
              <a href={`/api/files/${shown.id}/original`} target="_blank" rel="noopener" className="flex flex-col items-center gap-2 p-8 text-ink">
                <FileText size={40} aria-hidden /> <span className="font-semibold underline">Open {shown.file_name}</span>
              </a>
            )}
            {shown.version !== current?.version && (
              <span className="absolute left-2 top-2 rounded bg-ink px-2 py-0.5 text-[12.5px] font-semibold text-white">Older version</span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-[13.5px]">
            <p className="text-ink-2">
              <b className="text-ink">v{shown.version}</b> {shown.file_name}, {fileSize(shown.size_bytes)}
              {shown.page_count && shown.page_count > 1 ? `, ${shown.page_count} pages` : ''}
              <span className="block text-muted">Uploaded by {shown.uploaded_by ? names.get(shown.uploaded_by) ?? 'someone' : 'someone'}, {fmtDateTime(shown.uploaded_at)}</span>
            </p>
            {isAdmin(user) && (
              <ActionForm action={deleteVersion} confirm={`Remove v${shown.version}? Sign-off decisions for it will no longer count.`}>
                <input type="hidden" name="version_id" value={shown.id} />
                <SubmitButton variant="ghost" small pendingText="Removing…">Remove this version</SubmitButton>
              </ActionForm>
            )}
          </div>
          {shown.note && <p className="mt-1 text-[14px] text-ink">“{shown.note}”</p>}
          {versions.length > 1 && (
            <nav className="mt-3 flex flex-wrap gap-1.5" aria-label="Artwork versions">
              {versions.map((v) => (
                <Link key={v.id} href={`/items/${item.id}${v.version === current?.version ? '' : `?v=${v.version}`}`} scroll={false}
                  aria-current={v.id === shown.id ? 'true' : undefined}
                  className={cx('rounded-full px-2.5 py-0.5 text-[13px] font-semibold ring-1 ring-inset',
                    v.id === shown.id ? 'bg-ink text-white ring-ink' : 'bg-white text-ink-2 ring-line-strong hover:ring-ink')}>
                  v{v.version}{v.version === current?.version ? ' (current)' : ''}
                </Link>
              ))}
            </nav>
          )}
        </>
      ) : (
        <p className="mb-3 text-[14.5px] text-ink-2">
          {item.artwork_by === 'not_required'
            ? 'Artwork isn’t needed for this line, so sign-off has started. You can still upload a reference image.'
            : state.waitingOnLabel ? `No artwork yet. ${state.action}.` : 'No artwork yet.'}
        </p>
      )}
      {item.artwork_link && (
        <p className="mt-3 text-[14px]">
          <a href={item.artwork_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-ink underline underline-offset-2">
            Full-size files <ExternalLink size={14} aria-hidden />
          </a>
        </p>
      )}
      {editable && (
        <div className="mt-4">
          <ArtworkUploader itemId={item.id} eventId={item.event_id} access={blobAccess()}
            nextVersion={(current?.version ?? 0) + 1} hasArtwork={!!current} compact={!!current} />
        </div>
      )}
    </Panel>
  );
}
