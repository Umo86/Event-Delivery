import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { itemCode } from '@/lib/domain/labels';
import type { Category } from '@/lib/domain/types';
import { cx, Intro, Panel } from '@/components/ui';

export const metadata: Metadata = { title: 'Activity' };

const FILTERS = [
  { key: 'all', label: 'Everything' },
  { key: 'access', label: 'Access' },
  { key: 'setup', label: 'Setup' },
  { key: 'lines', label: 'Lines' },
] as const;

const LIMIT = 200;

export default async function ActivityPage(props: { searchParams: Promise<{ log?: string }> }) {
  await requireSuperAdmin();
  const sp = await props.searchParams;
  const filter = FILTERS.find((f) => f.key === sp.log)?.key ?? 'all';
  const sql = await db();
  // Setup covers shows, stages, departments, lists, suppliers, sponsors and the platform name.
  // Lines includes deletions, which are logged without a line (the line is gone).
  const where = filter === 'access' ? sql`where a.kind = 'access'`
    : filter === 'setup' ? sql`where a.kind in ('settings', 'sponsor')`
      : filter === 'lines' ? sql`where a.item_id is not null or a.kind = 'deleted'` : sql``;
  const trail = await sql<{
    id: string; actor_name: string; message: string; created_at: Date; event_name: string | null;
    item_id: string | null; category: Category | null; ref_no: number | null;
  }[]>`
    select a.id, a.actor_name, a.message, a.created_at, e.name as event_name, a.item_id, i.category, i.ref_no
    from activity a
    left join events e on e.id = a.event_id
    left join items i on i.id = a.item_id
    ${where}
    order by a.created_at desc limit ${LIMIT}`;

  return (
    <>
      <Intro>Who changed what, newest first: sign-ins and access changes, show setup, and every line.</Intro>
      <Panel title="Audit trail" padded={false}
        actions={
          <nav className="flex flex-wrap gap-1" aria-label="Filter">
            {FILTERS.map((f) => (
              <Link key={f.key} href={f.key === 'all' ? '/admin/activity' : `/admin/activity?log=${f.key}`}
                aria-current={filter === f.key ? 'page' : undefined}
                className={cx('rounded-md px-2.5 py-1 text-[13px] font-semibold', filter === f.key ? 'bg-ink text-white' : 'text-ink-2 hover:bg-paper')}>
                {f.label}
              </Link>
            ))}
          </nav>
        }>
        {trail.length === 0 ? <p className="p-4 text-[14px] text-muted">Nothing yet.</p> : (
          <ol>
            {trail.map((t) => (
              <li key={t.id} className="grid gap-x-4 gap-y-0.5 border-b border-line px-4 py-2.5 last:border-0 sm:grid-cols-[150px_minmax(0,1fr)]">
                <span className="text-[12.5px] text-muted">{fmtDateTime(t.created_at)}</span>
                <span className="min-w-0 text-[14px] text-ink">
                  <b>{t.actor_name}</b>:{' '}
                  {t.item_id && t.category && t.ref_no ? (
                    <><Link href={`/items/${t.item_id}`} className="font-semibold underline underline-offset-2">{itemCode(t.category, t.ref_no)}</Link>{' '}</>
                  ) : null}
                  {t.message}
                  {t.event_name && <span className="text-muted"> ({t.event_name})</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
        {trail.length === LIMIT && (
          <p className="border-t border-line px-4 py-2 text-[13px] text-muted">Showing the latest {LIMIT}.</p>
        )}
      </Panel>
    </>
  );
}
