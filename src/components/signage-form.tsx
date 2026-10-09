'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Check, Info } from 'lucide-react';
import { fmtDate } from '@/lib/dates';
import { ARTWORK_BY_OFFERED, categoryInfo } from '@/lib/domain/labels';
import type { Category, ItemRow } from '@/lib/domain/types';
import { ActionForm, SubmitButton } from './forms';
import { btn, cx, Field, inputCls, money, textareaCls } from './ui';
import { createItem, updateItem } from '@/app/actions/items';

// One form for signage. Adding asks in order: which list, what it is, where it goes, size and print, artwork,
// production and cost, then a check before it's added. Editing shows the same steps all at once.
// Every step stays in the form (hidden ones are just out of sight), so nothing typed is lost when going back.

type SignageCategory = 'organiser_signage' | 'sponsor_signage';
type StepKey = 'list' | 'what' | 'where' | 'print' | 'artwork' | 'production' | 'check';

export interface SignageFormData {
  event: { id: string; name: string; venue: string; art_due_os: string | null; art_due_ss: string | null; print_due_os: string | null; print_due_ss: string | null };
  sponsors: { id: string; name: string }[];
  sections: { id: string; name: string }[];
  suppliers: { id: string; name: string; works_on_os: boolean; works_on_ss: boolean }[];
  lists: Record<string, string[]>;
}

const STEPS: { key: StepKey; title: string }[] = [
  { key: 'list', title: 'Which list' },
  { key: 'what', title: 'What it is' },
  { key: 'where', title: 'Where it goes' },
  { key: 'print', title: 'Size and print' },
  { key: 'artwork', title: 'Artwork' },
  { key: 'production', title: 'Production and cost' },
  { key: 'check', title: 'Check and add' },
];

const NEW_SECTION = '__new__';

