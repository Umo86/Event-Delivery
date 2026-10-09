'use client';

import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { productionSteps, sheetStatusInfo, type SheetStatus } from '@/lib/domain/labels';
import type { Category, ProductionStatus } from '@/lib/domain/types';
import { Chip, cx } from '@/components/ui';
import { setItemSupplier, setProductionStep } from '@/app/actions/items';

// Cells on the sheet that save as soon as they're changed: Supplier, and Status once a line is approved.

type Result = { ok: true; message?: string } | { ok: false; error: string };
type Action = (prev: Result | null, fd: FormData) => Promise<Result>;

/** Runs an action with a FormData built from the given fields; shows a tick or the error for a moment. */
function useCellAction(action: Action) {
  const [state, dispatch, pending] = useActionState<Result | null, FormData>(action, null);
  const [shown, setShown] = useState<Result | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!state) return;
    setShown(state);
    window.clearTimeout(timer.current);
    if (state.ok) timer.current = window.setTimeout(() => setShown(null), 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const save = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    startTransition(() => dispatch(fd));
  };
  return { save, pending, shown };
}

const selectCls = 'h-8 max-w-[180px] rounded-md border border-line-strong bg-white px-2 text-[13px] text-ink focus:border-ink focus:outline-none disabled:opacity-60';

export function SupplierCell({ itemId, code, supplierId, options }: {
  itemId: string; code: string; supplierId: string | null; options: { value: string; label: string; recommended: boolean }[];
}) {
  const { save, pending, shown } = useCellAction(setItemSupplier);
  const first = options.filter((o) => o.recommended);
  const rest = options.filter((o) => !o.recommended);
  return (
    <div className="flex items-center gap-1.5">
      <select aria-label={`Supplier for ${code}`} className={selectCls} value={supplierId ?? ''} disabled={pending}
        onChange={(e) => save({ item_id: itemId, supplier_id: e.target.value })}>
        <option value="">Not chosen</option>
        {first.length > 0 && rest.length > 0 ? (
          <>
            <optgroup label="Work on this list">{first.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
            <optgroup label="Other suppliers">{rest.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
          </>
        ) : options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Saved shown={shown} pending={pending} />
    </div>
  );
}

/**
 * The Status cell: the sheet's word with its colour. Once every stage has approved, managers move the line along
 * (Sent → Printed → Delivered → Installed) from here.
 */
export function StatusCell({ itemId, code, category, status, label, detail, productionStatus, canMove }: {
  itemId: string; code: string; category: Category; status: SheetStatus | null; label: string;
  /** What's holding it up or where it is in sign-off, shown under the word. */
  detail: string | null;
  productionStatus: ProductionStatus | null;
  canMove: boolean;
}) {
  const { save, pending, shown } = useCellAction(setProductionStep);
  const info = status ? sheetStatusInfo(status) : null;
  return (
    <div className="min-w-[150px]">
      <div className="flex items-center gap-1.5">
        {canMove ? (
          <select aria-label={`Status for ${code}`} value={productionStatus ?? ''} disabled={pending}
            onChange={(e) => save({ item_id: itemId, production_status: e.target.value })}
            className={cx('h-7 cursor-pointer rounded-full border-0 py-0 pl-2.5 pr-7 text-[12.5px] font-semibold ring-1 ring-inset focus:outline-none disabled:opacity-60',
              info ? ringFor(info.tone) : 'bg-slate-100 text-slate-700 ring-slate-200')}>
            <option value="">Approved</option>
            {productionSteps(category).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        ) : (
          <Chip tone={info?.tone ?? 'muted'}>{info?.label ?? label}</Chip>
        )}
        <Saved shown={shown} pending={pending} />
      </div>
      {detail && <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{detail}</p>}
    </div>
  );
}

function ringFor(tone: string): string {
  switch (tone) {
    case 'orange': return 'bg-orange-50 text-orange-800 ring-orange-200';
    case 'teal': return 'bg-teal-50 text-teal-800 ring-teal-200';
    case 'green': return 'bg-green-100 text-green-900 ring-green-300';
    case 'blue': return 'bg-blue-50 text-blue-800 ring-blue-200';
    default: return 'bg-slate-100 text-slate-700 ring-slate-200';
  }
}

function Saved({ shown, pending }: { shown: Result | null; pending: boolean }) {
  if (pending) return <span className="text-[12px] text-muted" aria-live="polite">Saving…</span>;
  if (!shown) return null;
  return shown.ok
    ? <span role="status" className="flex items-center gap-0.5 text-[12px] font-semibold text-green-700"><Check size={13} aria-hidden /> Saved</span>
    : <span role="alert" className="max-w-[220px] text-[12px] font-semibold leading-snug text-red-700">{shown.error}</span>;
}
