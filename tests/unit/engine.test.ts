import { describe, expect, it } from 'vitest';
import { computeItemState, inWorkflow, isForSale, type EngineContext } from '@/lib/domain/engine';
import { allowedDecisions, canDecideStage, canSell } from '@/lib/domain/permissions';
import type { DecisionRow, EventRow, ItemRow, SponsorRow, StageRow, VersionRow } from '@/lib/domain/types';
import { addDays } from '@/lib/dates';

const TODAY = '2026-10-05';
// Noon UK time on a day relative to TODAY
const at = (days: number, hour = 12) => new Date(`${addDays(TODAY, days)}T${String(hour).padStart(2, '0')}:00:00+01:00`);

const USERS = { ops: 'u-ops', mkt: 'u-mkt', dir: 'u-dir', am1: 'u-am1', design: 'u-design', prod: 'u-prod' };
const names = new Map<string, string>([
  [USERS.ops, 'Ops Manager'], [USERS.mkt, 'Marketing Manager'], [USERS.dir, 'Event Director'],
  [USERS.am1, 'Account Manager 1'], [USERS.design, 'Designer'], [USERS.prod, 'Production Lead'],
]);

const event: EventRow = {
  id: 'ev', name: 'UKCW London 2027', venue: 'ExCeL London', build_start: '2027-05-08', show_open: '2027-05-11',
  show_close: '2027-05-13', breakdown_end: null, budget: 10000, warn_days: 7, turnaround_days: 3,
  studio_owner_id: USERS.design, production_owner_id: USERS.prod,
  art_due_os: '2026-11-01', print_due_os: '2026-12-01', art_due_ss: '2026-10-08', print_due_ss: '2026-12-01',
  art_due_si: '2026-10-01', print_due_si: '2026-10-09', archived: false, created_at: at(-60),
};

const st = (id: string, position: number, name: string, extra: Partial<StageRow> = {}): StageRow => {
  const base = { id, event_id: 'ev', position, name, approver_id: null, department_id: null, uses_account_manager: false,
    applies_os: true, applies_ss: true, applies_si: true, archived: false, ...extra } as StageRow;
  return { ...base, approver_ids: extra.approver_ids ?? (base.approver_id ? [base.approver_id] : []) };
};
const STAGES: StageRow[] = [
  st('s1', 1, 'Operations', { approver_id: USERS.ops }),
  st('s2', 2, 'Marketing', { approver_id: USERS.mkt }),
  st('s3', 3, 'Sponsor', { uses_account_manager: true, applies_os: false }),
  st('s4', 4, 'Final sign-off', { approver_id: USERS.dir }),
];
const sponsorA: SponsorRow = { id: 'sp-a', event_id: 'ev', name: 'Acme', package: null, account_manager_id: USERS.am1, contact_name: null, contact_email: null, notes: null };
const sponsorNoAm: SponsorRow = { ...sponsorA, id: 'sp-b', name: 'Beta', account_manager_id: null };

function ctx(over: Partial<EngineContext> = {}, ev: Partial<EventRow> = {}): EngineContext {
  return {
    event: { ...event, ...ev },
    stages: STAGES,
    sponsorsById: new Map([[sponsorA.id, sponsorA], [sponsorNoAm.id, sponsorNoAm]]),
    userNames: names,
    departmentsById: new Map(),
    today: TODAY,
    ...over,
  };
}

let seq = 0;
function item(over: Partial<ItemRow> = {}): ItemRow {
  seq += 1;
  return {
    id: `i${seq}`, event_id: 'ev', category: 'organiser_signage', ref_no: seq, description: 'Test line', sponsor_id: null,
    item_type: null, wording: null, hall: null, zone: null, location_detail: null, position: null, width_mm: null, height_mm: null,
    sides: null, qty: null, material: null, artwork_by: 'in_house', artwork_due: null, artwork_link: null, supplier_id: null,
    print_deadline: null, production_status: null, po_number: null, delivery_date: null, install_date: null, unit_cost: null,
    rate_card_price: null, sale_price: null, distribution_method: null, sold_at: null, sold_by: null,
    cancelled: false, notes: null, created_by: null, created_at: at(-30), updated_at: at(-30), ...over,
  };
}
const ver = (it: ItemRow, version: number, when: Date): VersionRow => ({
  id: `v-${it.id}-${version}`, item_id: it.id, event_id: 'ev', version, file_url: 'x', file_pathname: 'x', preview_url: null,
  preview_pathname: null, thumb_url: null, thumb_pathname: null, file_name: 'a.pdf', mime_type: 'application/pdf', size_bytes: 1,
  width_px: null, height_px: null, page_count: null, note: null, uploaded_by: null, uploaded_at: when,
});
let dseq = 0;
const dec = (it: ItemRow, stage: string, version: number, decision: DecisionRow['decision'], when: Date): DecisionRow => ({
  id: `d${++dseq}`, item_id: it.id, event_id: 'ev', stage_id: stage, version, decision, comment: null, decided_by: null,
  decided_by_name: 'x', via: 'app', decided_at: when,
});

