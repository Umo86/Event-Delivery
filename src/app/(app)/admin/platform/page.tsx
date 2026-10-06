import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { LATEST_VERSION } from '@/lib/db/migrations';
import { getAppName } from '@/lib/data/load';
import { fmtDateTime } from '@/lib/dates';
import { maintenanceOn, sponsorLinksEnabled } from '@/lib/settings';
import { blobAccess, blobSetupProblem, isBlobConfigured } from '@/lib/storage';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Chip, Field, inputCls, Intro, Notice, Panel } from '@/components/ui';
import { setSponsorLinks } from '@/app/actions/admin';
import { setAppName } from '@/app/actions/settings';
import { setDemoLogin, setMaintenance, signOutEveryoneElse, signOutPerson } from '@/app/actions/superadmin';
import { runCheck } from '@/app/actions/system';

export const metadata: Metadata = { title: 'Platform' };

const FREE_BLOB_BYTES = 1024 ** 3;

export default async function PlatformPage() {
  const me = await requireSuperAdmin();
  const sql = await db();
  const [[c], signedIn, [demo], linksOn, maintenance, appName] = await Promise.all([
    sql<{
      active: number; waiting: number; deactivated: number; events: number; archived: number; lines: number;
      files: number; bytes: number; people_in: number; sessions: number; open_links: number; schema: number;
    }[]>`select
      (select count(*)::int from users where active and not is_demo and not (must_change_password and last_login_at is null)) as active,
      (select count(*)::int from users where active and must_change_password and last_login_at is null) as waiting,
      (select count(*)::int from users where not active) as deactivated,
      (select count(*)::int from events where not archived) as events,
      (select count(*)::int from events where archived) as archived,
      (select count(*)::int from items) as lines,
      (select count(*)::int from artwork_versions) as files,
      (select coalesce(sum(size_bytes), 0)::bigint from artwork_versions) as bytes,
      (select count(distinct user_id)::int from sessions where expires_at > now()) as people_in,
      (select count(*)::int from sessions where expires_at > now()) as sessions,
      (select count(*)::int from share_links where revoked_at is null and used_at is null and expires_at > now()) as open_links,
      (select coalesce(max(version), 0)::int from schema_migrations) as schema`,
    sql<{ id: string; full_name: string; role: string; is_demo: boolean; n: number; latest: Date }[]>`
      select u.id, u.full_name, u.role, u.is_demo, count(*)::int as n, max(s.created_at) as latest
      from sessions s join users u on u.id = s.user_id where s.expires_at > now()
      group by u.id order by max(s.created_at) desc limit 100`,
    sql<{ id: string; full_name: string; email: string; active: boolean }[]>`
      select id, full_name, email, active from users where is_demo order by created_at limit 1`,
    sponsorLinksEnabled(),
    maintenanceOn(),
    getAppName(),
  ]);
  const bytes = Number(c.bytes);
  const pct = Math.min(100, (bytes / FREE_BLOB_BYTES) * 100);
  const blobProblem = blobSetupProblem();

  const tiles: { label: string; value: string | number; sub?: string; href: string }[] = [
    { label: 'People who can sign in', value: c.active, href: '/admin',
      sub: [c.waiting ? `${c.waiting} waiting to sign in` : null, c.deactivated ? `${c.deactivated} deactivated` : null].filter(Boolean).join(', ') || undefined },
    { label: 'Signed in now', value: c.people_in, href: '#signed-in', sub: `${c.sessions} session${c.sessions === 1 ? '' : 's'}` },
    { label: 'Live shows', value: c.events, href: '/shows', sub: c.archived ? `${c.archived} archived` : undefined },
    { label: 'Artwork stored', value: `${(bytes / 1024 / 1024).toFixed(1)} MB`, href: '#health', sub: `${pct.toFixed(0)}% of the free 1 GB` },
  ];

  return (
    <>
      <Intro>Switches that affect everyone, who is signed in right now, and whether the database and file storage are healthy.</Intro>

      <ul className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.label}>
            <Link href={t.href} className="block h-full rounded-[10px] border border-line bg-white p-4 hover:border-ink">
              <span className="block font-display text-[30px] font-semibold leading-none text-ink">{t.value}</span>
              <span className="mt-1.5 block text-[14px] font-semibold text-ink-2">{t.label}</span>
              {t.sub && <span className="block text-[12.5px] text-muted">{t.sub}</span>}
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <Panel title="Platform switches" padded={false}>
            <Switch title="Maintenance mode" on={maintenance} danger
              text="While it’s on, only super admins can sign in or use the platform. Everyone else sees a notice on the sign-in page.">
              <ActionForm action={setMaintenance}
                confirm={maintenance ? undefined : 'Turn on maintenance mode? Everyone except super admins is shut out until you turn it off.'}>
                <input type="hidden" name="on" value={maintenance ? '0' : '1'} />
                <SubmitButton variant={maintenance ? 'secondary' : 'danger'} small>{maintenance ? 'Turn maintenance off' : 'Turn maintenance on'}</SubmitButton>
              </ActionForm>
            </Switch>

            <Switch title="Sponsor approval links" on={linksOn}
              text={linksOn
                ? `Sponsors can approve their own artwork from a private link, without an account. Each link works once, for one version, for 30 days. ${c.open_links} link${c.open_links === 1 ? ' is' : 's are'} waiting for a sponsor’s answer.`
                : 'Sponsors can’t open links, and lines don’t offer them.'}>
              <ActionForm action={setSponsorLinks}
                confirm={linksOn ? 'Turn sponsor approval links off? Every existing link stops working until you turn them back on.' : undefined}>
                <input type="hidden" name="enabled" value={linksOn ? '0' : '1'} />
                <SubmitButton variant={linksOn ? 'danger' : 'secondary'} small>{linksOn ? 'Turn links off' : 'Turn links on'}</SubmitButton>
              </ActionForm>
            </Switch>

            {demo ? (
              <Switch title="Demo login" on={demo.active} danger
                text={demo.active
                  ? `Shown on the sign-in page, so anyone with the link can sign in as ${demo.full_name} (${demo.email}).`
                  : `${demo.full_name} (${demo.email}) can’t sign in and isn’t on the sign-in page.`}>
                <ActionForm action={setDemoLogin}
                  confirm={demo.active ? 'Turn the demo login off? It comes off the sign-in page and anyone using it is signed out.' : undefined}>
                  <input type="hidden" name="on" value={demo.active ? '0' : '1'} />
                  <SubmitButton variant={demo.active ? 'danger' : 'secondary'} small>{demo.active ? 'Turn demo login off' : 'Turn demo login on'}</SubmitButton>
                </ActionForm>
              </Switch>
            ) : (
              <Switch title="Demo login" on={false} text="No demo login is set up." />
            )}
          </Panel>

          <Panel id="signed-in" title={`Signed in (${signedIn.length})`} padded={false}
            actions={
              <ActionForm action={signOutEveryoneElse} confirm="Sign everyone else out? They’ll need to sign in again.">
                <SubmitButton variant="danger" small pendingText="Signing out…">Sign everyone else out</SubmitButton>
              </ActionForm>
            }>
            {signedIn.length === 0 ? <p className="p-4 text-[14px] text-muted">Nobody is signed in.</p> : (
              <ul>
                {signedIn.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2.5 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-ink">
                        {s.full_name}{s.id === me.id ? ' (you)' : ''}
                        <span className="ml-2 text-[13px] font-normal text-muted">
                          {s.role === 'super_admin' ? 'Super Admin' : s.role === 'manager' ? 'Manager' : 'User'}{s.is_demo ? ', demo login' : ''}
                        </span>
                      </p>
                      <p className="text-[13px] text-muted">{s.n} session{s.n === 1 ? '' : 's'}, latest sign-in {fmtDateTime(s.latest)}</p>
                    </div>
                    {s.id !== me.id && (
                      <ActionForm action={signOutPerson}>
                        <input type="hidden" name="user_id" value={s.id} />
                        <SubmitButton variant="secondary" small pendingText="Signing out…">Sign out</SubmitButton>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel id="health" title="Health">
            <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-y-2 text-[14.5px]">
              <dt className="text-muted">Database</dt>
              <dd className="font-semibold text-green-700">Connected (schema v{c.schema}{c.schema === LATEST_VERSION ? ', up to date' : ''})</dd>
              <dt className="text-muted">File storage</dt>
              <dd className={isBlobConfigured() ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>
                {isBlobConfigured() ? `Connected (${blobAccess()} store)` : 'Not connected'}
              </dd>
              <dt className="text-muted">Lines</dt><dd>{c.lines}</dd>
              <dt className="text-muted">Artwork files</dt><dd>{c.files} versions, {(bytes / 1024 / 1024).toFixed(1)} MB of originals</dd>
            </dl>
            <div className="mt-3">
              <div className="h-2.5 w-full rounded-full bg-paper"><div className="h-2.5 rounded-full bg-ink" style={{ width: `${pct}%` }} /></div>
              <p className="mt-1 text-[13px] text-muted">{pct.toFixed(0)}% of the 1 GB included in Vercel’s free plan (previews add a little more).</p>
            </div>
            {blobProblem && <div className="mt-3"><Notice tone="error">{blobProblem}</Notice></div>}
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-3 text-[14px] text-ink-2">
                The system check runs a test line through the database, file storage and every sign-off stage, then deletes it. It takes a few seconds.
              </p>
              <ActionForm action={runCheck}>
                <SubmitButton variant="dark" pendingText="Checking…">Run system check</SubmitButton>
              </ActionForm>
            </div>
          </Panel>

          <Panel title="Platform name">
            <ActionForm action={setAppName} className="flex flex-wrap items-end gap-3">
              <Field label="Name shown in the menu, sign-in page and proof sheets" htmlFor="app_name" className="min-w-[240px] flex-1">
                <input id="app_name" name="app_name" required maxLength={40} defaultValue={appName} className={inputCls} />
              </Field>
              <SubmitButton variant="secondary" small>Save</SubmitButton>
            </ActionForm>
          </Panel>
        </div>
      </div>
    </>
  );
}

/** One platform switch: what it is, whether it's on, and the button that flips it. */
function Switch({ title, on, danger = false, text, children }: {
  title: string; on: boolean; danger?: boolean; text: string; children?: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="border-b border-line px-4 py-3.5 last:border-0">
      <h3 className="flex items-center gap-2 text-[15.5px] font-semibold text-ink">
        {title}
        <Chip tone={on ? (danger ? 'red' : 'green') : 'grey'}>{on ? 'On' : 'Off'}</Chip>
      </h3>
      <p className="mt-1 max-w-[70ch] text-[13.5px] text-ink-2">{text}</p>
      {children && <div className="mt-2.5">{children}</div>}
    </section>
  );
}
