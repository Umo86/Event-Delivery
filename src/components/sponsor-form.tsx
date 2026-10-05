import type { SponsorRow, UserRow } from '@/lib/domain/types';
import { ActionForm, SubmitButton } from './forms';
import { Field, inputCls, textareaCls } from './ui';
import { createSponsor, updateSponsor } from '@/app/actions/sponsors';

export function SponsorForm({ eventId, users, sponsor, canChooseManager }: {
  eventId: string; users: UserRow[]; sponsor?: SponsorRow; canChooseManager: boolean;
}) {
  const p = sponsor ? `s-${sponsor.id}-` : 'new-';
  return (
    <ActionForm action={sponsor ? updateSponsor : createSponsor} resetOnSuccess={!sponsor} className="space-y-3">
      <input type="hidden" name="event_id" value={eventId} />
      {sponsor && <input type="hidden" name="sponsor_id" value={sponsor.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Sponsor name" htmlFor={`${p}name`}>
          <input id={`${p}name`} name="name" required maxLength={120} defaultValue={sponsor?.name ?? ''} className={inputCls} />
        </Field>
        <Field label="Package" htmlFor={`${p}package`}>
          <input id={`${p}package`} name="package" placeholder="e.g. Headline partner" defaultValue={sponsor?.package ?? ''} className={inputCls} />
        </Field>
        <Field label="Account manager" htmlFor={`${p}am`}
          help={canChooseManager ? 'Signs off on the sponsor’s behalf and chases their artwork.' : 'Signs off on the sponsor’s behalf. Only admins can choose who.'}>
          <select id={`${p}am`} name="account_manager_id" defaultValue={sponsor?.account_manager_id ?? ''} disabled={!canChooseManager} className={inputCls}>
            <option value="">Not set</option>
            {users.filter((u) => u.active && u.role !== 'viewer').map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </Field>
        <Field label="Sponsor contact" htmlFor={`${p}cname`}>
          <input id={`${p}cname`} name="contact_name" defaultValue={sponsor?.contact_name ?? ''} className={inputCls} />
        </Field>
        <Field label="Contact email" htmlFor={`${p}cemail`}>
          <input id={`${p}cemail`} name="contact_email" type="email" defaultValue={sponsor?.contact_email ?? ''} className={inputCls} />
        </Field>
        <Field label="Notes" htmlFor={`${p}notes`}>
          <textarea id={`${p}notes`} name="notes" rows={1} defaultValue={sponsor?.notes ?? ''} className={textareaCls} />
        </Field>
      </div>
      <SubmitButton variant={sponsor ? 'dark' : 'primary'} small>{sponsor ? 'Save sponsor' : 'Add sponsor'}</SubmitButton>
    </ActionForm>
  );
}
