'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, UserPlus } from 'lucide-react';
import { ActionForm, SubmitButton } from '@/components/forms';
import { btn, cx } from '@/components/ui';

// Setting up a show after it's created, one step at a time. Each step saves as it goes; saving moves straight
// on to the next step that still needs doing. Steps that are already done (often copied from a past show)
// fold into a one-line summary that can be opened again.

type Result = { ok: true; message?: string; data?: Record<string, unknown> } | { ok: false; error: string };
type Action = (prev: Result | null, fd: FormData) => Promise<Result>;

export interface GuideStep { key: string; title: string; done: boolean; summary: string }

const GuideContext = createContext<{ next: () => void; go: (key: string) => void }>({ next: () => {}, go: () => {} });

export function SetupGuide({ steps, bodies, start }: {
  steps: GuideStep[];
  /** What each step shows when it's open, rendered on the server. */
  bodies: Record<string, ReactNode>;
  start: string;
}) {
  const [current, setCurrent] = useState(start);
  const headings = useRef<Record<string, HTMLHeadingElement | null>>({});
  const shown = useRef(start);
  // The latest steps, so moving on uses what's done after the save rather than before it
  const latest = useRef(steps);
  latest.current = steps;

  useEffect(() => {
    if (shown.current === current) return;
    shown.current = current;
    const h = headings.current[current];
    if (!h) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
      h.closest('li')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      h.focus({ preventScroll: true });
    });
  }, [current]);

  function next() {
    setCurrent((cur) => {
      const list = latest.current;
      const i = list.findIndex((s) => s.key === cur);
      // The next step that still needs doing; the last step is where it all comes together
      return list.slice(i + 1).find((s) => !s.done || s.key === list[list.length - 1].key)?.key ?? list[list.length - 1].key;
    });
  }

  const index = steps.findIndex((s) => s.key === current);
  const countable = steps.length - 1; // the last step is the wrap-up
  const doneCount = steps.slice(0, countable).filter((s) => s.done).length;

  return (
    <GuideContext.Provider value={{ next, go: setCurrent }}>
      <div className="mb-5">
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-4 text-[13.5px]">
          <span className="font-semibold text-ink">Step {index + 1} of {steps.length}: {steps[index]?.title}</span>
          <span className="text-muted">{doneCount} of {countable} done. Each step saves as you go.</span>
        </div>
        <div role="progressbar" aria-label="Set-up progress" aria-valuemin={0} aria-valuemax={countable} aria-valuenow={doneCount}
          className="h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-signal transition-[width] duration-500 ease-out" style={{ width: `${(doneCount / countable) * 100}%` }} />
        </div>
      </div>

      <ol className="space-y-3">
        {steps.map((step, i) => {
          const open = step.key === current;
          const last = i === steps.length - 1;
          return (
            <li key={step.key} aria-current={open ? 'step' : undefined}
              className={cx('scroll-mt-4 rounded-[10px] border bg-surface transition-colors',
                open ? 'border-ink shadow-[0_0_0_3px_var(--color-signal-soft)]' : 'border-line')}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span aria-hidden className={cx('plate flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px]',
                  step.done && !last ? 'bg-ink text-signal' : open ? 'bg-signal text-ink' : 'bg-paper text-muted ring-1 ring-inset ring-line-strong')}>
                  {step.done && !last ? <Check size={15} strokeWidth={3} className="motion-safe:animate-[pop_320ms_ease-out]" /> : i + 1}
                </span>
                <h2 ref={(el) => { headings.current[step.key] = el; }} tabIndex={-1}
                  className={cx('text-[17px] font-semibold outline-none', open || step.done ? 'text-ink' : 'text-muted')}>
                  {step.title}
                </h2>
                {!open && (
                  <>
                    <span className={cx('min-w-0 flex-1 text-[14.5px]', step.done ? 'text-ink-2' : 'text-muted')}>
                      {step.done && !last && <span className="sr-only">Done: </span>}{step.summary}
                    </span>
                    <button type="button" onClick={() => setCurrent(step.key)} className={cx(btn.base, btn.ghost, btn.small)}
                      aria-label={`${step.done ? 'Change' : 'Open'} ${step.title.toLowerCase()}`}>
                      {step.done ? 'Change' : 'Open'}
                    </button>
                  </>
                )}
              </div>
              {open && (
                <div className="border-t border-line px-4 pt-3 pb-4 motion-safe:animate-[step-in_320ms_ease-out]">
                  {bodies[step.key]}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </GuideContext.Provider>
  );
}

/** A step's form: once it saves, the guide moves on after a moment, so the confirmation is seen first. */
export function StepForm({ action, children, className }: { action: Action; children: ReactNode; className?: string }) {
  const { next } = useContext(GuideContext);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <ActionForm action={action} className={className}
      onSuccess={() => { window.clearTimeout(timer.current); timer.current = window.setTimeout(next, 700); }}>
      {children}
    </ActionForm>
  );
}

export function SaveAndContinue({ children = 'Save and continue' }: { children?: ReactNode }) {
  return <SubmitButton variant="dark" pendingText="Saving…">{children}</SubmitButton>;
}

/** Moves on without saving anything (for steps where the list is already right, or to come back to later). */
export function ContinueButton({ children = 'Continue', variant = 'dark' }: { children?: ReactNode; variant?: 'dark' | 'secondary' | 'ghost' }) {
  const { next } = useContext(GuideContext);
  return <button type="button" onClick={next} className={cx(btn.base, btn[variant])}>{children}</button>;
}

/** Opens another step (from the wrap-up's list of what's left). */
export function GoToStep({ step, children }: { step: string; children: ReactNode }) {
  const { go } = useContext(GuideContext);
  return <button type="button" onClick={() => go(step)} className="font-semibold text-ink underline underline-offset-2">{children}</button>;
}

/** Shows its contents (an add-someone form) only when asked for. */
export function Reveal({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={cx(btn.base, btn.secondary, btn.small)}>
          <UserPlus size={15} aria-hidden /> {label}
        </button>
      ) : (
        <div className="motion-safe:animate-[step-in_240ms_ease-out]">{children}</div>
      )}
    </div>
  );
}
