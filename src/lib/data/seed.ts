import 'server-only';
import type { Sql } from '@/lib/db';
import { suggestedDeadlines } from '@/lib/domain/deadlines';

export { suggestedDeadlines };

export const DEFAULT_STAGES = [
  { name: 'Operations', department: 'Operations', uses_account_manager: false, applies_os: true, applies_ss: true, applies_si: true },
  { name: 'Marketing', department: 'Marketing', uses_account_manager: false, applies_os: true, applies_ss: true, applies_si: true },
  { name: 'Sponsor', department: null, uses_account_manager: true, applies_os: false, applies_ss: true, applies_si: true },
  { name: 'Final sign-off', department: 'Operations', uses_account_manager: false, applies_os: true, applies_ss: true, applies_si: true },
];

export async function createDefaultEvent(sql: Sql, _adminId: string): Promise<string> {
  const showOpen = '2027-05-11';
  const d = suggestedDeadlines(showOpen);
  const [ev] = await sql<{ id: string }[]>`
    insert into events (name, venue, show_open, show_close, budget, warn_days, turnaround_days,
      art_due_os, print_due_os, art_due_ss, print_due_ss, art_due_si, print_due_si)
    values ('UKCW London 2027', 'ExCeL London', ${showOpen}, '2027-05-13', null, 7, 3,
      ${d.art_due_os}, ${d.print_due_os}, ${d.art_due_ss}, ${d.print_due_ss}, ${d.art_due_si}, ${d.print_due_si})
    returning id`;
  const depts = await sql<{ id: string; name: string }[]>`select id, name from departments`;
  const deptId = (name: string | null) => (name ? depts.find((d) => d.name.toLowerCase() === name.toLowerCase())?.id ?? null : null);
  let pos = 1;
  for (const s of DEFAULT_STAGES) {
    await sql`insert into stages (event_id, position, name, department_id, uses_account_manager, applies_os, applies_ss, applies_si)
              values (${ev.id}, ${pos++}, ${s.name}, ${deptId(s.department)}, ${s.uses_account_manager}, ${s.applies_os}, ${s.applies_ss}, ${s.applies_si})`;
  }
  await sql`insert into event_departments (event_id, department_id)
            select distinct ${ev.id}::uuid, department_id from stages where event_id = ${ev.id} and department_id is not null
            on conflict do nothing`;
  return ev.id;
}
