'use client';

import { ActionForm, SubmitButton } from '../forms';
import { revokeShareLink } from '@/app/actions/items';

export function RevokeLinkButton({ linkId }: { linkId: string }) {
  return (
    <ActionForm action={revokeShareLink} confirm="Turn off this link? The sponsor won’t be able to use it.">
      <input type="hidden" name="link_id" value={linkId} />
      <SubmitButton small variant="ghost" pendingText="…">Turn off</SubmitButton>
    </ActionForm>
  );
}
