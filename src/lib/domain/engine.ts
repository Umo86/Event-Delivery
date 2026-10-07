// The sign-off engine: works out where every line is, who it is waiting on, its next deadline and flag.
// Pure functions only, so it can be unit-tested without a database.
import { addDays, daysBetween, londonDate } from '../dates';
import type {
  Category, DecisionRow, DepartmentRow, EventRow, Flag, Group, ItemRow, SponsorRow, StageRow, VersionRow,
} from './types';

export interface EngineContext {
  event: EventRow;
  stages: StageRow[]; // non-archived stages of the event (any order)
  sponsorsById: Map<string, SponsorRow>;
  userNames: Map<string, string>; // user id -> full name
  departmentsById: Map<string, DepartmentRow>;
  today: string; // YYYY-MM-DD (UK)
}

export type StageStateKind = 'na' | 'locked' | 'current' | 'approved' | 'stale';

export interface StageState {
  stage: StageRow;
  applies: boolean;
  kind: StageStateKind;
  decision: DecisionRow | null; // latest decision for the current artwork version
}

export interface ItemState {
  group: Group;
  phase: number; // 1 awaiting, 2 in sign-off, 3 needs attention, 4 approved..delivered, 5 installed, 9 cancelled
  statusLabel: string;
  version: number | null; // current artwork version (0 = no artwork needed), null = no artwork yet
  artIn: boolean;
  fullyApproved: boolean;
  currentStage: StageRow | null;
  currentStageNumber: number | null; // 1-based among stages that apply to this line
  currentDecision: DecisionRow | null;
  staleApproval: boolean;
  waitingOnUserId: string | null; // the single person responsible, or null (0 or several people)
  waitingOnUserIds: string[]; // everyone who can act now (e.g. a step's named approvers); empty when nobody is assigned
  waitingOnLabel: string; // '' when nobody needs to act
  due: string | null;
  flag: Flag | null;
  daysWaiting: number | null;
  since: Date | null;
  action: string;
  rank: 1 | 2 | 3;
  stages: StageState[];
}

export function stageApplies(stage: StageRow, category: Category): boolean {
  if (category === 'organiser_signage') return stage.applies_os;
  if (category === 'sponsor_signage') return stage.applies_ss;
  return stage.applies_si;
}

export function defaultArtworkDue(event: EventRow, category: Category): string | null {
  return category === 'organiser_signage' ? event.art_due_os : category === 'sponsor_signage' ? event.art_due_ss : event.art_due_si;
}
export function defaultPrintDeadline(event: EventRow, category: Category): string | null {
  return category === 'organiser_signage' ? event.print_due_os : category === 'sponsor_signage' ? event.print_due_ss : event.print_due_si;
}

/** A sponsorship item is for sale until it's sold to a sponsor (one sponsor per item). */
export function isForSale(item: Pick<ItemRow, 'category' | 'sponsor_id' | 'cancelled'>): boolean {
  return item.category === 'sponsor_item' && !item.sponsor_id && !item.cancelled;
}

/** Lines in the sign-off and production workflow: not cancelled, and not a sponsorship item still for sale. */
export function inWorkflow(group: Group): boolean {
  return group !== 'cancelled' && group !== 'for_sale';
}

const NOT_SET = 'Account manager not set';
const NOT_ASSIGNED = 'Not assigned';

