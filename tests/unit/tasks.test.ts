import { describe, expect, it } from 'vitest';
import { adjacentStatus, buildBoard, isTaskStatus, openCount } from '@/lib/domain/tasks';
import type { TaskRow } from '@/lib/domain/types';

const task = (over: Partial<TaskRow> & { id: string }): TaskRow => ({
  event_id: 'e1', user_id: 'u1', item_id: null, title: over.id, notes: null, due: null, status: 'to_do', position: 0,
  completed_at: null, created_at: new Date('2026-10-01T10:00:00Z'), updated_at: new Date('2026-10-01T10:00:00Z'), ...over,
});

describe('the board', () => {
  it('puts lines waiting on me in To do, started ones in In progress, and finished started ones in Complete', () => {
    const board = buildBoard({
      lines: [
        { id: 'urgent', waitingOnMe: true },
        { id: 'started', waitingOnMe: true },
        { id: 'later', waitingOnMe: true },
        { id: 'done', waitingOnMe: false },
        { id: 'someone-elses', waitingOnMe: false },
      ],
      started: new Set(['started', 'done']),
      tasks: [],
    });
    expect(board.to_do.lineIds).toEqual(['urgent', 'later']); // most urgent first, as given
    expect(board.in_progress.lineIds).toEqual(['started']);
    expect(board.complete.lineIds).toEqual(['done']); // a line I never started doesn't appear once it's not mine
  });

  it('keeps open tasks in their order and shows finished ones most recent first', () => {
    const board = buildBoard({
      lines: [],
      started: new Set(),
      tasks: [
        task({ id: 'b', position: 2 }),
        task({ id: 'a', position: 1 }),
        task({ id: 'working', status: 'in_progress', position: 1 }),
        task({ id: 'old-done', status: 'complete', completed_at: new Date('2026-10-02T09:00:00Z') }),
        task({ id: 'new-done', status: 'complete', completed_at: new Date('2026-10-04T09:00:00Z') }),
        task({ id: 'tie-1', position: 5, created_at: new Date('2026-10-03T09:00:00Z') }),
        task({ id: 'tie-0', position: 5, created_at: new Date('2026-10-02T09:00:00Z') }),
      ],
    });
    expect(board.to_do.tasks.map((t) => t.id)).toEqual(['a', 'b', 'tie-0', 'tie-1']);
    expect(board.in_progress.tasks.map((t) => t.id)).toEqual(['working']);
    expect(board.complete.tasks.map((t) => t.id)).toEqual(['new-done', 'old-done']);
    expect(openCount(board)).toBe(5);
  });

  it('counts lines and tasks still to do, not finished ones', () => {
    const board = buildBoard({
      lines: [{ id: 'l1', waitingOnMe: true }, { id: 'l2', waitingOnMe: false }],
      started: new Set(['l1', 'l2']),
      tasks: [task({ id: 't1' }), task({ id: 't2', status: 'complete' })],
    });
    expect(openCount(board)).toBe(2);
  });

  it('knows the column order', () => {
    expect(adjacentStatus('to_do', -1)).toBeNull();
    expect(adjacentStatus('to_do', 1)).toBe('in_progress');
    expect(adjacentStatus('in_progress', 1)).toBe('complete');
    expect(adjacentStatus('complete', 1)).toBeNull();
    expect(isTaskStatus('complete')).toBe(true);
    expect(isTaskStatus('done')).toBe(false);
  });
});
