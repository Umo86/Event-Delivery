import 'server-only';
import { cache } from 'react';
import { db, type Sql } from '@/lib/db';

/** Platform-wide switches, stored in app_settings. */
export const SETTING = {
  sponsorLinks: 'sponsor_links',
  /** While 'on', only super admins can sign in or use the platform. */
  maintenance: 'maintenance',
} as const;

export async function readSetting(sql: Sql, key: string): Promise<string | null> {
  const r = await sql<{ value: string }[]>`select value from app_settings where key = ${key}`;
  return r[0]?.value ?? null;
}

export async function writeSetting(sql: Sql, key: string, value: string): Promise<void> {
  await sql`insert into app_settings (key, value) values (${key}, ${value})
            on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

/**
 * Sponsor approval links are the only way into the platform without an account. Admins can switch them off;
 * while off, existing links stop working too (they work again if links are switched back on, until they expire).
 */
export const sponsorLinksEnabled = cache(async (): Promise<boolean> => {
  const sql = await db();
  return (await readSetting(sql, SETTING.sponsorLinks)) !== 'off';
});

export const maintenanceOn = cache(async (): Promise<boolean> => {
  const sql = await db();
  return (await readSetting(sql, SETTING.maintenance)) === 'on';
});
