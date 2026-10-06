import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowLeft, CalendarRange, Flag, Handshake, Inbox, LayoutDashboard, LogOut, Package, Settings, ShieldCheck, Signpost, Truck,
} from 'lucide-react';
import { db, isDatabaseConfigured } from '@/lib/db';
import { LATEST_VERSION } from '@/lib/db/migrations';
import { getCurrentUser, type CurrentUser } from '@/lib/auth/session';
import { getAppName, getCurrentEvent, listEvents, loadSchedule } from '@/lib/data/load';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { maintenanceOn, sponsorLinksEnabled } from '@/lib/settings';
import { blobAccess, isBlobConfigured } from '@/lib/storage';
import { Mark } from '@/components/brand';
import { ActionForm, SubmitButton } from '@/components/forms';
import { PasswordInput } from '@/components/password-input';
import { Chip, cx, Field, inputCls, Notice, Panel } from '@/components/ui';
import { changePassword, superAdminLogin, superAdminLogout } from '@/app/actions/auth';
import { setSponsorLinks } from '@/app/actions/admin';
import { setDemoLogin, setMaintenance, setSuperAdmin, signOutEveryoneElse, signOutPerson } from '@/app/actions/superadmin';

// Everywhere a super admin can go in the platform, surfaced on this dashboard (it has no app sidebar of its own).
const QUICK_LINKS = [
  { href: '/inbox', label: 'My actions', icon: Inbox },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/shows', label: 'All shows', icon: CalendarRange },
  { href: '/schedule/os', label: 'Organiser signage', icon: Signpost },
  { href: '/schedule/ss', label: 'Sponsor signage', icon: Flag },
  { href: '/schedule/si', label: 'Sponsor items', icon: Package },
  { href: '/sponsors', label: 'Sponsors', icon: Handshake },
  { href: '/suppliers', label: 'Suppliers', icon: Truck },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/admin', label: 'Admin (people)', icon: ShieldCheck },
];

export const dynamic = 'force-dynamic';

// The super admin panel. Signed out (or signed in as anyone who isn't a super admin), it shows its own sign-in.

export default async function SuperAdminPage(props: { searchParams: Promise<{ log?: string }> }) {
  if (!isDatabaseConfigured()) {
    return <div className="p-6"><Notice tone="warn">No database is connected yet.</Notice></div>;
  }
  const sql = await db();
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
  if (n === 0) redirect('/setup');
  const [me, appName] = await Promise.all([getCurrentUser(), getAppName()]);
  if (!me || !me.is_super_admin) return <SignIn appName={appName} signedInAs={me?.full_name ?? null} />;
  const sp = await props.searchParams;
  return <SuperAdminPanel me={me} appName={appName} log={sp.log} />;
}

function SignIn({ appName, signedInAs }: { appName: string; signedInAs: string | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-3 text-white">
          <Mark />
          <span className="font-display text-[22px] font-semibold">{appName}</span>
        </div>
        <div className="rounded-[12px] bg-white p-6">
          <h1 className="text-[28px] font-semibold text-ink">Super admin</h1>
          <p className="mt-1 text-[14.5px] text-muted">
            For super admins only. Everyone else signs in on the <Link href="/login" className="font-semibold text-ink underline">normal sign-in page</Link>.
          </p>
          {signedInAs && (
            <div className="mt-4"><Notice tone="info">You’re signed in as {signedInAs}, who isn’t a super admin.</Notice></div>
          )}
          <ActionForm action={superAdminLogin} className="mt-5 space-y-4">
            <Field label="Email" htmlFor="gs-email">
              <input id="gs-email" name="email" type="email" autoComplete="username" required className={inputCls} />
            </Field>
            <Field label="Password" htmlFor="gs-password">
              <PasswordInput id="gs-password" name="password" autoComplete="current-password" required />
            </Field>
            <SubmitButton variant="dark" className="w-full" pendingText="Signing in…">Sign in as super admin</SubmitButton>
          </ActionForm>
        </div>
        <div className="hazard mt-6 h-2 w-full rounded-[2px]" aria-hidden />
      </div>
    </div>
  );
}

const LOG_FILTERS = [
  { key: 'all', label: 'Everything' },
  { key: 'access', label: 'Access' },
  { key: 'settings', label: 'Settings' },
  { key: 'lines', label: 'Lines' },
] as const;

