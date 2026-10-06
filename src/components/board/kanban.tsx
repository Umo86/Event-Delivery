'use client';

import Link from 'next/link';
import { startTransition, useOptimistic, useState, type DragEvent, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { fmtDate, relativeDue } from '@/lib/dates';
import { adjacentStatus, TASK_STATUSES, taskStatusLabel } from '@/lib/domain/tasks';
import type { Flag, Group, TaskStatus } from '@/lib/domain/types';
import { addTask, clearCompleted, deleteTask, moveTask, setLineStarted, updateTask } from '@/app/actions/tasks';
import { ActionForm, SubmitButton } from '@/components/forms';
import { btn, cx, Field, FlagChip, inputCls, Notice, Plate, StatusChip, textareaCls, Thumb } from '@/components/ui';

// The My actions board: three columns of cards. Schedule lines waiting on the person arrive by themselves;
// their own tasks are added by hand. Cards move by drag and drop, or with the buttons on each card.

export interface LineCard {
  kind: 'line';
  id: string;
  code: string;
  description: string;
  category: string;
  sponsor: string | null;
  group: Group;
  statusLabel: string;
  action: string;
  due: string | null;
  flag: Flag | null;
  thumb: string | null;
  daysWaiting: number | null;
  /** False once the line has moved on: it then shows as complete until cleared. */
  waitingOnMe: boolean;
}

export interface TaskCard {
  kind: 'task';
  id: string;
  title: string;
  notes: string | null;
  due: string | null;
  item: { id: string; code: string; description: string } | null;
  /** The day it was finished (YYYY-MM-DD, UK time). */
  completedAt: string | null;
}

export type Card = LineCard | TaskCard;
export interface BoardColumnData { status: TaskStatus; cards: Card[] }
export interface LineOption { id: string; label: string }

const keyOf = (c: Card) => `${c.kind}:${c.id}`;

type Change =
  | { type: 'move'; key: string; to: TaskStatus; beforeKey: string | null }
  | { type: 'remove'; key: string }
  | { type: 'clear' };

function reduce(cols: BoardColumnData[], ch: Change): BoardColumnData[] {
  if (ch.type === 'clear') return cols.map((c) => (c.status === 'complete' ? { ...c, cards: [] } : c));
  let moved: Card | undefined;
  const without = cols.map((c) => {
    const cards = c.cards.filter((x) => (keyOf(x) === ch.key ? ((moved = x), false) : true));
    return { ...c, cards };
  });
  if (ch.type === 'remove' || !moved) return without;
  return without.map((c) => {
    if (c.status !== ch.to) return c;
    const at = ch.beforeKey ? c.cards.findIndex((x) => keyOf(x) === ch.beforeKey) : -1;
    const cards = [...c.cards];
    cards.splice(at < 0 ? cards.length : at, 0, moved!);
    return { ...c, cards };
  });
}

const DOT: Record<TaskStatus, string> = { to_do: 'bg-slate-400', in_progress: 'bg-signal ring-1 ring-[#e0a800]', complete: 'bg-green-600' };

export function KanbanBoard({ eventId, columns, today, lineOptions }: {
  eventId: string; columns: BoardColumnData[]; today: string; lineOptions: LineOption[];
}) {
  const [cols, apply] = useOptimistic(columns, reduce);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ status: TaskStatus; beforeKey: string | null } | null>(null);
  const [adding, setAdding] = useState<TaskStatus | null>(null);

  const find = (key: string) => cols.flatMap((c) => c.cards.map((x) => ({ card: x, status: c.status }))).find((x) => keyOf(x.card) === key);

  /** Where a card may go. Lines are finished by doing the work on the line page, so they never move to Complete by hand. */
  const canGo = (card: Card, from: TaskStatus, to: TaskStatus) =>
    to !== from && (card.kind === 'task' || (card.waitingOnMe && to !== 'complete'));

  function move(key: string, to: TaskStatus, beforeKey: string | null) {
    const found = find(key);
    if (!found) return;
    const { card, status } = found;
    if (!canGo(card, status, to)) {
      if (card.kind === 'line' && to === 'complete') setError(`${card.code} is completed by doing the work on its line page: it moves to Complete by itself.`);
      return;
    }
    setError(null);
    const before = beforeKey ? find(beforeKey)?.card ?? null : null;
    startTransition(async () => {
      apply({ type: 'move', key, to, beforeKey });
      const r = card.kind === 'task'
        ? await moveTask(card.id, to, before?.kind === 'task' ? before.id : null)
        : await setLineStarted(card.id, to === 'in_progress');
      if (!r.ok) setError(r.error);
    });
  }

  function remove(card: Card) {
    const label = card.kind === 'task' ? `Delete the task “${card.title}”?` : `Clear ${card.code} from your board?`;
    if (!window.confirm(label)) return;
    setError(null);
    startTransition(async () => {
      apply({ type: 'remove', key: keyOf(card) });
      const r = card.kind === 'task' ? await deleteTask(card.id) : await setLineStarted(card.id, false);
      if (!r.ok) setError(r.error);
    });
  }

  function clearAll() {
    if (!window.confirm('Clear everything in Complete? Finished tasks are deleted.')) return;
    setError(null);
    startTransition(async () => {
      apply({ type: 'clear' });
      const r = await clearCompleted(eventId);
      if (!r.ok) setError(r.error);
    });
  }

  // ---- drag and drop ---------------------------------------------------------------
  const onDragStart = (card: Card) => (e: DragEvent) => {
    e.dataTransfer.setData('text/plain', keyOf(card));
    e.dataTransfer.effectAllowed = 'move';
    setDragging(keyOf(card));
  };
  const onDragEnd = () => { setDragging(null); setOver(null); };
  const onDragOver = (status: TaskStatus, beforeKey: string | null) => (e: DragEvent) => {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (over?.status !== status || over?.beforeKey !== beforeKey) setOver({ status, beforeKey });
  };
  const onDrop = (status: TaskStatus, beforeKey: string | null) => (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const key = e.dataTransfer.getData('text/plain') || dragging;
    setDragging(null);
    setOver(null);
    if (key && key !== beforeKey) move(key, status, beforeKey);
  };

  return (
    <div>
      {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}
      <div className="grid items-start gap-4 md:grid-cols-3" role="list" aria-label="Board">
        {cols.map((col) => {
          const meta = TASK_STATUSES.find((t) => t.key === col.status)!;
          const isOver = over?.status === col.status;
          return (
            <section
              key={col.status}
              role="listitem"
              aria-labelledby={`col-${col.status}`}
              data-column={col.status}
              onDragOver={onDragOver(col.status, null)}
              onDrop={onDrop(col.status, null)}
              className={cx('flex min-h-[220px] flex-col rounded-[10px] border bg-paper/70 transition-colors',
                isOver ? 'border-ink bg-signal-soft/60' : 'border-line')}
            >
              <header className="flex items-center gap-2 px-3 pt-3 pb-2">
                <span aria-hidden className={cx('h-2.5 w-2.5 rounded-full', DOT[col.status])} />
                <h2 id={`col-${col.status}`} className="text-[17px] font-semibold text-ink">
                  {meta.label} <span className="text-muted">({col.cards.length})</span>
                </h2>
                <span className="ml-auto flex items-center gap-1">
                  {col.status === 'complete' && col.cards.length > 0 && (
                    <button type="button" onClick={clearAll} className={cx(btn.base, btn.ghost, btn.small)}>Clear all</button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAdding(adding === col.status ? null : col.status)}
                    aria-expanded={adding === col.status}
                    aria-label={`Add a task to ${meta.label}`}
                    className={cx(btn.base, btn.secondary, btn.small)}
                  >
                    <Plus size={15} aria-hidden /> Add
                  </button>
                </span>
              </header>

              <div className="flex-1 space-y-2 px-3 pb-3">
                {adding === col.status && (
                  <TaskForm
                    key={`add-${col.status}`}
                    action={addTask}
                    hidden={{ event_id: eventId, status: col.status }}
                    idPrefix={`add-${col.status}`}
                    lineOptions={lineOptions}
                    submitLabel="Add task"
                    onDone={() => setAdding(null)}
                  />
                )}
                {col.cards.length === 0 && adding !== col.status && (
                  <p className="rounded-[8px] border border-dashed border-line-strong px-3 py-6 text-center text-[13.5px] text-muted">{meta.empty}</p>
                )}
                {col.cards.map((card) => {
                  const key = keyOf(card);
                  const prev = adjacentStatus(col.status, -1);
                  const next = adjacentStatus(col.status, 1);
                  return (
                    <div key={key} className="relative">
                      {isOver && over?.beforeKey === key && <span aria-hidden className="absolute -top-[5px] left-0 right-0 h-[3px] rounded bg-ink" />}
                      <BoardCard
                        card={card}
                        status={col.status}
                        today={today}
                        dragging={dragging === key}
                        lineOptions={lineOptions}
                        onDragStart={onDragStart(card)}
                        onDragEnd={onDragEnd}
                        onDragOver={onDragOver(col.status, key)}
                        onDrop={onDrop(col.status, key)}
                        movePrev={prev && canGo(card, col.status, prev) ? () => move(key, prev, null) : null}
                        moveNext={next && canGo(card, col.status, next) ? () => move(key, next, null) : null}
                        complete={card.kind === 'task' && col.status !== 'complete' ? () => move(key, 'complete', null) : null}
                        reopen={card.kind === 'task' && col.status === 'complete' ? () => move(key, 'to_do', null) : null}
                        remove={() => remove(card)}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

const iconBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-paper hover:text-ink disabled:opacity-40';

function BoardCard(p: {
  card: Card; status: TaskStatus; today: string; dragging: boolean; lineOptions: LineOption[];
  onDragStart: (e: DragEvent) => void; onDragEnd: () => void; onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void;
  movePrev: (() => void) | null; moveNext: (() => void) | null; complete: (() => void) | null; reopen: (() => void) | null; remove: () => void;
}) {
  const { card, status } = p;
  const [editing, setEditing] = useState(false);
  const draggable = !editing && (card.kind === 'task' || card.waitingOnMe);
  const prevLabel = adjacentStatus(status, -1);
  const nextLabel = adjacentStatus(status, 1);
  const done = status === 'complete';
  const overdue = (d: string | null) => !!d && !done && d < p.today;

  const dueLine = (d: string | null) => d ? (
    <span className={cx('text-[12.5px]', overdue(d) ? 'font-semibold text-red-700' : 'text-muted')}>
      Due {fmtDate(d)}{!done && <span className="font-normal text-muted">, {relativeDue(d, p.today)}</span>}
    </span>
  ) : null;

  const footer = (extra?: ReactNode) => (
    <div className="mt-2 flex items-center gap-0.5 border-t border-line pt-2">
      {p.movePrev && prevLabel && (
        <button type="button" onClick={p.movePrev} className={iconBtn} aria-label={`Move to ${taskStatusLabel(prevLabel)}`} title={`Move to ${taskStatusLabel(prevLabel)}`}>
          <ChevronLeft size={16} aria-hidden />
        </button>
      )}
      {p.moveNext && nextLabel && (
        <button type="button" onClick={p.moveNext} className={iconBtn} aria-label={`Move to ${taskStatusLabel(nextLabel)}`} title={`Move to ${taskStatusLabel(nextLabel)}`}>
          <ChevronRight size={16} aria-hidden />
        </button>
      )}
      {p.complete && status === 'to_do' && (
        <button type="button" onClick={p.complete} className={iconBtn} aria-label="Mark complete" title="Mark complete"><Check size={16} aria-hidden /></button>
      )}
      {p.reopen && (
        <button type="button" onClick={p.reopen} className={iconBtn} aria-label="Reopen" title="Reopen (back to To do)"><RotateCcw size={15} aria-hidden /></button>
      )}
      {extra}
      <span className="flex-1" />
      {/* Tasks can always be deleted; a line is only cleared once it has stopped waiting on the person */}
      {(card.kind === 'task' || !card.waitingOnMe) && (
        <button type="button" onClick={p.remove} className={cx(iconBtn, 'hover:text-red-700')}
          aria-label={card.kind === 'task' ? 'Delete task' : 'Clear from board'} title={card.kind === 'task' ? 'Delete task' : 'Clear from board'}>
          {card.kind === 'task' ? <Trash2 size={15} aria-hidden /> : <X size={16} aria-hidden />}
        </button>
      )}
    </div>
  );

  const shell = (children: ReactNode, label: string) => (
    <article
      aria-label={label}
      data-card={`${card.kind}:${card.id}`}
      draggable={draggable}
      onDragStart={p.onDragStart}
      onDragEnd={p.onDragEnd}
      onDragOver={p.onDragOver}
      onDrop={p.onDrop}
      className={cx('rounded-[8px] border border-line bg-white p-3 shadow-[0_1px_2px_rgba(19,35,59,0.06)]',
        draggable && 'cursor-grab active:cursor-grabbing', p.dragging && 'opacity-40', done && 'bg-white/70')}
    >
      {children}
    </article>
  );

  if (card.kind === 'line') {
    return shell(
      <>
        <div className="flex gap-3">
          <Link href={`/items/${card.id}`} tabIndex={-1} aria-hidden><Thumb src={card.thumb} alt="" size={44} /></Link>
          <div className="min-w-0 flex-1">
            <Link href={`/items/${card.id}`} className="group block">
              <span className="flex items-center gap-2"><Plate>{card.code}</Plate><FlagChip flag={card.flag} /></span>
              <span className="mt-1 block font-semibold leading-snug text-ink group-hover:underline">{card.description}</span>
            </Link>
            <p className="mt-0.5 text-[12.5px] text-muted">{card.category}{card.sponsor ? `, ${card.sponsor}` : ''}</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusChip group={card.group} label={card.statusLabel} />
          {card.waitingOnMe
            ? <span className="text-[13.5px] text-ink">{card.action}</span>
            : <span className="text-[13px] text-muted">No longer waiting on you</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3">
          {card.waitingOnMe && dueLine(card.due)}
          {card.waitingOnMe && card.daysWaiting !== null && card.daysWaiting > 0 && (
            <span className="text-[12.5px] text-muted">{card.daysWaiting} day{card.daysWaiting === 1 ? '' : 's'} at this step</span>
          )}
        </div>
        {footer(<Link href={`/items/${card.id}`} className={cx(btn.base, btn.ghost, btn.small, 'ml-1')}>Open line</Link>)}
      </>,
      `${card.code} ${card.description}`,
    );
  }

  if (editing) {
    return shell(
      <TaskForm
        action={updateTask}
        hidden={{ task_id: card.id }}
        idPrefix={`edit-${card.id}`}
        lineOptions={p.lineOptions}
        initial={card}
        submitLabel="Save"
        onDone={() => setEditing(false)}
      />,
      card.title,
    );
  }

  return shell(
    <>
      <p className={cx('font-semibold leading-snug text-ink', done && 'text-ink-2 line-through decoration-ink-2/50')}>{card.title}</p>
      {card.notes && <p className="mt-1 whitespace-pre-line text-[13.5px] text-ink-2 line-clamp-4">{card.notes}</p>}
      {card.item && (
        <Link href={`/items/${card.item.id}`} className="mt-1.5 flex items-center gap-2 text-[13px] text-ink-2 hover:underline">
          <Plate tone="light" className="text-[11.5px]">{card.item.code}</Plate>
          <span className="truncate">{card.item.description}</span>
        </Link>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-3">
        {dueLine(card.due)}
        {done && card.completedAt && <span className="text-[12.5px] text-muted">Done {fmtDate(card.completedAt)}</span>}
      </div>
      {footer(
        <button type="button" onClick={() => setEditing(true)} className={iconBtn} aria-label="Edit task" title="Edit task"><Pencil size={15} aria-hidden /></button>,
      )}
    </>,
    card.title,
  );
}

function TaskForm({ action, hidden, idPrefix, lineOptions, initial, submitLabel, onDone }: {
  action: Parameters<typeof ActionForm>[0]['action'];
  hidden: Record<string, string>;
  idPrefix: string;
  lineOptions: LineOption[];
  initial?: TaskCard;
  submitLabel: string;
  onDone: () => void;
}) {
  return (
    <ActionForm action={action} onSuccess={onDone} className="rounded-[8px] border border-ink/30 bg-white p-3">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Field label="Task" htmlFor={`${idPrefix}-title`}>
        <input id={`${idPrefix}-title`} name="title" required maxLength={200} defaultValue={initial?.title ?? ''} autoFocus
          placeholder="What needs doing?" className={inputCls} />
      </Field>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Field label="Due" htmlFor={`${idPrefix}-due`} className="min-w-0">
          <input id={`${idPrefix}-due`} name="due" type="date" defaultValue={initial?.due ?? ''} className={inputCls} />
        </Field>
        <Field label="Line" htmlFor={`${idPrefix}-item`} className="min-w-0">
          <select id={`${idPrefix}-item`} name="item_id" defaultValue={initial?.item?.id ?? ''} className={inputCls}>
            <option value="">None</option>
            {lineOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notes" htmlFor={`${idPrefix}-notes`} className="mt-2">
        <textarea id={`${idPrefix}-notes`} name="notes" rows={2} maxLength={2000} defaultValue={initial?.notes ?? ''} className={textareaCls} />
      </Field>
      <div className="mt-3 flex items-center gap-2">
        <SubmitButton small>{submitLabel}</SubmitButton>
        <button type="button" onClick={onDone} className={cx(btn.base, btn.ghost, btn.small)}>Cancel</button>
      </div>
    </ActionForm>
  );
}
