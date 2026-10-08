'use client';

import Link from 'next/link';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Check, Info, Wand2 } from 'lucide-react';
import { addDays, daysBetween } from '@/lib/dates';
import { DEADLINE_RULES, suggestedDeadlines } from '@/lib/domain/deadlines';
import { ActionForm, SubmitButton } from '@/components/forms';
import { btn, cx, inputCls } from '@/components/ui';
import { createEvent } from '@/app/actions/settings';
import { Calendar, PHASE_KEY, shortDate, type DateField, type ShowDates } from './calendar';

// New show, one step at a time. Each step says what to do; picking a day on the calendar moves straight on,
// and every later calendar starts from the date picked before it. Nothing is saved until "Create show".

type StepKey = 'name' | DateField | 'copy' | 'review';

const STEPS: { key: StepKey; title: string }[] = [
  { key: 'name', title: 'Name and venue' },
  { key: 'build', title: 'Build-up starts' },
  { key: 'open', title: 'Opening day' },
  { key: 'close', title: 'Closing day' },
  { key: 'breakdown', title: 'Breakdown ends' },
  { key: 'copy', title: 'Copy from a past show' },
  { key: 'review', title: 'Check and create' },
];

const DATE_ORDER: DateField[] = ['build', 'open', 'close', 'breakdown'];

const DATE_STEP: Record<DateField, { ask: string; tip: string; noun: string; skip: string; next: string }> = {
  build: {
    next: 'Next: opening day',
    ask: 'Pick the first day contractors are on site.',
    tip: 'Signage needs to be ready to install from this day.',
    noun: 'build-up date',
    skip: 'Not sure yet? Skip it and add it later in Show setup.',
  },
  open: {
    next: 'Next: closing day',
    ask: 'Pick the day the doors open to visitors.',
    tip: 'Artwork and print deadlines are counted back from this day, so it’s the most important date.',
    noun: 'opening day',
    skip: 'Without an opening day, deadlines can’t be suggested.',
  },
  close: {
    next: 'Next: breakdown',
    ask: 'Pick the last day visitors can come.',
    tip: 'For a one-day show, pick the opening day again.',
    noun: 'closing day',
    skip: 'You can add it later in Show setup.',
  },
  breakdown: {
    next: 'Next: copy from a past show',
    ask: 'Pick the day breakdown finishes and the hall is handed back.',
    tip: 'Signage has to be collected by the end of this day.',
    noun: 'breakdown date',
    skip: 'You can add it later in Show setup.',
  },
};

/** The earliest day each date can be: never before the date chosen in the step before it. */
function minFor(f: DateField, d: ShowDates): { date: string; after: DateField } | null {
  const earlier = DATE_ORDER.slice(0, DATE_ORDER.indexOf(f)).reverse();
  for (const e of earlier) if (d[e]) return { date: d[e]!, after: e };
  return null;
}

interface State { current: StepKey; done: StepKey[]; dates: ShowDates; note: { step: DateField; text: string } | null }
type Action =
  | { type: 'go'; step: StepKey }
  | { type: 'complete'; step: StepKey }
  | { type: 'date'; field: DateField; value: string | null }
  | { type: 'pattern'; dates: ShowDates };

function nextStep(from: StepKey, done: StepKey[]): StepKey {
  const i = STEPS.findIndex((s) => s.key === from);
  return STEPS.slice(i + 1).find((s) => !done.includes(s.key))?.key ?? 'review';
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'go':
      return { ...s, current: a.step };
    case 'complete': {
      const done = s.done.includes(a.step) ? s.done : [...s.done, a.step];
      return { ...s, done, current: nextStep(a.step, done) };
    }
    case 'date': {
      // A later date that's now before this one is cleared, and that step asks again
      const dates = { ...s.dates, [a.field]: a.value };
      const cleared: DateField[] = [];
      for (const g of DATE_ORDER.slice(DATE_ORDER.indexOf(a.field) + 1)) {
        const m = minFor(g, dates);
        if (dates[g] && m && dates[g]! < m.date) { dates[g] = null; cleared.push(g); }
      }
      const done = s.done.filter((k) => !cleared.includes(k as DateField));
      const note = cleared.length
        ? { step: cleared[0], text: `Pick the ${DATE_STEP[cleared[0]].noun} again: the one you had was before the new ${DATE_STEP[a.field].noun}.` }
        : s.note?.step === a.field ? null : s.note;
      return { ...s, dates, done, note };
    }
    case 'pattern': {
      const done = [...new Set<StepKey>([...s.done, 'open', 'close', 'breakdown'])];
      return { ...s, dates: a.dates, done, note: null, current: nextStep('breakdown', done) };
    }
  }
}

