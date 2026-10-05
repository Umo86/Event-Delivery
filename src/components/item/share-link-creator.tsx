'use client';

import { useState } from 'react';
import { ActionForm, CopyButton, SubmitButton } from '../forms';
import { createShareLink } from '@/app/actions/items';

export function ShareLinkCreator({ itemId }: { itemId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  return (
    <div className="mt-2">
      <ActionForm action={createShareLink} onSuccess={(r) => r.ok && setUrl(String(r.data?.url ?? ''))} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="item_id" value={itemId} />
        <div className="min-w-[180px] flex-1">
          <label htmlFor={`rcpt-${itemId}`} className="block text-[12.5px] font-semibold text-ink-2">Sending to (optional)</label>
          <input id={`rcpt-${itemId}`} name="recipient_name" placeholder="Contact name" maxLength={120}
            className="mt-1 h-8 w-full rounded-md border border-line-strong bg-white px-2.5 text-[14px] focus:border-ink focus:outline-none" />
        </div>
        <SubmitButton small variant="dark" pendingText="Creating…">Create approval link</SubmitButton>
      </ActionForm>
      {url && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-green-200 bg-green-50 p-2">
          <input readOnly value={url} aria-label="Sponsor approval link" onFocus={(e) => e.currentTarget.select()}
            className="h-8 min-w-0 flex-1 rounded border border-green-200 bg-white px-2 text-[13px] text-ink" data-testid="share-url" />
          <CopyButton text={url} />
        </div>
      )}
    </div>
  );
}
