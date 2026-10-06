import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getCurrentEvent } from '@/lib/data/load';
import type { SupplierRow } from '@/lib/domain/types';
import { canEdit } from '@/lib/domain/permissions';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Chip, Empty, Field, inputCls, money, PageHeader, Panel, textareaCls } from '@/components/ui';
import { deleteSupplier, saveSupplier } from '@/app/actions/settings';

export const metadata: Metadata = { title: 'Suppliers' };

const LISTS = [
  { key: 'works_on_os', label: 'Organiser signage' },
  { key: 'works_on_ss', label: 'Sponsor signage' },
  { key: 'works_on_si', label: 'Sponsor items' },
] as const;

const SCOPE_EXAMPLE = 'e.g. Print and install all hall entrance and hanging banners (PVC and mesh). Deliver to ExCeL by 8 May, install during build-up, remove at breakdown. Prices as quote Q-1042.';

function SupplierFields({ s }: { s?: SupplierRow }) {
  const p = s ? `sp-${s.id}-` : 'sp-new-';
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Supplier name" htmlFor={`${p}name`}><input id={`${p}name`} name="name" required defaultValue={s?.name ?? ''} className={inputCls} /></Field>
        <Field label="Contact" htmlFor={`${p}contact`}><input id={`${p}contact`} name="contact_name" defaultValue={s?.contact_name ?? ''} className={inputCls} /></Field>
        <Field label="Email" htmlFor={`${p}email`}><input id={`${p}email`} name="email" type="email" defaultValue={s?.email ?? ''} className={inputCls} /></Field>
        <Field label="Phone" htmlFor={`${p}phone`}><input id={`${p}phone`} name="phone" defaultValue={s?.phone ?? ''} className={inputCls} /></Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-[13.5px] font-semibold text-ink-2">Works on</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {LISTS.map((l) => (
            <label key={l.key} className="flex items-center gap-2 text-[14.5px] text-ink">
              <input type="checkbox" name={l.key} defaultChecked={s ? s[l.key] : true} className="h-4 w-4 accent-[#13233b]" /> {l.label}
            </label>
          ))}
        </div>
        <p className="mt-1 text-[12.5px] text-muted">Lines on these lists suggest this supplier first.</p>
      </fieldset>
      <Field label="Scope of work" htmlFor={`${p}scope`}
        help="What they’re contracted to do: items, quantities, deadlines, delivery, install and removal, and the quote it’s based on.">
        <textarea id={`${p}scope`} name="scope_of_work" rows={4} maxLength={4000} defaultValue={s?.scope_of_work ?? ''}
          placeholder={SCOPE_EXAMPLE} className={textareaCls} />
      </Field>
      <div className="grid gap-3 lg:grid-cols-2">
        <Field label="Link to the signed scope of work (optional)" htmlFor={`${p}link`} help="SharePoint, OneDrive or Google Drive link.">
          <input id={`${p}link`} name="scope_link" type="url" placeholder="https://" defaultValue={s?.scope_link ?? ''} className={inputCls} />
        </Field>
        <Field label="Notes (optional)" htmlFor={`${p}notes`}>
          <input id={`${p}notes`} name="notes" defaultValue={s?.notes ?? ''} className={inputCls} />
        </Field>
      </div>
    </div>
  );
}

