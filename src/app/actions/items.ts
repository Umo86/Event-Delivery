'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, type Sql } from '@/lib/db';
import { bool, date, int, isUuid, num, required, run, str, UserError, uuidOrNull, type ActionResult } from '@/lib/action';
import { actor } from '@/lib/auth/session';
import { randomToken, sha256 } from '@/lib/auth/password';
import { loadItem } from '@/lib/data/load';
import { sponsorLinksEnabled } from '@/lib/settings';
import { appOrigin } from '@/lib/url';
import { logActivity } from '@/lib/activity';
import { fmtDate } from '@/lib/dates';
import { categoryInfo, decisionLabel, itemCode, productionLabel, productionLabelFor } from '@/lib/domain/labels';
import { isForSale } from '@/lib/domain/engine';
import { allowedDecisions, canDecideStage, canSell } from '@/lib/domain/permissions';
import type { ArtworkBy, Category, DecisionValue, ProductionStatus } from '@/lib/domain/types';
import { ALLOWED_UPLOAD_TYPES, artworkPrefix, blobExists, deleteBlobs, MAX_DERIVED_BYTES, MAX_ORIGINAL_BYTES } from '@/lib/storage';

const CATS: Category[] = ['organiser_signage', 'sponsor_signage', 'sponsor_item'];
const ART_BY: ArtworkBy[] = ['in_house', 'sponsor', 'supplier', 'not_required'];
const PROD: ProductionStatus[] = ['sent_to_supplier', 'in_production', 'delivered', 'installed'];
const DEC: DecisionValue[] = ['approved', 'changes_requested', 'rejected', 'on_hold'];

function refresh(itemId?: string) {
  revalidatePath('/', 'layout');
  if (itemId) revalidatePath(`/items/${itemId}`);
}

