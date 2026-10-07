'use client';

import { useEffect, useRef, useState } from 'react';
import { TEMP_PASSWORD_DAYS } from '@/lib/domain/access';
import type { Role } from '@/lib/domain/types';
import { SubmitButton } from '@/components/forms';
import { cx, Field, inputCls } from '@/components/ui';
import { DetailsForm } from '@/components/admin/details-form';
import { invitePerson } from '@/app/actions/admin';

export interface InviteChoices {
  /** The access levels this person can give (managers can't add Super Admins). */
  levels: { key: Role; label: string; summary: string }[];
  departments: { id: string; name: string; external: boolean }[];
  /** The show someone can be made an approver in, with its stages that have named approvers. */
  event: { id: string; name: string } | null;
  stages: { id: string; name: string; approvers: string[] }[];
}

const check = 'h-4 w-4 shrink-0 accent-[#13233b]';
const legend = 'mb-1.5 text-[13.5px] font-semibold text-ink-2';

/**
 * Adds someone to the platform: their details, access level, departments and the stages they approve.
 * On success the invite email to send them appears underneath (with the temporary password).
 */
export function InviteForm({ levels, departments, event, stages }: InviteChoices) {
  const start: Role = levels.some((l) => l.key === 'manager') ? 'manager' : levels[0].key;
  const [role, setRole] = useState<Role>(start);
  const box = useRef<HTMLDivElement>(null);
  // The form clears itself after each invite, so the access level goes back to the default too
  useEffect(() => {
    const form = box.current?.closest('form');
    if (!form) return;
    const reset = () => setRole(start);
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [start]);
  const canApprove = role !== 'user';

  return (
    <DetailsForm action={invitePerson} resetOnSuccess>
      <div ref={box} className="space-y-5"
        onChange={(e) => {
          const t = e.target as HTMLInputElement;
          if (t.name === 'role') setRole(t.value as Role);
        }}>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Name" htmlFor="inv-name"><input id="inv-name" name="full_name" required autoComplete="off" className={inputCls} /></Field>
          <Field label="Email" htmlFor="inv-email"><input id="inv-email" name="email" type="email" required autoComplete="off" className={inputCls} /></Field>
          <Field label="Job title (optional)" htmlFor="inv-title"><input id="inv-title" name="job_title" placeholder="e.g. Marketing Manager" className={inputCls} /></Field>
        </div>

        <fieldset>
          <legend className={legend}>Access level</legend>
          <div className={cx('grid gap-2', levels.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
            {levels.map((a) => (
              <label key={a.key}
                className="flex cursor-pointer gap-2.5 rounded-md border border-line-strong bg-white p-3 hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-signal-soft has-[:checked]:ring-1 has-[:checked]:ring-ink">
                <input type="radio" name="role" value={a.key} defaultChecked={a.key === start} className="mt-1 h-4 w-4 shrink-0 accent-[#13233b]" />
                <span>
                  <span className="block text-[15px] font-semibold text-ink">{a.label}</span>
                  <span className="block text-[13px] leading-snug text-ink-2">{a.summary}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {departments.length > 0 && (
          <fieldset>
            <legend className={legend}>Departments</legend>
            <ul className="grid gap-x-5 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {departments.map((d) => (
                <li key={d.id}>
                  <label className="flex items-start gap-2 text-[14.5px] text-ink">
                    <input type="checkbox" name="department_ids" value={d.id} className={`${check} mt-[3px]`} />
                    <span>
                      {d.name}
                      {d.external && <span className="block text-[12.5px] text-muted">Outside the company</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        {event && stages.length > 0 && (
          <>
            <input type="hidden" name="event_id" value={event.id} />
            {/* A disabled fieldset sends nothing, so a User can't be made an approver by a box ticked earlier */}
            <fieldset disabled={!canApprove} aria-describedby="inv-approver-help">
              <legend className={legend}>Approver in {event.name}</legend>
              <p id="inv-approver-help" className={cx('mb-2 text-[13px]', canApprove ? 'text-muted' : 'font-semibold text-ink-2')}>
                {canApprove
                  ? 'Tick the sign-off stages they approve. Leave them clear if they don’t approve anything.'
                  : 'Users can’t sign off. Choose Manager to make them an approver.'}
              </p>
              <ul className={cx('grid gap-x-5 gap-y-1 sm:grid-cols-2', !canApprove && 'opacity-50')}>
                {stages.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-baseline gap-x-2">
                    <label className="flex items-center gap-2 text-[14.5px] text-ink">
                      <input type="checkbox" name="stage_ids" value={s.id} className={check} />
                      {s.name}
                    </label>
                    <span className="text-[12.5px] text-muted">
                      {s.approvers.length ? `alongside ${[...s.approvers].sort((a, b) => a.localeCompare(b)).join(', ')}` : 'No approver yet'}
                    </span>
                  </li>
                ))}
              </ul>
            </fieldset>
          </>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SubmitButton pendingText="Creating…">Create invite</SubmitButton>
          <p className="max-w-[60ch] text-[13.5px] text-muted">
            You’ll get an email to send them from your own email, with a temporary password that works for {TEMP_PASSWORD_DAYS} days.
            They choose their own password when they first sign in.
          </p>
        </div>
      </div>
    </DetailsForm>
  );
}