describe('awaiting artwork', () => {
  it('routes to the in-house designer with the default artwork deadline', () => {
    const s = computeItemState(item(), null, [], ctx());
    expect(s.group).toBe('awaiting_artwork');
    expect(s.statusLabel).toBe('Awaiting artwork');
    expect(s.waitingOnLabel).toBe('Designer');
    expect(s.due).toBe('2026-11-01');
    expect(s.flag).toBeNull();
    expect(s.phase).toBe(1);
    expect(s.stages.every((x) => x.kind === 'locked' || x.kind === 'na')).toBe(true);
  });
  it('flags overdue and due soon from the line or default deadline', () => {
    expect(computeItemState(item({ artwork_due: addDays(TODAY, -1) }), null, [], ctx()).flag).toBe('overdue');
    expect(computeItemState(item({ artwork_due: TODAY }), null, [], ctx()).flag).toBe('due_soon');
    expect(computeItemState(item({ artwork_due: addDays(TODAY, 7) }), null, [], ctx()).flag).toBe('due_soon');
    expect(computeItemState(item({ artwork_due: addDays(TODAY, 8) }), null, [], ctx()).flag).toBeNull();
    // Sponsor items default artwork date is in the past
    expect(computeItemState(item({ category: 'sponsor_item', sponsor_id: sponsorA.id, artwork_by: 'sponsor' }), null, [], ctx()).flag).toBe('overdue');
  });
  it('routes sponsor artwork to the account manager, or says it is not set', () => {
    const a = computeItemState(item({ category: 'sponsor_signage', sponsor_id: sponsorA.id, artwork_by: 'sponsor' }), null, [], ctx());
    expect(a.waitingOnLabel).toBe('Account Manager 1');
    expect(a.waitingOnUserId).toBe(USERS.am1);
    expect(a.action).toBe('Chase artwork from Acme');
    const b = computeItemState(item({ category: 'sponsor_signage', sponsor_id: sponsorNoAm.id, artwork_by: 'sponsor' }), null, [], ctx());
    expect(b.waitingOnLabel).toBe('Account manager not set');
    expect(b.waitingOnUserId).toBeNull();
  });
  it('routes supplier artwork to the production owner', () => {
    const s = computeItemState(item({ artwork_by: 'supplier' }), null, [], ctx());
    expect(s.waitingOnLabel).toBe('Production Lead');
    expect(s.action).toBe('Chase artwork from the supplier');
  });
  it('says Not assigned when no owner is set', () => {
    const s = computeItemState(item(), null, [], ctx({}, { studio_owner_id: null }));
    expect(s.waitingOnLabel).toBe('Not assigned');
  });
});