/** Parses the editable fields shared by the add and edit forms. */
async function readItemFields(fd: FormData, eventId: string, category: Category) {
  const sql = await db();
  const sponsorship = category === 'sponsor_item';
  const sponsorId = uuidOrNull(fd, 'sponsor_id');
  if (sponsorId) {
    const s = await sql`select 1 from sponsors where id = ${sponsorId} and event_id = ${eventId}`;
    if (!s.length) throw new UserError('Pick a sponsor from this show’s list.');
  } else if (category === 'sponsor_signage') {
    throw new UserError('Choose the sponsor for this line.');
  }
  const supplierId = uuidOrNull(fd, 'supplier_id');
  if (supplierId) {
    const s = await sql`select 1 from suppliers where id = ${supplierId}`;
    if (!s.length) throw new UserError('Pick a supplier from the list.');
  }
  const artworkBy = (str(fd, 'artwork_by', 20) ?? 'in_house') as ArtworkBy;
  if (!ART_BY.includes(artworkBy)) throw new UserError('Choose who supplies the artwork.');
  const sides = str(fd, 'sides', 10);
  if (sides && sides !== 'single' && sides !== 'double') throw new UserError('Choose single or double-sided.');
  const link = str(fd, 'artwork_link', 1000);
  if (link && !/^https?:\/\//i.test(link)) throw new UserError('The artwork link must start with https://');
  const shared = {
    description: required(fd, 'description', sponsorship ? 'Item name' : 'Description', 200),
    sponsor_id: sponsorId,
    section_id: await readSection(sql, fd, eventId),
    plan_code: str(fd, 'plan_code', 40),
    item_type: str(fd, 'item_type', 120),
    wording: str(fd, 'wording', 2000),
    hall: str(fd, 'hall', 60),
    zone: str(fd, 'zone', 120),
    location_detail: str(fd, 'location_detail', 300),
    qty: int(fd, 'qty', 'Quantity', { min: 0, max: 10_000_000 }),
    material: str(fd, 'material', 120),
    artwork_by: artworkBy,
    artwork_due: date(fd, 'artwork_due', 'Artwork due'),
    artwork_link: link,
    supplier_id: supplierId,
    print_deadline: date(fd, 'print_deadline', sponsorship ? 'Order deadline' : 'Print / order deadline'),
    po_number: str(fd, 'po_number', 60),
    delivery_date: date(fd, 'delivery_date', 'Delivery date'),
    install_date: date(fd, 'install_date', sponsorship ? 'Hand-out date' : 'Install date'),
    unit_cost: num(fd, 'unit_cost', sponsorship ? 'Cost price per unit' : 'Unit cost'),
    notes: str(fd, 'notes', 4000),
  };
  if (sponsorship) {
    // Sponsorship items: no sign sizes; a rate card price, a sale price once sold, and how they reach visitors
    const salePrice = num(fd, 'sale_price', 'Sale price');
    if (salePrice !== null && !sponsorId) throw new UserError('Choose the sponsor it was sold to, or clear the sale price.');
    return {
      ...shared,
      rate_card_price: num(fd, 'rate_card_price', 'Rate card price'),
      sale_price: sponsorId ? salePrice : null,
      distribution_method: str(fd, 'distribution_method', 120),
    };
  }
  return {
    ...shared,
    position: str(fd, 'position', 120),
    width_mm: int(fd, 'width_mm', 'Width', { min: 0, max: 1_000_000 }),
    height_mm: int(fd, 'height_mm', 'Height', { min: 0, max: 1_000_000 }),
    bleed_mm: int(fd, 'bleed_mm', 'Bleed', { min: 0, max: 10_000 }),
    sides: sides as 'single' | 'double' | null,
    wording_side2: sides === 'double' ? str(fd, 'wording_side2', 2000) : null,
  };
}

/**
 * The section a line sits under on the sheet: an existing one by id, or a new one typed in (`section_new`),
 * which is created at the end of the show's list. Blank means no section.
 */
async function readSection(sql: Sql, fd: FormData, eventId: string): Promise<string | null> {
  const typed = str(fd, 'section_new', 80);
  if (typed) {
    const [existing] = await sql<{ id: string }[]>`select id from sections where event_id = ${eventId} and lower(name) = lower(${typed})`;
    if (existing) return existing.id;
    const [{ p }] = await sql<{ p: number }[]>`select coalesce(max(position), 0)::int + 1 as p from sections where event_id = ${eventId}`;
    const [created] = await sql<{ id: string }[]>`insert into sections (event_id, name, position) values (${eventId}, ${typed}, ${p}) returning id`;
    return created.id;
  }
  const raw = str(fd, 'section_id', 40);
  if (!raw || raw === '__new__') return null; // "New section…" chosen but nothing typed: no section
  const id = uuidOrNull(fd, 'section_id');
  if (!id) return null;
  const [ok] = await sql`select 1 from sections where id = ${id} and event_id = ${eventId}`;
  if (!ok) throw new UserError('Pick a section from this show’s list, or type a new one.');
  return id;
}

// ---- Sheet view: one cell at a time ----------------------------------------------------

/** The Supplier cell on the sheet: saves as soon as it's picked. */
export async function setItemSupplier(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const itemId = uuidOrNull(fd, 'item_id');
    if (!itemId) throw new UserError('Missing line.');
    const supplierId = uuidOrNull(fd, 'supplier_id');
    const sql = await db();
    const [item] = await sql<{ event_id: string; supplier_id: string | null; cancelled: boolean }[]>`select event_id, supplier_id, cancelled from items where id = ${itemId}`;
    if (!item) throw new UserError('That line no longer exists.');
    if (item.cancelled) throw new UserError('This line is cancelled. Restore it first.');
    if (item.supplier_id === supplierId) return { ok: true };
    let name: string | null = null;
    if (supplierId) {
      const [s] = await sql<{ name: string }[]>`select name from suppliers where id = ${supplierId}`;
      if (!s) throw new UserError('Pick a supplier from the list.');
      name = s.name;
    }
    await sql`update items set supplier_id = ${supplierId} where id = ${itemId}`;
    await logActivity(sql, { eventId: item.event_id, itemId, userId: me.id, actorName: me.full_name, kind: 'production',
      message: name ? `Supplier: ${name}` : 'Cleared the supplier' });
    refresh(itemId);
    return { ok: true, message: name ? `Supplier: ${name}.` : 'Supplier cleared.' };
  });
}

