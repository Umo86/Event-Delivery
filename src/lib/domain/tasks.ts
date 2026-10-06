import type { TaskRow, TaskStatus } from './types';

// A person's board: three columns. Schedule lines waiting on them appear by themselves, their own tasks are added by hand.

export const TASK_STATUSES: { key: TaskStatus; label: string; empty: string }[] = [
  { key: 'to_do', label: 'To do', empty: 'You’re all caught up. Add a task, or wait for a line to need you.' },
  { key: 'in_progress', label: 'In progress', empty: 'Move a card here when you start on it.' },
  { key: 'complete', label: 'Complete', empty: 'Finished tasks and lines you’ve dealt with end up here.' },
];

export function isTaskStatus(v: unknown): v is TaskStatus {
  return v === 'to_do' || v === 'in_progress' || v === 'complete';
}

export const taskStatusLabel = (s: TaskStatus) => TASK_STATUSES.find((t) => t.key === s)!.label;

/** The column after (dir = 1) or before (dir = -1) this one, or null at the ends. */
export function adjacentStatus(s: TaskStatus, dir: 1 | -1): TaskStatus | null {
  const i = TASK_STATUSES.findIndex((t) => t.key === s) + dir;
  return TASK_STATUSES[i]?.key ?? null;
}

export interface BoardLine {
  id: string;
  /** Whether the line is currently waiting on this person. */
  waitingOnMe: boolean;
}

export interface BoardColumn {
  status: TaskStatus;
  /** Schedule lines in this column, in the order given (most urgent first). */
  lineIds: string[];
  tasks: TaskRow[];
}

export type Board = Record<TaskStatus, BoardColumn>;

/**
 * Lays out a person's board.
 * - A line waiting on them is "to do", or "in progress" once they have started it.
 * - A line they started that no longer waits on them is "complete" (until they clear it).
 * - Their own tasks sit in the column they were put in: open ones in their order, finished ones most recent first.
 */
export function buildBoard(opts: { lines: BoardLine[]; started: Set<string>; tasks: TaskRow[] }): Board {
  const board: Board = {
    to_do: { status: 'to_do', lineIds: [], tasks: [] },
    in_progress: { status: 'in_progress', lineIds: [], tasks: [] },
    complete: { status: 'complete', lineIds: [], tasks: [] },
  };
  for (const l of opts.lines) {
    const started = opts.started.has(l.id);
    if (l.waitingOnMe) board[started ? 'in_progress' : 'to_do'].lineIds.push(l.id);
    else if (started) board.complete.lineIds.push(l.id);
  }
  const byOrder = (a: TaskRow, b: TaskRow) => a.position - b.position || +new Date(a.created_at) - +new Date(b.created_at);
  const byFinished = (a: TaskRow, b: TaskRow) =>
    +new Date(b.completed_at ?? b.updated_at) - +new Date(a.completed_at ?? a.updated_at) || byOrder(a, b);
  for (const t of opts.tasks) board[t.status].tasks.push(t);
  board.to_do.tasks.sort(byOrder);
  board.in_progress.tasks.sort(byOrder);
  board.complete.tasks.sort(byFinished);
  return board;
}

/** How many cards still need doing: lines waiting on the person plus their open tasks. */
export function openCount(board: Board): number {
  return ['to_do', 'in_progress'].reduce((n, k) => n + board[k as TaskStatus].lineIds.length + board[k as TaskStatus].tasks.length, 0);
}