describe('sign-off chain', () => {
  it('starts with the first stage once artwork arrives', () => {
    const it1 = item();
    const s = computeItemState(it1, ver(it1, 1, at(-2)), [], ctx());
    expect(s.group).toBe('in_signoff');
    expect(s.statusLabel).toBe('With Operations');
    expect(s.waitingOnLabel).toBe('Ops Manager');
    expect(s.currentStageNumber).toBe(1);
    expect(s.daysWaiting).toBe(2);
    expect(s.due).toBe('2026-12-01');
    expect(s.flag).toBeNull();
  });
  it('flags slow sign-off only when waiting longer than the target', () => {
    const a = item();
    expect(computeItemState(a, ver(a, 1, at(-3)), [], ctx()).flag).toBeNull();
    const b = item();
    expect(computeItemState(b, ver(b, 1, at(-4)), [], ctx()).flag).toBe('slow');
  });
  it('moves to the next stage after approval and measures time from that approval', () => {
    const it1 = item();
    const s = computeItemState(it1, ver(it1, 1, at(-6)), [dec(it1, 's1', 1, 'approved', at(-1))], ctx());
    expect(s.statusLabel).toBe('With Marketing');
    expect(s.waitingOnLabel).toBe('Marketing Manager');
    expect(s.daysWaiting).toBe(1);
    expect(s.stages.map((x) => x.kind)).toEqual(['approved', 'current', 'na', 'locked']);
  });
  it('skips the sponsor stage on organiser signage', () => {
    const it1 = item();
    const s = computeItemState(it1, ver(it1, 1, at(-6)), [
      dec(it1, 's1', 1, 'approved', at(-5)), dec(it1, 's2', 1, 'approved', at(-4)),
    ], ctx());
    expect(s.statusLabel).toBe('With Final sign-off');
    expect(s.currentStageNumber).toBe(3);
  });
  it('sends the sponsor stage to the account manager', () => {
    const it1 = item({ category: 'sponsor_signage', sponsor_id: sponsorA.id, artwork_by: 'sponsor' });
    const s = computeItemState(it1, ver(it1, 1, at(-6)), [
      dec(it1, 's1', 1, 'approved', at(-5)), dec(it1, 's2', 1, 'approved', at(-4)),
    ], ctx());
    expect(s.statusLabel).toBe('With Sponsor');
    expect(s.waitingOnUserId).toBe(USERS.am1);
  });
  it('is approved and ready to order when every stage has approved', () => {
    const it1 = item({ unit_cost: 10, qty: 2 });
    const s = computeItemState(it1, ver(it1, 1, at(-9)), [
      dec(it1, 's1', 1, 'approved', at(-8)), dec(it1, 's2', 1, 'approved', at(-7)), dec(it1, 's4', 1, 'approved', at(-6)),
    ], ctx());
    expect(s.group).toBe('approved');
    expect(s.fullyApproved).toBe(true);
    expect(s.statusLabel).toBe('Approved – ready to order');
    expect(s.waitingOnLabel).toBe('Production Lead');
    expect(s.daysWaiting).toBe(6);
    expect(s.action).toBe('Send to supplier / place order');
    expect(s.phase).toBe(4);
  });
});

describe('changes, rejections, holds and new versions', () => {
  it('changes requested goes back to the artwork owner', () => {
    const it1 = item();
    const s = computeItemState(it1, ver(it1, 1, at(-6)), [
      dec(it1, 's1', 1, 'approved', at(-5)), dec(it1, 's2', 1, 'changes_requested', at(-2)),
    ], ctx());
    expect(s.group).toBe('changes_requested');
    expect(s.statusLabel).toBe('Changes requested · Marketing');
    expect(s.waitingOnLabel).toBe('Designer');
    expect(s.daysWaiting).toBe(2);
    expect(s.phase).toBe(3);
  });
  it('a new version restarts sign-off from the first stage', () => {
    const it1 = item();
    const s = computeItemState(it1, ver(it1, 2, at(-1)), [
      dec(it1, 's1', 1, 'approved', at(-5)), dec(it1, 's2', 1, 'changes_requested', at(-2)),
    ], ctx());
    expect(s.group).toBe('in_signoff');
    expect(s.statusLabel).toBe('With Operations · v2');
    expect(s.version).toBe(2);
    expect(s.stages.find((x) => x.stage.id === 's2')!.decision).toBeNull();
  });
  it('rejected stays with the artwork owner; on hold stays with the approver', () => {
    const a = item({ category: 'sponsor_item', sponsor_id: sponsorA.id, artwork_by: 'sponsor' });
    const r = computeItemState(a, ver(a, 1, at(-8)), [
      dec(a, 's1', 1, 'approved', at(-7)), dec(a, 's2', 1, 'approved', at(-6)), dec(a, 's3', 1, 'rejected', at(-1)),
    ], ctx());
    expect(r.statusLabel).toBe('Rejected · Sponsor');
    expect(r.waitingOnLabel).toBe('Account Manager 1');
    const b = item();
    const h = computeItemState(b, ver(b, 1, at(-9)), [dec(b, 's1', 1, 'approved', at(-8)), dec(b, 's2', 1, 'on_hold', at(-6))], ctx());
    expect(h.group).toBe('on_hold');
    expect(h.waitingOnLabel).toBe('Marketing Manager');
    expect(h.flag).toBe('slow');
  });
  it('an approver can change their mind on the same version', () => {
    const it1 = item();
    const s = computeItemState(it1, ver(it1, 1, at(-6)), [
      dec(it1, 's1', 1, 'on_hold', at(-5)), dec(it1, 's1', 1, 'approved', at(-4)),
    ], ctx());
    expect(s.statusLabel).toBe('With Marketing');
  });
  it('reopening an earlier stage makes later approvals stale', () => {
    const it1 = item();
    const s = computeItemState(it1, ver(it1, 1, at(-10)), [
      dec(it1, 's1', 1, 'approved', at(-9)), dec(it1, 's2', 1, 'approved', at(-8)),
      dec(it1, 's1', 1, 'changes_requested', at(-5)), dec(it1, 's1', 1, 'approved', at(-3)),
    ], ctx());
    expect(s.currentStage?.id).toBe('s2');
    expect(s.staleApproval).toBe(true);
    expect(s.statusLabel).toBe('With Marketing · re-approve');
    expect(s.action).toBe('Re-approve (Marketing)');
    expect(s.daysWaiting).toBe(3);
  });
  it('an approval given before the artwork arrived does not count', () => {
    const it1 = item();
    const s = computeItemState(it1, ver(it1, 1, at(-1)), [dec(it1, 's1', 1, 'approved', at(-3))], ctx());
    expect(s.statusLabel).toBe('With Operations · re-approve');
  });
  it('an out-of-order approval does not skip a stage', () => {
    const it1 = item();
    const s = computeItemState(it1, ver(it1, 1, at(-6)), [
      dec(it1, 's1', 1, 'approved', at(-5)), dec(it1, 's4', 1, 'approved', at(-4)), dec(it1, 's2', 1, 'approved', at(-2)),
    ], ctx());
    expect(s.currentStage?.id).toBe('s4');
    expect(s.staleApproval).toBe(true);
  });
});