async function SuperAdminPanel({ me, appName, log }: { me: CurrentUser; appName: string; log?: string }) {
  const sql = await db();
  const filter = LOG_FILTERS.find((f) => f.key === log)?.key ?? 'all';
  const kindClause = filter === 'access' ? sql`where a.kind = 'access'`
    : filter === 'settings' ? sql`where a.kind = 'settings'`
      : filter === 'lines' ? sql`where a.item_id is not null` : sql``;
  const [[c], admins, signedIn, trail, linksOn, maintenance] = await Promise.all([
    sql<{
      active: number; waiting: number; deactivated: number; managers: number; supers: number; events: number; archived: number;
      lines: number; files: number; bytes: number; people_in: number; sessions: number; schema: number;
    }[]>`select
      (select count(*)::int from users where active and not is_demo and not (must_change_password and last_login_at is null)) as active,
      (select count(*)::int from users where active and must_change_password and last_login_at is null) as waiting,
      (select count(*)::int from users where not active) as deactivated,
      (select count(*)::int from users where role = 'manager' and active) as managers,
      (select count(*)::int from users where role = 'super_admin' and active) as supers,
      (select count(*)::int from events where not archived) as events,
      (select count(*)::int from events where archived) as archived,
      (select count(*)::int from items) as lines,
      (select count(*)::int from artwork_versions) as files,
      (select coalesce(sum(size_bytes), 0)::bigint from artwork_versions) as bytes,
      (select count(distinct user_id)::int from sessions where expires_at > now()) as people_in,
      (select count(*)::int from sessions where expires_at > now()) as sessions,
      (select coalesce(max(version), 0)::int from schema_migrations) as schema`,
    sql<{ id: string; full_name: string; email: string; active: boolean; is_super_admin: boolean; is_demo: boolean; last_login_at: Date | null }[]>`
      select id, full_name, email, active, (role = 'super_admin') as is_super_admin, is_demo, last_login_at from users
      where role in ('manager', 'super_admin') order by (role = 'super_admin') desc, active desc, lower(full_name)`,
    sql<{ id: string; full_name: string; role: string; is_super_admin: boolean; is_demo: boolean; n: number; latest: Date }[]>`
      select u.id, u.full_name, u.role, (u.role = 'super_admin') as is_super_admin, u.is_demo, count(*)::int as n, max(s.created_at) as latest
      from sessions s join users u on u.id = s.user_id where s.expires_at > now()
      group by u.id order by max(s.created_at) desc limit 100`,
    sql<{ id: string; actor_name: string; kind: string; message: string; created_at: Date; event_name: string | null }[]>`
      select a.id, a.actor_name, a.kind, a.message, a.created_at, e.name as event_name
      from activity a left join events e on e.id = a.event_id ${kindClause}
      order by a.created_at desc limit 100`,
    sponsorLinksEnabled(),
    maintenanceOn(),
  ]);
  const [demo] = await sql<{ id: string; full_name: string; email: string; active: boolean }[]>`
    select id, full_name, email, active from users where is_demo order by created_at limit 1`;

  // Event and signage info, so the super admin can see and reach it without leaving this dashboard.
  const [events, current] = await Promise.all([listEvents(), getCurrentEvent()]);
  const sched = current ? await loadSchedule(current.id) : null;
  const rows = (sched?.rows ?? []).filter((r) => r.state.group !== 'cancelled');
  const catCount = (cat: string) => rows.filter((r) => r.item.category === cat).length;
  const signage = {
    total: rows.length,
    os: catCount('organiser_signage'),
    ss: catCount('sponsor_signage'),
    si: catCount('sponsor_item'),
    inSignoff: rows.filter((r) => r.state.group === 'in_signoff' || r.state.group === 'on_hold').length,
    overdue: rows.filter((r) => r.state.rank === 1).length,
    approved: rows.filter((r) => r.state.phase >= 4).length,
  };
  const approvedPct = signage.total ? Math.round((signage.approved / signage.total) * 100) : 0;
  const range = (a: string | null, b: string | null) =>
    a && b ? `${fmtDate(a)} – ${fmtDate(b)}` : a ? fmtDate(a) : b ? fmtDate(b) : '—';

  const tiles: { label: string; value: string | number; sub?: string }[] = [
    { label: 'Active people', value: c.active, sub: [c.waiting ? `${c.waiting} waiting to sign in` : null, c.deactivated ? `${c.deactivated} deactivated` : null].filter(Boolean).join(', ') || undefined },
    { label: 'Super admins', value: c.supers, sub: `${c.managers} manager${c.managers === 1 ? '' : 's'}` },
    { label: 'Signed in now', value: c.people_in, sub: `${c.sessions} session${c.sessions === 1 ? '' : 's'}` },
    { label: 'Events', value: c.events, sub: c.archived ? `${c.archived} archived` : undefined },
    { label: 'Lines', value: c.lines },
    { label: 'Artwork stored', value: `${(c.bytes / 1024 / 1024).toFixed(1)} MB`, sub: `${c.files} version${c.files === 1 ? '' : 's'}` },
  ];
  const state = (on: boolean, onText: string, offText: string, danger = false) => (
    <b className={on ? (danger ? 'text-red-700' : 'text-green-700') : 'text-ink-2'}>{on ? onText : offText}</b>
  );

  return (
    <>
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-[1300px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <Mark />
          <span className="font-display text-[19px] font-semibold">{appName}</span>
          <span className="rounded-[4px] bg-signal px-1.5 py-0.5 font-display text-[13px] font-bold text-ink">Super admin</span>
          <nav className="ml-auto flex flex-wrap items-center gap-1 text-[14px]" aria-label="Super admin">
            <Link href="/dashboard" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-white/85 hover:bg-white/10 hover:text-white">
              <ArrowLeft size={16} aria-hidden /> Back to the platform
            </Link>
            <form action={superAdminLogout}>
              <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-white/85 hover:bg-white/10 hover:text-white">
                <LogOut size={16} aria-hidden /> Sign out
              </button>
            </form>
          </nav>
        </div>
        {maintenance && (
          <div className="hazard px-4 py-1.5 text-center text-[13.5px] font-bold"><span>Maintenance mode is on: only super admins can use the platform</span></div>
        )}
      </header>

      <main className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:py-8">
        <div className="mb-5">
          <h1 className="text-[28px] font-semibold leading-tight text-ink">Super admin</h1>
          <p className="mt-1 text-[14.5px] text-muted">Signed in as {me.full_name}. Platform-wide controls that only super admins have.</p>
        </div>

        <ul className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {tiles.map((t) => (
            <li key={t.label} className="rounded-[10px] border border-line bg-white p-4">
              <span className="block font-display text-[30px] font-semibold leading-none text-ink">{t.value}</span>
              <span className="mt-1.5 block text-[14px] font-semibold text-ink-2">{t.label}</span>
              {t.sub && <span className="block text-[12.5px] text-muted">{t.sub}</span>}
            </li>
          ))}
        </ul>

        <Panel title="Go to the platform" className="mb-6">
          <p className="mb-3 text-[13.5px] text-muted">Everything a manager can do, plus people and settings. These open the full app in a new context — the super admin bar brings you back here.</p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {QUICK_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href}
                  className="flex items-center gap-2.5 rounded-[10px] border border-line bg-white px-3 py-2.5 text-[14px] font-semibold text-ink hover:border-ink-2 hover:bg-paper">
                  <l.icon size={18} className="shrink-0 text-ink-2" aria-hidden /> {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 space-y-6">
            <Panel title={current ? `Signage — ${current.name}` : 'Signage'} padded={false}
              actions={<Link href="/dashboard" className="text-[13.5px] font-semibold text-ink underline underline-offset-2">Open the dashboard</Link>}>
              {!current ? <p className="p-4 text-[14px] text-muted">No active event yet.</p> : signage.total === 0 ? (
                <p className="p-4 text-[14px] text-muted">No lines on this show yet. <Link href="/schedule/os" className="font-semibold text-ink underline">Add the first</Link>.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-4">
                    {([['Total lines', signage.total, null], ['In sign-off', signage.inSignoff, null], ['Overdue', signage.overdue, signage.overdue ? 'text-red-700' : null], ['Approved+', `${approvedPct}%`, 'text-green-700']] as const).map(([label, value, tone]) => (
                      <div key={label}>
                        <span className={cx('block font-display text-[26px] font-semibold leading-none', tone ?? 'text-ink')}>{value}</span>
                        <span className="mt-1 block text-[13px] text-muted">{label}</span>
                      </div>
                    ))}
                  </div>
                  <ul className="border-t border-line">
                    {([['Organiser signage', signage.os, '/schedule/os'], ['Sponsor signage', signage.ss, '/schedule/ss'], ['Sponsor items', signage.si, '/schedule/si']] as const).map(([label, count, href]) => (
                      <li key={href} className="flex items-center justify-between border-b border-line px-4 py-2.5 last:border-0">
                        <Link href={href} className="text-[14.5px] font-semibold text-ink hover:underline">{label}</Link>
                        <span className="text-[14px] text-muted">{count} line{count === 1 ? '' : 's'}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Panel>

            <Panel title={`Events (${events.length})`} padded={false}
              actions={<Link href="/settings/events" className="text-[13.5px] font-semibold text-ink underline underline-offset-2">Create or manage events</Link>}>
              {events.length === 0 ? <p className="p-4 text-[14px] text-muted">No events yet.</p> : (
                <ul>
                  {events.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="text-[15.5px] font-semibold text-ink">{e.name}</span>
                          {e.id === current?.id && <Chip tone="teal">Current</Chip>}
                          {e.archived && <Chip tone="grey">Archived</Chip>}
                        </p>
                        <p className="text-[13px] text-muted">
                          {e.venue} · Open {range(e.show_open, e.show_close)}
                          {e.budget != null && ` · £${e.budget.toLocaleString('en-GB')} budget`}
                        </p>
                      </div>
                      <Link href="/settings" className="text-[13.5px] font-semibold text-ink underline underline-offset-2">Edit</Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Managers and super admins" padded={false}
              actions={<Link href="/admin" className="text-[13.5px] font-semibold text-ink underline underline-offset-2">Invite or change people on the Admin page</Link>}>
              <p className="border-b border-line px-4 py-2.5 text-[13.5px] text-muted">
                Promote a manager to super admin, or drop a super admin back to manager. Only super admins can change another super admin’s access, sign-in or details.
              </p>
              <ul>
                {admins.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-[15.5px] font-semibold text-ink">{a.full_name}{a.id === me.id ? ' (you)' : ''}</span>
                        {a.is_super_admin && <Chip tone="violet">Super admin</Chip>}
                        {a.is_demo && <Chip tone="yellow">Demo login</Chip>}
                        {!a.active && <Chip tone="grey">Deactivated</Chip>}
                      </p>
                      <p className="break-all text-[13px] text-muted">
                        {a.email}, {a.last_login_at ? `last signed in ${fmtDateTime(a.last_login_at)}` : 'hasn’t signed in yet'}
                      </p>
                    </div>
                    {a.id !== me.id && !a.is_demo && !me.is_demo && (a.is_super_admin || a.active) && (
                      <ActionForm action={setSuperAdmin}
                        confirm={a.is_super_admin ? `Remove ${a.full_name}’s super admin rights? They become a Manager.` : `Make ${a.full_name} a super admin?`}>
                        <input type="hidden" name="user_id" value={a.id} />
                        <input type="hidden" name="make" value={a.is_super_admin ? '0' : '1'} />
                        <SubmitButton variant={a.is_super_admin ? 'danger' : 'secondary'} small>
                          {a.is_super_admin ? 'Remove super admin' : 'Make super admin'}
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title={`Signed in (${signedIn.length})`} padded={false}
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
                          <span className="ml-2 text-[13px] font-normal text-muted">{s.role === 'super_admin' ? 'Super admin' : s.role === 'manager' ? 'Manager' : 'User'}{s.is_demo ? ', demo login' : ''}</span>
                        </p>
                        <p className="text-[13px] text-muted">
                          {s.n} session{s.n === 1 ? '' : 's'}, latest sign-in {fmtDateTime(s.latest)}
                        </p>
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

          <aside className="min-w-0 space-y-6">
            <Panel title="Your password">
              <ActionForm action={changePassword} resetOnSuccess className="space-y-3">
                <Field label="Current password" htmlFor="gs-cur">
                  <PasswordInput id="gs-cur" name="current" required autoComplete="current-password" />
                </Field>
                <Field label="New password" htmlFor="gs-new" help="At least 8 characters.">
                  <PasswordInput id="gs-new" name="password" required minLength={8} autoComplete="new-password" />
                </Field>
                <Field label="New password again" htmlFor="gs-confirm">
                  <PasswordInput id="gs-confirm" name="confirm" required minLength={8} autoComplete="new-password" />
                </Field>
                <SubmitButton variant="dark" small>Change password</SubmitButton>
              </ActionForm>
            </Panel>

            <Panel title="Platform switches">
              <div className="space-y-5">
                <section aria-label="Maintenance mode">
                  <h3 className="text-[15px] font-semibold text-ink">Maintenance mode</h3>
                  <p className="text-[13.5px] text-ink-2">
                    {state(maintenance, 'On.', 'Off.', true)} While it’s on, only super admins can sign in or use the platform. Everyone else sees a notice on the sign-in page.
                  </p>
                  <ActionForm action={setMaintenance} className="mt-2"
                    confirm={maintenance ? undefined : 'Turn on maintenance mode? Everyone except super admins is shut out until you turn it off.'}>
                    <input type="hidden" name="on" value={maintenance ? '0' : '1'} />
                    <SubmitButton variant={maintenance ? 'secondary' : 'danger'} small>{maintenance ? 'Turn maintenance off' : 'Turn maintenance on'}</SubmitButton>
                  </ActionForm>
                </section>

                <section aria-label="Sponsor approval links">
                  <h3 className="text-[15px] font-semibold text-ink">Sponsor approval links</h3>
                  <p className="text-[13.5px] text-ink-2">
                    {state(linksOn, 'On.', 'Off.')} The only way in without an account. While off, every link stops working.
                  </p>
                  <ActionForm action={setSponsorLinks} className="mt-2"
                    confirm={linksOn ? 'Turn sponsor approval links off? Every existing link stops working until you turn them back on.' : undefined}>
                    <input type="hidden" name="enabled" value={linksOn ? '0' : '1'} />
                    <SubmitButton variant={linksOn ? 'danger' : 'secondary'} small>{linksOn ? 'Turn links off' : 'Turn links on'}</SubmitButton>
                  </ActionForm>
                </section>

                <section aria-label="Demo login">
                  <h3 className="text-[15px] font-semibold text-ink">Demo login</h3>
                  {demo ? (
                    <>
                      <p className="text-[13.5px] text-ink-2">
                        {state(demo.active, 'On.', 'Off.', true)} {demo.active
                          ? <>Shown on the sign-in page, so anyone with the link can sign in as {demo.full_name} ({demo.email}).</>
                          : <>{demo.full_name} ({demo.email}) can’t sign in and isn’t on the sign-in page.</>}
                      </p>
                      <ActionForm action={setDemoLogin} className="mt-2"
                        confirm={demo.active ? 'Turn the demo login off? It comes off the sign-in page and anyone using it is signed out.' : undefined}>
                        <input type="hidden" name="on" value={demo.active ? '0' : '1'} />
                        <SubmitButton variant={demo.active ? 'danger' : 'secondary'} small>{demo.active ? 'Turn demo login off' : 'Turn demo login on'}</SubmitButton>
                      </ActionForm>
                    </>
                  ) : (
                    <p className="text-[13.5px] text-ink-2">No demo login is set up.</p>
                  )}
                </section>
              </div>
            </Panel>

            <Panel title="System">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[14px]">
                <dt className="text-muted">Database</dt>
                <dd className="font-semibold text-green-700">Connected, schema v{c.schema}{c.schema === LATEST_VERSION ? ' (up to date)' : ''}</dd>
                <dt className="text-muted">File storage</dt>
                <dd className={isBlobConfigured() ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>
                  {isBlobConfigured() ? `Connected (${blobAccess()} store)` : 'Not connected'}
                </dd>
              </dl>
              <p className="mt-3 text-[13.5px]">
                <Link href="/settings/system" className="font-semibold text-ink underline underline-offset-2">Run the full system check</Link>
              </p>
            </Panel>
          </aside>
        </div>

        <Panel title="Audit trail" className="mt-6" padded={false}
          actions={
            <nav className="flex flex-wrap gap-1" aria-label="Show">
              {LOG_FILTERS.map((f) => (
                <Link key={f.key} href={f.key === 'all' ? '/gs' : `/gs?log=${f.key}`} aria-current={filter === f.key ? 'page' : undefined}
                  className={cx('rounded-md px-2.5 py-1 text-[13px] font-semibold', filter === f.key ? 'bg-ink text-white' : 'text-ink-2 hover:bg-paper')}>
                  {f.label}
                </Link>
              ))}
            </nav>
          }>
          {trail.length === 0 ? <p className="p-4 text-[14px] text-muted">Nothing yet.</p> : (
            <ol className="max-h-[640px] overflow-y-auto">
              {trail.map((t) => (
                <li key={t.id} className="grid gap-x-4 gap-y-0.5 border-b border-line px-4 py-2.5 last:border-0 sm:grid-cols-[150px_minmax(0,1fr)]">
                  <span className="text-[12.5px] text-muted">{fmtDateTime(t.created_at)}</span>
                  <span className="min-w-0 text-[14px] text-ink">
                    <b>{t.actor_name}</b>: {t.message}
                    {t.event_name && <span className="text-muted"> ({t.event_name})</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </main>
    </>
  );
}
