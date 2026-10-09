import Link from 'next/link';
import type { Bundle, ScheduleRow } from '@/lib/data/load';
import { categoryInfo, SHEET_ROW_CLASSES, SHEET_STATUSES, sheetStatus, sheetStatusInfo } from '@/lib/domain/labels';
import { worksOn } from '@/lib/domain/suppliers';
import type { SectionRow } from '@/lib/domain/types';
import { cx, money, Plate, Thumb } from '@/components/ui';
import { thumbUrl } from '@/components/item-table';
import { StatusCell, SupplierCell } from './cells';

// The signage sheet: one row per graphic with its spec, cost, supplier and status, grouped under the show's
// sections like the team's spreadsheet. Rows take the colour of their status.

export const lineTotal = (r: ScheduleRow) => (r.item.unit_cost ?? 0) * (r.item.qty && r.item.qty > 0 ? r.item.qty : 1);

export interface SheetGroup { key: string; title: string; rows: ScheduleRow[] }

/** Rows grouped by section, in the show's section order, with lines in no section last. */
export function groupBySection(rows: ScheduleRow[], sections: SectionRow[], prefix = ''): SheetGroup[] {
  const by = new Map<string | null, ScheduleRow[]>();
  for (const r of rows) {
    const key = r.item.section_id && sections.some((s) => s.id === r.item.section_id) ? r.item.section_id : null;
    (by.get(key) ?? by.set(key, []).get(key)!).push(r);
  }
  const out: SheetGroup[] = [];
  for (const s of sections) if (by.has(s.id)) out.push({ key: `sec-${s.id}`, title: `${prefix}${s.name}`, rows: by.get(s.id)! });
  if (by.has(null)) out.push({ key: 'sec-none', title: `${prefix}No section`, rows: by.get(null)! });
  return out;
}

/** Sponsor signage grouped by sponsor, A to Z. */
export function groupBySponsor(rows: ScheduleRow[], prefix = ''): SheetGroup[] {
  const by = new Map<string, { title: string; rows: ScheduleRow[] }>();
  for (const r of rows) {
    const key = r.sponsor?.id ?? 'none';
    (by.get(key) ?? by.set(key, { title: r.sponsor?.name ?? 'No sponsor', rows: [] }).get(key)!).rows.push(r);
  }
  return [...by.entries()].sort((a, b) => a[1].title.localeCompare(b[1].title))
    .map(([key, g]) => ({ key: `sp-${key}`, title: `${prefix}${g.title}`, rows: g.rows }));
}

/**
 * How the sheet is grouped: organiser signage by section, sponsor signage by sponsor, sponsorship items on their
 * own. With more than one list on the page, each group says which list it belongs to.
 */
export function groupRows(rows: ScheduleRow[], sections: SectionRow[]): SheetGroup[] {
  const lists = [...new Set(rows.map((r) => r.item.category))];
  const prefixFor = (c: ScheduleRow['item']['category']) => (lists.length > 1 ? `${categoryInfo(c).label} · ` : '');
  const out: SheetGroup[] = [];
  for (const c of ['organiser_signage', 'sponsor_signage', 'sponsor_item'] as const) {
    const mine = rows.filter((r) => r.item.category === c);
    if (!mine.length) continue;
    if (c === 'organiser_signage') out.push(...groupBySection(mine, sections, prefixFor(c)));
    else if (c === 'sponsor_signage') out.push(...groupBySponsor(mine, prefixFor(c)));
    else out.push({ key: 'si', title: lists.length > 1 ? categoryInfo(c).label : 'All items', rows: mine });
  }
  return out;
}

/** What's holding a line up, or where it is in sign-off, for the small print under its status. */
function statusDetail(r: ScheduleRow): string | null {
  const s = r.state;
  switch (s.group) {
    case 'in_signoff': return s.statusLabel.replace(/^Artworked · /, '').replace(/^with /, 'With ');
    case 'changes_requested': case 'rejected': case 'on_hold': return s.statusLabel;
    case 'awaiting_artwork': return s.waitingOnLabel ? `Waiting on ${s.waitingOnLabel}` : null;
    case 'installed': return r.item.category === 'sponsor_item' ? 'Handed out' : null;
    default: return null;
  }
}

