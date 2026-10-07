import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, Plus } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { getCurrentEvent, loadSchedule } from '@/lib/data/load';
import { applyFilters, filterQuery, readFilters } from '@/lib/data/filter';
import { CATEGORIES, categoryBySlug, GROUPS } from '@/lib/domain/labels';
import { canEdit } from '@/lib/domain/permissions';
import { FilterBar } from '@/components/filter-bar';
import { ItemTable } from '@/components/item-table';
import { ButtonLink, cx, Empty, money, PageHeader } from '@/components/ui';
import { inWorkflow } from '@/lib/domain/engine';
import { NoEvent } from '@/components/no-event';

export async function generateMetadata(props: { params: Promise<{ cat: string }> }): Promise<Metadata> {
  const { cat } = await props.params;
  return { title: cat === 'all' ? 'All lines' : categoryBySlug(cat)?.label ?? 'Schedule' };
}

export default async function SchedulePage(props: {
  params: Promise<{ cat: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { cat } = await props.params;
  const isAll = cat === 'all';
  const category = isAll ? null : categoryBySlug(cat);
  if (!category && !isAll) notFound();
  const event = await getCurrentEvent();
  if (!event) return <NoEvent />;
  const sched = await loadSchedule(event.id);
  if (!sched) return <NoEvent />;
  const filters = readFilters(await props.searchParams);
  const all = category ? sched.rows.filter((r) => r.item.category === category.key) : sched.rows;
  const rows = applyFilters(all, filters, user.id, event.turnaround_days);
  const active = all.filter((r) => r.state.group !== 'cancelled');
  // Sign-off and production progress leaves out sponsorship items that are still for sale
  const working = active.filter((r) => inWorkflow(r.state.group));
  const sponsorship = category?.key === 'sponsor_item';

  const people = sched.bundle.users.filter((u) => u.active).map((u) => ({ value: u.id, label: u.full_name }));
  const venueKey = event.venue === 'NEC Birmingham' ? 'hall_nec' : event.venue === 'ExCeL London' ? 'hall_excel' : 'hall_other';
  const hallsUsed = new Set(all.map((r) => r.item.hall).filter((h): h is string => !!h));
  const halls = [...new Set([...(sched.bundle.lists[venueKey] ?? []), ...hallsUsed])].filter((h) => hallsUsed.has(h));

  const counts = {
    total: active.length,
    awaiting: working.filter((r) => r.state.phase === 1).length,
    signoff: working.filter((r) => r.state.phase === 2).length,
    attention: working.filter((r) => r.state.phase === 3).length,
    approved: working.filter((r) => r.state.phase >= 4).length,
    overdue: working.filter((r) => r.state.flag === 'overdue' || r.state.flag === 'not_signed_off').length,
  };
  const stat = (label: string, value: number | string, href: string, strong?: boolean) => (
    <Link href={href} className={cx('rounded-md border border-line bg-white px-3 py-2 hover:border-ink', strong && Number(value) > 0 && 'border-red-300 bg-red-50')}>
      <span className="block font-display text-[22px] font-semibold leading-none text-ink">{value}</span>
      <span className="mt-1 block text-[12.5px] text-muted">{label}</span>
    </Link>
  );
  // Sponsorship items: what's sold, for how much, and what's left to sell
  const sold = active.filter((r) => r.item.sponsor_id);
  const forSale = active.filter((r) => r.state.group === 'for_sale');
  const lineCost = (r: (typeof all)[number]) => (r.item.unit_cost ?? 0) * (r.item.qty && r.item.qty > 0 ? r.item.qty : 1);
  const sales = {
    value: sold.reduce((s, r) => s + (r.item.sale_price ?? 0), 0),
    // Margin only where the sale price is known, so a missing price doesn't look like a loss
    margin: sold.reduce((s, r) => s + (r.item.sale_price !== null ? r.item.sale_price - lineCost(r) : 0), 0),
    unsold: forSale.reduce((s, r) => s + (r.item.rate_card_price ?? 0), 0),
  };
  const base = `/schedule/${category?.slug ?? 'all'}`;
  const title = category?.label ?? 'All lines';

  return (
    <>
      <PageHeader
        title={title}
        subtitle={`${event.name}: ${counts.total} ${sponsorship ? 'item' : 'line'}${counts.total === 1 ? '' : 's'}`}
        actions={
          <>
            <ButtonLink href={`/api/export/${category?.slug ?? 'all'}${filterQuery(filters)}`} plain>
              <Download size={16} aria-hidden /> Export CSV
            </ButtonLink>
            {canEdit(user) && category && (
              <ButtonLink href={`${base}/new`} variant="primary">
                <Plus size={16} aria-hidden /> {sponsorship ? 'Add item' : 'Add line'}
              </ButtonLink>
            )}
          </>
        }
      />

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Schedule categories">
        {[...CATEGORIES, { slug: 'all', label: 'All lines' }].map((c) => (
          <Link key={c.slug} href={`/schedule/${c.slug}`}
            aria-current={c.slug === cat ? 'page' : undefined}
            className={cx('-mb-px whitespace-nowrap border-b-[3px] px-3 py-2 text-[15px] font-semibold',
              c.slug === cat ? 'border-signal text-ink' : 'border-transparent text-muted hover:text-ink')}>
            {c.label}
          </Link>
        ))}
      </nav>

      {sponsorship && (
        <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Sales">
          {stat('For sale', forSale.length, `${base}?status=for_sale`)}
          {stat('Sold', sold.length, `${base}?status=sold`)}
          {stat('Sales', money(sales.value), `${base}?status=sold`)}
          {stat('Margin on sold items', money(sales.margin), `${base}?status=sold`)}
          {stat('Still for sale at rate card', money(sales.unsold), `${base}?status=for_sale`)}
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stat(sponsorship ? 'Items' : 'Lines', counts.total, base)}
        {stat('Awaiting artwork', counts.awaiting, `${base}?status=awaiting_artwork`)}
        {stat('In sign-off', counts.signoff, `${base}?status=in_signoff`)}
        {stat('Needs attention', counts.attention, `${base}?status=attention`)}
        {stat('Approved or later', counts.approved, `${base}?status=approved_plus`)}
        {stat('Overdue', counts.overdue, `${base}?flag=urgent`, true)}
      </div>

      <FilterBar
        key={cat}
        statuses={[
          ...(sponsorship || !category ? [{ value: 'for_sale', label: 'For sale' }, { value: 'sold', label: 'Sold' }] : []),
          { value: 'attention', label: 'Needs attention' },
          { value: 'slow', label: `Slow sign-off (over ${event.turnaround_days} days)` },
          { value: 'production', label: 'Approved or in production' },
          { value: 'approved_plus', label: 'Approved or later' },
          ...GROUPS.filter((g) => g.key !== 'for_sale').map((g) => ({ value: g.key, label: g.label })),
        ]}
        people={people}
        sponsors={sched.bundle.sponsors.map((s) => ({ value: s.id, label: s.name }))}
        halls={halls}
        suppliers={sched.bundle.suppliers.map((s) => ({ value: s.id, label: s.name }))}
        showSponsor={category?.key !== 'organiser_signage' || all.some((r) => r.item.sponsor_id)}
      />

      <ItemTable
        rows={rows}
        today={sched.bundle.ctx.today}
        showCategory={!category}
        empty={
          all.length === 0 ? (
            <Empty title={`No ${title.toLowerCase()} yet`}
              action={canEdit(user) && category ? <ButtonLink href={`${base}/new`} variant="primary"><Plus size={16} /> {sponsorship ? 'Add the first item' : 'Add the first line'}</ButtonLink> : undefined}>
              {sponsorship
                ? <>Add each thing the show sells to sponsors, like lanyards, show bags or seat drops. Each one gets an ID like SI-001 and stays for sale until someone marks it sold.</>
                : <>Add a line for each sign or item. Each one gets an ID like {category?.prefix ?? 'OS'}-001.</>}
            </Empty>
          ) : (
            <Empty title="No lines match these filters">Clear the filters to see everything.</Empty>
          )
        }
      />
      {rows.length > 0 && rows.length !== all.length && (
        <p className="mt-3 text-[13.5px] text-muted">Showing {rows.length} of {all.length}.</p>
      )}
    </>
  );
}