/** The Status cell on the sheet: moves an approved line along Sent → Printed → Delivered → Installed. */
export async function setProductionStep(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const itemId = uuidOrNull(fd, 'item_id');
    if (!itemId) throw new UserError('Missing line.');
    const detail = await loadItem(itemId);
    if (!detail) throw new UserError('That line no longer exists.');
    const { item, state } = detail.row;
    if (item.cancelled) throw new UserError('This line is cancelled. Restore it first.');
    const status = (str(fd, 'production_status', 30) as ProductionStatus | null) ?? null;
    if (status && !PROD.includes(status)) throw new UserError('Choose a status.');
    if (status === item.production_status) return { ok: true };
    if (status && !state.fullyApproved) throw new UserError('It can only move on once every sign-off stage has approved the artwork.');
    const sql = await db();
    await sql`update items set production_status = ${status} where id = ${itemId}`;
    await logActivity(sql, { eventId: item.event_id, itemId, userId: me.id, actorName: me.full_name, kind: 'production',
      message: status ? `Production status: ${productionLabelFor(status, item.category)}` : 'Cleared production status' });
    refresh(itemId);
    return { ok: true, message: status ? `${productionLabelFor(status, item.category)}.` : 'Back to approved.' };
  });
}

export async function createItem(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const eventId = uuidOrNull(fd, 'event_id');
    const category = str(fd, 'category', 40) as Category;
    if (!eventId || !CATS.includes(category)) throw new UserError('Missing event or category.');
    const sql = await db();
    const ev = await sql<{ archived: boolean }[]>`select archived from events where id = ${eventId}`;
    if (!ev.length) throw new UserError('That event no longer exists.');
    const f = await readItemFields(fd, eventId, category);
    // A sponsorship item added with its sponsor is already sold
    const sold = category === 'sponsor_item' && f.sponsor_id ? { sold_at: new Date(), sold_by: me.id } : {};
    const [row] = await sql<{ id: string; ref_no: number }[]>`
      insert into items ${sql({ ...f, ...sold, event_id: eventId, category, created_by: me.id } as never)}
      returning id, ref_no`;
    const forSale = category === 'sponsor_item' && !f.sponsor_id ? ' (for sale)' : '';
    await logActivity(sql, { eventId, itemId: row.id, userId: me.id, actorName: me.full_name, kind: 'created',
      message: `Added ${itemCode(category, row.ref_no)} to ${categoryInfo(category).label.toLowerCase()}${forSale}` });
    refresh();
    redirect(`/items/${row.id}?created=1`);
  });
}

const FIELD_LABELS: Record<string, string> = {
  description: 'description', sponsor_id: 'sponsor', section_id: 'section', plan_code: 'plan code', item_type: 'type', wording: 'side 1 wording',
  wording_side2: 'side 2 wording', bleed_mm: 'bleed', hall: 'hall', zone: 'zone',
  location_detail: 'location', position: 'position', width_mm: 'width', height_mm: 'height', sides: 'sides', qty: 'quantity',
  material: 'material', artwork_by: 'artwork supplier', artwork_due: 'artwork due date', artwork_link: 'artwork link',
  supplier_id: 'supplier', print_deadline: 'print deadline', po_number: 'PO number', delivery_date: 'delivery date',
  install_date: 'install date', unit_cost: 'unit cost', notes: 'notes',
  rate_card_price: 'rate card price', sale_price: 'sale price', distribution_method: 'distribution method',
};

