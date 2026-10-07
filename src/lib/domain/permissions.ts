import type { ItemState } from './engine';
import type { DecisionValue, Role, SponsorRow, StageRow } from './types';

export interface Actor {
  id: string;
  role: Role;
  full_name: string;
}

/** Super Admin: full control of everything. */
export const isSuperAdmin = (u: Actor | null | undefined) => u?.role === 'super_admin';
/** Manager or Super Admin: can add, edit and delete signage and the things around it. Users are view-only. */
export const canEdit = (u: Actor | null | undefined) => u?.role === 'super_admin' || u?.role === 'manager';

/**
 * Who can mark a sponsorship item sold and record its sale price: everyone with an account, including Users,
 * except people in an external department (agencies, contractors). Managers and super admins always can.
 */
export const canSell = (u: (Actor & { is_external?: boolean }) | null | undefined) =>
  !!u && (canEdit(u) || !u.is_external);

/** Is this person the named approver for the stage (or the sponsor's account manager for sponsor stages)? */
export function isStageApprover(u: Actor, stage: StageRow, sponsor: SponsorRow | null): boolean {
  if (stage.uses_account_manager) return !!sponsor?.account_manager_id && sponsor.account_manager_id === u.id;
  return stage.approver_ids.includes(u.id);
}

/** Super Admins can record any stage; Managers only the stages they approve. Users never. */
export function canDecideStage(u: Actor, stage: StageRow, sponsor: SponsorRow | null): boolean {
  if (u.role === 'super_admin') return true;
  if (u.role !== 'manager') return false;
  return isStageApprover(u, stage, sponsor);
}

/**
 * Which decisions are allowed on a stage right now:
 * - the current stage: any decision
 * - an earlier stage that already approved this version: can be reopened (changes / reject / hold)
 * - later stages: none (they unlock in order)
 */
export function allowedDecisions(state: ItemState, stageId: string): DecisionValue[] {
  if (!state.artIn || state.group === 'cancelled' || state.group === 'for_sale') return [];
  const s = state.stages.find((x) => x.stage.id === stageId);
  if (!s || !s.applies) return [];
  if (s.kind === 'current' || s.kind === 'stale') return ['approved', 'changes_requested', 'rejected', 'on_hold'];
  if (s.kind === 'approved') return ['changes_requested', 'rejected', 'on_hold'];
  return [];
}
