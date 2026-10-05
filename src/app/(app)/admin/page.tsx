import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getCurrentEvent, loadBundle } from '@/lib/data/load';
import { fmtDateTime } from '@/lib/dates';
import { ABILITIES, ACCESS_LEVELS, personStatus, TEMP_PASSWORD_DAYS } from '@/lib/domain/access';
import { sponsorLinksEnabled } from '@/lib/settings';
import { ActionForm, SubmitButton } from '@/components/forms';
import { cx, Field, inputCls, PageHeader, Panel } from '@/components/ui';
import { DetailsForm } from '@/components/admin/details-form';
import { PersonRow, type AdminPerson } from '@/components/admin/person-row';
import { invitePerson, setSponsorLinks } from '@/app/actions/admin';

export const metadata: Metadata = { title: 'Admin' };

export default async function AdminPage(props: { searchParams: Promise<{ person?: string }> }) {
  const me = await requireAdminPage();
  const sp = await props.searchParams;
  const sql = await db();
  const event = await getCurrentEvent();
  const [bundle, people, log, linksOn, [{ openLinks }]] = await Promise.all([
    event ? loadBundle(event.id) : Promise.resolve(null),
    sql<AdminPerson[]>`
      select u.id, u.email, u.full_name, u.job_title, u.role, u.active, u.must_change_password, u.last_login_at, u.created_at,
             u.invited_at, inv.full_name as invited_by_name, u.temp_password_expires_at, u.locked_until, u.is_demo, u.is_super_admin
      from users u left join users inv on inv.id = u.invited_by
      order by lower(u.full_name)`,
    sql<{ id: string; actor_name: string; message: string; created_at: Date }[]>`
      select id, actor_name, message, created_at from activity where kind = 'access' order by created_at desc limit 40`,
    sponsorLinksEnabled(),
    sql<{ openLinks: number }[]>`
      select count(*)::int as "openLinks" from share_links where revoked_at is null and used_at is null and expires_at > now()`,
  ]);
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const byId = new Map(people.map((p) => [p.id, p]));
  const stages = (bundle?.stages ?? []).filter((s) => !s.uses_account_manager);
  const sponsors = bundle?.sponsors ?? [];

  const counts = { active: 0, waiting: 0, off: 0 };
  for (const p of people) {
    const st = personStatus(p);
    if (st === 'deactivated') counts.off += 1;
    else if (!p.last_login_at && p.must_change_password) counts.waiting += 1;
    else counts.active += 1;
  }

  // Things an admin should sort out, most important first
  const attention: { text: string; href: string; action: string }[] = [];
  const personLink = (id: string) => `/admin?person=${id}#person-${id}`;
  for (const p of people) {
    if (p.is_demo && p.active) {
      attention.push({ text: `The demo login is on the sign-in page, so anyone with the link can sign in as ${p.full_name}.`, href: personLink(p.id), action: 'Open' });
    }
    const st = personStatus(p);
    if (st === 'invite_expired') attention.push({ text: `${p.full_name}’s invite has expired.`, href: personLink(p.id), action: 'New invite' });
    if (p.active && p.locked_until && new Date(p.locked_until) > new Date()) {
      attention.push({ text: `${p.full_name} is locked out after too many wrong passwords.`, href: personLink(p.id), action: 'Open' });
    }
  }
  const cantSignOff = (id: string | null) => {
    const p = id ? byId.get(id) : null;
    return p && (!p.active || p.role === 'viewer') ? p : null;
  };
  for (const s of stages) {
    const p = cantSignOff(s.approver_id);
    if (!s.approver_id) attention.push({ text: `The ${s.name} stage has no approver.`, href: '/settings/stages', action: 'Choose' });
    else if (p) attention.push({ text: `${p.full_name} approves ${s.name} but ${p.active ? 'is a viewer' : 'is deactivated'}.`, href: personLink(p.id), action: 'Open' });
  }
  const noManager = sponsors.filter((s) => !s.account_manager_id).length;
  if (noManager) attention.push({ text: `${noManager} sponsor${noManager === 1 ? ' has' : 's have'} no account manager.`, href: '/sponsors', action: 'View' });
  for (const s of sponsors) {
    const p = cantSignOff(s.account_manager_id);
    if (p) attention.push({ text: `${p.full_name} manages ${s.name} but ${p.active ? 'is a viewer' : 'is deactivated'}.`, href: personLink(p.id), action: 'Open' });
  }

  return (
    <>
      <PageHeader title="Admin" subtitle="Only people you invite can sign in. Choose each person’s access level and what they sign off." />

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
                      <input type="radio" name="role" value={a.key} defaultChecked={a.key === 'member'} className="mt-1 h-4 w-4 shrink-0 accent-[#13233b]" />
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
                  stages={stages} sponsors={sponsors} names={names} open={sp.person === p.id} />
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
                      {(['admin', 'member', 'viewer'] as const).map((k) => (
                        <td key={k} className={cx('px-2 py-2', r[k] === 'No' ? 'text-muted' : 'font-semibold text-ink')}>{r[k]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Sponsor approval links">
            <p className="text-[14px] text-ink-2">
              Private links let a sponsor approve their own artwork without an account. They’re the only way in for people you haven’t invited.
              Each link works once, for one version, for 30 days.
            </p>
            <p className="mt-2 text-[14px]">
              {linksOn
                ? <><b className="text-green-700">On.</b> {openLinks} link{openLinks === 1 ? ' is' : 's are'} waiting for a sponsor’s answer.</>
                : <><b className="text-red-700">Off.</b> Sponsors can’t open links, and lines don’t offer them.</>}
            </p>
            <ActionForm action={setSponsorLinks} className="mt-3"
              confirm={linksOn ? 'Turn sponsor approval links off? Every existing link stops working until you turn them back on.' : undefined}>
              <input type="hidden" name="enabled" value={linksOn ? '0' : '1'} />
              <SubmitButton variant={linksOn ? 'danger' : 'secondary'} small>{linksOn ? 'Turn links off' : 'Turn links on'}</SubmitButton>
            </ActionForm>
          </Panel>

          <Panel title="Access log" padded={false}>
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