export async function updateItem(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const itemId = uuidOrNull(fd, 'item_id');
    if (!itemId) throw new UserError('Missing line.');
    const detail = await loadItem(itemId);
    if (!detail) throw new UserError('That line no longer exists.');
    const { item } = detail.row;
    const f = await readItemFields(fd, item.event_id, item.category);
    const changed = Object.keys(f).filter((k) => {
      const a = (item as unknown as Record<string, unknown>)[k];
      const b = (f as Record<string, unknown>)[k];
      return (a ?? null) !== (b ?? null) && String(a ?? '') !== String(b ?? '');
    });
    if (!changed.length) redirect(`/items/${itemId}`);
    const sql = await db();
    const sponsorChanged = changed.includes('sponsor_id');
    if (sponsorChanged && me.role !== 'super_admin' && detail.decisions.length > 0) {
      throw new UserError('Sign-off has started on this line, so only a super admin can move it to another sponsor.');
    }
    if (sponsorChanged && item.category === 'sponsor_item' && !f.sponsor_id && (detail.versions.length > 0 || detail.decisions.length > 0)) {
      throw new UserError('Artwork or sign-off has started for this sponsor, so it can’t go back on sale. Cancel it and add a new item to sell instead.');
    }
    await sql`update items set ${sql(f as never, ...(changed as never[]))} where id = ${itemId}`;
    // Sponsorship items: choosing a sponsor marks it sold now; clearing it puts the item back on sale
    if (sponsorChanged && item.category === 'sponsor_item') {
      if (f.sponsor_id) await sql`update items set sold_at = now(), sold_by = ${me.id} where id = ${itemId}`;
      else await sql`update items set sold_at = null, sold_by = null, sale_price = null where id = ${itemId}`;
    }
    // Approval links belong to the old sponsor
    if (sponsorChanged) await sql`update share_links set revoked_at = now() where item_id = ${itemId} and revoked_at is null`;
    await logActivity(sql, { eventId: item.event_id, itemId, userId: me.id, actorName: me.full_name, kind: 'updated',
      message: `Edited ${changed.map((k) => FIELD_LABELS[k] ?? k).join(', ')}` });
    refresh(itemId);
    redirect(`/items/${itemId}?saved=1`);
  });
}

export async function updateProduction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const itemId = uuidOrNull(fd, 'item_id');
    if (!itemId) throw new UserError('Missing line.');
    const detail = await loadItem(itemId);
    if (!detail) throw new UserError('That line no longer exists.');
    const { item, state } = detail.row;
    if (item.cancelled) throw new UserError('This line is cancelled. Restore it first.');
    const status = (str(fd, 'production_status', 30) as ProductionStatus | null) ?? null;
    if (status && !PROD.includes(status)) throw new UserError('Choose a production status.');
    if (status && !state.fullyApproved && status !== item.production_status) {
      throw new UserError('Production can only start once every sign-off stage has approved the current artwork.');
    }
    const supplierId = uuidOrNull(fd, 'supplier_id');
    const sql = await db();
    if (supplierId && !(await sql`select 1 from suppliers where id = ${supplierId}`).length) throw new UserError('Pick a supplier from the list.');
    const next = {
      production_status: status,
      supplier_id: supplierId,
      po_number: str(fd, 'po_number', 60),
      delivery_date: date(fd, 'delivery_date', 'Delivery date'),
      install_date: date(fd, 'install_date', 'Install date'),
    };
    await sql`update items set ${sql(next as never)} where id = ${itemId}`;
    const msgs: string[] = [];
    if (status !== item.production_status) msgs.push(status ? `Production status: ${productionLabelFor(status, item.category)}` : 'Cleared production status');
    if (next.po_number !== item.po_number && next.po_number) msgs.push(`PO ${next.po_number}`);
    if (next.delivery_date !== item.delivery_date) msgs.push(next.delivery_date ? `Delivery date ${fmtDate(next.delivery_date, 'long')}` : 'Cleared delivery date');
    if (next.install_date !== item.install_date) msgs.push(next.install_date ? `Install date ${fmtDate(next.install_date, 'long')}` : 'Cleared install date');
    if (next.supplier_id !== item.supplier_id) {
      const name = detail.bundle.suppliers.find((s) => s.id === next.supplier_id)?.name;
      msgs.push(name ? `Supplier: ${name}` : 'Cleared the supplier');
    }
    if (msgs.length) {
      await logActivity(sql, { eventId: item.event_id, itemId, userId: me.id, actorName: me.full_name, kind: 'production', message: msgs.join('; ') });
    }
    refresh(itemId);
    return { ok: true, message: msgs.length ? 'Production updated.' : 'No changes.' };
  });
}

export async function setCancelled(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const itemId = uuidOrNull(fd, 'item_id');
    const cancel = bool(fd, 'cancel');
    if (!itemId) throw new UserError('Missing line.');
    const sql = await db();
    const [it] = await sql<{ event_id: string; cancelled: boolean }[]>`select event_id, cancelled from items where id = ${itemId}`;
    if (!it) throw new UserError('That line no longer exists.');
    if (it.cancelled === cancel) return { ok: true };
    await sql`update items set cancelled = ${cancel} where id = ${itemId}`;
    const reason = str(fd, 'reason', 500);
    await logActivity(sql, { eventId: it.event_id, itemId, userId: me.id, actorName: me.full_name, kind: cancel ? 'cancelled' : 'restored',
      message: cancel ? `Cancelled the line${reason ? `: ${reason}` : ''}` : 'Restored the line' });
    refresh(itemId);
    return { ok: true, message: cancel ? 'Line cancelled.' : 'Line restored.' };
  });
}

