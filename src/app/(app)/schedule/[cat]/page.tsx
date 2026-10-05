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
import { ButtonLink, cx, Empty, PageHeader } from '@/components/ui';
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
  const rows = applyFilters(all, filters, user.id);
  const active = all.filter((r) => r.state.group !== 'cancelled');

  const people = sched.bundle.users.filter((u) => u.active).map((u) => ({ value: u.id, label: u.full_name }));
  const venueKey = event.venue === 'NEC Birmingham' ? 'hall_nec' : event.venue === 'ExCeL London' ? 'hall_excel' : 'hall_other';
  const hallsUsed = new Set(all.map((r) => r.item.hall).filter((h): h is string => !!h));
  const halls = [...new Set([...(sched.bundle.lists[venueKey] ?? []), ...hallsUsed])].filter((h) => hallsUsed.has(h));

  const counts = {
    total: active.length,
    awaiting: active.filter((r) => r.state.phase === 1).length,
    signoff: active.filter((r) => r.state.phase === 2).length,
    attention: active.filter((r) => r.state.phase === 3).length,
    approved: active.filter((r) => r.state.phase >= 4).length,
    overdue: active.filter((r) => r.state.flag === 'overdue' || r.state.flag === 'not_signed_off').length,
  };
  const stat = (label: string, value: number, href: string, strong?: boolean) => (
    <Link href={href} className={cx('rounded-md border border-line bg-white px-3 py-2 hover:border-ink', strong && value > 0 && 'border-red-300 bg-red-50')}>
      <span className="block font-display text-[22px] font-semibold leading-none text-ink">{value}</span>
      <span className="mt-1 block text-[12.5px] text-muted">{label}</span>
    </Link>
  );
  const base = `/schedule/${category?.slug ?? 'all'}`;
  const title = category?.label ?? 'All lines';

  return (
    <>
      <PageHeader
        title={title}
        subtitle={`${event.name}: ${counts.total} line${counts.total === 1 ? '' : 's'}`}
        actions={
          <>
            <ButtonLink href={`/api/export/${category?.slug ?? 'all'}${filterQuery(filters)}`} plain>
              <Download size={16} aria-hidden /> Export CSV
            </ButtonLink>
            {canEdit(user) && category && (
              <ButtonLink href={`${base}/new`} variant="primary">
                <Plus size={16} aria-hidden /> Add line
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

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stat('Lines', counts.total, base)}
        {stat('Awaiting artwork', counts.awaiting, `${base}?status=awaiting_artwork`)}
        {stat('In sign-off', counts.signoff, `${base}?status=in_signoff`)}
        {stat('Needs attention', counts.attention, `${base}?status=attention`)}
        {stat('Approved or later', counts.approved, `${base}?status=approved_plus`)}
        {stat('Overdue', counts.overdue, `${base}?flag=urgent`, true)}
      </div>

      <FilterBar
        key={cat}
        statuses={[{ value: 'attention', label: 'Needs attention' }, ...GROUPS.map((g) => ({ value: g.key, label: g.label }))]}
        people={people}
        sponsors={sched.bundle.sponsors.map((s) => ({ value: s.id, label: s.name }))}
        halls={halls}
        showSponsor={category?.key !== 'organiser_signage' || all.some((r) => r.item.sponsor_id)}
      />

      <ItemTable
        rows={rows}
        today={sched.bundle.ctx.today}
        showCategory={!category}
        empty={
          all.length === 0 ? (
            <Empty title={`No ${title.toLowerCase()} yet`}
              action={canEdit(user) && category ? <ButtonLink href={`${base}/new`} variant="primary"><Plus size={16} /> Add the first line</ButtonLink> : undefined}>
              Add a line for each sign or item. Each one gets an ID like {category?.prefix ?? 'OS'}-001.
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
