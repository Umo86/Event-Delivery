'use client';

import { useState, type ReactNode } from 'react';
import { ActionForm, CopyButton } from '@/components/forms';
import { TEMP_PASSWORD_DAYS } from '@/lib/domain/access';

type Result = { ok: true; message?: string; data?: Record<string, unknown> } | { ok: false; error: string };
type Action = (prev: Result | null, fd: FormData) => Promise<Result>;

/**
 * A form for actions that give someone a temporary password (invite, resend, reset).
 * After it succeeds, the sign-in details are offered as a ready-to-send message: open when the email
 * couldn't be sent, folded away when it was.
 */
export function DetailsForm({ action, children, className, resetOnSuccess, confirm }: {
  action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean; confirm?: string;
}) {
  const [manual, setManual] = useState<{ text: string; emailed: boolean } | null>(null);
  return (
    <div>
      <ActionForm
        action={action}
        className={className}
        resetOnSuccess={resetOnSuccess}
        confirm={confirm}
        onSuccess={(r) => {
          const d = r.ok ? r.data : undefined;
          setManual(d && typeof d.manual === 'string' ? { text: d.manual, emailed: d.emailed === true } : null);
        }}
      >
        {children}
      </ActionForm>
      {manual && <ManualMessage text={manual.text} emailed={manual.emailed} />}
    </div>
  );
}

function ManualMessage({ text, emailed }: { text: string; emailed: boolean }) {
  const body = (
    <div className="mt-2 space-y-2">
      <textarea
        readOnly
        value={text}
        rows={Math.min(14, text.split('\n').length + 1)}
        aria-label="Message with the sign-in details"
        onFocus={(e) => e.currentTarget.select()}
        className="block w-full resize-y rounded-md border border-line-strong bg-white px-3 py-2 text-[13.5px] leading-relaxed text-ink"
      />
      <CopyButton text={text} label="Copy message" />
    </div>
  );
  if (emailed) {
    return (
      <details className="mt-2 text-[13.5px]">
        <summary className="cursor-pointer font-semibold text-ink-2 underline-offset-2 hover:underline">
          Need to pass the details on yourself?
        </summary>
        {body}
      </details>
    );
  }
  return (
    <div className="mt-3 rounded-md border border-amber-300 bg-signal-soft p-3">
      <p className="text-[14px] font-semibold text-ink">Send these sign-in details yourself</p>
      <p className="text-[13px] text-ink-2">Send it to them by email or chat. The temporary password works for {TEMP_PASSWORD_DAYS} days, until they choose their own.</p>
      {body}
    </div>
  );
}