export async function deleteItem(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const itemId = uuidOrNull(fd, 'item_id');
    if (!itemId) throw new UserError('Missing line.');
    const sql = await db();
    const [it] = await sql<{ event_id: string; category: Category; ref_no: number }[]>`select event_id, category, ref_no from items where id = ${itemId}`;
    if (!it) throw new UserError('That line no longer exists.');
    const files = await sql<{ file_url: string; preview_url: string | null; thumb_url: string | null }[]>`
      select file_url, preview_url, thumb_url from artwork_versions where item_id = ${itemId}`;
    await sql`delete from items where id = ${itemId}`;
    await logActivity(sql, { eventId: it.event_id, itemId: null, userId: me.id, actorName: me.full_name, kind: 'deleted',
      message: `Deleted ${itemCode(it.category, it.ref_no)}` });
    await deleteBlobs(files.flatMap((f) => [f.file_url, f.preview_url, f.thumb_url]));
    refresh();
    redirect(`/schedule/${categoryInfo(it.category).slug}?deleted=1`);
  });
}

export async function addComment(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('user');
    const itemId = uuidOrNull(fd, 'item_id');
    const text = required(fd, 'comment', 'Comment', 2000);
    if (!itemId) throw new UserError('Missing line.');
    const sql = await db();
    const [it] = await sql<{ event_id: string }[]>`select event_id from items where id = ${itemId}`;
    if (!it) throw new UserError('That line no longer exists.');
    await logActivity(sql, { eventId: it.event_id, itemId, userId: me.id, actorName: me.full_name, kind: 'comment', message: text });
    refresh(itemId);
    return { ok: true };
  });
}

export async function recordDecision(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const itemId = uuidOrNull(fd, 'item_id');
    const stageId = uuidOrNull(fd, 'stage_id');
    const decision = str(fd, 'decision', 30) as DecisionValue;
    if (!itemId || !stageId || !DEC.includes(decision)) throw new UserError('Choose a decision.');
    const comment = str(fd, 'comment', 2000);
    if (decision !== 'approved' && !comment) throw new UserError('Add a comment so the team knows what needs to happen.');
    const detail = await loadItem(itemId);
    if (!detail) throw new UserError('That line no longer exists.');
    const { item, state, sponsor } = detail.row;
    const stage = detail.bundle.stages.find((s) => s.id === stageId);
    if (!stage) throw new UserError('That sign-off stage no longer exists.');
    if (!canDecideStage(me, stage, sponsor)) {
      throw new UserError(stage.uses_account_manager
        ? 'Only the sponsor’s account manager (or a super admin) can record this stage.'
        : 'Only the approver for this stage (or a super admin) can record it.');
    }
    const allowed = allowedDecisions(state, stageId);
    if (!allowed.includes(decision)) {
      throw new UserError(state.artIn ? 'This stage isn’t open yet. Earlier stages need to approve first.' : 'Artwork is needed before sign-off can start.');
    }
    const sql = await db();
    await sql`insert into decisions (item_id, event_id, stage_id, version, decision, comment, decided_by, decided_by_name)
              values (${itemId}, ${item.event_id}, ${stageId}, ${state.version!}, ${decision}, ${comment}, ${me.id}, ${me.full_name})`;
    const v = state.version ? ` v${state.version}` : '';
    await logActivity(sql, { eventId: item.event_id, itemId, userId: me.id, actorName: me.full_name, kind: 'decision',
      message: `${stage.name}: ${decisionLabel(decision)}${v}${comment ? ` – ${comment}` : ''}` });
    refresh(itemId);
    return { ok: true, message: `Saved: ${decisionLabel(decision).toLowerCase()}.` };
  });
}

// ---- Sponsorship sales ----------------------------------------------------------
// Anyone with an account can record a sale, except people in an external department (see canSell).

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

