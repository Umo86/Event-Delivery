'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { ActionForm, SubmitButton } from '@/components/forms';
import { cx } from '@/components/ui';
import { PasswordInput } from '@/components/password-input';
import { setPersonPassword } from '@/app/actions/admin';

/** Typing a password for someone, instead of a generated one. By default they still choose their own at sign-in. */
export function SetPassword({ userId, first }: { userId: string; first: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-line bg-white">
      <button type="button" aria-expanded={open} aria-controls={`sp-panel-${userId}`} onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-left text-[13.5px] hover:bg-paper">
        <ChevronRight size={15} aria-hidden className={cx('shrink-0 text-muted transition-transform', open && 'rotate-90')} />
        <span className="font-semibold text-ink underline underline-offset-2">Set a password yourself</span>
      </button>
      {open && (
        <div id={`sp-panel-${userId}`} className="border-t border-line px-3 py-3 motion-safe:animate-[step-in_240ms_ease-out]">
          <ActionForm action={setPersonPassword} resetOnSuccess className="space-y-2">
            <input type="hidden" name="user_id" value={userId} />
            <div>
              <label htmlFor={`sp-${userId}`} className="mb-1 block text-[13.5px] font-semibold text-ink-2">New password for {first}</label>
              <PasswordInput id={`sp-${userId}`} name="password" autoComplete="new-password" required minLength={8} />
              <p className="mt-1 text-[12.5px] text-muted">At least 8 characters. It isn’t emailed, so tell {first} yourself.</p>
            </div>
            <label className="flex items-start gap-2 text-[14px] text-ink">
              <input type="checkbox" name="must_change" defaultChecked className="mt-[3px] h-4 w-4 shrink-0 accent-[#13233b]" />
              Ask {first} to choose their own password when they next sign in
            </label>
            <SubmitButton variant="secondary" small pendingText="Saving…">Set password</SubmitButton>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
