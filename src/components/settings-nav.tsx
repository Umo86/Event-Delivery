'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './ui';

const ITEMS = [
  { href: '/settings', label: 'Event', super: false },
  { href: '/settings/stages', label: 'Sign-off stages', super: false },
  { href: '/settings/departments', label: 'Departments', super: false },
  { href: '/settings/lists', label: 'Dropdown lists', super: false },
  { href: '/settings/events', label: 'Events', super: false },
  { href: '/settings/system', label: 'System', super: true },
];

export function SettingsNav({ superAdmin }: { superAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Settings">
      {ITEMS.filter((i) => superAdmin || !i.super).map((i) => {
        const on = pathname === i.href;
        return (
          <Link key={i.href} href={i.href} aria-current={on ? 'page' : undefined}
            className={cx('-mb-px whitespace-nowrap border-b-[3px] px-3 py-2 text-[15px] font-semibold',
              on ? 'border-signal text-ink' : 'border-transparent text-muted hover:text-ink')}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