/** Marks a sponsorship item sold, or changes the sale: who bought it (an existing or new sponsor) and the sale price. */
export async function saveSale(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('user');
    if (!canSell(me)) throw new UserError('People in an external department can’t mark items sold.');
    const itemId = uuidOrNull(fd, 'item_id');
    if (!itemId) throw new UserError('Missing item.');
    const detail = await loadItem(itemId);
    if (!detail) throw new UserError('That item no longer exists.');
    const { item, code } = detail.row;
    if (item.category !== 'sponsor_item') throw new UserError('Only sponsorship items are sold.');
    if (item.cancelled) throw new UserError('This item is cancelled. Restore it first.');
    const price = num(fd, 'sale_price', 'Sale price');
    if (price === null) throw new UserError('Enter the sale price (0 if it’s part of a bigger package).');
    const sql = await db();
    let sponsorId = uuidOrNull(fd, 'sponsor_id');
    const newName = str(fd, 'new_sponsor', 120);
    if (sponsorId && newName) throw new UserError('Choose a sponsor from the list or type a new one, not both.');
    let added = false;
    if (newName) {
      const [found] = await sql<{ id: string }[]>`select id from sponsors where event_id = ${item.event_id} and lower(name) = lower(${newName})`;
      if (found) sponsorId = found.id;
      else {
        const [s] = await sql<{ id: string }[]>`insert into sponsors (event_id, name) values (${item.event_id}, ${newName}) returning id`;
        sponsorId = s.id;
        added = true;
        await logActivity(sql, { eventId: item.event_id, itemId: null, userId: me.id, actorName: me.full_name, kind: 'sponsor',
          message: `Added sponsor ${newName} when selling ${code}` });
      }
    } else if (sponsorId) {
      if (!(await sql`select 1 from sponsors where id = ${sponsorId} and event_id = ${item.event_id}`).length) throw new UserError('Pick a sponsor from this show’s list.');
    } else {
      throw new UserError('Choose who bought it, or type a new sponsor’s name.');
    }
    const changingSponsor = !!item.sponsor_id && item.sponsor_id !== sponsorId;
    if (changingSponsor && (detail.versions.length > 0 || detail.decisions.length > 0) && me.role !== 'super_admin') {
      throw new UserError('Artwork or sign-off has started for the current sponsor, so only a super admin can change who bought it.');
    }
    const newSale = !item.sponsor_id || changingSponsor;
    if (!newSale && item.sale_price === price) return { ok: true, message: 'No changes.' };
    if (newSale) await sql`update items set sponsor_id = ${sponsorId}, sale_price = ${price}, sold_at = now(), sold_by = ${me.id} where id = ${itemId}`;
    else await sql`update items set sale_price = ${price} where id = ${itemId}`;
    if (changingSponsor) await sql`update share_links set revoked_at = now() where item_id = ${itemId} and revoked_at is null`;
    const [{ name }] = await sql<{ name: string }[]>`select name from sponsors where id = ${sponsorId}`;
    await logActivity(sql, { eventId: item.event_id, itemId, userId: me.id, actorName: me.full_name, kind: 'sale',
      message: newSale ? `Sold to ${name} for ${gbp(price)}` : `Changed the sale price to ${gbp(price)}` });
    refresh(itemId);
    return { ok: true, message: newSale ? `Sold to ${name}${added ? ', who’s now on the Sponsors list' : ''}.` : 'Sale price saved.' };
  });
}

/** Puts a sold sponsorship item back on sale, as long as no artwork or sign-off has started for the buyer. */
export async function putBackOnSale(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('user');
    if (!canSell(me)) throw new UserError('People in an external department can’t change sales.');
    const itemId = uuidOrNull(fd, 'item_id');
    if (!itemId) throw new UserError('Missing item.');
    const detail = await loadItem(itemId);
    if (!detail) throw new UserError('That item no longer exists.');
    const { item, sponsor } = detail.row;
    if (item.category !== 'sponsor_item' || !item.sponsor_id) return { ok: true };
    if (detail.versions.length > 0 || detail.decisions.length > 0) {
      throw new UserError('Artwork or sign-off has started for this sponsor, so it can’t go back on sale. Cancel it and add a new item to sell instead.');
    }
    const sql = await db();
    await sql`update items set sponsor_id = null, sale_price = null, sold_at = null, sold_by = null where id = ${itemId}`;
    await sql`update share_links set revoked_at = now() where item_id = ${itemId} and revoked_at is null`;
    await logActivity(sql, { eventId: item.event_id, itemId, userId: me.id, actorName: me.full_name, kind: 'sale',
      message: `Put back on sale (was sold to ${sponsor?.name ?? 'a sponsor'})` });
    refresh(itemId);
    return { ok: true, message: 'It’s back on sale.' };
  });
}

