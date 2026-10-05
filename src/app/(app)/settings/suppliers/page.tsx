import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import type { SupplierRow } from '@/lib/domain/types';
import { canEdit, isAdmin } from '@/lib/domain/permissions';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Empty, Field, inputCls, Panel } from '@/components/ui';
import { deleteSupplier, saveSupplier } from '@/app/actions/settings';

export const metadata: Metadata = { title: 'Suppliers' };

function SupplierFields({ s }: { s?: SupplierRow }) {
  const p = s ? `sp-${s.id}-` : 'sp-new-';
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="Supplier name" htmlFor={`${p}name`}><input id={`${p}name`} name="name" required defaultValue={s?.name ?? ''} className={inputCls} /></Field>
      <Field label="Contact" htmlFor={`${p}contact`}><input id={`${p}contact`} name="contact_name" defaultValue={s?.contact_name ?? ''} className={inputCls} /></Field>
      <Field label="Email" htmlFor={`${p}email`}><input id={`${p}email`} name="email" type="email" defaultValue={s?.email ?? ''} className={inputCls} /></Field>
      <Field label="Phone" htmlFor={`${p}phone`}><input id={`${p}phone`} name="phone" defaultValue={s?.phone ?? ''} className={inputCls} /></Field>
      <Field label="Notes" htmlFor={`${p}notes`}><input id={`${p}notes`} name="notes" defaultValue={s?.notes ?? ''} className={inputCls} /></Field>
    </div>
  );
}

export default async function SuppliersPage() {
  const user = await requireUser();
  const sql = await db();
  const suppliers = await sql<SupplierRow[]>`select * from suppliers order by lower(name)`;
  const editable = canEdit(user);
  return (
    <div className="space-y-6">
      {editable && (
        <Panel title="Add a supplier">
          <ActionForm action={saveSupplier} resetOnSuccess className="space-y-3">
            <SupplierFields />
            <SubmitButton small>Add supplier</SubmitButton>
          </ActionForm>
        </Panel>
      )}
      {suppliers.length === 0 ? <Empty title="No suppliers yet">Add printers, promo-item suppliers and riggers so lines can be assigned to them.</Empty> : (
        <Panel title={`Suppliers (${suppliers.length})`} padded={false}>
          <ul>
            {suppliers.map((s) => (
              <li key={s.id} className="border-b border-line p-4 last:border-0">
                {editable ? (
                  <div className="flex flex-wrap items-end gap-3">
                    <ActionForm action={saveSupplier} className="min-w-0 flex-1 space-y-3">
                      <input type="hidden" name="supplier_id" value={s.id} />
                      <SupplierFields s={s} />
                      <SubmitButton variant="dark" small>Save</SubmitButton>
                    </ActionForm>
                    {isAdmin(user) && (
                      <ActionForm action={deleteSupplier} confirm={`Remove ${s.name}?`}>
                        <input type="hidden" name="supplier_id" value={s.id} />
                        <SubmitButton variant="ghost" small pendingText="…">Remove</SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                ) : (
                  <p className="text-[15px]"><b>{s.name}</b> <span className="text-muted">{[s.contact_name, s.email, s.phone].filter(Boolean).join(', ')}</span></p>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
