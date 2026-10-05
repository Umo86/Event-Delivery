import { describe, expect, it } from 'vitest';
import type { ItemState } from '@/lib/domain/engine';
import { shareLinkStatus, type ShareLinkRow } from '@/lib/domain/share-link';
import type { DecisionRow } from '@/lib/domain/types';

const now = new Date('2026-10-05T12:00:00Z');
const link = (over: Partial<ShareLinkRow> = {}): ShareLinkRow => ({
  stage_id: 'sponsor', version: 2, expires_at: new Date('2026-11-01T00:00:00Z'), revoked_at: null, used_at: null, ...over,
});
const decision = (d: DecisionRow['decision']) => ({ decision: d } as DecisionRow);
const state = (over: Partial<ItemState> = {}) => ({
  version: 2, currentStage: { id: 'sponsor' }, currentDecision: null, staleApproval: false, ...over,
}) as unknown as ItemState;

describe('sponsor approval links', () => {
  it('are open while the line waits at the link’s stage and version', () => {
    expect(shareLinkStatus(link(), state(), false, now)).toBe('open');
  });
  it('stay open when the stage is on hold or needs re-approving', () => {
    expect(shareLinkStatus(link(), state({ currentDecision: decision('on_hold') }), false, now)).toBe('open');
    expect(shareLinkStatus(link(), state({ currentDecision: decision('approved'), staleApproval: true }), false, now)).toBe('open');
  });
  it('close when turned off or expired', () => {
    expect(shareLinkStatus(link({ revoked_at: now }), state(), false, now)).toBe('closed');
    expect(shareLinkStatus(link({ expires_at: new Date('2026-10-01T00:00:00Z') }), state(), false, now)).toBe('closed');
  });
  it('go stale when newer artwork is uploaded', () => {
    expect(shareLinkStatus(link(), state({ version: 3 }), false, now)).toBe('stale');
  });
  it('can only be used once', () => {
    expect(shareLinkStatus(link({ used_at: now }), state(), false, now)).toBe('done');
  });
  it('stop when the line is cancelled, has moved on, or someone else has decided', () => {
    expect(shareLinkStatus(link(), state(), true, now)).toBe('not_waiting');
    expect(shareLinkStatus(link(), state({ currentStage: { id: 'final' } as ItemState['currentStage'] }), false, now)).toBe('not_waiting');
    expect(shareLinkStatus(link(), state({ currentDecision: decision('rejected') }), false, now)).toBe('not_waiting');
    expect(shareLinkStatus(link(), state({ currentDecision: decision('changes_requested') }), false, now)).toBe('not_waiting');
  });
});
