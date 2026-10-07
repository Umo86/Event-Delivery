import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { londonDate } from '@/lib/dates';
import { computeItemState, type EngineContext, type ItemState } from '@/lib/domain/engine';
import { itemCode } from '@/lib/domain/labels';
import type {
  DecisionRow, DepartmentRow, EventRow, ItemRow, SponsorRow, StageRow, SupplierRow, UserRow, VersionRow,
} from '@/lib/domain/types';

export const EVENT_COOKIE = 'ed_event';

export const listEvents = cache(async (): Promise<EventRow[]> => {
  const sql = await db();
  return sql<EventRow[]>`select * from events order by archived, coalesce(show_open, '9999-12-31') desc, created_at desc`;
});

/**
 * The event the person is working in (remembered in a cookie). Without one, it's the next active event
 * to open (or the one running now), then the latest active event.
 */
export const getCurrentEvent = cache(async (): Promise<EventRow | null> => {
  const events = await listEvents();
  if (!events.length) return null;
  const jar = await cookies();
  const wanted = jar.get(EVENT_COOKIE)?.value;
  const active = events.filter((e) => !e.archived);
  const today = londonDate();
  const upcoming = active
    .filter((e) => (e.show_close ?? e.show_open ?? '') >= today)
    .sort((a, b) => (a.show_open ?? '9999').localeCompare(b.show_open ?? '9999'));
  return events.find((e) => e.id === wanted) ?? upcoming[0] ?? active[0] ?? events[0];
});

export interface Bundle {
  event: EventRow;
  stages: StageRow[];
  sponsors: SponsorRow[];
  suppliers: SupplierRow[];
  users: UserRow[];
  departments: DepartmentRow[];
  /** Departments this show has been assigned (a subset of departments). */
  eventDepartmentIds: string[];
  lists: Record<string, string[]>;
  ctx: EngineContext;
}

export const loadBundle = cache(async (eventId: string): Promise<Bundle | null> => {
  const sql = await db();
  const [events, stageRows, approvers, sponsors, suppliers, users, departments, eventDepts, opts] = await Promise.all([
    sql<EventRow[]>`select * from events where id = ${eventId}`,
    sql<StageRow[]>`select * from stages where event_id = ${eventId} and not archived order by position, created_at`,
    sql<{ stage_id: string; user_id: string }[]>`select sa.stage_id, sa.user_id from stage_approvers sa
      join stages s on s.id = sa.stage_id where s.event_id = ${eventId}`,
    sql<SponsorRow[]>`select * from sponsors where event_id = ${eventId} order by lower(name)`,
    sql<SupplierRow[]>`select * from suppliers order by lower(name)`,
    sql<UserRow[]>`select id, email, full_name, job_title, role, active, must_change_password, last_login_at, created_at from users order by lower(full_name)`,
    sql<DepartmentRow[]>`select id, name, position, archived, external from departments where not archived order by position, lower(name)`,
    sql<{ department_id: string }[]>`select department_id from event_departments where event_id = ${eventId}`,
    sql<{ list_key: string; value: string }[]>`select list_key, value from list_options order by list_key, sort, lower(value)`,
  ]);
  const event = events[0];
  if (!event) return null;
  const byStage = new Map<string, string[]>();
  for (const a of approvers) (byStage.get(a.stage_id) ?? byStage.set(a.stage_id, []).get(a.stage_id)!).push(a.user_id);
  const stages = stageRows.map((s) => ({ ...s, approver_ids: byStage.get(s.id) ?? [] }));
  const lists: Record<string, string[]> = {};
  for (const o of opts) (lists[o.list_key] ??= []).push(o.value);
  const ctx: EngineContext = {
    event,
    stages,
    sponsorsById: new Map(sponsors.map((s) => [s.id, s])),
    userNames: new Map(users.map((u) => [u.id, u.full_name])),
    departmentsById: new Map(departments.map((d) => [d.id, d])),
    today: londonDate(),
  };
  return { event, stages, sponsors, suppliers, users, departments, eventDepartmentIds: eventDepts.map((e) => e.department_id), lists, ctx };
});