describe('production and other states', () => {
  const approvedItem = (over: Partial<ItemRow>) => {
    const it1 = item(over);
    return { it1, v: ver(it1, 1, at(-20)), d: [
      dec(it1, 's1', 1, 'approved', at(-19)), dec(it1, 's2', 1, 'approved', at(-18)), dec(it1, 's4', 1, 'approved', at(-17)),
    ] };
  };
  it('uses delivery, install, build-up and show dates as the next deadline', () => {
    const a = approvedItem({ production_status: 'sent_to_supplier', delivery_date: '2027-05-01' });
    expect(computeItemState(a.it1, a.v, a.d, ctx()).due).toBe('2027-05-01');
    const b = approvedItem({ production_status: 'in_production', install_date: '2027-05-09' });
    expect(computeItemState(b.it1, b.v, b.d, ctx()).due).toBe('2027-05-09');
    const c = approvedItem({ production_status: 'in_production' });
    expect(computeItemState(c.it1, c.v, c.d, ctx()).due).toBe('2027-05-08');
    expect(computeItemState(c.it1, c.v, c.d, ctx({}, { build_start: null })).due).toBe('2027-05-11');
    const dlv = approvedItem({ production_status: 'delivered', install_date: addDays(TODAY, -1) });
    const s = computeItemState(dlv.it1, dlv.v, dlv.d, ctx());
    expect(s.statusLabel).toBe('Delivered to venue');
    expect(s.flag).toBe('overdue');
    expect(s.action).toBe('Install / put in place');
  });
  it('installed lines need nobody and never flag', () => {
    const a = approvedItem({ production_status: 'installed', install_date: addDays(TODAY, -10) });
    const s = computeItemState(a.it1, a.v, a.d, ctx());
    expect(s.group).toBe('installed');
    expect(s.waitingOnLabel).toBe('');
    expect(s.flag).toBeNull();
    expect(s.phase).toBe(5);
  });
  it('flags production that started before full sign-off', () => {
    const it1 = item({ production_status: 'sent_to_supplier' });
    const s = computeItemState(it1, ver(it1, 1, at(-2)), [], ctx());
    expect(s.flag).toBe('not_signed_off');
    expect(s.rank).toBe(1);
    expect(s.group).toBe('in_signoff');
  });
  it('cancelled lines drop out', () => {
    const it1 = item({ cancelled: true, production_status: 'sent_to_supplier', artwork_due: addDays(TODAY, -5) });
    const s = computeItemState(it1, null, [], ctx());
    expect(s.group).toBe('cancelled');
    expect(s.flag).toBeNull();
    expect(s.phase).toBe(9);
    expect(s.waitingOnLabel).toBe('');
  });
  it('artwork not required signs off from creation on version 0', () => {
    const it1 = item({ artwork_by: 'not_required', created_at: at(-2) });
    const s = computeItemState(it1, null, [], ctx());
    expect(s.version).toBe(0);
    expect(s.statusLabel).toBe('With Operations');
    expect(s.daysWaiting).toBe(2);
    const s2 = computeItemState(it1, null, [dec(it1, 's1', 0, 'approved', at(-1))], ctx());
    expect(s2.statusLabel).toBe('With Marketing');
  });
  it('ignores archived stages and respects applicability', () => {
    const stages = [...STAGES.slice(0, 3), { ...STAGES[3], archived: true }];
    const it1 = item();
    const s = computeItemState(it1, ver(it1, 1, at(-6)), [
      dec(it1, 's1', 1, 'approved', at(-5)), dec(it1, 's2', 1, 'approved', at(-4)),
    ], ctx({ stages }));
    expect(s.group).toBe('approved');
  });
});

