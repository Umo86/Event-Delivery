import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { getCurrentEvent, loadSchedule } from '@/lib/data/load';
import { canEdit, isAdmin } from '@/lib/domain/permissions';
import { cx, Empty, PageHeader, Panel } from '@/components/ui';
import { SponsorForm } from '@/components/sponsor-form';
import { NoEvent } from '@/components/no-event';

export const metadata: Metadata = { title: 'Sponsors' };

export default async function SponsorsPage() {
  const user = await requireUser();
  const event = await getCurrentEvent();
  if (!event) return <NoEvent />;
  const sched = await loadSchedule(event.id);
  if (!sched) return <NoEvent />;
  const { bundle } = sched;
  const names = bundle.ctx.userNames;
  const rows = bundle.sponsors.map((s) => {
    const lines = sched.rows.filter((r) => r.item.sponsor_id === s.id && r.state.group !== 'cancelled');
    return {
      s,
      total: lines.length,
      awaiting: lines.filter((r) => r.state.phase === 1).length,
      signoff: lines.filter((r) => r.state.phase === 2).length,
      attention: lines.filter((r) => r.state.phase === 3).length,
      done: lines.filter((r) => r.state.phase >= 4).length,
      urgent: lines.filter((r) => r.state.rank === 1).length,
    };
  });

  return (
    <>
      <PageHeader title="Sponsors" subtitle={`${rows.length} sponsor${rows.length === 1 ? '' : 's'} for ${event.name}. Each one’s account manager signs off on their behalf.`} />
      {rows.length === 0 ? (
        <div className="mb-6"><Empty title="No sponsors yet">Add each sponsor and their account manager. Sponsor signage and items are linked to them.</Empty></div>
      ) : (
        <div className="relative mb-6 overflow-x-auto rounded-[10px] border border-line bg-white">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-line bg-paper/70 text-left text-[13px] text-ink-2">
                <th className="px-4 py-2.5 font-semibold">Sponsor</th>
                <th className="px-3 py-2.5 font-semibold">Account manager</th>
                <th className="px-3 py-2.5 text-right font-semibold">Lines</th>
                <th className="px-3 py-2.5 text-right font-semibold">Awaiting artwork</th>
                <th className="px-3 py-2.5 text-right font-semibold">In sign-off</th>
                <th className="px-3 py-2.5 text-right font-semibold">Needs attention</th>
                <th className="px-3 py-2.5 font-semibold">Approved</th>
                <th className="px-4 py-2.5 text-right font-semibold"><span className="sr-only">Overdue</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.s.id} className="border-b border-line last:border-0 hover:bg-signal-soft/40">
                  <td className="px-4 py-2.5">
                    <Link href={`/sponsors/${r.s.id}`} className="font-semibold text-ink hover:underline">{r.s.name}</Link>
                    {r.s.package && <span className="block text-[12.5px] text-muted">{r.s.package}</span>}
                  </td>
                  <td className={cx('px-3 py-2.5', r.s.account_manager_id ? 'text-ink-2' : 'font-semibold text-red-700')}>
                    {r.s.account_manager_id ? names.get(r.s.account_manager_id) : 'Not set'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold">{r.total}</td>
                  <td className="px-3 py-2.5 text-right text-ink-2">{r.awaiting || '–'}</td>
                  <td className="px-3 py-2.5 text-right text-ink-2">{r.signoff || '–'}</td>
                  <td className={cx('px-3 py-2.5 text-right', r.attention ? 'font-semibold text-orange-700' : 'text-ink-2')}>{r.attention || '–'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="mr-2 inline-block w-14 text-ink-2">{r.done} of {r.total}</span>
                    <span className="inline-block h-2 w-20 rounded-full bg-paper align-middle">
                      <span className="block h-2 rounded-full bg-[#0284c7]" style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%` }} />
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">{r.urgent ? <span className="font-semibold text-red-700">{r.urgent} overdue</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit(user) && (
        <Panel title="Add a sponsor">
          <SponsorForm eventId={event.id} users={bundle.users} canChooseManager={isAdmin(user)} />
        </Panel>
      )}
    </>
  );
}