// ---- Artwork ------------------------------------------------------------------

export interface UploadedFile { url: string; pathname: string; size: number; contentType: string }

export async function commitArtwork(input: {
  itemId: string; original: UploadedFile; preview: UploadedFile | null; thumb: UploadedFile | null;
  fileName: string; widthPx: number | null; heightPx: number | null; pageCount: number | null; note: string | null;
}): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    if (!isUuid(input.itemId)) throw new UserError('Missing line.');
    const sql = await db();
    const [item] = await sql<{ id: string; event_id: string; cancelled: boolean; production_status: ProductionStatus | null; category: Category; sponsor_id: string | null }[]>`
      select id, event_id, cancelled, production_status, category, sponsor_id from items where id = ${input.itemId}`;
    if (!item) throw new UserError('That line no longer exists.');
    if (item.cancelled) throw new UserError('This line is cancelled. Restore it before adding artwork.');
    if (isForSale(item)) throw new UserError('This item is still for sale. Mark it sold before adding artwork.');
    const prefix = artworkPrefix(item.event_id, item.id);
    const files = [input.original, input.preview, input.thumb].filter((f): f is UploadedFile => !!f);
    for (const f of files) {
      if (typeof f.pathname !== 'string' || !f.pathname.startsWith(prefix)) throw new UserError('Upload didn’t match this line. Please try again.');
      // Trust only what the store itself reports (address, size and type), never what the browser sent.
      const found = await blobExists(String(f.url));
      if (!found || found.pathname !== f.pathname) throw new UserError('The upload didn’t finish. Please try again.');
      f.url = found.url;
      f.size = found.size;
      f.contentType = found.contentType;
    }
    if (!ALLOWED_UPLOAD_TYPES.includes(input.original.contentType)) throw new UserError('Upload a PDF, PNG, JPG, WebP or GIF file.');
    if (input.original.size > MAX_ORIGINAL_BYTES) throw new UserError('That file is over 25 MB. Upload a smaller proof and add the full-size file as an artwork link.');
    for (const f of [input.preview, input.thumb]) if (f && f.size > MAX_DERIVED_BYTES) throw new UserError('Preview image is too large.');
    const fileName = String(input.fileName ?? 'artwork').slice(0, 200);
    const note = input.note ? String(input.note).slice(0, 1000) : null;
    let version = 0;
    await sql.begin(async (tx) => {
      // Take the next number from the line's counter. The update locks the line, so two uploads at once get
      // different numbers, and numbers are never reused, so old decisions and links can't attach to new artwork.
      const [{ v }] = await tx<{ v: number }[]>`
        update items set last_version = greatest(last_version,
          (select coalesce(max(version), 0) from artwork_versions where item_id = ${item.id})) + 1
        where id = ${item.id} returning last_version as v`;
      version = v;
      await tx`insert into artwork_versions (item_id, event_id, version, file_url, file_pathname, preview_url, preview_pathname,
          thumb_url, thumb_pathname, file_name, mime_type, size_bytes, width_px, height_px, page_count, note, uploaded_by)
        values (${item.id}, ${item.event_id}, ${version}, ${input.original.url}, ${input.original.pathname},
          ${input.preview?.url ?? null}, ${input.preview?.pathname ?? null}, ${input.thumb?.url ?? null}, ${input.thumb?.pathname ?? null},
          ${fileName}, ${input.original.contentType}, ${input.original.size},
          ${Number.isFinite(input.widthPx) ? input.widthPx : null}, ${Number.isFinite(input.heightPx) ? input.heightPx : null},
          ${Number.isFinite(input.pageCount) ? input.pageCount : null}, ${note}, ${me.id})`;
      if (item.production_status) await tx`update items set production_status = null where id = ${item.id}`;
    });
    await logActivity(sql, { eventId: item.event_id, itemId: item.id, userId: me.id, actorName: me.full_name, kind: 'artwork',
      message: `Uploaded artwork v${version} (${fileName})${note ? ` – ${note}` : ''}${version > 1 ? '. Sign-off restarts from the first stage.' : ''}` });
    if (item.production_status) {
      await logActivity(sql, { eventId: item.event_id, itemId: item.id, userId: me.id, actorName: me.full_name, kind: 'production',
        message: `Production status cleared (was ${productionLabel(item.production_status)}) because new artwork needs sign-off` });
    }
    refresh(item.id);
    return { ok: true, message: `Artwork v${version} added.`, data: { version } };
  });
}

