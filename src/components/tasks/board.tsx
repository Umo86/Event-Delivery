'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Calendar, Check, ChevronDown, ExternalLink, FileText, Plus, Trash2, X } from 'lucide-react';
import type { TaskStatus } from '@/lib/domain/types';
import { relativeDue } from '@/lib/dates';
import {
  addSubtask, createTask, deleteSubtask, deleteTask, moveTask, removeDocument, toggleSubtask, updateTask,
} from '@/app/actions/tasks';
import { ActionForm, SubmitButton } from '../forms';
import { TaskUploader } from './task-uploader';
import { btn, cx } from '../ui';

export type ActionCard = { itemId: string; code: string; title: string; action: string; due: string | null; overdue: boolean };
export type SubtaskLite = { id: string; title: string; done: boolean };
export type DocLite = { id: string; name: string };
export type TaskLite = {
  id: string; title: string; notes: string | null; status: TaskStatus; deadline: string | null;
  subtasks: SubtaskLite[]; documents: DocLite[];
};

const COLUMNS: { status: TaskStatus; label: string; dot: string; head: string; ring: string }[] = [
  { status: 'todo', label: 'To do', dot: 'bg-red-500', head: 'text-red-700', ring: 'ring-red-200' },
  { status: 'in_process', label: 'In process', dot: 'bg-orange-500', head: 'text-orange-700', ring: 'ring-orange-200' },
  { status: 'complete', label: 'Complete', dot: 'bg-green-600', head: 'text-green-700', ring: 'ring-green-200' },
];

function isOverdue(deadline: string | null, today: string, status: TaskStatus): boolean {
  return !!deadline && status !== 'complete' && deadline < today;
}