export interface ScheduleRow {
  item: ItemRow;
  code: string;
  state: ItemState;
  version: VersionRow | null;
  sponsor: SponsorRow | null;
}

export const loadSchedule = cache(async (eventId: string): Promise<{ bundle: Bundle; rows: ScheduleRow[] } | null> => {
  const bundle = await loadBundle(eventId);
  if (!bundle) return null;
  const sql = await db();
  const [items, versions, decisions] = await Promise.all([
    sql<ItemRow[]>`select * from items where event_id = ${eventId}
      order by case category when 'organiser_signage' then 1 when 'sponsor_signage' then 2 else 3 end, ref_no`,
    sql<VersionRow[]>`select distinct on (item_id) * from artwork_versions where event_id = ${eventId} order by item_id, version desc`,
    sql<DecisionRow[]>`select * from decisions where event_id = ${eventId} order by decided_at`,
  ]);
  const vByItem = new Map(versions.map((v) => [v.item_id, v]));
  const dByItem = new Map<string, DecisionRow[]>();
  for (const d of decisions) (dByItem.get(d.item_id) ?? dByItem.set(d.item_id, []).get(d.item_id)!).push(d);
  const rows = items.map((item) => {
    const version = vByItem.get(item.id) ?? null;
    return {
      item,
      code: itemCode(item.category, item.ref_no),
      state: computeItemState(item, version, dByItem.get(item.id) ?? [], bundle.ctx),
      version,
      sponsor: item.sponsor_id ? bundle.ctx.sponsorsById.get(item.sponsor_id) ?? null : null,
    };
  });
  return { bundle, rows };
});

export interface ItemDetail {
  bundle: Bundle;
  row: ScheduleRow;
  versions: VersionRow[];
  decisions: DecisionRow[];
  activity: { id: string; actor_name: string; kind: string; message: string; created_at: Date }[];
  supplier: SupplierRow | null;
  shareLinks: { id: string; stage_id: string; version: number; recipient_name: string | null; created_at: Date; expires_at: Date; used_at: Date | null; revoked_at: Date | null }[];
  /** The number the next upload will get. Never reused, even after a version is removed. */
  nextVersion: number;
}

export async function loadItem(itemId: string): Promise<ItemDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return null;
  const sql = await db();
  const items = await sql<ItemRow[]>`select * from items where id = ${itemId}`;
  const item = items[0];
  if (!item) return null;
  const bundle = await loadBundle(item.event_id);
  if (!bundle) return null;
  const [versions, decisions, activity, shareLinks] = await Promise.all([
    sql<VersionRow[]>`select * from artwork_versions where item_id = ${itemId} order by version desc`,
    sql<DecisionRow[]>`select * from decisions where item_id = ${itemId} order by decided_at`,
    sql<ItemDetail['activity']>`select id, actor_name, kind, message, created_at from activity where item_id = ${itemId} order by created_at desc limit 200`,
    sql<ItemDetail['shareLinks']>`select id, stage_id, version, recipient_name, created_at, expires_at, used_at, revoked_at from share_links where item_id = ${itemId} order by created_at desc`,
  ]);
  const version = versions[0] ?? null;
  const row: ScheduleRow = {
    item,
    code: itemCode(item.category, item.ref_no),
    state: computeItemState(item, version, decisions, bundle.ctx),
    version,
    sponsor: item.sponsor_id ? bundle.ctx.sponsorsById.get(item.sponsor_id) ?? null : null,
  };
  const supplier = item.supplier_id ? bundle.suppliers.find((s) => s.id === item.supplier_id) ?? null : null;
  const nextVersion = Math.max(item.last_version ?? 0, ...versions.map((v) => v.version)) + 1;
  return { bundle, row, versions, decisions, activity, supplier, shareLinks, nextVersion };
}

export const getAppName = cache(async (): Promise<string> => {
  try {
    const sql = await db();
    const r = await sql<{ value: string }[]>`select value from app_settings where key = 'app_name'`;
    return r[0]?.value || 'Event Delivery';
  } catch {
    return 'Event Delivery';
  }
});