export default async function SuppliersPage() {
  const user = await requireUser();
  const sql = await db();
  const event = await getCurrentEvent();
  const [suppliers, usage] = await Promise.all([
    sql<SupplierRow[]>`select * from suppliers order by lower(name)`,
    event
      ? sql<{ supplier_id: string; n: number; cost: number }[]>`
          select supplier_id, count(*)::int as n, coalesce(sum(unit_cost * greatest(coalesce(qty, 1), 1)), 0)::numeric as cost
          from items where event_id = ${event.id} and supplier_id is not null and not cancelled group by supplier_id`
      : Promise.resolve([]),
  ]);
  const used = new Map(usage.map((u) => [u.supplier_id, u]));
  const editable = canEdit(user);
  return (
    <>
      <PageHeader title="Suppliers"
        subtitle="Printers, riggers and promo-item suppliers, and what each one is contracted to do." />
      <div className="space-y-6">
      {editable && (
        <Panel title="Add a supplier">
          <ActionForm action={saveSupplier} resetOnSuccess className="space-y-4">
            <SupplierFields />
            <SubmitButton small>Add supplier</SubmitButton>
          </ActionForm>
        </Panel>
      )}
      {suppliers.length === 0 ? <Empty title="No suppliers yet">Add printers, promo-item suppliers and riggers, with what each one is contracted to do, so lines can be assigned to them.</Empty> : (
        <Panel title={`Suppliers (${suppliers.length})`} padded={false}>
          <ul>
            {suppliers.map((s) => {
              const u = used.get(s.id);
              const contact = [s.contact_name, s.phone].filter(Boolean).join(', ');
              return (
                <li key={s.id} id={`supplier-${s.id}`} className="border-b border-line p-4 last:border-0">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <h3 className="text-[17px] font-semibold text-ink">{s.name}</h3>
                      {(contact || s.email) && (
                        <p className="break-words text-[13.5px] text-muted">
                          {contact}{contact && s.email ? ', ' : ''}
                          {s.email && <a href={`mailto:${s.email}`} className="underline underline-offset-2">{s.email}</a>}
                        </p>
                      )}
                    </div>
                    <ul className="flex flex-wrap gap-1.5" aria-label="Works on">
                      {LISTS.filter((l) => s[l.key]).map((l) => <li key={l.key}><Chip tone="blue">{l.label}</Chip></li>)}
                    </ul>
                  </div>

                  <div className="mt-2.5">
                    <p className="text-[12.5px] font-semibold text-ink-2">Scope of work</p>
                    {s.scope_of_work
                      ? <p className="max-w-[80ch] whitespace-pre-wrap text-[14.5px] text-ink">{s.scope_of_work}</p>
                      : <p className="text-[14px] text-amber-800">No scope of work yet.{editable ? ' Add it under Edit.' : ''}</p>}
                    {s.scope_link && (
                      <a href={s.scope_link} target="_blank" rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[14px] font-semibold text-ink underline underline-offset-2">
                        Signed scope of work <ExternalLink size={14} aria-hidden />
                      </a>
                    )}
                  </div>

                  <p className="mt-2 text-[13.5px] text-ink-2">
                    {u ? <>On {u.n} line{u.n === 1 ? '' : 's'} in {event!.name}{u.cost ? ` (${money(u.cost)})` : ''}. <Link href={`/schedule/all?supplier=${s.id}`} className="font-semibold text-ink underline underline-offset-2">View lines</Link></>
                      : event ? <>Not on any lines in {event.name} yet.</> : null}
                  </p>
                  {s.notes && <p className="mt-1 text-[13.5px] text-muted">Notes: {s.notes}</p>}

                  {editable && (
                    <details className="mt-3">
                      <summary className="inline-flex cursor-pointer list-none items-center rounded-md border border-line-strong bg-white px-2.5 py-1 text-[13px] font-semibold text-ink hover:bg-paper [&::-webkit-details-marker]:hidden">
                        Edit
                      </summary>
                      <div className="mt-3 flex flex-wrap items-start gap-3 rounded-md border border-line bg-paper/60 p-3">
                        <ActionForm action={saveSupplier} className="min-w-0 flex-1 space-y-3">
                          <input type="hidden" name="supplier_id" value={s.id} />
                          <SupplierFields s={s} />
                          <SubmitButton variant="dark" small>Save</SubmitButton>
                        </ActionForm>
                        {canEdit(user) && (
                          <ActionForm action={deleteSupplier} confirm={`Remove ${s.name}?`}>
                            <input type="hidden" name="supplier_id" value={s.id} />
                            <SubmitButton variant="ghost" small pendingText="…">Remove</SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      </div>
    </>
  );
}