export function computeItemState(
  item: ItemRow,
  latestVersion: VersionRow | null,
  decisions: DecisionRow[],
  ctx: EngineContext,
): ItemState {
  const { event, today } = ctx;
  const ordered = [...ctx.stages].filter((s) => !s.archived).sort((a, b) => a.position - b.position);
  const sponsor = item.sponsor_id ? ctx.sponsorsById.get(item.sponsor_id) ?? null : null;
  // A sponsorship item nobody has bought yet: no artwork, sign-off or deadlines until it's sold.
  const forSale = isForSale(item);
  const sponsorship = item.category === 'sponsor_item';
  const name = (id: string | null | undefined) => (id ? ctx.userNames.get(id) ?? null : null);

  // Current artwork version: 0 when artwork isn't required and none has been uploaded.
  const version: number | null = latestVersion
    ? latestVersion.version
    : item.artwork_by === 'not_required'
      ? 0
      : null;
  const artIn = version !== null;
  const artInAt = latestVersion ? new Date(latestVersion.uploaded_at) : new Date(item.created_at);

  // Latest decision per stage for the current version.
  const latest = new Map<string, DecisionRow>();
  if (artIn) {
    for (const d of decisions) {
      if (d.version !== version) continue;
      const cur = latest.get(d.stage_id);
      if (!cur || new Date(d.decided_at).getTime() >= new Date(cur.decided_at).getTime()) latest.set(d.stage_id, d);
    }
  }

  // Walk the chain: each approval counts only if it was given after the artwork arrived
  // and after the previous stage's approval.
  let threshold = artInAt.getTime();
  let current: StageRow | null = null;
  let currentNumber: number | null = null;
  let applicableCount = 0;
  const stages: StageState[] = [];
  for (const s of ordered) {
    const applies = stageApplies(s, item.category);
    if (!applies) {
      stages.push({ stage: s, applies, kind: 'na', decision: null });
      continue;
    }
    applicableCount += 1;
    const d = latest.get(s.id) ?? null;
    if (!artIn || forSale) {
      stages.push({ stage: s, applies, kind: 'locked', decision: d });
      continue;
    }
    if (current) {
      stages.push({ stage: s, applies, kind: 'locked', decision: d });
      continue;
    }
    if (d && d.decision === 'approved' && new Date(d.decided_at).getTime() >= threshold) {
      threshold = new Date(d.decided_at).getTime();
      stages.push({ stage: s, applies, kind: 'approved', decision: d });
    } else {
      current = s;
      currentNumber = applicableCount;
      stages.push({ stage: s, applies, kind: d && d.decision === 'approved' ? 'stale' : 'current', decision: d });
    }
  }
  const fullyApproved = artIn && !current && !forSale;
  const currentDecision = current ? latest.get(current.id) ?? null : null;
  const staleApproval = !!currentDecision && currentDecision.decision === 'approved';

  // Group
  let group: Group;
  if (item.cancelled) group = 'cancelled';
  else if (forSale) group = 'for_sale';
  else if (!artIn) group = 'awaiting_artwork';
  else if (!current) group = item.production_status ?? 'approved';
  else if (currentDecision?.decision === 'changes_requested') group = 'changes_requested';
  else if (currentDecision?.decision === 'rejected') group = 'rejected';
  else if (currentDecision?.decision === 'on_hold') group = 'on_hold';
  else group = 'in_signoff';

  const phase =
    group === 'cancelled' ? 9
      : group === 'for_sale' ? 0
      : group === 'awaiting_artwork' ? 1
        : group === 'in_signoff' ? 2
          : group === 'changes_requested' || group === 'rejected' || group === 'on_hold' ? 3
            : group === 'installed' ? 5
              : 4;

  // Who needs to act. waiting = [single responsible id | null, label]; waitingIds = everyone who can act now.
  const am = sponsor?.account_manager_id ?? null;
  const amOrNotSet = (): [string | null, string] => (am ? [am, name(am) ?? NOT_SET] : [null, NOT_SET]);
  const ownerOr = (id: string | null): [string | null, string] => (id ? [id, name(id) ?? NOT_ASSIGNED] : [null, NOT_ASSIGNED]);
  let waiting: [string | null, string] = [null, ''];
  let waitingIds: string[] = [];
  if (group === 'awaiting_artwork' || group === 'changes_requested' || group === 'rejected') {
    if (item.artwork_by === 'sponsor') waiting = amOrNotSet();
    else if (item.artwork_by === 'supplier') waiting = ownerOr(event.production_owner_id);
    else waiting = ownerOr(event.studio_owner_id);
    waitingIds = waiting[0] ? [waiting[0]] : [];
  } else if (group === 'in_signoff' || group === 'on_hold') {
    if (current!.uses_account_manager) {
      waiting = amOrNotSet();
      waitingIds = am ? [am] : [];
    } else {
      const ids = current!.approver_ids;
      waitingIds = ids;
      if (ids.length === 0) waiting = [null, 'No approver set'];
      else if (ids.length === 1) waiting = [ids[0], name(ids[0]) ?? NOT_ASSIGNED];
      else {
        const dept = current!.department_id ? ctx.departmentsById.get(current!.department_id) : null;
        waiting = [null, `${dept?.name ?? current!.name} (${ids.length})`];
      }
    }
  } else if (group === 'approved' || group === 'sent_to_supplier' || group === 'in_production' || group === 'delivered') {
    waiting = ownerOr(event.production_owner_id);
    waitingIds = waiting[0] ? [waiting[0]] : [];
  }

  // Next deadline
  const fallbackOnsite = event.build_start ?? event.show_open;
  let due: string | null = null;
  if (group === 'awaiting_artwork') due = item.artwork_due ?? defaultArtworkDue(event, item.category);
  else if (['in_signoff', 'changes_requested', 'rejected', 'on_hold', 'approved'].includes(group))
    due = item.print_deadline ?? defaultPrintDeadline(event, item.category);
  else if (group === 'sent_to_supplier' || group === 'in_production') due = item.delivery_date ?? item.install_date ?? fallbackOnsite;
  else if (group === 'delivered') due = item.install_date ?? fallbackOnsite;

  // Time at current step
  let since: Date | null = null;
  if (group === 'in_signoff' || group === 'approved') since = new Date(threshold);
  else if (group === 'changes_requested' || group === 'rejected' || group === 'on_hold') since = currentDecision ? new Date(currentDecision.decided_at) : null;
  const daysWaiting = since ? Math.max(0, daysBetween(londonDate(since), today)) : null;

  // Flag (most serious wins)
  let flag: Flag | null = null;
  if (!item.cancelled && !forSale) {
    if (item.production_status && !fullyApproved) flag = 'not_signed_off';
    else if (group !== 'installed') {
      if (due && due < today) flag = 'overdue';
      else if (due && due <= addDays(today, event.warn_days)) flag = 'due_soon';
      else if ((group === 'in_signoff' || group === 'on_hold') && (daysWaiting ?? 0) > event.turnaround_days) flag = 'slow';
    }
  }
  const rank: 1 | 2 | 3 = flag === 'not_signed_off' || flag === 'overdue' ? 1 : flag === 'due_soon' || flag === 'slow' ? 2 : 3;

  // Labels
  const stageName = current?.name ?? '';
  const vTag = version && version > 1 ? ` · v${version}` : '';
  let statusLabel: string;
  switch (group) {
    case 'awaiting_artwork': statusLabel = 'Awaiting artwork'; break;
    case 'in_signoff':
      statusLabel = `With ${stageName}${vTag}${staleApproval ? ' · re-approve' : ''}`;
      break;
    case 'changes_requested': statusLabel = `Changes requested · ${stageName}`; break;
    case 'rejected': statusLabel = `Rejected · ${stageName}`; break;
    case 'on_hold': statusLabel = `On hold · ${stageName}`; break;
    case 'approved': statusLabel = 'Approved – ready to order'; break;
    case 'sent_to_supplier': statusLabel = 'Sent to supplier'; break;
    case 'in_production': statusLabel = 'In production'; break;
    case 'delivered': statusLabel = 'Delivered to venue'; break;
    case 'installed': statusLabel = sponsorship ? 'Handed out' : 'Installed'; break;
    case 'for_sale': statusLabel = 'For sale'; break;
    default: statusLabel = 'Cancelled';
  }

  let action = '';
  switch (group) {
    case 'awaiting_artwork':
      action = item.artwork_by === 'sponsor' ? `Chase artwork from ${sponsor?.name ?? 'the sponsor'}`
        : item.artwork_by === 'supplier' ? 'Chase artwork from the supplier' : 'Create the artwork';
      break;
    case 'in_signoff': action = staleApproval ? `Re-approve (${stageName})` : `Review and sign off (${stageName})`; break;
    case 'changes_requested': action = `Upload revised artwork (changes requested by ${stageName})`; break;
    case 'rejected': action = `Upload new artwork (rejected by ${stageName})`; break;
    case 'on_hold': action = `Resolve the hold (${stageName})`; break;
    case 'approved': action = 'Send to supplier / place order'; break;
    case 'sent_to_supplier':
    case 'in_production': action = 'Chase delivery'; break;
    case 'delivered': action = sponsorship ? 'Hand out / put in place' : 'Install / put in place'; break;
  }

  return {
    group, phase, statusLabel, version, artIn, fullyApproved,
    currentStage: current, currentStageNumber: currentNumber, currentDecision, staleApproval,
    waitingOnUserId: waiting[0], waitingOnUserIds: waitingIds, waitingOnLabel: waiting[1],
    due, flag, daysWaiting, since, action, rank, stages,
  };
}

/** Sort key for "most urgent first": flag rank, then longest waiting, then earliest deadline. */
export function urgencyCompare(a: ItemState, b: ItemState): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const dw = (b.daysWaiting ?? -1) - (a.daysWaiting ?? -1);
  if (dw !== 0) return dw;
  return (a.due ?? '9999').localeCompare(b.due ?? '9999');
}