export async function deleteVersion(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const versionId = uuidOrNull(fd, 'version_id');
    if (!versionId) throw new UserError('Missing version.');
    const sql = await db();
    const [v] = await sql<{ item_id: string; event_id: string; version: number; file_url: string; preview_url: string | null; thumb_url: string | null }[]>`
      select item_id, event_id, version, file_url, preview_url, thumb_url from artwork_versions where id = ${versionId}`;
    if (!v) throw new UserError('That version no longer exists.');
    await sql.begin(async (tx) => {
      await tx`delete from artwork_versions where id = ${versionId}`;
      await tx`update share_links set revoked_at = now() where item_id = ${v.item_id} and version = ${v.version} and revoked_at is null`;
    });
    await logActivity(sql, { eventId: v.event_id, itemId: v.item_id, userId: me.id, actorName: me.full_name, kind: 'artwork', message: `Removed artwork v${v.version}` });
    await deleteBlobs([v.file_url, v.preview_url, v.thumb_url]);
    refresh(v.item_id);
    return { ok: true, message: `Removed v${v.version}.` };
  });
}

// ---- Sponsor approval links -------------------------------------------------------

export async function createShareLink(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const itemId = uuidOrNull(fd, 'item_id');
    if (!itemId) throw new UserError('Missing line.');
    const detail = await loadItem(itemId);
    if (!detail) throw new UserError('That line no longer exists.');
    const { item, state, sponsor } = detail.row;
    const stage = state.currentStage;
    if (!stage || !stage.uses_account_manager || !state.artIn || item.cancelled) {
      throw new UserError('A sponsor link can be sent when the line is at the sponsor sign-off stage.');
    }
    if (!sponsor) throw new UserError('Choose the sponsor for this line first.');
    if (!canDecideStage(me, stage, sponsor)) throw new UserError('Only the sponsor’s account manager (or a super admin) can send an approval link.');
    if (!(await sponsorLinksEnabled())) throw new UserError('Sponsor approval links are turned off. A super admin can turn them back on in Admin › Platform.');
    const token = randomToken(24);
    const expires = new Date(Date.now() + 30 * 86400000);
    const recipient = str(fd, 'recipient_name', 120);
    const sql = await db();
    await sql`insert into share_links (item_id, stage_id, version, token_hash, recipient_name, created_by, expires_at)
              values (${itemId}, ${stage.id}, ${state.version!}, ${sha256(token)}, ${recipient}, ${me.id}, ${expires})`;
    await logActivity(sql, { eventId: item.event_id, itemId, userId: me.id, actorName: me.full_name, kind: 'share_link',
      message: `Created a sponsor approval link${recipient ? ` for ${recipient}` : ''} (v${state.version})` });
    refresh(itemId);
    return { ok: true, message: 'Link created. Copy it and send it to the sponsor.', data: { url: `${await appOrigin()}/p/${token}` } };
  });
}

export async function revokeShareLink(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const linkId = uuidOrNull(fd, 'link_id');
    if (!linkId) throw new UserError('Missing link.');
    const sql = await db();
    const [l] = await sql<{ item_id: string; event_id: string }[]>`
      update share_links s set revoked_at = now() from items i where s.id = ${linkId} and i.id = s.item_id and s.revoked_at is null
      returning s.item_id, i.event_id`;
    if (l) {
      await logActivity(sql, { eventId: l.event_id, itemId: l.item_id, userId: me.id, actorName: me.full_name, kind: 'share_link', message: 'Turned off a sponsor approval link' });
      refresh(l.item_id);
    }
    return { ok: true, message: 'Link turned off.' };
  });
}
