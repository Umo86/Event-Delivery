import type { Metadata } from 'next';
import { requireManager } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { canEdit } from '@/lib/domain/permissions';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Intro, Panel, textareaCls } from '@/components/ui';
import { saveList } from '@/app/actions/settings';

export const metadata: Metadata = { title: 'Dropdown lists' };

const LISTS = [
  { key: 'sign_type', title: 'Sign types', help: 'Type suggestions for organiser and sponsor signage.' },
  { key: 'item_type', title: 'Sponsorship item types', help: 'Type suggestions for sponsorship items.' },
  { key: 'distribution', title: 'Distribution methods', help: 'How sponsorship items reach visitors.' },
  { key: 'zone', title: 'Zones and areas', help: 'Show areas, features and theatres.' },
  { key: 'material', title: 'Materials', help: '' },
  { key: 'position', title: 'Positions', help: 'How a sign is fixed or displayed.' },
  { key: 'hall_excel', title: 'ExCeL London halls', help: 'Shown when the show’s venue is ExCeL London.' },
  { key: 'hall_nec', title: 'NEC Birmingham halls', help: 'Shown when the show’s venue is NEC Birmingham.' },
  { key: 'hall_other', title: 'Other venue halls', help: 'Shown when the venue is set to Other.' },
];

export default async function ListsPage() {
  const user = await requireManager();
  const sql = await db();
  const rows = await sql<{ list_key: string; value: string }[]>`select list_key, value from list_options order by list_key, sort, lower(value)`;
  const byKey: Record<string, string[]> = {};
  for (const r of rows) (byKey[r.list_key] ??= []).push(r.value);
  const editable = canEdit(user);
  return (
    <div className="space-y-4">
      <Intro>
        Suggestions offered in the line form, shared by every show. People can still type something that isn’t on a list. One option per line.
      </Intro>
      <div className="grid gap-4 lg:grid-cols-2">
        {LISTS.map((l) => (
          <Panel key={l.key} title={l.title}>
            <ActionForm action={saveList} className="space-y-2">
              <input type="hidden" name="list_key" value={l.key} />
              {l.help && <p className="text-[13px] text-muted">{l.help}</p>}
              <label htmlFor={`list-${l.key}`} className="sr-only">{l.title}</label>
              <textarea id={`list-${l.key}`} name="values" rows={8} disabled={!editable} defaultValue={(byKey[l.key] ?? []).join('\n')} className={textareaCls} />
              {editable && <SubmitButton variant="dark" small>Save list</SubmitButton>}
            </ActionForm>
          </Panel>
        ))}
      </div>
    </div>
  );
}
