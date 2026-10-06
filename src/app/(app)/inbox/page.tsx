import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser, requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getCurrentEvent, loadSchedule, type ScheduleRow } from '@/lib/data/load';
import { urgencyCompare } from '@/lib/domain/engine';
import { actionKind } from '@/lib/domain/labels';
import type { SubtaskRow, TaskDocumentRow, TaskRow } from '@/lib/domain/types';
import { blobAccess } from '@/lib/storage';
import { ItemTable } from '@/components/item-table';
import { TaskBoard, type TaskLite } from '@/components/tasks/board';
import { cx, Empty, PageHeader } from '@/components/ui';
import { NoEvent } from '@/components/no-event';

// Users can't be given sign-off work, so for them this page is just their own task board.
const pageTitle = (role: string | undefined) => (role === 'user' ? 'My tasks' : 'My actions');

export async function generateMetadata(): Promise<Metadata> {
  return { title: pageTitle((await getCurrentUser())?.role) };
}

export default async function InboxPage(props: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser();
  const title = pageTitle(user.role);
  const { view } = await props.searchParams;
  const event = await getCurrentEvent();
  if (!event) return <NoEvent />;
  const sched = await loadSchedule(event.id);
  if (!sched) return <NoEvent />;
  const today = sched.bundle.ctx.today;
  const names = sched.bundle.ctx.userNames;
  const open = sched.rows.filter((r) => r.state.group !== 'cancelled' && r.state.waitingOnLabel);
  const mine = open.filter((r) => r.state.waitingOnUserIds.includes(user.id)).sort((a, b) => urgencyCompare(a.state, b.state));
  const team = view === 'team';

  const tabs = (
    <nav className="mb-5 flex gap-1 border-b border-line" aria-label="Board views">
      {[{ href: '/inbox', label: 'My board', on: !team }, { href: '/inbox?view=team', label: 'Whole team', on: team }].map((t) => (
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
        <PageHeader title={title} subtitle={`Everything waiting on someone in ${event.name}.`} />
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
                          ? (user.role === 'super_admin'
                            ? 'Give the sponsor an account manager on the Sponsors page.'
                            : 'A super admin needs to give the sponsor an account manager.')
                          : 'Choose an approver or owner in Show setup.'}
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

  // The personal board: lines waiting on me (artwork, sign-off or production; added automatically) + my own tasks.
  const actions = mine.map((r) => ({
    itemId: r.item.id,
    code: r.code,
    title: r.item.description,
    action: r.state.action,
    kind: actionKind(r.state.group),
    due: r.state.due,
    overdue: !!r.state.due && r.state.due < today,
  }));

  const sql = await db();
  const [taskRows, subtaskRows, docRows] = await Promise.all([
    sql<TaskRow[]>`select * from tasks where user_id = ${user.id} and event_id = ${event.id}
      order by status, deadline asc nulls last, created_at`,
    sql<SubtaskRow[]>`select s.* from task_subtasks s join tasks t on t.id = s.task_id
      where t.user_id = ${user.id} and t.event_id = ${event.id} order by s.created_at`,
    sql<TaskDocumentRow[]>`select d.* from task_documents d join tasks t on t.id = d.task_id
      where t.user_id = ${user.id} and t.event_id = ${event.id} order by d.uploaded_at`,
  ]);
  const subs = new Map<string, SubtaskRow[]>();
  for (const s of subtaskRows) (subs.get(s.task_id) ?? subs.set(s.task_id, []).get(s.task_id)!).push(s);
  const docs = new Map<string, TaskDocumentRow[]>();
  for (const d of docRows) (docs.get(d.task_id) ?? docs.set(d.task_id, []).get(d.task_id)!).push(d);
  const tasks: TaskLite[] = taskRows.map((t) => ({
    id: t.id, title: t.title, notes: t.notes, status: t.status, deadline: t.deadline,
    subtasks: (subs.get(t.id) ?? []).map((s) => ({ id: s.id, title: s.title, done: s.done })),
    documents: (docs.get(t.id) ?? []).map((d) => ({ id: d.id, name: d.name })),
  }));

  const subtitle = user.role === 'user'
    ? `Your own task board for ${event.name}.`
    : actions.length
      ? `${actions.length} line${actions.length === 1 ? '' : 's'} waiting on you in ${event.name}, plus your own tasks.`
      : `Your board for ${event.name}. Anything that needs you lands in To do automatically.`;

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      {tabs}
      <TaskBoard today={today} userId={user.id} access={blobAccess()} actions={actions} tasks={tasks} />
    </>
  );
}
