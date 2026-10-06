'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './ui';

/** The row of tabs under a page title (Show setup, Admin). */
export function TabNav({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line" aria-label={label}>
      {items.map((i) => {
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
