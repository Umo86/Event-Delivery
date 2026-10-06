import type { Bundle } from '@/lib/data/load';
import { ARTWORK_BY } from '@/lib/domain/labels';
import { defaultArtworkDue, defaultPrintDeadline } from '@/lib/domain/engine';
import { fmtDate } from '@/lib/dates';
import type { Category, ItemRow } from '@/lib/domain/types';
import { ActionForm, SubmitButton } from './forms';
import { ButtonLink, Field, inputCls, textareaCls } from './ui';
import { createItem, updateItem } from '@/app/actions/items';
import { SupplierOptions } from './supplier-options';

function hallList(bundle: Bundle) {
  const v = bundle.event.venue;
  return bundle.lists[v === 'NEC Birmingham' ? 'hall_nec' : v === 'ExCeL London' ? 'hall_excel' : 'hall_other'] ?? [];
}

export function ItemForm({ bundle, category, item, cancelHref, defaultSponsorId }: {
  bundle: Bundle; category: Category; item?: ItemRow; cancelHref: string; defaultSponsorId?: string;
}) {
  const ev = bundle.event;
  const isSponsorCat = category !== 'organiser_signage';
  const v = (k: keyof ItemRow) => (item ? ((item[k] ?? '') as string | number) : '');
  const typeList = category === 'sponsor_item' ? bundle.lists.item_type : bundle.lists.sign_type;
  const defArt = defaultArtworkDue(ev, category);
  const defPrint = defaultPrintDeadline(ev, category);
  const section = 'rounded-[10px] border border-line bg-white p-4 sm:p-5';
  const h2 = 'mb-4 text-[18px] font-semibold text-ink';
  const grid = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4';

  return (
    <ActionForm action={item ? updateItem : createItem} className="space-y-5">
      <input type="hidden" name="event_id" value={ev.id} />
      <input type="hidden" name="category" value={category} />
      {item && <input type="hidden" name="item_id" value={item.id} />}

      <datalist id="dl-type">{(typeList ?? []).map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="dl-hall">{hallList(bundle).map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="dl-zone">{(bundle.lists.zone ?? []).map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="dl-position">{(bundle.lists.position ?? []).map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="dl-material">{(bundle.lists.material ?? []).map((x) => <option key={x} value={x} />)}</datalist>

      <section className={section}>
        <h2 className={h2}>What and where</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Description" htmlFor="description" help="A short name people will recognise, like “Hall S1 entrance banner”.">
            <input id="description" name="description" required maxLength={200} defaultValue={v('description')} className={inputCls} />
          </Field>
          <Field label={isSponsorCat ? 'Sponsor' : 'Sponsor (only if their logo is on it)'} htmlFor="sponsor_id"
            help={bundle.sponsors.length ? undefined : 'Add sponsors on the Sponsors page first.'}>
            <select id="sponsor_id" name="sponsor_id" defaultValue={item ? v('sponsor_id') : defaultSponsorId ?? ''} required={isSponsorCat} className={inputCls}>
              <option value="">{isSponsorCat ? 'Choose a sponsor' : 'No sponsor'}</option>
              {bundle.sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Type" htmlFor="item_type" help="Pick from the list or type your own.">
            <input id="item_type" name="item_type" list="dl-type" defaultValue={v('item_type')} className={inputCls} />
          </Field>
          <Field label="Material / spec" htmlFor="material">
            <input id="material" name="material" list="dl-material" defaultValue={v('material')} className={inputCls} />
          </Field>
        </div>
        <Field label="Wording / content" htmlFor="wording" className="mt-4">
          <textarea id="wording" name="wording" rows={2} defaultValue={v('wording')} className={textareaCls} />
        </Field>
        <div className={`${grid} mt-4`}>
          <Field label="Hall" htmlFor="hall"><input id="hall" name="hall" list="dl-hall" defaultValue={v('hall')} className={inputCls} /></Field>
          <Field label="Zone / area" htmlFor="zone"><input id="zone" name="zone" list="dl-zone" defaultValue={v('zone')} className={inputCls} /></Field>
          <Field label="Exact location" htmlFor="location_detail"><input id="location_detail" name="location_detail" defaultValue={v('location_detail')} placeholder="Stand, rigging point…" className={inputCls} /></Field>
          <Field label="Position" htmlFor="position"><input id="position" name="position" list="dl-position" defaultValue={v('position')} className={inputCls} /></Field>
        </div>
        <div className={`${grid} mt-4`}>
          <Field label="Width (mm)" htmlFor="width_mm"><input id="width_mm" name="width_mm" type="number" min={0} inputMode="numeric" defaultValue={v('width_mm')} className={inputCls} /></Field>
          <Field label="Height (mm)" htmlFor="height_mm"><input id="height_mm" name="height_mm" type="number" min={0} inputMode="numeric" defaultValue={v('height_mm')} className={inputCls} /></Field>
          <Field label="Sides" htmlFor="sides">
            <select id="sides" name="sides" defaultValue={v('sides')} className={inputCls}>
              <option value="">Not set</option><option value="single">Single-sided</option><option value="double">Double-sided</option>
            </select>
          </Field>
          <Field label="Quantity" htmlFor="qty"><input id="qty" name="qty" type="number" min={0} inputMode="numeric" defaultValue={v('qty')} className={inputCls} /></Field>
        </div>
      </section>

      <section className={section}>
        <h2 className={h2}>Artwork</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Who supplies the artwork" htmlFor="artwork_by" help="“Not required” starts sign-off straight away.">
            <select id="artwork_by" name="artwork_by" defaultValue={v('artwork_by') || (isSponsorCat ? 'sponsor' : 'in_house')} className={inputCls}>
              {ARTWORK_BY.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </Field>
          <Field label="Artwork due" htmlFor="artwork_due" help={defArt ? `Leave blank to use the show’s default (${fmtDate(defArt, 'long')}).` : 'Leave blank to use the show’s default.'}>
            <input id="artwork_due" name="artwork_due" type="date" defaultValue={v('artwork_due')} className={inputCls} />
          </Field>
          <Field label="Link to full-size files (optional)" htmlFor="artwork_link" help="SharePoint, Dropbox or WeTransfer link to print-ready files.">
            <input id="artwork_link" name="artwork_link" type="url" placeholder="https://" defaultValue={v('artwork_link')} className={inputCls} />
          </Field>
        </div>
      </section>

      <section className={section}>
        <h2 className={h2}>Production and cost</h2>
        <div className={grid}>
          <Field label="Supplier" htmlFor="supplier_id">
            <select id="supplier_id" name="supplier_id" defaultValue={v('supplier_id')} className={inputCls}>
              <option value="">Not chosen</option>
              <SupplierOptions suppliers={bundle.suppliers} category={category} />
            </select>
          </Field>
          <Field label="Print / order deadline" htmlFor="print_deadline" help={defPrint ? `Blank uses ${fmtDate(defPrint, 'long')}.` : undefined}>
            <input id="print_deadline" name="print_deadline" type="date" defaultValue={v('print_deadline')} className={inputCls} />
          </Field>
          <Field label="Delivery to venue" htmlFor="delivery_date"><input id="delivery_date" name="delivery_date" type="date" defaultValue={v('delivery_date')} className={inputCls} /></Field>
          <Field label="Install by" htmlFor="install_date"><input id="install_date" name="install_date" type="date" defaultValue={v('install_date')} className={inputCls} /></Field>
          <Field label="PO number" htmlFor="po_number"><input id="po_number" name="po_number" defaultValue={v('po_number')} className={inputCls} /></Field>
          <Field label="Unit cost (£)" htmlFor="unit_cost" help="Total = unit cost × quantity.">
            <input id="unit_cost" name="unit_cost" inputMode="decimal" defaultValue={v('unit_cost')} className={inputCls} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="notes" className="mt-4">
          <textarea id="notes" name="notes" rows={3} defaultValue={v('notes')} className={textareaCls} />
        </Field>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton>{item ? 'Save changes' : 'Add line'}</SubmitButton>
        <ButtonLink href={cancelHref} variant="ghost">Cancel</ButtonLink>
      </div>
    </ActionForm>
  );
}
