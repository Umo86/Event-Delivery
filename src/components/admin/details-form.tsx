'use client';

import { useId, useState, type ReactNode } from 'react';
import { ActionForm, CopyButton } from '@/components/forms';
import { btn, cx } from '@/components/ui';

type Result = { ok: true; message?: string; data?: Record<string, unknown> } | { ok: false; error: string };
type Action = (prev: Result | null, fd: FormData) => Promise<Result>;

interface Invite { name: string; to: string; subject: string; body: string; mailto: string }

function isInvite(v: unknown): v is Invite {
  const o = v as Partial<Invite> | null;
  return !!o && typeof o.to === 'string' && typeof o.subject === 'string' && typeof o.body === 'string' && typeof o.mailto === 'string';
}

/**
 * A form for actions that give someone a temporary password (invite, new invite, reset). When it succeeds,
 * the email to send them appears underneath, ready to open in the admin's own email app or copy.
 */
export function DetailsForm({ action, children, className, resetOnSuccess, confirm }: {
  action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean; confirm?: string;
}) {
  const [invite, setInvite] = useState<Invite | null>(null);
  return (
    <div>
      <ActionForm
        action={action}
        className={className}
        resetOnSuccess={resetOnSuccess}
        confirm={confirm}
        onSuccess={(r) => {
          const d = r.ok ? r.data?.invite : null;
          setInvite(isInvite(d) ? d : null);
        }}
      >
        {children}
      </ActionForm>
      {invite && <SendInvite invite={invite} onDone={() => setInvite(null)} />}
    </div>
  );
}

const field = 'block w-full min-w-0 rounded-md border border-line-strong bg-white px-3 text-[14px] text-ink';

/** Enough rows to show the whole message, allowing for long lines wrapping. */
function rowsFor(text: string): number {
  return Math.min(24, text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 70)), 0) + 1);
}

function SendInvite({ invite, onDone }: { invite: Invite; onDone: () => void }) {
  const id = useId();
  return (
    <section role="region" aria-label="Email to send" className="mt-3 rounded-[10px] border-2 border-signal bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[16px] font-semibold text-ink">Send this to {invite.name}</h3>
          <p className="text-[13px] text-muted">The temporary password is only shown here. If it gets lost, make a new one from their row.</p>
        </div>
        <button type="button" onClick={onDone} className={cx(btn.base, btn.ghost, btn.small)}>Done</button>
      </div>

      <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2">
        <label htmlFor={`${id}-to`} className="text-[13px] font-semibold text-ink-2">To</label>
        <input id={`${id}-to`} readOnly value={invite.to} onFocus={(e) => e.currentTarget.select()} className={cx(field, 'h-9')} />
        <CopyButton text={invite.to} label="Copy" ariaLabel="Copy the email address" />
        <label htmlFor={`${id}-subject`} className="text-[13px] font-semibold text-ink-2">Subject</label>
        <input id={`${id}-subject`} readOnly value={invite.subject} onFocus={(e) => e.currentTarget.select()} className={cx(field, 'h-9')} />
        <CopyButton text={invite.subject} label="Copy" ariaLabel="Copy the subject" />
      </div>
      <label htmlFor={`${id}-body`} className="mt-3 mb-1 block text-[13px] font-semibold text-ink-2">Message</label>
      <textarea id={`${id}-body`} readOnly value={invite.body} rows={rowsFor(invite.body)}
        onFocus={(e) => e.currentTarget.select()} className={cx(field, 'resize-y py-2 leading-relaxed')} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={invite.mailto} className={cx(btn.base, btn.primary)}>Open in your email app</a>
        <CopyButton text={invite.body} label="Copy message" />
      </div>
      <p className="mt-2 text-[12.5px] text-muted">
        Opens a new email in Outlook or your usual email app with everything filled in, ready to send. Or copy it into any email.
      </p>
    </section>
  );
}
