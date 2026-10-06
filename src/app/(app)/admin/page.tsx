import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getCurrentEvent, loadBundle } from '@/lib/data/load';
import { fmtDateTime } from '@/lib/dates';
import { ABILITIES, ACCESS_LEVELS, personStatus, TEMP_PASSWORD_DAYS } from '@/lib/domain/access';
import { loadAttention } from '@/lib/data/attention';
import { SubmitButton } from '@/components/forms';
import { cx, Field, inputCls, Intro, Panel } from '@/components/ui';
import { DetailsForm } from '@/components/admin/details-form';
import { PersonRow, type AdminPerson } from '@/components/admin/person-row';
import type { DepartmentRow } from '@/lib/domain/types';
import { invitePerson } from '@/app/actions/admin';

export const metadata: Metadata = { title: 'People' };

export default async function AdminPage(props: { searchParams: Promise<{ person?: string }> }) {
  const me = await requireSuperAdmin();
  const sp = await props.searchParams;
  const sql = await db();
  const event = await getCurrentEvent();
  const [bundle, people, log, departments, memberships] = await Promise.all([
    event ? loadBundle(event.id) : Promise.resolve(null),
    sql<AdminPerson[]>`
      select u.id, u.email, u.full_name, u.job_title, u.role, u.active, u.must_change_password, u.last_login_at, u.created_at,
             u.invited_at, inv.full_name as invited_by_name, u.temp_password_expires_at, u.locked_until, u.is_demo, (u.role = 'super_admin') as is_super_admin
      from users u left join users inv on inv.id = u.invited_by
      order by lower(u.full_name)`,
    sql<{ id: string; actor_name: string; message: string; created_at: Date }[]>`
      select id, actor_name, message, created_at from activity where kind = 'access' order by created_at desc limit 40`,
    sql<DepartmentRow[]>`select id, name, position, archived from departments where not archived order by position, lower(name)`,
    sql<{ user_id: string; department_id: string }[]>`select user_id, department_id from user_departments`,
  ]);
  const deptIds = new Map<string, string[]>();
  for (const m of memberships) (deptIds.get(m.user_id) ?? deptIds.set(m.user_id, []).get(m.user_id)!).push(m.department_id);
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const stages = (bundle?.stages ?? []).filter((s) => !s.uses_account_manager);
  const sponsors = bundle?.sponsors ?? [];

  const counts = { active: 0, waiting: 0, off: 0 };
  for (const p of people) {
    const st = personStatus(p);
    if (st === 'deactivated') counts.off += 1;
    else if (!p.last_login_at && p.must_change_password) counts.waiting += 1;
    else counts.active += 1;
  }

  // Things to sort out about people and sign-off (platform switches are on the Platform tab)
  const attention = (await loadAttention(sql, event?.id ?? null)).filter((a) => a.area !== 'platform');

  return (
    <>
      <Intro>Only people you invite can sign in. Choose each person’s access level and what they sign off.</Intro>

      {attention.length > 0 && (
        <section aria-labelledby="attention-title" className="mb-6 rounded-[10px] border border-amber-300 bg-signal-soft px-4 py-3">
          <h2 id="attention-title" className="mb-1.5 text-[17px] font-semibold text-ink">Needs attention ({attention.length})</h2>
          <ul className="space-y-1">
            {attention.map((a, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-[14.5px]">
                <span className="text-ink">{a.text}</span>
                <Link href={a.href} className="text-[13.5px] font-semibold text-ink underline underline-offset-2">{a.action}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Invite someone" id="invite">
            <DetailsForm action={invitePerson} resetOnSuccess className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Name" htmlFor="inv-name"><input id="inv-name" name="full_name" required autoComplete="off" className={inputCls} /></Field>
                <Field label="Email" htmlFor="inv-email"><input id="inv-email" name="email" type="email" required autoComplete="off" className={inputCls} /></Field>
                <Field label="Job title (optional)" htmlFor="inv-title"><input id="inv-title" name="job_title" placeholder="e.g. Marketing Manager" className={inputCls} /></Field>
              </div>
              <fieldset>
                <legend className="mb-1.5 text-[13.5px] font-semibold text-ink-2">Access level</legend>
                <div className="grid gap-2 md:grid-cols-3">
                  {ACCESS_LEVELS.map((a) => (
                    <label key={a.key}
                      className="flex cursor-pointer gap-2.5 rounded-md border border-line-strong bg-white p-3 hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-signal-soft has-[:checked]:ring-1 has-[:checked]:ring-ink">
                      <input type="radio" name="role" value={a.key} defaultChecked={a.key === 'manager'} className="mt-1 h-4 w-4 shrink-0 accent-[#13233b]" />
                      <span>
                        <span className="block text-[15px] font-semibold text-ink">{a.label}</span>
                        <span className="block text-[13px] leading-snug text-ink-2">{a.summary}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <SubmitButton pendingText="Creating…">Create invite</SubmitButton>
                <p className="max-w-[60ch] text-[13.5px] text-muted">
                  You’ll get an email to send them from your own email, with a temporary password that works for {TEMP_PASSWORD_DAYS} days.
                  They choose their own password when they first sign in.
                </p>
              </div>
            </DetailsForm>
          </Panel>

          <Panel title={`People (${people.length})`} padded={false}
            actions={<span className="text-[13.5px] text-muted">
              {[`${counts.active} active`, counts.waiting ? `${counts.waiting} waiting to sign in` : null, counts.off ? `${counts.off} deactivated` : null].filter(Boolean).join(', ')}
            </span>}>
            <ul>
              {people.map((p) => (
                <PersonRow key={p.id} u={p} me={me.id} meSuper={me.is_super_admin} meDemo={me.is_demo} event={event ? { id: event.id, name: event.name } : null}
                  stages={stages} sponsors={sponsors} names={names} departments={departments} deptIds={deptIds.get(p.id) ?? []} open={sp.person === p.id} />
              ))}
            </ul>
          </Panel>
        </div>

        <aside className="min-w-0 space-y-6">
          <Panel title="What each level can do" padded={false}>
            <div className="relative overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th scope="col" className="px-4 py-2 font-semibold"><span className="sr-only">Ability</span></th>
                    {ACCESS_LEVELS.map((a) => <th key={a.key} scope="col" className="px-2 py-2 font-semibold text-ink">{a.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {ABILITIES.map((r) => (
                    <tr key={r.label} className="border-b border-line last:border-0 align-top">
                      <th scope="row" className="px-4 py-2 text-left font-normal text-ink-2">{r.label}</th>
                      {(['super_admin', 'manager', 'user'] as const).map((k) => (
                        <td key={k} className={cx('px-2 py-2', r[k] === 'No' ? 'text-muted' : 'font-semibold text-ink')}>{r[k]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Access log" padded={false}
            actions={<Link href="/admin/activity?log=access" className="text-[13.5px] font-semibold text-ink underline underline-offset-2">See all</Link>}>
            {log.length === 0 ? <p className="p-4 text-[14px] text-muted">Nothing yet.</p> : (
              <ol className="max-h-[520px] overflow-y-auto">
                {log.map((l) => (
                  <li key={l.id} className="border-b border-line px-4 py-2.5 last:border-0">
                    <p className="text-[14px] text-ink"><b>{l.actor_name}</b>: {l.message}</p>
                    <p className="text-[12.5px] text-muted">{fmtDateTime(l.created_at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
