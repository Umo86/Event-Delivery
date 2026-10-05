import 'server-only';
import type { Sql } from '@/lib/db';
import { addDays } from '@/lib/dates';

export const DEFAULT_STAGES = [
  { name: 'Operations', uses_account_manager: false, applies_os: true, applies_ss: true, applies_si: true },
  { name: 'Marketing', uses_account_manager: false, applies_os: true, applies_ss: true, applies_si: true },
  { name: 'Sponsor', uses_account_manager: true, applies_os: false, applies_ss: true, applies_si: true },
  { name: 'Final sign-off', uses_account_manager: false, applies_os: true, applies_ss: true, applies_si: true },
];

/** Suggested default deadlines, counted back from the opening day. */
export function suggestedDeadlines(showOpen: string | null) {
  if (!showOpen) return { art_due_os: null, print_due_os: null, art_due_ss: null, print_due_ss: null, art_due_si: null, print_due_si: null };
  return {
    art_due_os: addDays(showOpen, -42),
    print_due_os: addDays(showOpen, -21),
    art_due_ss: addDays(showOpen, -56),
    print_due_ss: addDays(showOpen, -21),
    art_due_si: addDays(showOpen, -70),
    print_due_si: addDays(showOpen, -56),
  };
}

export async function createDefaultEvent(sql: Sql, _adminId: string): Promise<string> {
  const showOpen = '2027-05-11';
  const d = suggestedDeadlines(showOpen);
  const [ev] = await sql<{ id: string }[]>`
    insert into events (name, venue, show_open, show_close, budget, warn_days, turnaround_days,
      art_due_os, print_due_os, art_due_ss, print_due_ss, art_due_si, print_due_si)
    values ('UKCW London 2027', 'ExCeL London', ${showOpen}, '2027-05-13', null, 7, 3,
      ${d.art_due_os}, ${d.print_due_os}, ${d.art_due_ss}, ${d.print_due_ss}, ${d.art_due_si}, ${d.print_due_si})
    returning id`;
  let pos = 1;
  for (const s of DEFAULT_STAGES) {
    await sql`insert into stages (event_id, position, name, uses_account_manager, applies_os, applies_ss, applies_si)
              values (${ev.id}, ${pos++}, ${s.name}, ${s.uses_account_manager}, ${s.applies_os}, ${s.applies_ss}, ${s.applies_si})`;
  }
  return ev.id;
}
