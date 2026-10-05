'use client';

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { btn, cx } from './ui';

type Result = { ok: true; message?: string; data?: Record<string, unknown> } | { ok: false; error: string };
type Action = (prev: Result | null, fd: FormData) => Promise<Result>;

const PendingContext = createContext(false);

/**
 * A form wired to a server action, showing its error or success message.
 * It submits through onSubmit rather than the form's action prop so that React does not
 * clear what the person typed when the server sends back an error.
 */
export function ActionForm({
  action, children, className, resetOnSuccess = false, onSuccess, successMessage, id, confirm: confirmText,
}: {
  action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean;
  onSuccess?: (r: Result) => void; successMessage?: string; id?: string; confirm?: string;
}) {
  const [state, dispatch, pending] = useActionState<Result | null, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const [shown, setShown] = useState<Result | null>(null);
  useEffect(() => {
    if (!state) return;
    setShown(state);
    if (state.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form
      id={id}
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        if (confirmText && !window.confirm(confirmText)) return;
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        const fd = new FormData(e.currentTarget, submitter instanceof HTMLElement ? submitter : null);
        startTransition(() => dispatch(fd));
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      {shown && !shown.ok && (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[14px] text-red-800">{shown.error}</p>
      )}
      {shown && shown.ok && (shown.message || successMessage) && (
        <p role="status" className="mt-3 whitespace-pre-line rounded-md border border-green-200 bg-green-50 px-3 py-2 text-[14px] text-green-900">
          {shown.message || successMessage}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({ children, variant = 'primary', small, className, pendingText, name, value }: {
  children: ReactNode; variant?: keyof typeof btn; small?: boolean; className?: string; pendingText?: string;
  name?: string; value?: string;
}) {
  const inActionForm = useContext(PendingContext);
  const { pending: nativePending } = useFormStatus();
  const pending = inActionForm || nativePending;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-busy={pending || undefined}
      className={cx(btn.base, btn[variant as 'primary'], small && btn.small, className)}
    >
      {pending ? pendingText ?? 'Saving…' : children}
    </button>
  );
}

export function CopyButton({ text, label = 'Copy link' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={cx(btn.base, btn.secondary, btn.small)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          window.prompt('Copy this link:', text);
        }
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}
