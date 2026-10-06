import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { getCurrentEvent, loadSchedule, type ScheduleRow } from '@/lib/data/load';
import { loadBoardData } from '@/lib/data/tasks';
import { londonDate } from '@/lib/dates';
import { urgencyCompare } from '@/lib/domain/engine';
import { categoryInfo } from '@/lib/domain/labels';
import { buildBoard, openCount, TASK_STATUSES } from '@/lib/domain/tasks';
import { ItemTable, thumbUrl } from '@/components/item-table';
import { KanbanBoard, type BoardColumnData, type Card } from '@/components/board/kanban';
import { cx, Empty, PageHeader } from '@/components/ui';
import { NoEvent } from '@/components/no-event';

export const metadata: Metadata = { title: 'My actions' };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default async function InboxPage(props: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser();
  const { view } = await props.searchParams;
  const event = await getCurrentEvent();
  if (!event) return <NoEvent />;
  const sched = await loadSchedule(event.id);
  if (!sched) return <NoEvent />;
  const today = sched.bundle.ctx.today;
  const names = sched.bundle.ctx.userNames;
  const open = sched.rows.filter((r) => r.state.group !== 'cancelled' && r.state.waitingOnLabel);
  const waitingOnMe = (r: ScheduleRow) => r.state.group !== 'cancelled' && r.state.waitingOnUserIds.includes(user.id);
  const team = view === 'team';

  const { tasks, started } = await loadBoardData(event.id, user.id);
  const byId = new Map(sched.rows.map((r) => [r.item.id, r]));
  const board = buildBoard({
    lines: [...sched.rows].sort((a, b) => urgencyCompare(a.state, b.state)).map((r) => ({ id: r.item.id, waitingOnMe: waitingOnMe(r) })),
    started,
    tasks,
  });
  const mineCount = board.to_do.lineIds.length + board.in_progress.lineIds.length;
  const openTasks = board.to_do.tasks.length + board.in_progress.tasks.length;

  const tabs = (
    <nav className="mb-5 flex gap-1 border-b border-line" aria-label="Inbox views">
      {[{ href: '/inbox', label: `My board (${openCount(board)})`, on: !team }, { href: '/inbox?view=team', label: 'Whole team', on: team }].map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.on ? 'page' : undefined}
          className={cx('-mb-px border-b-[3px] px-3 py-2 text-[15px] font-semibold', t.on ? 'border-signal text-ink' : 'border-transparent text-muted hover:text-ink')}>
          {t.label}
        </Link>
      ))}
    </nav>
  );

  if (team) {
    const byPerson = new Map<string, { label: string; userId: string | null; rows: ScheduleRow[] }>();
    const add = (key: string, label: string, userId: string | null, r: ScheduleRow) => {
      const entry = byPerson.get(key) ?? { label, userId, rows: [] };
      entry.rows.push(r);
      byPerson.set(key, entry);
    };
    for (const r of open) {
      const ids = r.state.waitingOnUserIds;
      if (ids.length === 0) add(`label:${r.state.waitingOnLabel}`, r.state.waitingOnLabel, null, r);
      else for (const uid of ids) add(uid, names.get(uid) ?? 'Someone', uid, r);
    }
    const people = [...byPerson.values()].sort((a, b) => (a.userId ? 1 : 0) - (b.userId ? 1 : 0) || b.rows.length - a.rows.length);
    return (
      <>
        <PageHeader title="My actions" subtitle={`Everything waiting on someone in ${event.name}.`} />
        {tabs}
        {people.length === 0 ? <Empty title="Nothing is waiting on anyone">Every line is installed, cancelled or not started.</Empty> : (
          <div className="space-y-3">
            {people.map((p) => {
              const urgent = p.rows.filter((r) => r.state.rank === 1).length;
              return (
                <details key={p.label} className="group rounded-[10px] border border-line bg-white" open={!p.userId || p.userId === user.id}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                    <span className={cx('text-[16px] font-semibold', p.userId ? 'text-ink' : 'text-red-700')}>
                      {p.label}{p.userId === user.id ? ' (you)' : ''}
                    </span>
                    <span className="flex items-center gap-3 text-[14px] text-muted">
                      {urgent > 0 && <span className="font-semibold text-red-700">{urgent} overdue</span>}
                      <span>{p.rows.length} line{p.rows.length === 1 ? '' : 's'}</span>
                    </span>
                  </summary>
                  <div className="border-t border-line p-3">
                    {!p.userId && (
                      <p className="mb-3 text-[14px] text-ink-2">
                        Nobody is set to handle these. {p.label === 'Account manager not set'
                          ? 'Give the sponsor an account manager on the Sponsors page.' : 'Choose an approver or owner in Settings.'}
                      </p>
                    )}
                    <ItemTable rows={p.rows.sort((a, b) => urgencyCompare(a.state, b.state))} today={today} showCategory showAction />
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </>
    );
  }

  // ---- The board --------------------------------------------------------------------
  const lineCard = (id: string): Card | null => {
    const r = byId.get(id);
    if (!r) return null;
    return {
      kind: 'line',
      id,
      code: r.code,
      description: r.item.description,
      category: categoryInfo(r.item.category).label,
      sponsor: r.sponsor?.name ?? null,
      group: r.state.group,
      statusLabel: r.state.statusLabel,
      action: r.state.action,
      due: r.state.due,
      flag: r.state.flag,
      thumb: thumbUrl(r),
      daysWaiting: r.state.daysWaiting,
      waitingOnMe: waitingOnMe(r),
    };
  };
  const columns: BoardColumnData[] = TASK_STATUSES.map((s) => {
    const col = board[s.key];
    return {
      status: s.key,
      cards: [
        ...col.lineIds.map(lineCard).filter((c): c is Card => c !== null),
        ...col.tasks.map((t): Card => {
          const linked = t.item_id ? byId.get(t.item_id) : null;
          return {
            kind: 'task',
            id: t.id,
            title: t.title,
            notes: t.notes,
            due: t.due,
            item: linked ? { id: linked.item.id, code: linked.code, description: linked.item.description } : null,
            completedAt: t.completed_at ? londonDate(new Date(t.completed_at)) : null,
          };
        }),
      ],
    };
  });
  const lineOptions = sched.rows.filter((r) => !r.item.cancelled).map((r) => ({ id: r.item.id, label: `${r.code} ${r.item.description}` }));

  const subtitle = mineCount || openTasks
    ? `${mineCount ? `${plural(mineCount, 'line')} waiting on you` : 'No lines waiting on you'} and ${plural(openTasks, 'open task')} in ${event.name}. Drag cards between columns, or use the arrows.`
    : `Nothing is waiting on you in ${event.name}. Add your own tasks to the board, and lines that need you will appear here by themselves.`;

  return (
    <>
      <PageHeader title="My actions" subtitle={subtitle} />
      {tabs}
      <KanbanBoard eventId={event.id} columns={columns} today={today} lineOptions={lineOptions} />
    </>
  );
}
