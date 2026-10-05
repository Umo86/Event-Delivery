'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Search } from 'lucide-react';
import { cx } from './ui';

type Opt = { value: string; label: string };

export function FilterBar({ statuses, people, sponsors, halls, showSponsor = true }: {
  statuses: Opt[]; people: Opt[]; sponsors: Opt[]; halls: string[]; showSponsor?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The filters asked for so far. Quick changes in a row build on each other (and show at once)
  // rather than waiting for the address bar, which only updates once the previous change has loaded.
  const [query, setQuery] = useState(sp.toString());
  const latest = useRef(query);
  useEffect(() => {
    if (pending) return;
    latest.current = sp.toString();
    setQuery(sp.toString());
  }, [sp, pending]);
  const current = new URLSearchParams(query);

  const go = (next: string) => {
    latest.current = next;
    setQuery(next);
    start(() => router.replace(`${pathname}${next ? `?${next}` : ''}`, { scroll: false }));
  };
  const set = (key: string, value: string) => {
    const p = new URLSearchParams(latest.current);
    if (value) p.set(key, value);
    else p.delete(key);
    go(p.toString());
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const sel = 'h-9 rounded-md border border-line-strong bg-white px-2.5 text-[14px] text-ink focus:border-ink focus:outline-none';
  const active = ['status', 'waiting', 'sponsor', 'flag', 'hall', 'q', 'cancelled', 'sort'].some((k) => current.get(k));

  return (
    <div className={cx('mb-4 flex flex-wrap items-center gap-2', pending && 'opacity-70')} role="search">
      <label className="relative min-w-[200px] flex-1 sm:max-w-[280px]">
        <span className="sr-only">Search lines</span>
        <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => set('q', v.trim()), 300);
          }}
          placeholder="Search ID, description, location…"
          className="h-9 w-full rounded-md border border-line-strong bg-white pl-8 pr-3 text-[14px] focus:border-ink focus:outline-none"
        />
      </label>
      <select aria-label="Status" className={sel} value={current.get('status') ?? ''} onChange={(e) => set('status', e.target.value)}>
        <option value="">All statuses</option>
        {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <select aria-label="Waiting on" className={sel} value={current.get('waiting') ?? ''} onChange={(e) => set('waiting', e.target.value)}>
        <option value="">Waiting on anyone</option>
        <option value="me">Waiting on me</option>
        <option value="unassigned">Waiting on nobody assigned</option>
        {people.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      {showSponsor && sponsors.length > 0 && (
        <select aria-label="Sponsor" className={sel} value={current.get('sponsor') ?? ''} onChange={(e) => set('sponsor', e.target.value)}>
          <option value="">All sponsors</option>
          {sponsors.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      )}
      <select aria-label="Flag" className={sel} value={current.get('flag') ?? ''} onChange={(e) => set('flag', e.target.value)}>
        <option value="">Any flag</option>
        <option value="any">Flagged only</option>
        <option value="urgent">Overdue or not signed off</option>
        <option value="overdue">Overdue</option>
        <option value="not_signed_off">Not signed off</option>
        <option value="due_soon">Due soon</option>
        <option value="slow">Slow sign-off</option>
      </select>
      {halls.length > 0 && (
        <select aria-label="Hall" className={sel} value={current.get('hall') ?? ''} onChange={(e) => set('hall', e.target.value)}>
          <option value="">All halls</option>
          {halls.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      )}
      <select aria-label="Sort" className={sel} value={current.get('sort') ?? ''} onChange={(e) => set('sort', e.target.value)}>
        <option value="">Sort by ID</option>
        <option value="urgency">Most urgent first</option>
        <option value="due">Next deadline</option>
        <option value="waiting">Waiting on</option>
      </select>
      <label className="flex items-center gap-1.5 text-[14px] text-ink-2">
        <input type="checkbox" checked={current.get('cancelled') === '1'} onChange={(e) => set('cancelled', e.target.checked ? '1' : '')} className="h-4 w-4 accent-[#13233b]" />
        Show cancelled
      </label>
      {active && (
        <button type="button" className="text-[14px] font-semibold text-ink underline underline-offset-2"
          onClick={() => { setQ(''); if (timer.current) clearTimeout(timer.current); go(''); }}>
          Clear filters
        </button>
      )}
    </div>
  );
}
