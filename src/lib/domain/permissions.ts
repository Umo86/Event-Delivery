import type { ItemState } from './engine';
import type { DecisionValue, Role, SponsorRow, StageRow } from './types';

export interface Actor {
  id: string;
  role: Role;
  full_name: string;
}

export const isAdmin = (u: Actor | null | undefined) => u?.role === 'admin';
export const canEdit = (u: Actor | null | undefined) => u?.role === 'admin' || u?.role === 'member';

/** Is this person the named approver for the stage (or the sponsor's account manager for sponsor stages)? */
export function isStageApprover(u: Actor, stage: StageRow, sponsor: SponsorRow | null): boolean {
  if (stage.uses_account_manager) return !!sponsor?.account_manager_id && sponsor.account_manager_id === u.id;
  return !!stage.approver_id && stage.approver_id === u.id;
}

/** Admins can record any stage; members only the stages they approve. Viewers never. */
export function canDecideStage(u: Actor, stage: StageRow, sponsor: SponsorRow | null): boolean {
  if (u.role === 'admin') return true;
  if (u.role !== 'member') return false;
  return isStageApprover(u, stage, sponsor);
}

/**
 * Which decisions are allowed on a stage right now:
 * - the current stage: any decision
 * - an earlier stage that already approved this version: can be reopened (changes / reject / hold)
 * - later stages: none (they unlock in order)
 */
export function allowedDecisions(state: ItemState, stageId: string): DecisionValue[] {
  if (!state.artIn || state.group === 'cancelled') return [];
  const s = state.stages.find((x) => x.stage.id === stageId);
  if (!s || !s.applies) return [];
  if (s.kind === 'current' || s.kind === 'stale') return ['approved', 'changes_requested', 'rejected', 'on_hold'];
  if (s.kind === 'approved') return ['changes_requested', 'rejected', 'on_hold'];
  return [];
}
