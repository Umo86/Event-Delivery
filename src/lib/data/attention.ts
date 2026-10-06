import 'server-only';
import type { Sql } from '@/lib/db';
import { loadBundle } from './load';
import { personStatus } from '@/lib/domain/access';
import { maintenanceOn, sponsorLinksEnabled } from '@/lib/settings';

export interface AttentionItem { text: string; href: string; action: string }

/** Where platform switches live. */
export const PLATFORM_HREF = '/gs';
export const personHref = (id: string) => `/admin?person=${id}#person-${id}`;

/**
 * Things a super admin should sort out, most important first: platform switches that are in an unusual state,
 * people who can't get in, and sign-off steps (in the current show) that nobody can act on.
 */
export async function loadAttention(sql: Sql, eventId: string | null): Promise<AttentionItem[]> {
  const [people, bundle, maintenance, linksOn] = await Promise.all([
    sql<{ id: string; full_name: string; role: string; active: boolean; is_demo: boolean; must_change_password: boolean;
      last_login_at: Date | null; temp_password_expires_at: Date | null; locked_until: Date | null }[]>`
      select id, full_name, role, active, is_demo, must_change_password, last_login_at, temp_password_expires_at, locked_until
      from users order by lower(full_name)`,
    eventId ? loadBundle(eventId) : Promise.resolve(null),
    maintenanceOn(),
    sponsorLinksEnabled(),
  ]);
  const out: AttentionItem[] = [];

  if (maintenance) out.push({ text: 'Maintenance mode is on, so only super admins can sign in.', href: PLATFORM_HREF, action: 'Turn off' });
  if (!linksOn) out.push({ text: 'Sponsor approval links are switched off, so sponsors can’t approve their own artwork.', href: PLATFORM_HREF, action: 'Turn on' });

  for (const p of people) {
    if (p.is_demo && p.active) {
      out.push({ text: `The demo login is on the sign-in page, so anyone with the link can sign in as ${p.full_name}.`, href: personHref(p.id), action: 'Open' });
    }
    if (personStatus(p) === 'invite_expired') out.push({ text: `${p.full_name}’s invite has expired.`, href: personHref(p.id), action: 'New invite' });
    if (p.active && p.locked_until && new Date(p.locked_until) > new Date()) {
      out.push({ text: `${p.full_name} is locked out after too many wrong passwords.`, href: personHref(p.id), action: 'Open' });
    }
  }

  const byId = new Map(people.map((p) => [p.id, p]));
  const cantSignOff = (id: string | null) => {
    const p = id ? byId.get(id) : null;
    return p && (!p.active || p.role === 'user') ? p : null;
  };
  for (const s of (bundle?.stages ?? []).filter((x) => !x.uses_account_manager)) {
    if (s.approver_ids.length === 0) {
      out.push({ text: `The ${s.name} stage has no approver.`, href: '/settings/stages', action: 'Choose' });
      continue;
    }
    for (const aid of s.approver_ids) {
      const p = cantSignOff(aid);
      if (p) out.push({ text: `${p.full_name} approves ${s.name} but ${p.active ? 'is a User' : 'is deactivated'}.`, href: personHref(p.id), action: 'Open' });
    }
  }
  const sponsors = bundle?.sponsors ?? [];
  const noManager = sponsors.filter((s) => !s.account_manager_id).length;
  if (noManager) out.push({ text: `${noManager} sponsor${noManager === 1 ? ' has' : 's have'} no account manager.`, href: '/sponsors', action: 'View' });
  for (const s of sponsors) {
    const p = cantSignOff(s.account_manager_id);
    if (p) out.push({ text: `${p.full_name} manages ${s.name} but ${p.active ? 'is a User' : 'is deactivated'}.`, href: personHref(p.id), action: 'Open' });
  }
  return out;
}
