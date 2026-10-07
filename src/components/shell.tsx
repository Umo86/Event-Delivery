'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  CalendarRange, Gauge, Handshake, History, Inbox, LayoutDashboard, LogOut, Menu, Package, Settings, Signpost, Flag, Truck, UserRound, UsersRound, X,
} from 'lucide-react';
import { Mark } from './brand';
import { cx } from './ui';

export interface ShellProps {
  appName: string;
  user: { name: string; role: string; superAdmin: boolean };
  /** Maintenance mode is on (only super admins can be signed in while it is). */
  maintenance: boolean;
  events: { id: string; name: string; archived: boolean }[];
  currentEvent: { id: string; name: string; detail: string } | null;
  myCount: number;
  counts: { os: number; ss: number; si: number };
  switchEvent: (fd: FormData) => Promise<void>;
  logout: () => Promise<void>;
  children: React.ReactNode;
}

type NavItem = { href: string; label: string; icon: typeof Inbox; key: string };

/** The menu, grouped, with each role seeing only what it can use. */
function navFor(role: string): { group: string; items: NavItem[] }[] {
  const manager = role === 'super_admin' || role === 'manager';
  const home = role === 'super_admin' ? 'Control centre' : role === 'user' ? 'Overview' : 'Dashboard';
  const groups: { group: string; items: NavItem[] }[] = [
    { group: 'Home', items: [
      { href: '/dashboard', label: home, icon: LayoutDashboard, key: 'dashboard' },
      // Every show at a glance, and where new shows are created (managers and super admins)
      ...(manager ? [{ href: '/shows', label: 'All shows', icon: CalendarRange, key: 'shows' }] : []),
      { href: '/inbox', label: manager ? 'My actions' : 'My tasks', icon: Inbox, key: 'inbox' },
    ] },
    { group: 'Signage', items: [
      { href: '/schedule/os', label: 'Organiser signage', icon: Signpost, key: 'os' },
      { href: '/schedule/ss', label: 'Sponsor signage', icon: Flag, key: 'ss' },
      { href: '/schedule/si', label: 'Sponsor items', icon: Package, key: 'si' },
    ] },
    { group: 'Show', items: [
      { href: '/sponsors', label: 'Sponsors', icon: Handshake, key: 'sponsors' },
      { href: '/suppliers', label: 'Suppliers', icon: Truck, key: 'suppliers' },
      ...(manager ? [{ href: '/settings', label: 'Show setup', icon: Settings, key: 'settings' }] : []),
    ] },
  ];
  if (role === 'super_admin') {
    groups.push({ group: 'Admin', items: [
      { href: '/admin', label: 'People', icon: UsersRound, key: 'admin' },
      { href: '/admin/platform', label: 'Platform', icon: Gauge, key: 'platform' },
      { href: '/admin/activity', label: 'Activity', icon: History, key: 'activity' },
    ] });
  }
  return groups;
}

export function AppShell(p: ShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const groups = navFor(p.user.role);
  // The most specific item that matches the current page is the active one
  const activeHref = groups.flatMap((g) => g.items.map((i) => i.href))
    .filter((h) => pathname === h || pathname.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0];

  const nav = (
    <nav className="flex h-full flex-col" aria-label="Main">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <Mark />
        <span className="font-display text-[20px] font-semibold tracking-wide text-white">{p.appName}</span>
      </div>

      {p.currentEvent && (
        <form action={p.switchEvent} className="mx-3 mb-3 rounded-lg bg-white/[0.06] p-3">
          <input type="hidden" name="back" value={pathname} />
          <label htmlFor="event-switch" className="block text-[12px] font-medium text-white/60">Show</label>
          <select
            key={p.currentEvent.id /* remount so the shown event always matches the one in use */}
            id="event-switch"
            name="event_id"
            defaultValue={p.currentEvent.id}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="mt-0.5 w-full cursor-pointer appearance-none truncate bg-transparent pr-2 font-display text-[17px] font-semibold text-white focus:outline-none"
          >
            {p.events.map((e) => (
              <option key={e.id} value={e.id} className="text-ink">
                {e.name}{e.archived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
          <p className="mt-0.5 text-[12.5px] text-white/60">{p.currentEvent.detail}</p>
          <noscript><button className="mt-2 text-[12px] underline">Switch</button></noscript>
        </form>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        {groups.map((g) => (
          <div key={g.group}>
            <p className="px-3 pb-1 text-[12px] font-medium text-white/45">{g.group}</p>
            <ul className="space-y-0.5">
              {g.items.map((n) => {
                const active = n.href === activeHref;
                const count = n.key === 'inbox' ? p.myCount : n.key === 'os' || n.key === 'ss' || n.key === 'si' ? p.counts[n.key] : null;
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'flex items-center gap-3 rounded-md px-3 py-[7px] text-[15px] font-medium transition-colors',
                        active ? 'bg-signal text-ink' : 'text-white/80 hover:bg-white/[0.08] hover:text-white',
                      )}
                    >
                      <n.icon size={18} strokeWidth={2} aria-hidden />
                      <span className="flex-1">{n.label}</span>
                      {count !== null && count > 0 && (
                        <span className={cx(
                          'min-w-6 rounded-full px-1.5 text-center text-[12px] font-bold',
                          n.key === 'inbox' ? (active ? 'bg-ink text-signal' : 'bg-signal text-ink') : active ? 'bg-ink/10 text-ink' : 'bg-white/10 text-white/70',
                        )}>
                          {count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 p-3">
        <Link href="/account" className="flex items-center gap-3 rounded-md px-3 py-2 text-white/85 hover:bg-white/[0.08]">
          <UserRound size={18} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-semibold">{p.user.name}</span>
            <span className="block text-[12px] text-white/55">{p.user.role === 'super_admin' ? 'Super Admin' : p.user.role === 'manager' ? 'Manager' : 'User'}</span>
          </span>
        </Link>
        <form action={p.logout}>
          <button className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-[14.5px] text-white/70 hover:bg-white/[0.08] hover:text-white">
            <LogOut size={18} aria-hidden /> Sign out
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-[248px]">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[248px] bg-ink lg:block">{nav}</aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-ink px-4 text-white lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="-ml-1 rounded p-1.5 hover:bg-white/10">
          <Menu size={22} />
        </button>
        <span className="font-display text-[18px] font-semibold">{p.appName}</span>
        {p.myCount > 0 && (
          <Link href="/inbox" className="ml-auto rounded-full bg-signal px-2.5 py-0.5 text-[13px] font-bold text-ink">
            {p.myCount} for you
          </Link>
        )}
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-ink/50" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] overflow-y-auto bg-ink shadow-2xl">
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 rounded p-1 text-white/80 hover:bg-white/10">
              <X size={20} />
            </button>
            {nav}
          </div>
        </div>
      )}

      {p.maintenance && (
        <div className="no-print hazard px-4 py-1.5 text-center text-[13.5px] font-bold">
          <span>
            Maintenance mode is on: only super admins can use the platform.{' '}
            {pathname !== '/admin/platform' && <Link href="/admin/platform" className="underline underline-offset-2">Turn it off</Link>}
          </span>
        </div>
      )}
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{p.children}</main>
    </div>
  );
}