export function SignageForm({ data, item, cancelHref, initialType, defaultSponsorId }: {
  data: SignageFormData;
  /** Editing this line (every step shown at once); otherwise adding a new one step by step. */
  item?: ItemRow;
  cancelHref: string;
  initialType?: SignageCategory;
  defaultSponsorId?: string;
}) {
  const editing = !!item;
  const v = (k: keyof ItemRow) => (item ? ((item[k] ?? '') as string | number) : '');
  const [category, setCategory] = useState<SignageCategory>(
    item?.category === 'sponsor_signage' ? 'sponsor_signage' : item ? 'organiser_signage' : initialType ?? 'organiser_signage');
  const [sides, setSides] = useState<string>(String(v('sides')));
  const [sectionChoice, setSectionChoice] = useState<string>(item?.section_id ?? '');
  const [sponsorId, setSponsorId] = useState<string>(item?.sponsor_id ?? defaultSponsorId ?? '');
  const [unitCost, setUnitCost] = useState<string>(String(v('unit_cost')));
  const [qty, setQty] = useState<string>(String(v('qty')));
  const [step, setStep] = useState<StepKey>('list');
  const [reached, setReached] = useState<Set<StepKey>>(new Set(['list']));
  const [snap, setSnap] = useState<Record<string, string>>({});
  const form = useRef<HTMLDivElement>(null);
  const sponsorCat = category === 'sponsor_signage';
  const info = categoryInfo(category);
  const venueHalls = data.lists[data.event.venue === 'NEC Birmingham' ? 'hall_nec' : data.event.venue === 'ExCeL London' ? 'hall_excel' : 'hall_other'] ?? [];
  const defArt = sponsorCat ? data.event.art_due_ss : data.event.art_due_os;
  const defPrint = sponsorCat ? data.event.print_due_ss : data.event.print_due_os;
  const total = Number(unitCost.replace(/[£,\s]/g, '')) * (Number(qty) > 0 ? Number(qty) : 1);
  const index = STEPS.findIndex((s) => s.key === step);

  /** Checks the current step's fields the way the browser would on submit, and moves on if they're fine. */
  function next() {
    const el = form.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    if (el) {
      for (const field of el.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')) {
        if (!field.checkValidity()) { field.reportValidity(); return; }
      }
    }
    const fd = new FormData(form.current!.closest('form')!);
    const values: Record<string, string> = {};
    fd.forEach((val, key) => { if (typeof val === 'string') values[key] = val; });
    setSnap(values);
    const nextKey = STEPS[index + 1].key;
    setReached((r) => new Set([...r, nextKey]));
    setStep(nextKey);
    requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(`[data-step="${nextKey}"] h2`)?.focus());
  }

  const name = (list: { id: string; name: string }[], id: string | undefined) => list.find((x) => x.id === id)?.name;
  const summaries: Record<StepKey, () => string> = {
    list: () => sponsorCat ? `Sponsor signage for ${name(data.sponsors, snap.sponsor_id) ?? 'a sponsor'}` : `Organiser signage${snap.sponsor_id ? `, with ${name(data.sponsors, snap.sponsor_id)}’s logo` : ''}`,
    what: () => [snap.description, snap.plan_code && `ID ${snap.plan_code}`, snap.item_type,
      !sponsorCat && (snap.section_new || name(data.sections, snap.section_id)), snap.qty && `×${snap.qty}`].filter(Boolean).join(' · '),
    where: () => [snap.hall, snap.zone, snap.location_detail, snap.position].filter(Boolean).join(', ') || 'Not set yet',
    print: () => [snap.width_mm && snap.height_mm ? `${Number(snap.width_mm).toLocaleString('en-GB')} × ${Number(snap.height_mm).toLocaleString('en-GB')} mm` : null,
      snap.sides === 'double' ? 'double-sided' : snap.sides === 'single' ? 'single-sided' : null, snap.bleed_mm && `${snap.bleed_mm} mm bleed`, snap.material]
      .filter(Boolean).join(', ') || 'Not set yet',
    artwork: () => `${ARTWORK_BY_OFFERED.find((a) => a.key === snap.artwork_by)?.label ?? 'Media10 Studio'}${snap.artwork_due ? `, due ${fmtDate(snap.artwork_due, 'long')}` : defArt ? `, due ${fmtDate(defArt, 'long')} (show default)` : ''}`,
    production: () => {
      const cost = snap.unit_cost ? Number(snap.unit_cost.replace(/[£,\s]/g, '')) : NaN;
      return [name(data.suppliers, snap.supplier_id) ?? 'No supplier yet',
        snap.unit_cost && (Number.isFinite(cost) && cost > 0 ? `${money(cost, 2)} each` : `unit cost “${snap.unit_cost}” isn’t a number`),
        snap.print_deadline && `order by ${fmtDate(snap.print_deadline, 'long')}`].filter(Boolean).join(', ');
    },
    check: () => '',
  };

  const stepCls = (k: StepKey) => cx(editing ? 'rounded-[10px] border border-line bg-white p-4 sm:p-5' : 'px-4 pt-3 pb-4', !editing && k !== step && 'hidden');
  const h2 = 'text-[18px] font-semibold text-ink outline-none';
  const grid = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4';
  const check = 'mt-1 h-4 w-4 shrink-0 accent-[#13233b]';

  const body: Record<StepKey, React.ReactNode> = {
    list: (
      <>
        <Ask tip="Organiser signage is the show’s own. Sponsor signage carries a sponsor’s branding and is signed off by their account manager too.">
          Is this organiser signage or sponsor signage?
        </Ask>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['organiser_signage', 'sponsor_signage'] as const).map((c) => (
            <label key={c} className={cx('flex cursor-pointer gap-3 rounded-md border bg-white p-3 hover:border-ink',
              category === c ? 'border-ink bg-signal-soft ring-1 ring-ink' : 'border-line-strong', editing && 'cursor-default opacity-80')}>
              <input type="radio" name="category" value={c} checked={category === c} disabled={editing}
                onChange={() => { setCategory(c); if (c === 'organiser_signage') setSponsorId(''); }} className={check} />
              <span>
                <span className="block text-[15px] font-semibold text-ink">{categoryInfo(c).label}</span>
                <span className="block text-[13px] leading-snug text-ink-2">
                  {c === 'organiser_signage' ? 'Wayfinding, feature areas, stages, registration: numbered OS-001, OS-002…' : 'A sponsor’s branding on signs, walls or screens: numbered SS-001, SS-002…'}
                </span>
              </span>
            </label>
          ))}
        </div>
        {editing && <input type="hidden" name="category" value={category} />}
        <div className="mt-4 max-w-[420px]">
          <Field label={sponsorCat ? 'Which sponsor' : 'Carries a sponsor’s logo? (optional)'} htmlFor="sponsor_id"
            help={data.sponsors.length ? (sponsorCat ? 'Their account manager signs it off.' : 'Only if the sponsor needs to approve it.') : 'Add sponsors on the Sponsors page first.'}>
            <select id="sponsor_id" name="sponsor_id" value={sponsorId} required={sponsorCat} onChange={(e) => setSponsorId(e.target.value)} className={inputCls}>
              <option value="">{sponsorCat ? 'Choose a sponsor' : 'No sponsor'}</option>
              {data.sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
      </>
    ),
    what: (
      <>
        <Ask tip="The description is the name everyone will see on the sheet, so make it the one the team uses.">What is it?</Ask>
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Description" htmlFor="description" help="Like “Hall 4 entrance banner” or “Main stage lectern board”.">
            <input id="description" name="description" required maxLength={200} defaultValue={v('description')} autoComplete="off" className={inputCls} />
          </Field>
          <Field label="Signage ID (optional)" htmlFor="plan_code" help="Your own code from the floor plan or sheet, like F1.1 or MBar2.">
            <input id="plan_code" name="plan_code" maxLength={40} defaultValue={v('plan_code')} autoComplete="off" className={inputCls} />
          </Field>
          <Field label="Type" htmlFor="item_type" help="Pick from the list or type your own.">
            <input id="item_type" name="item_type" list="dl-type" defaultValue={v('item_type')} className={inputCls} />
          </Field>
          <Field label="Quantity" htmlFor="qty">
            <input id="qty" name="qty" type="number" min={0} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} />
          </Field>
          {!sponsorCat && (
            <Field label="Section on the sheet" htmlFor="section_id" help="Groups it with the other lines in the same area, like F1 UKCW Main Stage." className="lg:col-span-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <select id="section_id" name="section_id" value={sectionChoice} onChange={(e) => setSectionChoice(e.target.value)} className={inputCls}>
                  <option value="">No section</option>
                  {data.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value={NEW_SECTION}>New section…</option>
                </select>
                {sectionChoice === NEW_SECTION && (
                  <input name="section_new" aria-label="New section name" placeholder="e.g. F1 UKCW Main Stage" maxLength={80} autoFocus className={inputCls} />
                )}
              </div>
            </Field>
          )}
        </div>
      </>
    ),
    where: (
      <>
        <Ask tip="Hall and zone come from the show’s lists; the exact spot is free text, like a stand number or rigging point.">Where does it go?</Ask>
        <div className={grid}>
          <Field label="Hall" htmlFor="hall"><input id="hall" name="hall" list="dl-hall" defaultValue={v('hall')} className={inputCls} /></Field>
          <Field label="Zone / area" htmlFor="zone"><input id="zone" name="zone" list="dl-zone" defaultValue={v('zone')} className={inputCls} /></Field>
          <Field label="Exact location" htmlFor="location_detail"><input id="location_detail" name="location_detail" defaultValue={v('location_detail')} placeholder="Stand, rigging point…" className={inputCls} /></Field>
          <Field label="Position" htmlFor="position"><input id="position" name="position" list="dl-position" defaultValue={v('position')} placeholder="Hanging, freestanding…" className={inputCls} /></Field>
        </div>
      </>
    ),
    print: (
      <>
        <Ask tip="Sizes in millimetres, finished size. Bleed is the extra print beyond it.">How big is it, and how is it printed?</Ask>
        <div className={grid}>
          <Field label="Width (mm)" htmlFor="width_mm"><input id="width_mm" name="width_mm" type="number" min={0} inputMode="numeric" defaultValue={v('width_mm')} className={inputCls} /></Field>
          <Field label="Height (mm)" htmlFor="height_mm"><input id="height_mm" name="height_mm" type="number" min={0} inputMode="numeric" defaultValue={v('height_mm')} className={inputCls} /></Field>
          <Field label="Print" htmlFor="sides">
            <select id="sides" name="sides" value={sides} onChange={(e) => setSides(e.target.value)} className={inputCls}>
              <option value="">Not set</option>
              <option value="single">Single-sided</option>
              <option value="double">Double-sided</option>
            </select>
          </Field>
          <Field label="Bleed (mm)" htmlFor="bleed_mm"><input id="bleed_mm" name="bleed_mm" type="number" min={0} inputMode="numeric" defaultValue={v('bleed_mm')} className={inputCls} /></Field>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Field label={sides === 'double' ? 'Side A wording / content' : 'Wording / content'} htmlFor="wording" className={sides === 'double' ? '' : 'lg:col-span-2'}>
            <textarea id="wording" name="wording" rows={2} defaultValue={v('wording')} className={textareaCls} />
          </Field>
          {sides === 'double' && (
            <Field label="Side B wording / content" htmlFor="wording_side2">
              <textarea id="wording_side2" name="wording_side2" rows={2} defaultValue={v('wording_side2')} className={textareaCls} />
            </Field>
          )}
          <Field label="Material / spec" htmlFor="material" help="Pick from the list or type your own." className="lg:col-span-2">
            <input id="material" name="material" list="dl-material" defaultValue={v('material')} className={inputCls} />
          </Field>
        </div>
      </>
    ),
    artwork: (
      <>
        <Ask tip={sponsorCat ? 'Sponsor artwork is chased through their account manager.' : 'Media10 Studio artwork goes to the studio owner set in Show setup.'}>Who supplies the artwork?</Ask>
        <div className="grid gap-3 sm:grid-cols-2" key={category}>
          {ARTWORK_BY_OFFERED.map((a) => (
            <label key={a.key} className="flex cursor-pointer gap-3 rounded-md border border-line-strong bg-white p-3 hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-signal-soft has-[:checked]:ring-1 has-[:checked]:ring-ink">
              <input type="radio" name="artwork_by" value={a.key} defaultChecked={(v('artwork_by') || (sponsorCat ? 'sponsor' : 'in_house')) === a.key} className={check} />
              <span>
                <span className="block text-[15px] font-semibold text-ink">{a.label}</span>
                <span className="block text-[13px] leading-snug text-ink-2">{a.key === 'in_house' ? 'The studio designs it and uploads the proof.' : 'The sponsor sends the artwork; we upload it for sign-off.'}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Artwork due" htmlFor="artwork_due" help={defArt ? `Leave blank to use the show’s default, ${fmtDate(defArt, 'long')}.` : 'Leave blank to use the show’s default.'}>
            <input id="artwork_due" name="artwork_due" type="date" defaultValue={v('artwork_due')} className={inputCls} />
          </Field>
          <Field label="Link to full-size files (optional)" htmlFor="artwork_link" help="SharePoint, Dropbox or WeTransfer link to print-ready files.">
            <input id="artwork_link" name="artwork_link" type="url" placeholder="https://" defaultValue={v('artwork_link')} className={inputCls} />
          </Field>
        </div>
      </>
    ),
    production: (
      <>
        <Ask tip="All of this can be filled in later from the sheet or the line’s page.">Who makes it, by when, and what it costs</Ask>
        <div className={grid}>
          <Field label="Supplier" htmlFor="supplier_id">
            <select id="supplier_id" name="supplier_id" defaultValue={v('supplier_id')} className={inputCls}>
              <option value="">Not chosen yet</option>
              <SupplierOpts suppliers={data.suppliers} category={category} />
            </select>
          </Field>
          <Field label="Print / order deadline" htmlFor="print_deadline" help={defPrint ? `Blank uses ${fmtDate(defPrint, 'long')}.` : undefined}>
            <input id="print_deadline" name="print_deadline" type="date" defaultValue={v('print_deadline')} className={inputCls} />
          </Field>
          <Field label="Delivery to venue" htmlFor="delivery_date"><input id="delivery_date" name="delivery_date" type="date" defaultValue={v('delivery_date')} className={inputCls} /></Field>
          <Field label="Install by" htmlFor="install_date"><input id="install_date" name="install_date" type="date" defaultValue={v('install_date')} className={inputCls} /></Field>
          <Field label="Unit cost (£)" htmlFor="unit_cost" help={Number.isFinite(total) && total > 0 ? `Total ${money(total, 2)}${Number(qty) > 1 ? ` for ${qty}` : ''}.` : 'Total = unit cost × quantity.'}>
            <input id="unit_cost" name="unit_cost" inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className={inputCls} />
          </Field>
          <Field label="PO number" htmlFor="po_number"><input id="po_number" name="po_number" defaultValue={v('po_number')} className={inputCls} /></Field>
        </div>
        <Field label="Notes" htmlFor="notes" className="mt-4">
          <textarea id="notes" name="notes" rows={3} defaultValue={v('notes')} className={textareaCls} />
        </Field>
      </>
    ),
    check: (
      <>
        <Ask>Check it over, then add it. It gets the next {info.prefix} number, and everything can be changed later.</Ask>
        <dl className="grid gap-x-6 gap-y-1.5 text-[14.5px] sm:grid-cols-[160px_minmax(0,1fr)]">
          {STEPS.filter((s) => s.key !== 'check').map((s) => (
            <div key={s.key} className="contents">
              <dt className="font-semibold text-ink-2">{s.title}</dt>
              <dd className="text-ink">{summaries[s.key]()}</dd>
            </div>
          ))}
        </dl>
        {snap.wording && <p className="mt-3 whitespace-pre-wrap text-[14px] text-ink-2"><b className="text-ink">{snap.sides === 'double' ? 'Side A: ' : 'Wording: '}</b>{snap.wording}</p>}
        {snap.sides === 'double' && snap.wording_side2 && <p className="mt-1 whitespace-pre-wrap text-[14px] text-ink-2"><b className="text-ink">Side B: </b>{snap.wording_side2}</p>}
      </>
    ),
  };

  return (
    <ActionForm action={editing ? updateItem : createItem} className={editing ? 'space-y-5' : ''}>
      <input type="hidden" name="event_id" value={data.event.id} />
      {item && <input type="hidden" name="item_id" value={item.id} />}
      <datalist id="dl-type">{(data.lists.sign_type ?? []).map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="dl-hall">{venueHalls.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="dl-zone">{(data.lists.zone ?? []).map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="dl-position">{(data.lists.position ?? []).map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="dl-material">{(data.lists.material ?? []).map((x) => <option key={x} value={x} />)}</datalist>

      <div ref={form} className={editing ? 'space-y-5' : ''}>
        {!editing && (
          <div className="mb-4">
            <div className="mb-1.5 flex items-baseline justify-between text-[13.5px]">
              <span className="font-semibold text-ink">Step {index + 1} of {STEPS.length}: {STEPS[index].title}</span>
              <span className="text-muted">Nothing is saved until the last step.</span>
            </div>
            <div role="progressbar" aria-label="Progress" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={index + 1} className="h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-signal transition-[width] duration-500 ease-out" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
            </div>
          </div>
        )}
        <ol className={editing ? 'space-y-5' : 'space-y-3'}>
          {STEPS.filter((s) => editing ? s.key !== 'check' : true).map((s, i) => {
            const current = s.key === step;
            const done = !editing && reached.has(s.key) && !current;
            return (
              <li key={s.key} aria-current={!editing && current ? 'step' : undefined}
                className={editing ? '' : cx('rounded-[10px] border bg-surface transition-colors', current ? 'border-ink shadow-[0_0_0_3px_var(--color-signal-soft)]' : 'border-line')}>
                {!editing && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                    <span aria-hidden className={cx('plate flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px]',
                      done ? 'bg-ink text-signal' : current ? 'bg-signal text-ink' : 'bg-paper text-muted ring-1 ring-inset ring-line-strong')}>
                      {done ? <Check size={15} strokeWidth={3} /> : i + 1}
                    </span>
                    <h2 tabIndex={-1} className={cx(h2, 'text-[17px]', !current && !done && 'text-muted')}>{s.title}</h2>
                    {done && (
                      <>
                        <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink-2">{summaries[s.key]()}</span>
                        <button type="button" onClick={() => setStep(s.key)} className={cx(btn.base, btn.ghost, btn.small)} aria-label={`Change ${s.title.toLowerCase()}`}>Change</button>
                      </>
                    )}
                  </div>
                )}
                <div data-step={s.key} className={cx(stepCls(s.key), !editing && current && 'border-t border-line motion-safe:animate-[step-in_320ms_ease-out]')}>
                  {editing && <h2 className={cx(h2, 'mb-4')}>{s.title === 'Which list' ? 'List and sponsor' : s.title}</h2>}
                  {body[s.key]}
                  {!editing && current && s.key !== 'check' && (
                    <div className="mt-5">
                      <button type="button" onClick={next} className={cx(btn.base, btn.dark)}>Next: {STEPS[i + 1].title.toLowerCase()}</button>
                    </div>
                  )}
                  {!editing && current && s.key === 'check' && (
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <SubmitButton pendingText="Adding…">Add signage</SubmitButton>
                      <Link href={cancelHref} className="text-[14px] font-semibold text-ink-2 underline underline-offset-2 hover:text-ink">Cancel</Link>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {editing && (
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton>Save changes</SubmitButton>
            <Link href={cancelHref} className="text-[14px] font-semibold text-ink-2 underline underline-offset-2 hover:text-ink">Cancel</Link>
          </div>
        )}
        {!editing && step !== 'check' && (
          <p className="mt-4 text-[14px]"><Link href={cancelHref} className="font-semibold text-ink-2 underline underline-offset-2 hover:text-ink">Cancel</Link></p>
        )}
      </div>
    </ActionForm>
  );
}

function Ask({ children, tip }: { children: React.ReactNode; tip?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-[15px] font-semibold text-ink">{children}</p>
      {tip && <p className="mt-0.5 flex gap-1.5 text-[13.5px] text-ink-2"><Info size={15} aria-hidden className="mt-[3px] shrink-0 text-muted" />{tip}</p>}
    </div>
  );
}

function SupplierOpts({ suppliers, category }: { suppliers: SignageFormData['suppliers']; category: Category }) {
  const works = (s: SignageFormData['suppliers'][number]) => (category === 'sponsor_signage' ? s.works_on_ss : s.works_on_os);
  const match = suppliers.filter(works);
  const others = suppliers.filter((s) => !works(s));
  const opt = (s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>;
  if (!match.length || !others.length) return <>{suppliers.map(opt)}</>;
  return (
    <>
      <optgroup label={`Work on ${categoryInfo(category).label.toLowerCase()}`}>{match.map(opt)}</optgroup>
      <optgroup label="Other suppliers">{others.map(opt)}</optgroup>
    </>
  );
}
