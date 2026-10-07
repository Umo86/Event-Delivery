import type { Metadata } from 'next';
import Link from 'next/link';
import { requireManager } from '@/lib/auth/session';
import { db } from '@/lib/db';
import type { DepartmentRow, UserRow } from '@/lib/domain/types';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Chip, Field, inputCls, Intro, Panel } from '@/components/ui';
import {
  addDepartment, moveDepartment, renameDepartment, setDepartmentArchived, setDepartmentExternal, setDepartmentMembers,
} from '@/app/actions/departments';

export const metadata: Metadata = { title: 'Departments' };

export default async function DepartmentsPage() {
  await requireManager();
  const sql = await db();
  const [departments, people, memberships] = await Promise.all([
    sql<DepartmentRow[]>`select id, name, position, archived, external from departments order by archived, position, lower(name)`,
    sql<UserRow[]>`select id, email, full_name, job_title, role, active, must_change_password, last_login_at, created_at from users where active order by lower(full_name)`,
    sql<{ user_id: string; department_id: string }[]>`select user_id, department_id from user_departments`,
  ]);
  const members = new Map<string, Set<string>>();
  for (const m of memberships) (members.get(m.department_id) ?? members.set(m.department_id, new Set()).get(m.department_id)!).add(m.user_id);
  const active = departments.filter((d) => !d.archived);
  const archived = departments.filter((d) => d.archived);

  return (
    <>
    <Intro>The teams in your organisation, shared by every show. People belong to departments, and each sign-off stage draws its approvers from one.</Intro>
    <div className="space-y-6">
      <Panel title="Add a department">
        <ActionForm action={addDepartment} resetOnSuccess className="flex flex-wrap items-end gap-3">
          <Field label="Department name" htmlFor="nd-name" className="min-w-[240px]">
            <input id="nd-name" name="name" required placeholder="e.g. Content" className={inputCls} />
          </Field>
          <SubmitButton variant="secondary">Add department</SubmitButton>
        </ActionForm>
      </Panel>

      {active.map((d, i) => {
        const mine = members.get(d.id) ?? new Set<string>();
        return (
          <Panel key={d.id}
            title={<span className="flex flex-wrap items-center gap-2">{d.name} <Chip tone="grey">{mine.size} {mine.size === 1 ? 'person' : 'people'}</Chip>{d.external && <Chip tone="orange">Outside the company</Chip>}</span>}
            actions={
              <div className="flex items-center gap-1">
                {i > 0 && <ActionForm action={moveDepartment}><input type="hidden" name="department_id" value={d.id} /><input type="hidden" name="dir" value="up" /><SubmitButton variant="ghost" small pendingText="…">Move up</SubmitButton></ActionForm>}
                {i < active.length - 1 && <ActionForm action={moveDepartment}><input type="hidden" name="department_id" value={d.id} /><input type="hidden" name="dir" value="down" /><SubmitButton variant="ghost" small pendingText="…">Move down</SubmitButton></ActionForm>}
                <ActionForm action={setDepartmentArchived} confirm={`Archive ${d.name}? It's hidden from new choices but stays on anything already using it.`}>
                  <input type="hidden" name="department_id" value={d.id} /><input type="hidden" name="archived" value="1" />
                  <SubmitButton variant="ghost" small pendingText="…">Archive</SubmitButton>
                </ActionForm>
              </div>
            }>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
              <div className="space-y-4">
                <ActionForm action={renameDepartment} className="flex items-end gap-2">
                  <input type="hidden" name="department_id" value={d.id} />
                  <Field label="Name" htmlFor={`dn-${d.id}`} className="flex-1"><input id={`dn-${d.id}`} name="name" required defaultValue={d.name} className={inputCls} /></Field>
                  <SubmitButton variant="dark" small>Rename</SubmitButton>
                </ActionForm>
                <ActionForm action={setDepartmentExternal}>
                  <input type="hidden" name="department_id" value={d.id} />
                  <input type="hidden" name="external" value={d.external ? '0' : '1'} />
                  <p className="mb-1.5 text-[13px] text-ink-2">
                    {d.external
                      ? 'People outside the company, like agencies. They can’t mark sponsorship items sold.'
                      : 'People in the company. Everyone here can mark sponsorship items sold.'}
                  </p>
                  <SubmitButton variant="secondary" small>{d.external ? 'Mark as inside the company' : 'Mark as outside the company'}</SubmitButton>
                </ActionForm>
              </div>

              <ActionForm action={setDepartmentMembers}>
                <input type="hidden" name="department_id" value={d.id} />
                <span className="mb-1.5 block text-[13.5px] font-semibold text-ink-2">People in {d.name}</span>
                {people.length === 0 ? <p className="text-[13px] text-muted">Nobody to add yet. Add people on the <Link href="/team" className="font-semibold text-ink underline">Team</Link> page.</p> : (
                  <ul className="mb-3 grid max-h-64 gap-x-6 gap-y-1 overflow-y-auto pr-1 sm:grid-cols-2">
                    {people.map((u) => (
                      <li key={u.id}>
                        <label className="flex items-center gap-2 text-[14.5px] text-ink">
                          <input type="checkbox" name="user_ids" value={u.id} defaultChecked={mine.has(u.id)} className="h-4 w-4 accent-[#13233b]" />
                          {u.full_name}{u.job_title ? <span className="text-[12.5px] text-muted"> · {u.job_title}</span> : ''}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <SubmitButton variant="secondary" small>Save members</SubmitButton>
              </ActionForm>
            </div>
          </Panel>
        );
      })}

      {archived.length > 0 && (
        <Panel title={`Archived (${archived.length})`} padded={false}>
          <ul>
            {archived.map((d) => (
              <li key={d.id} className="flex items-center justify-between border-b border-line px-4 py-2.5 last:border-0">
                <span className="text-[15px] text-ink-2">{d.name}</span>
                <ActionForm action={setDepartmentArchived}>
                  <input type="hidden" name="department_id" value={d.id} /><input type="hidden" name="archived" value="0" />
                  <SubmitButton variant="ghost" small pendingText="…">Restore</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
    </>
  );
}
