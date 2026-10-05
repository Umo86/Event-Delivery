import 'server-only';
import { del, head, put } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { db } from '@/lib/db';
import { londonDate } from '@/lib/dates';
import { computeItemState } from '@/lib/domain/engine';
import type { DecisionRow, EventRow, ItemRow, StageRow, VersionRow } from '@/lib/domain/types';
import { DEFAULT_STAGES } from '@/lib/data/seed';
import { blobAccess, blobToken, isBlobConfigured, readBlob } from '@/lib/storage';

export interface CheckStep { step: string; ok: boolean; ms: number; detail?: string }

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/** Runs a full lap of the workflow against the real database and file storage, then cleans up. */
export async function runSystemCheck(): Promise<{ ok: boolean; steps: CheckStep[] }> {
  const steps: CheckStep[] = [];
  const step = async <T>(name: string, fn: () => Promise<T>, detail?: (r: T) => string): Promise<T | null> => {
    const t = Date.now();
    try {
      const r = await fn();
      steps.push({ step: name, ok: true, ms: Date.now() - t, detail: detail?.(r) });
      return r;
    } catch (e) {
      steps.push({ step: name, ok: false, ms: Date.now() - t, detail: (e as Error).message?.slice(0, 300) });
      return null;
    }
  };

  const sql = await step('Connect to the database and apply migrations', () => db(), () => 'connected');
  if (!sql) return { ok: false, steps };
  let eventId: string | null = null;
  let blobUrls: string[] = [];
  try {
    const ev = await step('Create a temporary event with sign-off stages', async () => {
      const [e] = await sql<EventRow[]>`insert into events (name, venue, archived, show_open, print_due_os)
        values ('System check (temporary)', 'ExCeL London', true, '2030-01-10', '2030-01-01') returning *`;
      eventId = e.id;
      let pos = 1;
      for (const s of DEFAULT_STAGES) {
        await sql`insert into stages (event_id, position, name, uses_account_manager, applies_os, applies_ss, applies_si)
                  values (${e.id}, ${pos++}, ${s.name}, ${s.uses_account_manager}, ${s.applies_os}, ${s.applies_ss}, ${s.applies_si})`;
      }
      return e;
    }, (e) => e.id);
    if (!ev) return { ok: false, steps };

    const item = await step('Add a line (automatic ID)', async () => {
      const [a] = await sql<ItemRow[]>`insert into items (event_id, category, description) values (${ev.id}, 'organiser_signage', 'System check sign') returning *`;
      const [b] = await sql<ItemRow[]>`insert into items (event_id, category, description) values (${ev.id}, 'organiser_signage', 'System check sign 2') returning *`;
      if (a.ref_no !== 1 || b.ref_no !== 2) throw new Error(`IDs were ${a.ref_no} and ${b.ref_no}, expected 1 and 2`);
      return a;
    }, (a) => `OS-${String(a.ref_no).padStart(3, '0')}`);
    if (!item) return { ok: false, steps };

    let fileUrl = '';
    let pathname = '';
    if (!isBlobConfigured()) {
      steps.push({ step: 'File storage', ok: false, ms: 0, detail: 'No Blob store connected (BLOB_READ_WRITE_TOKEN missing).' });
    } else {
      const up = await step(`Upload a file to Blob storage (${blobAccess()} store)`, async () => {
        const r = await put(`artwork/${ev.id}/${item.id}/selftest.png`, PNG, {
          access: blobAccess(), addRandomSuffix: true, contentType: 'image/png', token: blobToken(),
        });
        blobUrls.push(r.url);
        return r;
      }, (r) => r.pathname);
      if (up) {
        fileUrl = up.url;
        pathname = up.pathname;
        await step('Check the uploaded file', async () => {
          const h = await head(up.url, { token: blobToken() });
          if (h.size !== PNG.length) throw new Error(`size ${h.size}, expected ${PNG.length}`);
          const b = await readBlob(up.url);
          if (!b) throw new Error('file not found when reading it back');
          const bytes = Buffer.from(await new Response(b.stream).arrayBuffer());
          if (!bytes.equals(PNG)) throw new Error('file content did not match');
          return h;
        }, (h) => `${h.size} bytes, ${h.contentType}`);
        await step('Issue a browser upload token', async () => {
          const t = await generateClientTokenFromReadWriteToken({ token: blobToken(), pathname: `artwork/${ev.id}/${item.id}/x.png`, allowedContentTypes: ['image/png'] });
          if (!t.startsWith('vercel_blob_client_')) throw new Error('unexpected token format');
          return t;
        }, () => 'ok');
      }
    }

    await step('Run artwork through every sign-off stage', async () => {
      const stages = await sql<StageRow[]>`select * from stages where event_id = ${ev.id} order by position`;
      const [v] = await sql<VersionRow[]>`insert into artwork_versions (item_id, event_id, version, file_url, file_pathname, file_name, mime_type, size_bytes)
        values (${item.id}, ${ev.id}, 1, ${fileUrl || 'https://example.invalid/x.png'}, ${pathname || 'none'}, 'selftest.png', 'image/png', ${PNG.length}) returning *`;
      const ctx = { event: ev, stages, sponsorsById: new Map(), userNames: new Map<string, string>(), today: londonDate() };
      const fresh = await sql<ItemRow[]>`select * from items where id = ${item.id}`;
      let state = computeItemState(fresh[0], v, [], ctx);
      if (state.group !== 'in_signoff' || state.currentStage?.name !== stages[0].name) throw new Error(`expected "With ${stages[0].name}", got "${state.statusLabel}"`);
      let t = Date.now();
      for (const s of stages.filter((x) => x.applies_os)) {
        t += 1000;
        await sql`insert into decisions (item_id, event_id, stage_id, version, decision, decided_by_name, decided_at)
                  values (${item.id}, ${ev.id}, ${s.id}, 1, 'approved', 'System check', ${new Date(t)})`;
      }
      const decisions = await sql<DecisionRow[]>`select * from decisions where item_id = ${item.id}`;
      state = computeItemState(fresh[0], v, decisions, ctx);
      if (state.group !== 'approved') throw new Error(`expected approved, got "${state.statusLabel}"`);
      await sql`update items set production_status = 'installed' where id = ${item.id}`;
      const done = await sql<ItemRow[]>`select * from items where id = ${item.id}`;
      state = computeItemState(done[0], v, decisions, ctx);
      if (state.group !== 'installed') throw new Error(`expected installed, got "${state.statusLabel}"`);
      return state;
    }, (s) => `ended as "${s.statusLabel}"`);
  } finally {
    if (blobUrls.length) await step('Delete the test file', async () => { await del(blobUrls, { token: blobToken() }); blobUrls = []; return true; }, () => 'deleted');
    if (eventId) await step('Remove the temporary event', async () => { await sql`delete from events where id = ${eventId}`; return true; }, () => 'removed');
  }
  return { ok: steps.every((s) => s.ok), steps };
}
