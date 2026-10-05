import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { AuthError } from '@/lib/auth/session';
import { DatabaseNotConfiguredError } from '@/lib/db';

export type ActionResult = { ok: true; message?: string; data?: Record<string, unknown> } | { ok: false; error: string };

/** A message that is safe and useful to show the person. */
export class UserError extends Error {}

export async function run(fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    const r = await fn();
    return r ?? { ok: true };
  } catch (e) {
    unstable_rethrow(e); // let redirects and other framework signals through
    if (e instanceof UserError || e instanceof AuthError || e instanceof DatabaseNotConfiguredError) {
      return { ok: false, error: e.message };
    }
    const code = (e as { code?: string })?.code;
    if (code === '23505') return { ok: false, error: 'That already exists. Use a different name.' };
    console.error(e);
    return { ok: false, error: 'Something went wrong while saving. Please try again.' };
  }
}

// ---- FormData helpers -------------------------------------------------------
export function str(fd: FormData, key: string, max = 2000): string | null {
  const v = fd.get(key);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  if (t.length > max) throw new UserError(`"${key.replace(/_/g, ' ')}" is too long (max ${max} characters).`);
  return t;
}

export function required(fd: FormData, key: string, label: string, max = 500): string {
  const v = str(fd, key, max);
  if (!v) throw new UserError(`${label} is required.`);
  return v;
}

export function int(fd: FormData, key: string, label: string, opts: { min?: number; max?: number } = {}): number | null {
  const v = str(fd, key, 20);
  if (v === null) return null;
  const n = Number(v.replace(/,/g, ''));
  if (!Number.isInteger(n)) throw new UserError(`${label} must be a whole number.`);
  if (opts.min !== undefined && n < opts.min) throw new UserError(`${label} must be at least ${opts.min}.`);
  if (opts.max !== undefined && n > opts.max) throw new UserError(`${label} must be at most ${opts.max}.`);
  return n;
}

export function num(fd: FormData, key: string, label: string): number | null {
  const v = str(fd, key, 30);
  if (v === null) return null;
  const n = Number(v.replace(/[£,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) throw new UserError(`${label} must be a positive number.`);
  return Math.round(n * 100) / 100;
}

export function date(fd: FormData, key: string, label: string): string | null {
  const v = str(fd, key, 20);
  if (v === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new UserError(`${label} must be a date.`);
  return v;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === 'on' || v === 'true' || v === '1' || v === 'yes';
}

export function uuidOrNull(fd: FormData, key: string): string | null {
  const v = str(fd, key, 64);
  if (!v) return null;
  if (!/^[0-9a-f-]{36}$/i.test(v)) throw new UserError('Invalid selection.');
  return v;
}

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}
