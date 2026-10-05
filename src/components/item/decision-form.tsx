'use client';

import { useState } from 'react';
import { ActionForm, SubmitButton } from '../forms';
import { recordDecision } from '@/app/actions/items';
import { cx, textareaCls } from '../ui';

const LABELS: Record<string, { text: string; variant: 'primary' | 'secondary' | 'danger' }> = {
  approved: { text: 'Approve', variant: 'primary' },
  changes_requested: { text: 'Request changes', variant: 'secondary' },
  rejected: { text: 'Reject', variant: 'danger' },
  on_hold: { text: 'Put on hold', variant: 'secondary' },
};

export function DecisionForm({ itemId, stageId, allowed, reopen = false, onBehalf }: {
  itemId: string; stageId: string; allowed: string[]; reopen?: boolean; onBehalf?: string;
}) {
  const [open, setOpen] = useState(!reopen);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-[13.5px] font-semibold text-ink-2 underline underline-offset-2">
        Change this decision
      </button>
    );
  }
  return (
    <ActionForm action={recordDecision} resetOnSuccess className="mt-3 rounded-md border border-line bg-paper/60 p-3">
      <input type="hidden" name="item_id" value={itemId} />
      <input type="hidden" name="stage_id" value={stageId} />
      {onBehalf && <p className="mb-2 text-[13px] text-muted">{onBehalf}</p>}
      <label htmlFor={`c-${stageId}`} className="block text-[13px] font-semibold text-ink-2">
        Comment {allowed.includes('approved') ? '(needed unless approving)' : '(needed)'}
      </label>
      <textarea id={`c-${stageId}`} name="comment" rows={2} className={cx(textareaCls, 'mt-1 text-[14px]')}
        placeholder="What needs to change, or any conditions" />
      <div className="mt-2 flex flex-wrap gap-2">
        {allowed.map((d) => (
          <SubmitButton key={d} name="decision" value={d} variant={LABELS[d].variant} small pendingText="Saving…">
            {LABELS[d].text}
          </SubmitButton>
        ))}
      </div>
    </ActionForm>
  );
}