export function SheetTable({ rows, bundle, canEdit, showCategory = false, showSponsor = true, empty }: {
  rows: ScheduleRow[]; bundle: Bundle; canEdit: boolean; showCategory?: boolean; showSponsor?: boolean; empty?: React.ReactNode;
}) {
  if (!rows.length) return <>{empty}</>;
  const groups = groupRows(rows, bundle.sections);
  const total = rows.reduce((sum, r) => sum + lineTotal(r), 0);
  const qty = rows.reduce((sum, r) => sum + (r.item.qty ?? 0), 0);
  const counts = SHEET_STATUSES.map((s) => ({ ...s, n: rows.filter((r) => sheetStatus(r.state.group) === s.key).length })).filter((s) => s.n > 0);
  const supplierOptions = (category: ScheduleRow['item']['category']) =>
    bundle.suppliers.map((s) => ({ value: s.id, label: s.name, recommended: worksOn(s, category) }));
  const supplierName = (id: string | null) => (id ? bundle.suppliers.find((s) => s.id === id)?.name ?? null : null);
  const th = 'whitespace-nowrap px-2 py-2 text-left text-[12.5px] font-semibold text-ink-2';
  const td = 'px-2 py-1.5 align-top text-[13px] text-ink';
  const num = `${td} whitespace-nowrap text-right tabular-nums`;
  const cols = 15 + (showCategory ? 1 : 0);

  return (
    <div>
      {/* The key: every row is one of these */}
      <ul aria-label="Status key" className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
        {SHEET_STATUSES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-3 w-4 rounded-sm ring-1 ring-inset ring-black/10" style={{ background: s.swatch }} />
            {s.label}
            {counts.find((c) => c.key === s.key) && <span className="text-muted">({counts.find((c) => c.key === s.key)!.n})</span>}
          </li>
        ))}
      </ul>

      {/* Phones: one card per line, still grouped by section */}
      <div className="space-y-4 md:hidden">
        {groups.map(({ key, title, rows: lines }) => (
          <section key={key} aria-label={title}>
            <h3 className="mb-1.5 flex items-baseline justify-between text-[14px] font-semibold text-ink">
              <span>{title}</span>
              <span className="text-[12.5px] font-normal text-ink-2">{lines.length} line{lines.length === 1 ? '' : 's'}</span>
            </h3>
            <ul className="space-y-2">
              {lines.map((r) => {
                const it = r.item;
                const status = sheetStatus(r.state.group);
                const lt = lineTotal(r);
                return (
                  <li key={it.id} className={cx('rounded-[10px] border border-line p-3', status ? SHEET_ROW_CLASSES[status] : 'bg-white', r.state.group === 'cancelled' && 'opacity-60')}>
                    <Link href={`/items/${it.id}`} className="flex gap-3">
                      <Thumb src={thumbUrl(r)} alt="" size={48} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><Plate>{r.code}</Plate>{it.plan_code && <span className="text-[12.5px] text-ink-2">{it.plan_code}</span>}</span>
                        <span className="mt-1 block font-semibold leading-snug text-ink">{it.description}</span>
                        <span className="mt-0.5 block text-[12.5px] text-ink-2">
                          {[showSponsor && r.sponsor?.name, it.material,
                            it.width_mm || it.height_mm ? `${(it.width_mm ?? 0).toLocaleString('en-GB')} × ${(it.height_mm ?? 0).toLocaleString('en-GB')} mm` : null,
                            it.sides === 'double' ? 'DS' : it.sides === 'single' ? 'SS' : null,
                            it.qty ? `×${it.qty.toLocaleString('en-GB')}` : null, lt > 0 ? money(lt, 2) : null].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </Link>
                    <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
                      <StatusCell itemId={it.id} code={r.code} category={it.category} status={status} label={r.state.statusLabel}
                        detail={statusDetail(r)} productionStatus={it.production_status}
                        canMove={canEdit && r.state.group !== 'cancelled' && r.state.fullyApproved && status !== null} />
                      {canEdit && r.state.group !== 'cancelled'
                        ? <SupplierCell itemId={it.id} code={r.code} supplierId={it.supplier_id} options={supplierOptions(it.category)} />
                        : <span className={cx('text-[13px]', !it.supplier_id && 'text-muted')}>{supplierName(it.supplier_id) ?? 'No supplier'}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <p className="text-[13.5px] font-semibold text-ink">Total: {rows.length} line{rows.length === 1 ? '' : 's'}{total > 0 ? `, ${money(total, 2)}` : ''}</p>
      </div>

      <div className="relative hidden overflow-x-auto rounded-[10px] border border-line bg-white md:block">
        <table className="w-full min-w-[1360px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-paper/70">
              <th scope="col" className={cx(th, 'w-[44px]')}><span className="sr-only">Artwork</span></th>
              <th scope="col" className={th}>ID</th>
              <th scope="col" className={th}>Signage ID</th>
              <th scope="col" className={cx(th, 'min-w-[220px]')}>Description</th>
              {showCategory && <th scope="col" className={th}>List</th>}
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={th}>Supplier</th>
              <th scope="col" className={th}>Material</th>
              <th scope="col" className={th}>Size (mm)</th>
              <th scope="col" className={th}>Sides</th>
              <th scope="col" className={th}>Bleed</th>
              <th scope="col" className={cx(th, 'min-w-[160px]')}>Side A</th>
              <th scope="col" className={cx(th, 'min-w-[120px]')}>Side B</th>
              <th scope="col" className={cx(th, 'text-right')}>Qty</th>
              <th scope="col" className={cx(th, 'text-right')}>Unit cost</th>
              <th scope="col" className={cx(th, 'text-right')}>Total</th>
            </tr>
          </thead>
          {groups.map(({ key, title, rows: lines }) => {
            const sectionTotal = lines.reduce((sum, r) => sum + lineTotal(r), 0);
            return (
              <tbody key={key} className="border-b border-line last:border-0">
                <tr className="bg-slate-100">
                  <th scope="rowgroup" colSpan={cols} className="px-3 py-1.5 text-left text-[13.5px] font-semibold text-ink">
                    <span className="flex flex-wrap items-baseline gap-x-3">
                      <span>{title}</span>
                      <span className="text-[12.5px] font-normal text-ink-2">{lines.length} line{lines.length === 1 ? '' : 's'}</span>
                      {sectionTotal > 0 && <span className="ml-auto text-[12.5px] font-semibold tabular-nums text-ink-2">{money(sectionTotal, 2)}</span>}
                    </span>
                  </th>
                </tr>
                {lines.map((r) => {
                  const it = r.item;
                  const status = sheetStatus(r.state.group);
                  const cancelled = r.state.group === 'cancelled';
                  const lt = lineTotal(r);
                  return (
                    <tr key={it.id} data-line={r.code} className={cx('border-t border-line/70', status ? SHEET_ROW_CLASSES[status] : 'bg-white', cancelled && 'opacity-60')}>
                      <td className={cx(td, 'py-1')}>
                        <Link href={`/items/${it.id}`} tabIndex={-1} aria-hidden><Thumb src={thumbUrl(r)} alt="" size={32} /></Link>
                      </td>
                      <td className={cx(td, 'whitespace-nowrap')}>
                        <Link href={`/items/${it.id}`} className="block hover:underline"><Plate className="text-[12px]">{r.code}</Plate></Link>
                      </td>
                      <td className={cx(td, 'whitespace-nowrap font-semibold')}>{it.plan_code}</td>
                      <td className={td}>
                        <Link href={`/items/${it.id}`} className={cx('font-semibold text-ink hover:underline', cancelled && 'line-through')}>{it.description}</Link>
                        <span className="block text-[12px] text-ink-2">
                          {[showSponsor && r.sponsor?.name, it.item_type, [it.hall, it.zone, it.location_detail].filter(Boolean).join(', ') || null]
                            .filter(Boolean).join(' · ')}
                        </span>
                      </td>
                      {showCategory && <td className={cx(td, 'whitespace-nowrap text-ink-2')}>{categoryInfo(it.category).short}</td>}
                      <td className={td}>
                        <StatusCell itemId={it.id} code={r.code} category={it.category} status={status} label={r.state.statusLabel}
                          detail={statusDetail(r)} productionStatus={it.production_status}
                          canMove={canEdit && !cancelled && r.state.fullyApproved && status !== null} />
                      </td>
                      <td className={cx(td, 'whitespace-nowrap')}>
                        {canEdit && !cancelled
                          ? <SupplierCell itemId={it.id} code={r.code} supplierId={it.supplier_id} options={supplierOptions(it.category)} />
                          : <span className={cx(!it.supplier_id && 'text-muted')}>{supplierName(it.supplier_id) ?? 'Not chosen'}</span>}
                      </td>
                      <td className={cx(td, 'max-w-[160px]')}>{it.material}</td>
                      <td className={cx(td, 'whitespace-nowrap tabular-nums')}>
                        {it.width_mm || it.height_mm ? `${(it.width_mm ?? 0).toLocaleString('en-GB')} × ${(it.height_mm ?? 0).toLocaleString('en-GB')}` : ''}
                      </td>
                      <td className={cx(td, 'whitespace-nowrap')}>{it.sides === 'double' ? 'DS' : it.sides === 'single' ? 'SS' : ''}</td>
                      <td className={cx(td, 'whitespace-nowrap tabular-nums')}>{it.bleed_mm !== null && it.bleed_mm !== undefined ? `${it.bleed_mm} mm` : ''}</td>
                      <td className={cx(td, 'max-w-[240px] text-[12.5px] leading-snug')} title={it.wording ?? undefined}><span className="line-clamp-3 whitespace-pre-wrap">{it.wording}</span></td>
                      <td className={cx(td, 'max-w-[180px] text-[12.5px] leading-snug')} title={it.sides === 'double' ? it.wording_side2 ?? undefined : undefined}>
                        <span className="line-clamp-3 whitespace-pre-wrap">{it.sides === 'double' ? it.wording_side2 : ''}</span>
                      </td>
                      <td className={num}>{it.qty?.toLocaleString('en-GB')}</td>
                      <td className={num}>{it.unit_cost !== null ? money(it.unit_cost, 2) : ''}</td>
                      <td className={cx(num, 'font-semibold')}>{lt > 0 ? money(lt, 2) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
          <tfoot>
            <tr className="border-t-2 border-line bg-paper/70 text-[13px] font-semibold text-ink">
              <td colSpan={12 + (showCategory ? 1 : 0)} className="px-3 py-2">
                Total: {rows.length} line{rows.length === 1 ? '' : 's'}
                {counts.length > 0 && <span className="font-normal text-ink-2"> · {counts.map((c) => `${c.n} ${sheetStatusInfo(c.key).label.toLowerCase()}`).join(', ')}</span>}
              </td>
              <td className={num}>{qty ? qty.toLocaleString('en-GB') : ''}</td>
              <td />
              <td className={num}>{total > 0 ? money(total, 2) : ''}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
