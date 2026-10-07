import type { Metadata } from 'next';
import Link from 'next/link';
import { requireManager } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getCurrentEvent, loadBundle } from '@/lib/data/load';
import { levelsFor } from '@/lib/domain/access';
import type { DepartmentRow } from '@/lib/domain/types';
import { people as peopleCount } from '@/lib/text';
import { Notice, PageHeader, Panel } from '@/components/ui';
import { InviteForm } from '@/components/team/invite-form';
import { memberHref, TeamRow, type TeamPerson } from '@/components/team/team-row';

export const metadata: Metadata = { title: 'Team' };

const sideLink = 'text-[13.5px] font-semibold text-ink underline underline-offset-2';

/**
 * Show › Team: everyone who can sign in, the departments they're in and what they approve in the show you're
 * working in. Managers and super admins add people here; only super admins can add Super Admins.
 */
export default async function TeamPage(props: { searchParams: Promise<{ person?: string }> }) {
  const me = await requireManager();
  const sp = await props.searchParams;
  const sql = await db();
  const event = await getCurrentEvent();
  const [bundle, team, departments, memberships, [{ off }]] = await Promise.all([
    event ? loadBundle(event.id) : Promise.resolve(null),
    sql<TeamPerson[]>`
      select id, email, full_name, job_title, role, active, must_change_password, last_login_at, temp_password_expires_at, is_demo
      from users where active order by lower(full_name)`,
    sql<DepartmentRow[]>`select id, name, position, archived, external from departments where not archived order by position, lower(name)`,
    sql<{ user_id: string; department_id: string }[]>`select user_id, department_id from user_departments`,
    sql<{ off: number }[]>`select count(*)::int as off from users where not active`,
  ]);

  const deptIds = new Map<string, string[]>();
  for (const m of memberships) (deptIds.get(m.user_id) ?? deptIds.set(m.user_id, []).get(m.user_id)!).push(m.department_id);
  // Everyone ever invited, so approvers who've since been deactivated still show by name
  const everyone = new Map((bundle?.users ?? []).map((u) => [u.id, u]));
  const names = new Map([...everyone].map(([id, u]) => [id, u.full_name]));
  for (const u of team) names.set(u.id, u.full_name);
  const byName = (a: string, b: string) => (names.get(a) ?? '').localeCompare(names.get(b) ?? '');
  const stages = (bundle?.stages ?? []).filter((s) => !s.uses_account_manager)
    .map((s) => ({ ...s, approver_ids: [...s.approver_ids].sort(byName) }));
  const sponsorStage = bundle?.stages.find((s) => s.uses_account_manager) ?? null;
  const sponsors = bundle?.sponsors ?? [];
  const show = event ? { id: event.id, name: event.name } : null;

  const counts = { super_admin: 0, manager: 0, user: 0, waiting: 0 };
  for (const u of team) {
    counts[u.role] += 1;
    if (!u.last_login_at && u.must_change_password) counts.waiting += 1;
  }
  const countText = [
    counts.super_admin ? `${counts.super_admin} super admin${counts.super_admin === 1 ? '' : 's'}` : null,
    `${counts.manager} manager${counts.manager === 1 ? '' : 's'}`,
    counts.user ? `${counts.user} user${counts.user === 1 ? '' : 's'}` : null,
    counts.waiting ? `${counts.waiting} waiting to sign in` : null,
  ].filter(Boolean).join(', ');
  const noDept = team.filter((u) => !(deptIds.get(u.id) ?? []).some((id) => departments.some((d) => d.id === id)));

  return (
    <>
      <PageHeader title="Team"
        subtitle={show
          ? `Everyone who can sign in, the departments they’re in and what they approve in ${show.name}.`
          : 'Everyone who can sign in and the departments they’re in.'} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {me.is_demo ? (
            <Notice>You’re using the shared demo login, which can’t add people. Sign in with your own account to add someone.</Notice>
          ) : (
            <Panel title="Add someone" id="add">
              <InviteForm
                levels={levelsFor(me.is_super_admin).map(({ key, label, summary }) => ({ key, label, summary }))}
                departments={departments.map(({ id, name, external }) => ({ id, name, external }))}
                event={show}
                stages={stages.map((s) => ({ id: s.id, name: s.name, approvers: s.approver_ids.map((id) => names.get(id) ?? 'someone') }))} />
            </Panel>
          )}

          <Panel title={`Team (${team.length})`} padded={false} actions={<span className="text-[13.5px] text-muted">{countText}</span>}>
            <div aria-hidden className="hidden grid-cols-[16px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-x-3 border-b border-line px-4 py-2 text-[12.5px] font-semibold text-muted lg:grid">
              <span />
              <span>Person</span>
              <span>Departments</span>
              {show && <span>Approver in {show.name}</span>}
            </div>
            <ul>
              {team.map((u) => (
                <TeamRow key={u.id} u={u} me={{ id: me.id, superAdmin: me.is_super_admin, demo: me.is_demo }} event={show}
                  stages={stages} sponsors={sponsors} departments={departments} deptIds={deptIds.get(u.id) ?? []} names={names}
                  open={sp.person === u.id} />
              ))}
            </ul>
            {off > 0 && (
              <p className="border-t border-line px-4 py-2.5 text-[13.5px] text-muted">
                {peopleCount(off)} with a deactivated account {off === 1 ? 'isn’t' : 'aren’t'} listed.{' '}
                {me.is_super_admin ? <Link href="/admin" className={sideLink}>See them in Admin › People</Link> : 'A super admin can reactivate them.'}
              </p>
            )}
          </Panel>
        </div>

        <aside className="min-w-0 space-y-6">
          {show && (
            <Panel title={`Approvers in ${show.name}`} padded={false}>
              <ul className="border-b border-line">
                {stages.map((s) => (
                  <li key={s.id} className="border-b border-line px-4 py-2.5 last:border-0">
                    <p className="text-[14.5px] font-semibold text-ink">{s.name}</p>
                    {s.approver_ids.length === 0 ? (
                      <p className="text-[13.5px] font-semibold text-red-700">No approver yet</p>
                    ) : (
                      <p className="text-[13.5px] text-ink-2">
                        {s.approver_ids.map((id, i) => {
                          const u = everyone.get(id);
                          const problem = !u ? null : !u.active ? 'deactivated' : u.role === 'user' ? 'a User, so can’t sign off' : null;
                          return (
                            <span key={id}>
                              {i > 0 && ', '}
                              {u?.active ? <Link href={memberHref(id)} className="text-ink underline-offset-2 hover:underline">{names.get(id)}</Link> : names.get(id) ?? 'someone'}
                              {problem && <span className="font-semibold text-red-700"> ({problem})</span>}
                            </span>
                          );
                        })}
                      </p>
                    )}
                  </li>
                ))}
                {sponsorStage && (
                  <li className="px-4 py-2.5">
                    <p className="text-[14.5px] font-semibold text-ink">{sponsorStage.name}</p>
                    <p className="text-[13.5px] text-ink-2">
                      Each sponsor’s account manager.{' '}
                      {sponsors.length === 0 ? 'No sponsors yet.'
                        : `${sponsors.filter((x) => x.account_manager_id).length} of ${sponsors.length} sponsor${sponsors.length === 1 ? ' has' : 's have'} one.`}
                    </p>
                  </li>
                )}
                {stages.length === 0 && !sponsorStage && <li className="px-4 py-2.5 text-[13.5px] text-muted">No sign-off stages yet.</li>}
              </ul>
              <p className="px-4 py-2.5 text-[13px] text-muted">
                Change someone’s stages from their row, or add and reorder stages in{' '}
                <Link href="/settings/stages" className={sideLink}>Sign-off stages</Link>.
              </p>
            </Panel>
          )}

          <Panel title="Departments" padded={false}
            actions={<Link href="/settings/departments" className={sideLink}>Edit departments</Link>}>
            <ul>
              {departments.map((d) => {
                const members = team.filter((u) => (deptIds.get(u.id) ?? []).includes(d.id));
                return (
                  <li key={d.id} className="border-b border-line px-4 py-2.5 last:border-0">
                    <p className="flex items-baseline justify-between gap-3">
                      <span className="text-[14.5px] font-semibold text-ink">{d.name}</span>
                      <span className="shrink-0 text-[12.5px] text-muted">{peopleCount(members.length)}</span>
                    </p>
                    <p className="text-[13.5px] text-ink-2">
                      {members.length ? members.map((u) => u.full_name).join(', ') : <span className="text-muted">Nobody yet</span>}
                    </p>
                    {d.external && <p className="text-[12.5px] text-muted">Outside the company: they can’t mark sponsorship items sold.</p>}
                  </li>
                );
              })}
              {departments.length === 0 && <li className="px-4 py-2.5 text-[13.5px] text-muted">No departments yet.</li>}
              {noDept.length > 0 && (
                <li className="border-t border-line bg-paper/60 px-4 py-2.5">
                  <p className="text-[14.5px] font-semibold text-ink">Not in a department</p>
                  <p className="text-[13.5px] text-ink-2">{noDept.map((u) => u.full_name).join(', ')}</p>
                </li>
              )}
            </ul>
          </Panel>
        </aside>
      </div>
    </>
  );
}
