import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { ROLES } from '@/lib/domain/labels';
import type { UserRow } from '@/lib/domain/types';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Chip, Field, inputCls, Panel } from '@/components/ui';
import { createUser, resetPassword, updateUser } from '@/app/actions/settings';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage() {
  const me = await requireAdminPage();
  const sql = await db();
  const users = await sql<UserRow[]>`select id, email, full_name, job_title, role, active, must_change_password, last_login_at, created_at from users order by active desc, lower(full_name)`;

  return (
    <div className="space-y-6">
      <Panel title="Add a person">
        <p className="mb-3 text-[14px] text-muted">They get a temporary password to sign in with, then choose their own. Nothing is emailed: pass the password on yourself.</p>
        <ActionForm action={createUser} resetOnSuccess className="grid items-end gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <Field label="Name" htmlFor="nu-name"><input id="nu-name" name="full_name" required className={inputCls} /></Field>
          <Field label="Email" htmlFor="nu-email"><input id="nu-email" name="email" type="email" required className={inputCls} /></Field>
          <Field label="Job title" htmlFor="nu-title"><input id="nu-title" name="job_title" placeholder="e.g. Marketing Manager" className={inputCls} /></Field>
          <Field label="Role" htmlFor="nu-role">
            <select id="nu-role" name="role" defaultValue="member" className={inputCls}>
              {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}: {r.help}</option>)}
            </select>
          </Field>
          <SubmitButton>Add person</SubmitButton>
        </ActionForm>
      </Panel>

      <Panel title={`Team (${users.length})`} padded={false}>
        <ul>
          {users.map((u) => (
            <li key={u.id} className="border-b border-line p-4 last:border-0">
              <details>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-[16px] font-semibold text-ink">{u.full_name}{u.id === me.id ? ' (you)' : ''}</span>
                  <Chip tone={u.role === 'admin' ? 'blue' : u.role === 'viewer' ? 'grey' : 'teal'}>{ROLES.find((r) => r.key === u.role)?.label}</Chip>
                  {!u.active && <Chip tone="red">Deactivated</Chip>}
                  {u.must_change_password && u.active && <Chip tone="amber">Hasn’t set a password yet</Chip>}
                  <span className="text-[14px] text-muted">{u.email}{u.job_title ? `, ${u.job_title}` : ''}</span>
                  <span className="ml-auto text-[13px] text-muted">{u.last_login_at ? `Last signed in ${fmtDateTime(u.last_login_at)}` : 'Never signed in'}</span>
                </summary>
                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
                  <ActionForm action={updateUser} className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <input type="hidden" name="user_id" value={u.id} />
                    <Field label="Name" htmlFor={`un-${u.id}`}><input id={`un-${u.id}`} name="full_name" required defaultValue={u.full_name} className={inputCls} /></Field>
                    <Field label="Email" htmlFor={`ue-${u.id}`}><input id={`ue-${u.id}`} name="email" type="email" required defaultValue={u.email} className={inputCls} /></Field>
                    <Field label="Job title" htmlFor={`ut-${u.id}`}><input id={`ut-${u.id}`} name="job_title" defaultValue={u.job_title ?? ''} className={inputCls} /></Field>
                    <Field label="Role" htmlFor={`ur-${u.id}`}>
                      <select id={`ur-${u.id}`} name="role" defaultValue={u.role} className={inputCls}>
                        {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                    </Field>
                    <label className="flex h-10 items-center gap-2 text-[14px]">
                      <input type="checkbox" name="active" defaultChecked={u.active} className="h-4 w-4 accent-[#13233b]" /> Can sign in
                    </label>
                    <div><SubmitButton variant="dark" small>Save</SubmitButton></div>
                  </ActionForm>
                  <ActionForm action={resetPassword} confirm={`Reset ${u.full_name}’s password? They’ll be signed out everywhere.`}>
                    <input type="hidden" name="user_id" value={u.id} />
                    <p className="mb-2 text-[13.5px] text-muted">Forgotten password? Create a new temporary one.</p>
                    <SubmitButton variant="secondary" small pendingText="Resetting…">Reset password</SubmitButton>
                  </ActionForm>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
