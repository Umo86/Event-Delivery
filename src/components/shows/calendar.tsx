'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays } from '@/lib/dates';
import { cx } from '@/components/ui';

// A month calendar for choosing a show's dates. It shades the run of the show as it's built up
// (build-up, show days, breakdown) and greys out days before the date chosen in the step before.

export type ShowDates = { build: string | null; open: string | null; close: string | null; breakdown: string | null };
export type DateField = keyof ShowDates;
type Phase = 'build' | 'show' | 'breakdown' | null;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const parts = (d: string) => d.split('-').map(Number) as [number, number, number];
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const monthLength = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** "Saturday 25 September 2027" */
export function longDate(d: string): string {
  const [y, m, day] = parts(d);
  return `${DAYS[dow(d)]} ${day} ${MONTHS[m - 1]} ${y}`;
}

/** "Sat 25 Sep 2027" */
export function shortDate(d: string): string {
  const [y, m, day] = parts(d);
  return `${DAYS[dow(d)].slice(0, 3)} ${day} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

export function addMonths(d: string, n: number): string {
  const [y, m, day] = parts(d);
  const t = y * 12 + (m - 1) + n;
  const ny = Math.floor(t / 12);
  const nm = (t % 12) + 1;
  return ymd(ny, nm, Math.min(day, monthLength(ny, nm)));
}

/** Which part of the show a day falls in, from the dates chosen so far. */
export function phaseOf(d: string, s: ShowDates): Phase {
  const { build, open, close, breakdown } = s;
  if (open && (close ? d >= open && d <= close : d === open)) return 'show';
  if (build && (open ? d >= build && d < open : d === build)) return 'build';
  const end = close ?? open;
  if (breakdown && (end ? d > end && d <= breakdown : d === breakdown)) return 'breakdown';
  return null;
}

const PHASE_CLS: Record<Exclude<Phase, null>, string> = {
  build: 'bg-sky-100 text-sky-950',
  show: 'bg-signal text-ink',
  breakdown: 'bg-slate-200 text-slate-800',
};

export const PHASE_KEY: { phase: Exclude<Phase, null>; label: string; swatch: string }[] = [
  { phase: 'build', label: 'Build-up', swatch: 'bg-sky-100 ring-sky-300' },
  { phase: 'show', label: 'Show days', swatch: 'bg-signal ring-[#e0a800]' },
  { phase: 'breakdown', label: 'Breakdown', swatch: 'bg-slate-200 ring-slate-300' },
];

export function Calendar({ field, value, min, dates, month, today, onPick, idPrefix }: {
  field: DateField;
  /** The date chosen for this step. */
  value: string | null;
  /** Days before this can't be picked. */
  min: string | null;
  /** Everything chosen so far, for shading. */
  dates: ShowDates;
  /** 'YYYY-MM' to open on. */
  month: string;
  today: string;
  onPick: (date: string) => void;
  idPrefix: string;
}) {
  const [view, setView] = useState(month);
  const [hover, setHover] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState(value ?? (min && min > `${month}-01` ? min : `${month}-01`));
  const [stamped, setStamped] = useState<string | null>(null);
  const table = useRef<HTMLTableElement>(null);
  const moveFocus = useRef(false);

  // Follow the step opening on a new month (for example when an earlier date changes)
  useEffect(() => setView(month), [month]);
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    table.current?.querySelector<HTMLButtonElement>(`button[data-date="${focusDate}"]`)?.focus();
  }, [focusDate, view]);

  const [vy, vm] = view.split('-').map(Number);
  const first = ymd(vy, vm, 1);
  const lead = (dow(first) + 6) % 7;
  const start = addDays(first, -lead);
  const count = Math.ceil((lead + monthLength(vy, vm)) / 7) * 7;
  const days = Array.from({ length: count }, (_, i) => addDays(start, i));
  const blocked = (d: string) => !!min && d < min;
  const tabbable = days.includes(focusDate) ? focusDate
    : (value && days.includes(value) ? value : days.find((d) => d.startsWith(view) && !blocked(d)) ?? days[0]);
  // While hovering, preview the run of the show as if this day were picked
  const shown: ShowDates = { ...dates, [field]: hover ?? value };

  const years: number[] = [];
  const [ty] = parts(today);
  for (let y = Math.min(ty - 1, vy); y <= Math.max(ty + 6, vy); y++) years.push(y);

  function onKeyDown(e: React.KeyboardEvent) {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const from = tabbable;
    let next: string | null = null;
    if (e.key in step) next = addDays(from, step[e.key]);
    else if (e.key === 'PageUp') next = addMonths(from, e.shiftKey ? -12 : -1);
    else if (e.key === 'PageDown') next = addMonths(from, e.shiftKey ? 12 : 1);
    else if (e.key === 'Home') next = addDays(from, -((dow(from) + 6) % 7));
    else if (e.key === 'End') next = addDays(from, 6 - ((dow(from) + 6) % 7));
    if (!next) return;
    e.preventDefault();
    moveFocus.current = true;
    setFocusDate(next);
    if (!next.startsWith(view)) setView(next.slice(0, 7));
  }

  const nav = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line-strong bg-white text-ink hover:bg-paper';
  const select = 'h-9 rounded-md border border-line-strong bg-white px-2 text-[14.5px] font-semibold text-ink';

  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-2 flex items-center gap-2">
        <button type="button" className={nav} aria-label="Previous month" onClick={() => setView(addMonths(`${view}-01`, -1).slice(0, 7))}>
          <ChevronLeft size={18} aria-hidden />
        </button>
        <div className="flex flex-1 justify-center gap-1.5">
          <label htmlFor={`${idPrefix}-month`} className="sr-only">Month</label>
          <select id={`${idPrefix}-month`} className={select} value={vm}
            onChange={(e) => setView(ymd(vy, Number(e.target.value), 1).slice(0, 7))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <label htmlFor={`${idPrefix}-year`} className="sr-only">Year</label>
          <select id={`${idPrefix}-year`} className={select} value={vy}
            onChange={(e) => setView(ymd(Number(e.target.value), vm, 1).slice(0, 7))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button type="button" className={nav} aria-label="Next month" onClick={() => setView(addMonths(`${view}-01`, 1).slice(0, 7))}>
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>

      <table ref={table} className="w-full table-fixed border-separate border-spacing-y-1" onKeyDown={onKeyDown} onMouseLeave={() => setHover(null)}>
        <caption className="sr-only">{MONTHS[vm - 1]} {vy}</caption>
        <thead>
          <tr>
            {WEEK.map((w) => (
              <th key={w} scope="col" abbr={DAYS[w]} className="pb-1 text-[12px] font-semibold text-muted">{DAYS[w].slice(0, 3)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: count / 7 }, (_, r) => days.slice(r * 7, r * 7 + 7)).map((week) => (
            <tr key={week[0]}>
              {week.map((d, i) => {
                const phase = phaseOf(d, shown);
                const prevSame = i > 0 && phase !== null && phaseOf(week[i - 1], shown) === phase;
                const nextSame = i < 6 && phase !== null && phaseOf(week[i + 1], shown) === phase;
                const off = !d.startsWith(view);
                const no = blocked(d);
                const chosen = d === value;
                return (
                  <td key={d} className="p-0">
                    <button
                      type="button"
                      data-date={d}
                      aria-label={longDate(d)}
                      aria-pressed={chosen}
                      aria-disabled={no || undefined}
                      tabIndex={d === tabbable ? 0 : -1}
                      onMouseEnter={() => setHover(no ? null : d)}
                      onFocus={() => setFocusDate(d)}
                      onClick={() => {
                        if (no) return;
                        setFocusDate(d);
                        setStamped(d);
                        onPick(d);
                      }}
                      className={cx(
                        'relative flex h-10 w-full items-center justify-center text-[14.5px] font-medium transition-colors duration-150',
                        phase ? PHASE_CLS[phase] : off ? 'text-muted/70' : 'text-ink',
                        !prevSame && 'rounded-l-md',
                        !nextSame && 'rounded-r-md',
                        no ? 'cursor-not-allowed text-muted/40 line-through decoration-muted/40'
                          : 'cursor-pointer hover:ring-2 hover:ring-inset hover:ring-ink/50',
                        chosen && 'z-10 rounded-md font-bold ring-2 ring-inset ring-ink',
                        stamped === d && 'motion-safe:animate-[stamp_380ms_ease-out]',
                      )}
                    >
                      {Number(d.slice(8))}
                      {d === today && <span aria-hidden className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-ink" />}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <ul aria-label="Key" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
        {PHASE_KEY.map((k) => (
          <li key={k.phase} className="flex items-center gap-1.5">
            <span aria-hidden className={cx('inline-block h-3 w-4 rounded-sm ring-1 ring-inset', k.swatch)} />{k.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-ink" />Today</li>
      </ul>
    </div>
  );
}