export function TaskBoard({ today, userId, access, actions, tasks }: {
  today: string; userId: string; access: 'public' | 'private'; actions: ActionCard[]; tasks: TaskLite[];
}) {
  const router = useRouter();
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [, startTransition] = useTransition();

  function drop(status: TaskStatus, taskId: string) {
    setDragOver(null);
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    const fd = new FormData();
    fd.set('task_id', taskId);
    fd.set('status', status);
    startTransition(async () => {
      await moveTask(null, fd);
      router.refresh();
    });
  }

  return (
    <div>
      <ActionForm action={createTask} resetOnSuccess className="mb-5 flex flex-wrap items-end gap-2 rounded-[10px] border border-line bg-surface p-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="nt-title" className="mb-1 block text-[13px] font-semibold text-ink-2">New task</label>
          <input id="nt-title" name="title" required maxLength={200} placeholder="What needs doing?"
            className="h-9 w-full rounded-md border border-line-strong bg-white px-3 text-[14px] focus:border-ink focus:outline-none" />
        </div>
        <div>
          <label htmlFor="nt-deadline" className="mb-1 block text-[13px] font-semibold text-ink-2">Deadline (optional)</label>
          <input id="nt-deadline" name="deadline" type="date"
            className="h-9 rounded-md border border-line-strong bg-white px-3 text-[14px] focus:border-ink focus:outline-none" />
        </div>
        <SubmitButton><Plus size={16} aria-hidden /> Add task</SubmitButton>
      </ActionForm>

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.status);
          const count = colTasks.length + (col.status === 'todo' ? actions.length : 0);
          return (
            <section
              key={col.status}
              aria-label={col.label}
              onDragOver={(e) => { e.preventDefault(); setDragOver(col.status); }}
              onDragLeave={() => setDragOver((s) => (s === col.status ? null : s))}
              onDrop={(e) => { e.preventDefault(); drop(col.status, e.dataTransfer.getData('text/plain')); }}
              className={cx('rounded-[12px] border bg-paper/50 p-2.5', dragOver === col.status ? 'border-ink ring-2 ring-inset ' + col.ring : 'border-line')}
            >
              <div className="mb-2.5 flex items-center gap-2 px-1">
                <span className={cx('h-2.5 w-2.5 rounded-full', col.dot)} aria-hidden />
                <h2 className={cx('text-[15px] font-semibold', col.head)}>{col.label}</h2>
                <span className="text-[13px] text-muted">{count}</span>
              </div>

              <div className="space-y-2.5">
                {col.status === 'todo' && actions.map((a) => (
                  <Link key={a.itemId} href={`/items/${a.itemId}`}
                    className={cx('block rounded-[10px] border bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:border-ink-2',
                      a.overdue ? 'border-red-300' : 'border-line')}>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-signal-soft px-1.5 py-0.5 text-[11px] font-semibold text-ink">Sign-off</span>
                      <span className="text-[12px] text-muted">{a.code}</span>
                    </div>
                    <p className="mt-1 text-[14.5px] font-semibold text-ink">{a.title}</p>
                    <p className="mt-0.5 text-[13px] text-ink-2">{a.action}</p>
                    {a.due && (
                      <p className={cx('mt-1 text-[12.5px]', a.overdue ? 'font-semibold text-red-700' : 'text-muted')}>
                        {a.overdue ? 'Overdue — ' : 'Due '}{relativeDue(a.due, today)}
                      </p>
                    )}
                  </Link>
                ))}

                {colTasks.map((t) => <TaskCard key={t.id} task={t} today={today} userId={userId} access={access} />)}

                {count === 0 && (
                  <p className="rounded-[10px] border border-dashed border-line-strong px-3 py-6 text-center text-[13px] text-muted">
                    {col.status === 'todo' ? 'You’re all caught up. Add a task or drag one here.' : 'Nothing here yet.'}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({ task, today, userId, access }: { task: TaskLite; today: string; userId: string; access: 'public' | 'private' }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const overdue = isOverdue(task.deadline, today, task.status);
  const doneCount = task.subtasks.filter((s) => s.done).length;

  return (
    <article
      aria-label={task.title}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; }}
      className={cx('rounded-[10px] border bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]', overdue ? 'border-red-300 ring-1 ring-red-200' : 'border-line')}
    >
      {!editing ? (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className={cx('text-[14.5px] font-semibold text-ink', task.status === 'complete' && 'text-muted line-through')}>{task.title}</p>
            <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open}
              className="shrink-0 rounded p-0.5 text-muted hover:bg-paper hover:text-ink">
              <ChevronDown size={16} className={cx('transition-transform', open && 'rotate-180')} aria-hidden />
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {task.deadline && (
              <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ring-inset',
                overdue ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-slate-100 text-slate-700 ring-slate-200')}>
                <Calendar size={11} aria-hidden /> {overdue ? 'Overdue' : 'Due'} {relativeDue(task.deadline, today)}
              </span>
            )}
            {task.subtasks.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[12px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                <Check size={11} aria-hidden /> {doneCount}/{task.subtasks.length}
              </span>
            )}
            {task.documents.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[12px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                <FileText size={11} aria-hidden /> {task.documents.length}
              </span>
            )}
          </div>
        </>
      ) : (
        <ActionForm action={updateTask} className="space-y-2" onSuccess={() => setEditing(false)}>
          <input type="hidden" name="task_id" value={task.id} />
          <input name="title" required defaultValue={task.title} maxLength={200} aria-label="Task title"
            className="h-9 w-full rounded-md border border-line-strong bg-white px-3 text-[14px] focus:border-ink focus:outline-none" />
          <textarea name="notes" defaultValue={task.notes ?? ''} maxLength={2000} rows={2} placeholder="Notes" aria-label="Notes"
            className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-[14px] focus:border-ink focus:outline-none" />
          <label className="block text-[12.5px] font-semibold text-ink-2">Deadline
            <input name="deadline" type="date" defaultValue={task.deadline ?? ''}
              className="mt-1 block h-9 rounded-md border border-line-strong bg-white px-3 text-[14px] focus:border-ink focus:outline-none" />
          </label>
          <div className="flex gap-2">
            <SubmitButton small>Save</SubmitButton>
            <button type="button" onClick={() => setEditing(false)} className={cx(btn.base, btn.ghost, btn.small)}>Cancel</button>
          </div>
        </ActionForm>
      )}

      {open && !editing && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {task.notes && <p className="whitespace-pre-line text-[13.5px] text-ink-2">{task.notes}</p>}

          {/* Sub-tasks */}
          <div>
            {task.subtasks.length > 0 && (
              <ul className="mb-1.5 space-y-1">
                {task.subtasks.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <ActionForm action={toggleSubtask} className="flex min-w-0 flex-1 items-center gap-2">
                      <input type="hidden" name="subtask_id" value={s.id} />
                      <input type="hidden" name="done" value={s.done ? '' : 'on'} />
                      <button type="submit" aria-label={s.done ? `Mark "${s.title}" not done` : `Mark "${s.title}" done`}
                        className={cx('flex h-4 w-4 shrink-0 items-center justify-center rounded border', s.done ? 'border-green-600 bg-green-600 text-white' : 'border-line-strong bg-white')}>
                        {s.done && <Check size={11} strokeWidth={3} aria-hidden />}
                      </button>
                      <span className={cx('truncate text-[13.5px]', s.done ? 'text-muted line-through' : 'text-ink')}>{s.title}</span>
                    </ActionForm>
                    <ActionForm action={deleteSubtask}>
                      <input type="hidden" name="subtask_id" value={s.id} />
                      <button type="submit" aria-label={`Delete sub-task "${s.title}"`} className="rounded p-0.5 text-muted hover:text-red-700"><X size={13} aria-hidden /></button>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={addSubtask} resetOnSuccess className="flex items-center gap-2">
              <input type="hidden" name="task_id" value={task.id} />
              <input name="title" required maxLength={200} placeholder="Add a sub-task" aria-label="Add a sub-task"
                className="h-8 min-w-0 flex-1 rounded-md border border-line-strong bg-white px-2.5 text-[13.5px] focus:border-ink focus:outline-none" />
              <SubmitButton variant="secondary" small pendingText="…">Add</SubmitButton>
            </ActionForm>
          </div>

          {/* Documents */}
          <div>
            {task.documents.length > 0 && (
              <ul className="mb-1.5 space-y-1">
                {task.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-2">
                    <a href={`/api/task-files/${d.id}`} target="_blank" rel="noopener noreferrer"
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-[13.5px] text-ink hover:underline">
                      <FileText size={13} className="shrink-0 text-muted" aria-hidden />
                      <span className="truncate">{d.name}</span>
                      <ExternalLink size={11} className="shrink-0 text-muted" aria-hidden />
                    </a>
                    <ActionForm action={removeDocument}>
                      <input type="hidden" name="document_id" value={d.id} />
                      <button type="submit" aria-label={`Remove file "${d.name}"`} className="rounded p-0.5 text-muted hover:text-red-700"><X size={13} aria-hidden /></button>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
            <TaskUploader taskId={task.id} userId={userId} access={access} />
          </div>

          {/* Move between columns */}
          <ActionForm action={moveTask}>
            <input type="hidden" name="task_id" value={task.id} />
            <span className="mb-1 block text-[12px] font-semibold text-ink-2">Move to</span>
            <div className="flex flex-wrap gap-1.5">
              {COLUMNS.map((c) => (
                c.status === task.status
                  ? <span key={c.status} className={cx('inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[13px] font-semibold', c.head)}>
                      <span className={cx('h-2 w-2 rounded-full', c.dot)} aria-hidden /> {c.label}
                    </span>
                  : <SubmitButton key={c.status} variant="secondary" small name="status" value={c.status} pendingText="…">{c.label}</SubmitButton>
              ))}
            </div>
          </ActionForm>

          <div className="flex justify-between gap-2 pt-1">
            <button type="button" onClick={() => setEditing(true)} className={cx(btn.base, btn.ghost, btn.small)}>Edit</button>
            <ActionForm action={deleteTask} confirm={`Delete "${task.title}"? This can’t be undone.`}>
              <input type="hidden" name="task_id" value={task.id} />
              <button type="submit" className={cx(btn.base, btn.danger, btn.small)}><Trash2 size={13} aria-hidden /> Delete</button>
            </ActionForm>
          </div>
        </div>
      )}
    </article>
  );
}
