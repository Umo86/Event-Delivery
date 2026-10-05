import type { ItemState } from './engine';

export interface ShareLinkRow {
  stage_id: string;
  version: number;
  expires_at: Date;
  revoked_at: Date | null;
  used_at: Date | null;
}

/**
 * Whether a sponsor approval link can record a decision right now.
 * - closed: turned off or expired
 * - stale: newer artwork has been uploaded since the link was made
 * - done: the sponsor has already answered through this link (links are single-use)
 * - not_waiting: the line isn't at that stage, is cancelled, or someone has already decided it
 * - open: the sponsor can approve or ask for changes
 */
export type ShareLinkStatus = 'closed' | 'stale' | 'done' | 'not_waiting' | 'open';

export function shareLinkStatus(link: ShareLinkRow, state: ItemState, cancelled: boolean, now: Date = new Date()): ShareLinkStatus {
  if (link.revoked_at || new Date(link.expires_at) < now) return 'closed';
  if (state.version !== link.version) return 'stale';
  if (link.used_at) return 'done';
  if (cancelled || state.currentStage?.id !== link.stage_id) return 'not_waiting';
  // On hold, or an approval that needs repeating, still waits for the sponsor; any other decision has settled it.
  if (state.currentDecision && state.currentDecision.decision !== 'on_hold' && !state.staleApproval) return 'not_waiting';
  return 'open';
}