export interface ReferenceShow { name: string; build_start: string; show_open: string; show_close: string; breakdown_end: string }

export function NewShowWizard({ venues, events, defaultCopy, reference, today }: {
  venues: readonly string[];
  events: { id: string; name: string; archived: boolean }[];
  defaultCopy: string;
  /** A past show with all four dates, whose timings can be reused. */
  reference: ReferenceShow | null;
  today: string;
}) {
  const [s, dispatch] = useReducer(reducer, { current: 'name', done: [], dates: { build: null, open: null, close: null, breakdown: null }, note: null });
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('NEC Birmingham');
  const [nameError, setNameError] = useState(false);
  const [copyFrom, setCopyFrom] = useState(defaultCopy);
  const [copySponsors, setCopySponsors] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const headings = useRef<Partial<Record<StepKey, HTMLHeadingElement | null>>>({});
  const shownStep = useRef<StepKey>('name');

  // Bring each new step into view and give it focus, so keyboard and screen reader users follow along
  useEffect(() => {
    if (shownStep.current === s.current) return;
    shownStep.current = s.current;
    const h = headings.current[s.current];
    if (!h) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
      h.closest('li')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      h.focus({ preventScroll: true });
    });
  }, [s.current]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const go = (step: StepKey) => { window.clearTimeout(timer.current); dispatch({ type: 'go', step }); };
  const complete = (step: StepKey) => { window.clearTimeout(timer.current); dispatch({ type: 'complete', step }); };
  const pick = (field: DateField, value: string) => {
    window.clearTimeout(timer.current);
    dispatch({ type: 'date', field, value });
    // A short pause shows the choice landing before moving on
    timer.current = window.setTimeout(() => dispatch({ type: 'complete', step: field }), 450);
  };

  const index = STEPS.findIndex((x) => x.key === s.current);
  const copyName = events.find((e) => e.id === copyFrom)?.name ?? null;

  function summary(k: StepKey): string {
    if (k === 'name') return [name.trim(), venue].filter(Boolean).join(', ');
    if (k === 'copy') return copyName ? `Copy from ${copyName}${copySponsors ? ', with its sponsors' : ''}` : 'The standard sign-off stages';
    if (k === 'review') return '';
    const v = s.dates[k];
    if (!v) return 'Not set yet';
    if (k === 'close' && s.dates.open) {
      const n = daysBetween(s.dates.open, v) + 1;
      return `${shortDate(v)} (${n} show day${n === 1 ? '' : 's'})`;
    }
    return shortDate(v);
  }

  return (
    <div>
      <div className="mb-5">
        <div className="mb-1.5 flex items-baseline justify-between text-[13.5px]">
          <span className="font-semibold text-ink">Step {index + 1} of {STEPS.length}: {STEPS[index].title}</span>
          <span className="text-muted">Nothing is saved until you create the show.</span>
        </div>
        <div role="progressbar" aria-label="Progress" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={index + 1}
          className="h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-signal transition-[width] duration-500 ease-out" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <ol className="space-y-3">
        {STEPS.map((step, i) => {
          const current = step.key === s.current;
          const done = s.done.includes(step.key) && !current;
          const upcoming = !current && !done;
          return (
            <li key={step.key} aria-current={current ? 'step' : undefined}
              className={cx('scroll-mt-4 rounded-[10px] border bg-surface transition-colors',
                current ? 'border-ink shadow-[0_0_0_3px_var(--color-signal-soft)]' : 'border-line')}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span aria-hidden className={cx('plate flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px]',
                  done ? 'bg-ink text-signal' : current ? 'bg-signal text-ink' : 'bg-paper text-muted ring-1 ring-inset ring-line-strong')}>
                  {done ? <Check size={15} strokeWidth={3} className="motion-safe:animate-[pop_320ms_ease-out]" /> : i + 1}
                </span>
                <h2 ref={(el) => { headings.current[step.key] = el; }} tabIndex={-1}
                  className={cx('text-[17px] font-semibold outline-none', upcoming ? 'text-muted' : 'text-ink')}>
                  {step.title}
                </h2>
                {done && (
                  <>
                    <span className="min-w-0 flex-1 text-[14.5px] text-ink-2">{summary(step.key)}</span>
                    <button type="button" onClick={() => go(step.key)} className={cx(btn.base, btn.ghost, btn.small)}
                      aria-label={`Change ${step.title.toLowerCase()}`}>Change</button>
                  </>
                )}
              </div>

              {current && (
                <div className="border-t border-line px-4 pt-3 pb-4 motion-safe:animate-[step-in_320ms_ease-out]">
                  {step.key === 'name' && (
                    <NameStep name={name} venue={venue} venues={venues} error={nameError}
                      onName={(v) => { setName(v); if (v.trim()) setNameError(false); }} onVenue={setVenue}
                      onNext={() => (name.trim() ? complete('name') : setNameError(true))} />
                  )}
                  {(step.key === 'build' || step.key === 'open' || step.key === 'close' || step.key === 'breakdown') && (
                    <DateStep key={step.key} field={step.key} dates={s.dates} today={today} note={s.note?.step === step.key ? s.note.text : null}
                      reference={step.key === 'open' ? reference : null}
                      onPick={(v) => pick(step.key as DateField, v)}
                      onTyped={(v) => { dispatch({ type: 'date', field: step.key as DateField, value: v }); complete(step.key); }}
                      onSkip={() => { dispatch({ type: 'date', field: step.key as DateField, value: null }); complete(step.key); }}
                      onPattern={(d) => { window.clearTimeout(timer.current); dispatch({ type: 'pattern', dates: d }); }} />
                  )}
                  {step.key === 'copy' && (
                    <CopyStep events={events} copyFrom={copyFrom} copySponsors={copySponsors}
                      onCopyFrom={setCopyFrom} onCopySponsors={setCopySponsors} onNext={() => complete('copy')} />
                  )}
                  {step.key === 'review' && (
                    <ReviewStep name={name.trim()} venue={venue} dates={s.dates} copyFrom={copyFrom} copyName={copyName}
                      copySponsors={copySponsors} today={today} onEdit={go} />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-5 text-[14px]">
        <Link href="/shows" className="font-semibold text-ink-2 underline underline-offset-2 hover:text-ink">Cancel and go back to All shows</Link>
      </p>
    </div>
  );
}

function Ask({ children, tip }: { children: React.ReactNode; tip?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="text-[15px] font-semibold text-ink">{children}</p>
      {tip && <p className="mt-0.5 flex gap-1.5 text-[13.5px] text-ink-2"><Info size={15} aria-hidden className="mt-[3px] shrink-0 text-muted" />{tip}</p>}
    </div>
  );
}

function NameStep({ name, venue, venues, error, onName, onVenue, onNext }: {
  name: string; venue: string; venues: readonly string[]; error: boolean;
  onName: (v: string) => void; onVenue: (v: string) => void; onNext: () => void;
}) {
  return (
    <>
      <Ask tip="The venue decides which halls you can choose on each line.">Give the show the name your team uses, and pick the venue.</Ask>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ne-name" className="mb-1 block text-[13.5px] font-semibold text-ink-2">Show name</label>
          <input id="ne-name" value={name} autoFocus autoComplete="off" placeholder="UKCW Birmingham 2028"
            aria-invalid={error || undefined} aria-describedby={error ? 'ne-name-error' : undefined}
            onChange={(e) => onName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onNext(); } }}
            className={cx(inputCls, error && 'border-red-500')} />
          {error && <p id="ne-name-error" className="mt-1 text-[13px] font-semibold text-red-700">Give the show a name to carry on.</p>}
        </div>
        <div>
          <label htmlFor="ne-venue" className="mb-1 block text-[13.5px] font-semibold text-ink-2">Venue</label>
          <select id="ne-venue" value={venue} onChange={(e) => onVenue(e.target.value)} className={inputCls}>
            {venues.map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-4"><button type="button" onClick={onNext} className={cx(btn.base, btn.dark)}>Next: build-up</button></div>
    </>
  );
}

function DateStep({ field, dates, today, note, reference, onPick, onTyped, onSkip, onPattern }: {
  field: DateField; dates: ShowDates; today: string; note: string | null; reference: ReferenceShow | null;
  onPick: (v: string) => void; onTyped: (v: string) => void; onSkip: () => void; onPattern: (d: ShowDates) => void;
}) {
  const text = DATE_STEP[field];
  const min = minFor(field, dates);
  const value = dates[field];
  const [typed, setTyped] = useState(value ?? '');
  const [typedError, setTypedError] = useState<string | null>(null);
  // Keep the typed box in step with picks on the calendar and with dates filled in for you
  useEffect(() => { setTyped(value ?? ''); setTypedError(null); }, [value]);
  const month = (value ?? min?.date ?? today).slice(0, 7);
  const id = `ne-${field}`;

  function submitTyped() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(typed) || Number(typed.slice(0, 4)) < 2000) {
      setTypedError('Enter the whole date, or pick it on the calendar.');
      return;
    }
    if (min && typed < min.date) {
      setTypedError(`Pick ${shortDate(min.date)} or later: that’s the ${DATE_STEP[min.after].noun}.`);
      return;
    }
    onTyped(typed);
  }

  // Reusing a past show's timings: the same gaps between build-up, opening, closing and breakdown
  const pattern = reference && dates.build ? (() => {
    const open = addDays(dates.build!, daysBetween(reference.build_start, reference.show_open));
    const close = addDays(open, daysBetween(reference.show_open, reference.show_close));
    const breakdown = addDays(close, daysBetween(reference.show_close, reference.breakdown_end));
    return { build: dates.build, open, close, breakdown };
  })() : null;

  return (
    <>
      {note && <p role="status" className="mb-3 rounded-md border border-amber-300 bg-signal-soft px-3 py-2 text-[14px] text-ink">{note}</p>}
      <Ask tip={text.tip}>{text.ask}</Ask>
      {min && (
        <p className="mb-3 text-[13.5px] text-ink-2">
          The calendar starts from the {DATE_STEP[min.after].noun}, {shortDate(min.date)}. Days before it are greyed out.
        </p>
      )}

      {pattern && (
        <div className="mb-4 rounded-md border border-line bg-paper/70 p-3">
          <p className="text-[14px] text-ink">
            <b>Same timings as {reference!.name}?</b> Opens {shortDate(pattern.open!)}, closes {shortDate(pattern.close!)}, breakdown
            ends {shortDate(pattern.breakdown!)}.
          </p>
          <button type="button" onClick={() => onPattern(pattern)} className={cx(btn.base, btn.secondary, btn.small, 'mt-2')}>
            <Wand2 size={15} aria-hidden /> Use these dates
          </button>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <Calendar idPrefix={id} field={field} value={value} min={min?.date ?? null} dates={dates} month={month} today={today} onPick={onPick} />
        <div className="space-y-4">
          <div>
            <label htmlFor={id} className="mb-1 block text-[13.5px] font-semibold text-ink-2">Or type the date</label>
            <div className="flex flex-wrap items-center gap-2">
              <input id={id} type="date" value={typed} min={min?.date}
                aria-invalid={typedError ? true : undefined} aria-describedby={typedError ? `${id}-error` : undefined}
                onChange={(e) => { setTyped(e.target.value); setTypedError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitTyped(); } }}
                className={cx(inputCls, 'w-auto min-w-[170px]')} />
              <button type="button" onClick={submitTyped} className={cx(btn.base, btn.dark)}>{text.next}</button>
            </div>
            {typedError && <p id={`${id}-error`} className="mt-1 text-[13px] font-semibold text-red-700">{typedError}</p>}
          </div>
          <div className="border-t border-line pt-3">
            <button type="button" onClick={onSkip} className="text-[14px] font-semibold text-ink-2 underline underline-offset-2 hover:text-ink">
              Skip for now
            </button>
            <p className="mt-0.5 text-[13px] text-muted">{text.skip}</p>
          </div>
        </div>
      </div>
    </>
  );
}

function CopyStep({ events, copyFrom, copySponsors, onCopyFrom, onCopySponsors, onNext }: {
  events: { id: string; name: string; archived: boolean }[]; copyFrom: string; copySponsors: boolean;
  onCopyFrom: (v: string) => void; onCopySponsors: (v: boolean) => void; onNext: () => void;
}) {
  return (
    <>
      <Ask tip="Lines aren’t copied: the new show starts with empty signage lists.">
        Start from a show you’ve already set up, or from the standard sign-off stages.
      </Ask>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ne-copy" className="mb-1 block text-[13.5px] font-semibold text-ink-2">Copy sign-off stages, approvers, budget and owners from</label>
          <select id="ne-copy" value={copyFrom} onChange={(e) => onCopyFrom(e.target.value)} className={inputCls}>
            <option value="">Nothing: start with the standard stages</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}{e.archived ? ' (archived)' : ''}</option>)}
          </select>
        </div>
        <label className={cx('flex items-center gap-2 text-[14.5px] sm:pt-6', !copyFrom && 'opacity-50')}>
          <input type="checkbox" checked={copySponsors && !!copyFrom} disabled={!copyFrom} onChange={(e) => onCopySponsors(e.target.checked)}
            className="h-4 w-4 accent-[#13233b]" />
          Also copy the sponsor list
        </label>
      </div>
      <p className="mt-2 text-[13.5px] text-ink-2">
        {copyFrom
          ? 'The approvers on each stage come across too, so sign-off works straight away.'
          : 'You’ll get Operations, Marketing, Sponsor and Final sign-off. Choose their approvers in Show setup.'}
      </p>
      <div className="mt-4"><button type="button" onClick={onNext} className={cx(btn.base, btn.dark)}>Next: check and create</button></div>
    </>
  );
}

function ReviewStep({ name, venue, dates, copyFrom, copyName, copySponsors, today, onEdit }: {
  name: string; venue: string; dates: ShowDates; copyFrom: string; copyName: string | null; copySponsors: boolean; today: string;
  onEdit: (k: StepKey) => void;
}) {
  const deadlines = suggestedDeadlines(dates.open);
  const missing = DATE_ORDER.filter((f) => !dates[f]);
  return (
    <>
      <Ask>Check everything, then create the show. You can change any of it later in Show setup.</Ask>
      <dl className="grid gap-x-6 gap-y-2 text-[14.5px] sm:grid-cols-[180px_minmax(0,1fr)]">
        <dt className="font-semibold text-ink-2">Show</dt>
        <dd className="text-ink">{name}, {venue}</dd>
        <dt className="font-semibold text-ink-2">Starts from</dt>
        <dd className="text-ink">{copyName ? `${copyName}${copySponsors ? ', with its sponsor list' : ''}` : 'The standard sign-off stages'}</dd>
      </dl>

      <h3 className="mt-5 mb-2 text-[15px] font-semibold text-ink">The run of the show</h3>
      <Timeline dates={dates} />
      {missing.length > 0 && (
        <p className="mt-2 text-[13.5px] text-ink-2">
          Not set yet: {missing.map((f) => DATE_STEP[f].noun).join(', ')}.{' '}
          <button type="button" onClick={() => onEdit(missing[0])} className="font-semibold text-ink underline underline-offset-2">Add {missing.length === 1 ? 'it' : 'them'} now</button>
        </p>
      )}

      <h3 className="mt-5 mb-1 text-[15px] font-semibold text-ink">Deadlines</h3>
      {dates.open ? (
        <>
          <p className="mb-2 text-[13.5px] text-ink-2">Worked out from the opening day. Change them in Show setup if you need to.</p>
          <table className="w-full max-w-[560px] text-[14px]">
            <tbody>
              {DEADLINE_RULES.map((r) => {
                const d = deadlines[r.key]!;
                const past = d < today;
                return (
                  <tr key={r.key} className="border-b border-line last:border-0">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink-2">{r.list} {r.what}</th>
                    <td className="py-1.5 pr-3 font-semibold text-ink">{shortDate(d)}</td>
                    <td className={cx('py-1.5 text-[13px]', past ? 'font-semibold text-red-700' : 'text-muted')}>
                      {past ? 'Already passed' : `${r.weeks} weeks before opening`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : <p className="text-[13.5px] text-ink-2">Add an opening day and the deadlines are worked out for you.</p>}

      <ActionForm action={createEvent} className="mt-5">
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="venue" value={venue} />
        <input type="hidden" name="build_start" value={dates.build ?? ''} />
        <input type="hidden" name="show_open" value={dates.open ?? ''} />
        <input type="hidden" name="show_close" value={dates.close ?? ''} />
        <input type="hidden" name="breakdown_end" value={dates.breakdown ?? ''} />
        <input type="hidden" name="copy_from" value={copyFrom} />
        {copyFrom && copySponsors && <input type="hidden" name="copy_sponsors" value="1" />}
        <SubmitButton pendingText="Creating…">Create show</SubmitButton>
      </ActionForm>
    </>
  );
}

/** The show's dates as one strip: build-up, show days and breakdown, each as wide as it is long. */
function Timeline({ dates }: { dates: ShowDates }) {
  const { build, open, close, breakdown } = dates;
  const end = close ?? open;
  const parts = [
    { phase: 'build' as const, days: build && open ? daysBetween(build, open) : build ? 1 : 0, from: build, to: open ? addDays(open, -1) : build },
    { phase: 'show' as const, days: open ? (close ? daysBetween(open, close) + 1 : 1) : 0, from: open, to: close ?? open },
    { phase: 'breakdown' as const, days: end && breakdown ? daysBetween(end, breakdown) : breakdown ? 1 : 0, from: end ? addDays(end, 1) : breakdown, to: breakdown },
  ].filter((p) => p.days > 0);
  if (!parts.length) return <p className="text-[13.5px] text-ink-2">No dates yet.</p>;
  const label = (p: (typeof parts)[number]) => PHASE_KEY.find((k) => k.phase === p.phase)!.label;
  return (
    <div className="max-w-[560px]">
      <div className="flex h-9 overflow-hidden rounded-md ring-1 ring-inset ring-line-strong" aria-hidden>
        {parts.map((p) => (
          <div key={p.phase} style={{ flexGrow: p.days }}
            className={cx('flex min-w-[2.5rem] basis-0 items-center justify-center text-[12.5px] font-semibold',
              p.phase === 'build' ? 'bg-sky-100 text-sky-950' : p.phase === 'show' ? 'bg-signal text-ink' : 'bg-slate-200 text-slate-800')}>
            {p.days} day{p.days === 1 ? '' : 's'}
          </div>
        ))}
      </div>
      <ul className="mt-2 space-y-1 text-[14px]">
        {parts.map((p) => (
          <li key={p.phase} className="flex flex-wrap gap-x-2">
            <span className="w-24 shrink-0 font-semibold text-ink-2">{label(p)}</span>
            <span className="text-ink">
              {p.from && p.to && p.from !== p.to ? `${shortDate(p.from)} to ${shortDate(p.to)}` : p.from ? shortDate(p.from) : ''}
              {` (${p.days} day${p.days === 1 ? '' : 's'})`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
