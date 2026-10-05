import Link from 'next/link';
import type { ScheduleRow } from '@/lib/data/load';
import { fmtDate, relativeDue } from '@/lib/dates';
import { categoryInfo } from '@/lib/domain/labels';
import { cx, FlagChip, Plate, StatusChip, Thumb } from './ui';

export function thumbUrl(r: ScheduleRow): string | null {
  return r.version?.thumb_url ? `/api/files/${r.version.id}/thumb` : null;
}

function location(r: ScheduleRow) {
  return [r.item.zone, r.item.location_detail].filter(Boolean).join(', ');
}

export function ItemTable({ rows, today, showCategory = false, showAction = false, empty }: {
  rows: ScheduleRow[]; today: string; showCategory?: boolean; showAction?: boolean; empty?: React.ReactNode;
}) {
  if (!rows.length) return <>{empty}</>;
  return (
    <>
      {/* Desktop / tablet table */}
      <div className="relative hidden overflow-x-auto rounded-[10px] border border-line bg-white md:block">
        <table className="w-full border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-b border-line bg-paper/70 text-[13px] text-ink-2">
              <th className="w-[60px] px-3 py-2.5 font-semibold"><span className="sr-only">Artwork</span></th>
              <th className="px-3 py-2.5 font-semibold">Line</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">{showAction ? 'Next step' : 'Waiting on'}</th>
              <th className="px-3 py-2.5 font-semibold">Next deadline</th>
              <th className="px-3 py-2.5 font-semibold"><span className="sr-only">Flag</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.item.id} className={cx('group border-b border-line last:border-0 hover:bg-signal-soft/40', r.state.group === 'cancelled' && 'opacity-60')}>
                <td className="px-3 py-2 align-middle">
                  <Link href={`/items/${r.item.id}`} tabIndex={-1} aria-hidden>
                    <Thumb src={thumbUrl(r)} alt="" size={44} />
                  </Link>
                </td>
                <td className="max-w-[420px] px-3 py-2 align-middle">
                  <Link href={`/items/${r.item.id}`} className="block focus:outline-none">
                    <span className="flex items-center gap-2">
                      <Plate>{r.code}</Plate>
                      <span className={cx('truncate font-semibold text-ink group-hover:underline', r.state.group === 'cancelled' && 'line-through')}>
                        {r.item.description}
                      </span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted">
                      {showCategory && <span>{categoryInfo(r.item.category).label}</span>}
                      {r.sponsor && <span className="font-medium text-ink-2">{r.sponsor.name}</span>}
                      {r.item.hall && <Plate tone="light" className="text-[11.5px]">{r.item.hall}</Plate>}
                      {location(r) && <span className="truncate">{location(r)}</span>}
                      {r.item.qty && r.item.qty > 1 ? <span>×{r.item.qty.toLocaleString('en-GB')}</span> : null}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2 align-middle"><StatusChip group={r.state.group} label={r.state.statusLabel} /></td>
                <td className="px-3 py-2 align-middle text-ink-2">
                  {showAction ? <span className="text-ink">{r.state.action}</span> : (
                    r.state.waitingOnLabel
                      ? <span className={cx(!r.state.waitingOnUserId && 'font-semibold text-red-700')}>{r.state.waitingOnLabel}</span>
                      : <span className="text-muted">Nobody</span>
                  )}
                  {r.state.daysWaiting !== null && r.state.daysWaiting > 0 && (
                    <span className="block text-[12.5px] text-muted">{r.state.daysWaiting} day{r.state.daysWaiting === 1 ? '' : 's'} at this step</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-middle">
                  {r.state.due ? (
                    <>
                      <span className={cx('font-semibold', (r.state.flag === 'overdue') && 'text-red-700')}>{fmtDate(r.state.due)}</span>
                      <span className="block text-[12.5px] text-muted">{relativeDue(r.state.due, today)}</span>
                    </>
                  ) : <span className="text-muted">None</span>}
                </td>
                <td className="px-3 py-2 align-middle"><FlagChip flag={r.state.flag} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.item.id}>
            <Link href={`/items/${r.item.id}`} className={cx('flex gap-3 rounded-[10px] border border-line bg-white p-3', r.state.group === 'cancelled' && 'opacity-60')}>
              <Thumb src={thumbUrl(r)} alt="" size={56} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Plate>{r.code}</Plate>
                  <FlagChip flag={r.state.flag} />
                </div>
                <p className="mt-1 font-semibold leading-snug text-ink">{r.item.description}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <StatusChip group={r.state.group} label={r.state.statusLabel} />
                </div>
                <p className="mt-1.5 text-[13px] text-muted">
                  {showAction ? r.state.action : r.state.waitingOnLabel ? `Waiting on ${r.state.waitingOnLabel}` : 'Nothing waiting'}
                  {r.state.due ? `, due ${fmtDate(r.state.due)}` : ''}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