describe('sponsorship items', () => {
  it('are for sale until sold: nobody is waiting, nothing is due and nothing flags', () => {
    const it1 = item({ category: 'sponsor_item', artwork_by: 'sponsor', artwork_due: addDays(TODAY, -3) });
    const s = computeItemState(it1, null, [], ctx());
    expect(s.group).toBe('for_sale');
    expect(s.phase).toBe(0);
    expect(s.statusLabel).toBe('For sale');
    expect(s.waitingOnLabel).toBe('');
    expect(s.waitingOnUserIds).toEqual([]);
    expect(s.due).toBeNull();
    expect(s.flag).toBeNull();
    expect(s.action).toBe('');
    expect(s.stages.filter((x) => x.applies).every((x) => x.kind === 'locked')).toBe(true);
    expect(allowedDecisions(s, 's1')).toEqual([]);
    expect(inWorkflow(s.group)).toBe(false);
  });
  it('once sold, the sponsor’s artwork is chased through their account manager', () => {
    const s = computeItemState(item({ category: 'sponsor_item', artwork_by: 'sponsor', sponsor_id: sponsorA.id }), null, [], ctx());
    expect(s.group).toBe('awaiting_artwork');
    expect(s.waitingOnUserIds).toEqual([USERS.am1]);
    expect(s.due).toBe(event.art_due_si);
    expect(inWorkflow(s.group)).toBe(true);
  });
  it('are handed out rather than installed', () => {
    const base = { category: 'sponsor_item' as const, sponsor_id: sponsorA.id, artwork_by: 'not_required' as const };
    expect(computeItemState(item({ ...base, production_status: 'installed' }), null, [], ctx({ stages: [] })).statusLabel).toBe('Handed out');
    expect(computeItemState(item({ ...base, production_status: 'delivered' }), null, [], ctx({ stages: [] })).action).toBe('Hand out / put in place');
  });
  it('cancelled unsold items are cancelled, not for sale', () => {
    const s = computeItemState(item({ category: 'sponsor_item', cancelled: true }), null, [], ctx());
    expect(s.group).toBe('cancelled');
    expect(isForSale({ category: 'sponsor_item', sponsor_id: null, cancelled: true })).toBe(false);
    expect(isForSale({ category: 'sponsor_signage', sponsor_id: null, cancelled: false })).toBe(false);
  });
  it('everyone except external people can mark them sold', () => {
    expect(canSell({ id: 'u', role: 'user', full_name: 'Sales person', is_external: false })).toBe(true);
    expect(canSell({ id: 'x', role: 'user', full_name: 'Agency', is_external: true })).toBe(false);
    expect(canSell({ id: 'm', role: 'manager', full_name: 'Manager in External', is_external: true })).toBe(true);
    expect(canSell(null)).toBe(false);
  });
});

describe('permissions', () => {
  const ops = { id: USERS.ops, role: 'manager' as const, full_name: 'Ops' };
  const am = { id: USERS.am1, role: 'manager' as const, full_name: 'AM' };
  const viewer = { id: 'v', role: 'user' as const, full_name: 'V' };
  const admin = { id: 'a', role: 'super_admin' as const, full_name: 'A' };
  it('only the named approver, the account manager for sponsor stages, or an admin can decide', () => {
    expect(canDecideStage(ops, STAGES[0], null)).toBe(true);
    expect(canDecideStage(ops, STAGES[1], null)).toBe(false);
    expect(canDecideStage(am, STAGES[2], sponsorA)).toBe(true);
    expect(canDecideStage(am, STAGES[2], sponsorNoAm)).toBe(false);
    expect(canDecideStage(viewer, STAGES[0], null)).toBe(false);
    expect(canDecideStage(admin, STAGES[3], null)).toBe(true);
  });
  it('allows decisions on the current stage and reopening approved ones only', () => {
    const it1 = item();
    const s = computeItemState(it1, ver(it1, 1, at(-6)), [dec(it1, 's1', 1, 'approved', at(-5))], ctx());
    expect(allowedDecisions(s, 's2')).toEqual(['approved', 'changes_requested', 'rejected', 'on_hold']);
    expect(allowedDecisions(s, 's1')).toEqual(['changes_requested', 'rejected', 'on_hold']);
    expect(allowedDecisions(s, 's4')).toEqual([]);
    expect(allowedDecisions(s, 's3')).toEqual([]);
    const awaiting = computeItemState(item(), null, [], ctx());
    expect(allowedDecisions(awaiting, 's1')).toEqual([]);
  });
});
