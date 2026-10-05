import Link from 'next/link';
import type { ReactNode } from 'react';
import { flagInfo, groupInfo, TONE_CLASSES, type Tone } from '@/lib/domain/labels';
import type { Flag, Group } from '@/lib/domain/types';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export const btn = {
  base: 'inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 h-9 text-[14px] font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none',
  primary: 'bg-signal text-ink hover:bg-signal-hover border border-[#e0a800]',
  dark: 'bg-ink text-white hover:bg-[#1d3354] border border-ink',
  secondary: 'bg-white text-ink border border-line-strong hover:bg-paper',
  ghost: 'text-ink-2 hover:bg-paper hover:text-ink',
  danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50',
  small: 'h-8 px-2.5 text-[13px]',
};

export function ButtonLink({ href, variant = 'secondary', small, children, className, plain, ...rest }: {
  href: string; variant?: 'primary' | 'dark' | 'secondary' | 'ghost' | 'danger'; small?: boolean; children: ReactNode; className?: string;
  /** Render a normal <a> (for files, downloads and API routes) instead of a client-side link. */
  plain?: boolean;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const cls = cx(btn.base, btn[variant], small && btn.small, className);
  if (plain) return <a href={href} className={cls} {...rest}>{children}</a>;
  return (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  );
}

export function Chip({ tone, children, title, className }: { tone: Tone; children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-[12.5px] font-semibold ring-1 ring-inset whitespace-nowrap', TONE_CLASSES[tone], className)}>
      {children}
    </span>
  );
}

export function StatusChip({ group, label }: { group: Group; label: string }) {
  return <Chip tone={groupInfo(group).tone}>{label}</Chip>;
}

export function FlagChip({ flag }: { flag: Flag | null }) {
  if (!flag) return null;
  const f = flagInfo(flag);
  if (flag === 'overdue' || flag === 'not_signed_off') {
    return (
      <span className="hazard inline-flex items-center rounded-[3px] px-1 py-[3px] text-[12px] font-bold whitespace-nowrap" title={f.label}>
        <span>{f.label}</span>
      </span>
    );
  }
  return <Chip tone={f.tone}>{f.label}</Chip>;
}

export function Plate({ children, tone = 'ink', className }: { children: ReactNode; tone?: 'ink' | 'light'; className?: string }) {
  return (
    <span className={cx(
      'plate inline-flex items-center rounded-[4px] px-1.5 py-[1px] text-[13px] leading-5',
      tone === 'ink' ? 'bg-ink text-white' : 'bg-white text-ink ring-1 ring-inset ring-line-strong',
      className,
    )}>
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight text-ink">{title}</h1>
        {subtitle && <div className="mt-1 text-[14.5px] text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, className, padded = true, id }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean; id?: string;
}) {
  return (
    <section id={id} className={cx('min-w-0 rounded-[10px] border border-line bg-surface', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3">
          {title && <h2 className="text-[17px] font-semibold text-ink">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-line-strong bg-white px-6 py-10 text-center">
      <p className="text-[17px] font-semibold text-ink">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-[14.5px] text-muted">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const cls = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    warn: 'border-amber-300 bg-signal-soft text-ink',
    error: 'border-red-200 bg-red-50 text-red-800',
    ok: 'border-green-200 bg-green-50 text-green-900',
  }[tone];
  return <div className={cx('rounded-md border px-3.5 py-2.5 text-[14px]', cls)} role={tone === 'error' ? 'alert' : undefined}>{children}</div>;
}

export function Thumb({ src, alt, size = 44, className }: { src: string | null; alt: string; size?: number; className?: string }) {
  if (!src) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size }}
        className={cx('inline-flex shrink-0 items-center justify-center rounded-[6px] border border-dashed border-line-strong bg-paper text-[10px] font-semibold text-muted', className)}
      >
        No art
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={size} height={size} loading="lazy"
      style={{ width: size, height: size }}
      className={cx('shrink-0 rounded-[6px] border border-line bg-white object-contain', className)} />
  );
}

export const inputCls =
  'block w-full rounded-md border border-line-strong bg-white px-3 h-10 text-[15px] text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none disabled:bg-paper disabled:text-muted';
export const textareaCls =
  'block w-full rounded-md border border-line-strong bg-white px-3 py-2 text-[15px] text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none';
export const labelCls = 'mb-1 block text-[13.5px] font-semibold text-ink-2';
export const helpCls = 'mt-1 text-[12.5px] text-muted';

export function Field({ label, htmlFor, help, children, className }: { label: string; htmlFor?: string; help?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={labelCls}>{label}</label>
      {children}
      {help && <p className={helpCls}>{help}</p>}
    </div>
  );
}

export function money(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
