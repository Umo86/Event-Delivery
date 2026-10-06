import { Check } from 'lucide-react';
import type { ItemDetail } from '@/lib/data/load';
import type { CurrentUser } from '@/lib/auth/session';
import { fmtDateTime } from '@/lib/dates';
import { categoryInfo, decisionLabel } from '@/lib/domain/labels';
import { allowedDecisions, canDecideStage, canEdit, isStageApprover } from '@/lib/domain/permissions';
import { cx } from '../ui';
import { DecisionForm } from './decision-form';
import { SharePanel } from './share-panel';

export function SignoffRoute({ detail, user, sponsorLinks = true }: { detail: ItemDetail; user: CurrentUser; sponsorLinks?: boolean }) {
  const { row, bundle } = detail;
  const { state, sponsor, item } = row;
  const names = bundle.ctx.userNames;
  const depts = bundle.ctx.departmentsById;
  let n = 0;

  return (
    <ol className="relative">
      {state.stages.map((s, idx) => {
        const applies = s.applies;
        if (applies) n += 1;
        const last = idx === state.stages.length - 1;
        const deptName = s.stage.department_id ? depts.get(s.stage.department_id)?.name ?? null : null;
        const approverNames = s.stage.approver_ids.map((id) => names.get(id) ?? 'Approver');
        const approverText = s.stage.uses_account_manager
          ? sponsor?.account_manager_id ? `${names.get(sponsor.account_manager_id) ?? 'Account manager'} (sponsor’s account manager)` : 'Sponsor’s account manager (not set)'
          : approverNames.length
            ? (deptName ? `${deptName}: ${approverNames.join(', ')}` : approverNames.join(', '))
            : (deptName ? `${deptName} (no approver set)` : 'No approver set');
        // Just the people, for the "only … can record" and on-behalf lines (no department prefix)
        const approverShort = s.stage.uses_account_manager
          ? (sponsor?.account_manager_id ? names.get(sponsor.account_manager_id) ?? 'the account manager' : 'the account manager')
          : approverNames.length ? approverNames.join(', ') : 'the approver';
        const allowed = allowedDecisions(state, s.stage.id);
        const mayDecide = allowed.length > 0 && canDecideStage(user, s.stage, sponsor);
        const onBehalf = mayDecide && user.role === 'super_admin' && !isStageApprover(user, s.stage, sponsor)
          ? `You’re recording this as a super admin on behalf of ${approverShort}.` : undefined;
        const d = s.decision;
        const marker = s.kind === 'approved'
          ? <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-600 text-white"><Check size={16} strokeWidth={3} aria-label="Approved" /></span>
          : s.kind === 'current' || s.kind === 'stale'
            ? <span className="plate flex h-7 w-7 items-center justify-center rounded-full bg-signal text-[14px] text-ink ring-2 ring-ink">{n}</span>
            : s.kind === 'na'
              ? <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-line-strong text-[12px] text-muted">–</span>
              : <span className="plate flex h-7 w-7 items-center justify-center rounded-full bg-white text-[14px] text-muted ring-1 ring-line-strong">{n}</span>;

        let statusText: React.ReactNode = null;
        if (s.kind === 'na') statusText = <>Not used for {categoryInfo(item.category).label.toLowerCase()}.</>;
        else if (s.kind === 'locked') statusText = state.artIn ? 'Opens when the stages before it approve.' : 'Opens once artwork is in.';
        else if (s.kind === 'approved' && d) statusText = <>Approved by <b>{d.decided_by_name}</b>, {fmtDateTime(d.decided_at)}</>;
        else if (s.kind === 'stale' && d) statusText = <>Approved by {d.decided_by_name} before an earlier stage changed. <b>Needs approving again.</b></>;
        else if (d) statusText = <><b>{decisionLabel(d.decision)}</b> by {d.decided_by_name}, {fmtDateTime(d.decided_at)}</>;
        else statusText = <>Waiting for a decision{state.daysWaiting ? ` (${state.daysWaiting} day${state.daysWaiting === 1 ? '' : 's'})` : ''}.</>;

        return (
          <li key={s.stage.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span aria-hidden className={cx('absolute left-[13px] top-8 bottom-1 w-[2px]', s.kind === 'approved' ? 'bg-green-600' : 'bg-line')} />}
            <div className="relative z-10 shrink-0">{marker}</div>
            <div className={cx('min-w-0 flex-1 pt-0.5', s.kind === 'na' && 'opacity-60')}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="text-[16px] font-semibold text-ink">{s.stage.name}</h3>
                <span className="text-[13px] text-muted">{approverText}</span>
              </div>
              <p className="mt-0.5 text-[14px] text-ink-2">{statusText}</p>
              {d?.comment && s.kind !== 'na' && s.kind !== 'locked' && (
                <blockquote className="mt-1.5 border-l-[3px] border-line-strong pl-2.5 text-[14px] text-ink">{d.comment}</blockquote>
              )}
              {d?.via === 'sponsor_link' && s.kind !== 'locked' && (
                <p className="mt-1 text-[12.5px] text-muted">Recorded by the sponsor through their approval link.</p>
              )}
              {mayDecide && (
                // Keyed by state so the form starts fresh (open, or folded away once approved) whenever the stage moves on.
                <DecisionForm key={`${s.kind}-${state.version}`} itemId={item.id} stageId={s.stage.id} allowed={allowed}
                  reopen={s.kind === 'approved'} onBehalf={onBehalf} />
              )}
              {!mayDecide && (s.kind === 'current' || s.kind === 'stale') && canEdit(user) && (
                <p className="mt-1.5 text-[12.5px] text-muted">Only {approverShort} or a super admin can record this stage.</p>
              )}
              {sponsorLinks && (s.kind === 'current' || s.kind === 'stale') && s.stage.uses_account_manager && !item.cancelled && canDecideStage(user, s.stage, sponsor) && (
                <SharePanel detail={detail} stageId={s.stage.id} />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
