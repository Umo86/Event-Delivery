'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Handshake, Inbox, LayoutDashboard, LogOut, Menu, Package, Settings, ShieldCheck, Signpost, Flag, UserRound, X,
} from 'lucide-react';
import { Mark } from './brand';
import { cx } from './ui';

export interface ShellProps {
  appName: string;
  user: { name: string; role: string };
  events: { id: string; name: string; archived: boolean }[];
  currentEvent: { id: string; name: string; detail: string } | null;
  myCount: number;
  counts: { os: number; ss: number; si: number };
  switchEvent: (fd: FormData) => Promise<void>;
  logout: () => Promise<void>;
  children: React.ReactNode;
}

const NAV = [
  { href: '/inbox', label: 'My actions', icon: Inbox, key: 'inbox' },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, key: 'dashboard' },
  { href: '/schedule/os', label: 'Organiser signage', icon: Signpost, key: 'os' },
  { href: '/schedule/ss', label: 'Sponsor signage', icon: Flag, key: 'ss' },
  { href: '/schedule/si', label: 'Sponsor items', icon: Package, key: 'si' },
  { href: '/sponsors', label: 'Sponsors', icon: Handshake, key: 'sponsors' },
  { href: '/settings', label: 'Settings', icon: Settings, key: 'settings' },
  { href: '/admin', label: 'Admin', icon: ShieldCheck, key: 'admin' },
] as const;

export function AppShell(p: ShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <nav className="flex h-full flex-col" aria-label="Main">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <Mark />
        <span className="font-display text-[20px] font-semibold tracking-wide text-white">{p.appName}</span>
      </div>

      {p.currentEvent && (
        <form action={p.switchEvent} className="mx-3 mb-3 rounded-lg bg-white/[0.06] p-3">
          <input type="hidden" name="back" value={pathname} />
          <label htmlFor="event-switch" className="block text-[12px] font-medium text-white/60">Event</label>
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

      <ul className="flex-1 space-y-0.5 px-3">
        {NAV.filter((n) => n.key !== 'admin' || p.user.role === 'admin').map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + '/');
          const count = n.key === 'inbox' ? p.myCount : n.key === 'os' || n.key === 'ss' || n.key === 'si' ? p.counts[n.key] : null;
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-[15px] font-medium transition-colors',
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

      <div className="border-t border-white/10 p-3">
        <Link href="/account" className="flex items-center gap-3 rounded-md px-3 py-2 text-white/85 hover:bg-white/[0.08]">
          <UserRound size={18} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-semibold">{p.user.name}</span>
            <span className="block text-[12px] capitalize text-white/55">{p.user.role}</span>
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

      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{p.children}</main>
    </div>
  );
}
