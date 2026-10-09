import 'server-only';
import type { Sql } from '@/lib/db';
import { hashPassword, tempPassword } from '@/lib/auth/password';
import { logActivity } from '@/lib/activity';
import { DEFAULT_STAGES, suggestedDeadlines } from '@/lib/data/seed';
import type { ProductionStatus } from '@/lib/domain/types';
import { readSetting, writeSetting } from '@/lib/settings';

// Sample data to try the platform with: a show, sections, suppliers, sponsors, a sample team, and organiser and
// sponsor signage in every status. Everything it makes is remembered so it can be removed in one go.

export const SAMPLE_KEY = 'sample_data';
export const SAMPLE_SHOW = 'UKCW Birmingham 2027 (sample)';
const SAMPLE_DOMAIN = 'sample.ukcw.test';

export interface SampleRecord { eventId: string; userIds: string[]; supplierIds: string[]; createdAt: string }

export async function sampleRecord(sql: Sql): Promise<SampleRecord | null> {
  const raw = await readSetting(sql, SAMPLE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as SampleRecord; } catch { return null; }
}

type Role = 'manager' | 'user';
const PEOPLE: { key: string; name: string; title: string; role: Role; dept: string; approves?: string[] }[] = [
  { key: 'sam', name: 'Sam Okafor', title: 'Operations Manager', role: 'manager', dept: 'Operations', approves: ['Operations'] },
  { key: 'maya', name: 'Maya Lindqvist', title: 'Marketing Manager', role: 'manager', dept: 'Marketing', approves: ['Marketing'] },
  { key: 'dev', name: 'Dev Chandra', title: 'Event Director', role: 'manager', dept: 'Operations', approves: ['Final sign-off'] },
  { key: 'alex', name: 'Alex Byrne', title: 'Account Manager', role: 'manager', dept: 'Sales' },
  { key: 'priya', name: 'Priya Nair', title: 'Sponsorship Manager', role: 'manager', dept: 'Sales' },
  { key: 'jordan', name: 'Jordan Reyes', title: 'Designer, Media10 Studio', role: 'manager', dept: 'Content' },
  { key: 'riley', name: 'Riley Morgan', title: 'Finance', role: 'user', dept: 'Sales' },
  { key: 'casey', name: 'Casey Whitfield', title: 'Agency designer', role: 'user', dept: 'External' },
];

const SUPPLIERS = [
  { name: 'Printworks UK (sample)', contact: 'Dana Hill', os: true, ss: true, si: true, scope: 'Print and install all organiser signage, hanging banners and feature-area walling. Supply and fit floor stickers.' },
  { name: 'Bannerline (sample)', contact: 'Omar Said', os: true, ss: true, si: false, scope: 'Fabric and PVC banners, lectern boards and foamex panels. Delivery to venue; installation by the venue team.' },
  { name: 'Venue Graphics Team (sample)', contact: 'NEC graphics desk', os: true, ss: false, si: false, scope: 'Entrance headers, kiosk graphics and venue-owned digital screens.' },
  { name: 'Quickprint Online (sample)', contact: null, os: false, ss: true, si: true, scope: 'Short-run A4 and A3 signage, table stickers and badge-collection graphics.' },
];

const SPONSORS: { name: string; pkg: string; am: string | null; contact: string }[] = [
  { name: 'BuildRight Ltd', pkg: 'Headline partner', am: 'alex', contact: 'Hannah Cole' },
  { name: 'Steelway Systems', pkg: 'Gold sponsor', am: 'priya', contact: 'Tom Adebayo' },
  { name: 'SolarPeak Energy', pkg: 'Stage sponsor', am: 'alex', contact: 'Lena Fischer' },
  { name: 'Nordic Timber', pkg: 'Lounge sponsor', am: null, contact: 'Erik Dahl' },
  { name: 'Zenith Software', pkg: 'Bar sponsor', am: 'priya', contact: 'Aisha Khan' },
];

const SECTIONS = [
  'G1 General', 'G4 Registration and cross over', 'F1 UKCW Main Stage', 'F2 Digitalisation and AI Stage',
  'F9 VIP Lounge', 'F10 Sales Lounge', 'Hall 4 – Entrance', 'Hall 4 – Main Bar Branding', 'Floor stickers',
];

/** Where a line should end up: the sheet's six words, plus a held-up one. */
type Target = 'ready' | 'artworked' | 'changes' | 'approved' | 'sent' | 'printed' | 'installed';

interface Line {
  code: string; desc: string; section?: string; sponsor?: string; type: string; material: string | null;
  w: number | null; h: number | null; sides: 'single' | 'double' | null; bleed?: number; a?: string; b?: string;
  qty: number; cost: number | null; hall: string | null; zone: string | null; spot?: string; supplier: number; target: Target;
}

const ORGANISER: Line[] = [
  { code: 'G1.1', desc: 'Organisers office sign', section: 'G1 General', type: 'Door sign', material: 'PVC with foamex', w: 600, h: 600, sides: 'single', a: 'ORGANISERS OFFICE', qty: 1, cost: 45, hall: 'Hall 4', zone: "Organiser's office", supplier: 0, target: 'installed' },
  { code: 'G1.2', desc: 'Entrance header', section: 'G1 General', type: 'Entrance header', material: 'Vinyl', w: 7500, h: 800, sides: 'single', a: 'UKCW creative with show sections', qty: 2, cost: null, hall: 'Hall 4', zone: 'Hall entrance', supplier: 2, target: 'printed' },
  { code: 'G1.3', desc: 'Kiosk headers', section: 'G1 General', type: 'Kiosk header', material: 'Foamex', w: 420, h: 297, sides: 'single', a: 'EXHIBITOR BADGE COLLECTION / Registration', qty: 4, cost: null, hall: 'Hall 4', zone: 'Entrance / registration', supplier: 2, target: 'printed' },
  { code: 'G1.9', desc: 'You are here board', section: 'G1 General', type: 'Floorplan board', material: 'Falcon board', w: 2000, h: 1200, sides: 'double', a: 'Floorplan and listing', b: 'Show sections and timetable', qty: 3, cost: 495, hall: 'Hall 4', zone: 'Boulevard / concourse', supplier: 0, target: 'approved' },
  { code: 'REF01', desc: 'Registration left wall', section: 'G4 Registration and cross over', type: 'Wall graphic', material: 'Vinyl', w: 2000, h: 2500, sides: 'single', bleed: 50, a: 'Welcome to UK Construction Week', qty: 1, cost: 165, hall: 'Hall 4', zone: 'Entrance / registration', supplier: 0, target: 'installed' },
  { code: 'REF02', desc: 'Registration back wall', section: 'G4 Registration and cross over', type: 'Wall graphic', material: 'Vinyl', w: 7500, h: 2500, sides: 'single', bleed: 50, a: 'The national platform for the built environment', qty: 1, cost: 590, hall: 'Hall 4', zone: 'Entrance / registration', supplier: 0, target: 'installed' },
  { code: 'REF03', desc: 'Registration counter front', section: 'G4 Registration and cross over', type: 'Counter graphic', material: 'Vinyl', w: 4000, h: 1000, sides: 'single', a: 'Registration', qty: 1, cost: 210, hall: 'Hall 4', zone: 'Entrance / registration', supplier: 0, target: 'sent' },
  { code: 'REF17', desc: 'Registration rear panels', section: 'G4 Registration and cross over', type: 'Wall graphic', material: null, w: 2000, h: 2500, sides: 'single', qty: 2, cost: null, hall: 'Hall 4', zone: 'Entrance / registration', supplier: 0, target: 'ready' },
  { code: 'F1.1', desc: 'Main stage lectern board', section: 'F1 UKCW Main Stage', type: 'Lectern board', material: 'Foamex', w: 400, h: 1200, sides: 'single', a: 'UKCW Main Stage / media partners', qty: 1, cost: 32, hall: 'Hall 4', zone: 'Main stage', supplier: 1, target: 'approved' },
  { code: 'F1.2', desc: 'CPD accreditation sign with QR code', section: 'F1 UKCW Main Stage', type: 'Freestanding sign', material: 'Falcon board', w: 600, h: 1500, sides: 'double', a: 'CPD accredited: scan to log your hours', b: 'Today’s programme', qty: 1, cost: 110, hall: 'Hall 4', zone: 'Main stage', supplier: 1, target: 'artworked' },
  { code: 'F1.4', desc: 'Plain black fabric end wall panels', section: 'F1 UKCW Main Stage', type: 'Fabric wall', material: 'Stretch fabric', w: 1300, h: 3000, sides: 'single', bleed: 150, a: 'Plain black', qty: 2, cost: 225, hall: 'Hall 4', zone: 'Main stage', supplier: 0, target: 'ready' },
  { code: 'F2.1', desc: 'Digitalisation stage lectern board', section: 'F2 Digitalisation and AI Stage', type: 'Lectern board', material: 'Foamex', w: 400, h: 1200, sides: 'single', a: 'Digitalisation & AI Stage / media partners', qty: 2, cost: 32, hall: 'Hall 4', zone: 'Theatre', supplier: 1, target: 'changes' },
  { code: 'F2.3', desc: 'Hub walling (inside)', section: 'F2 Digitalisation and AI Stage', type: 'Fabric wall', material: 'Stretch fabric', w: 4000, h: 2400, sides: 'single', bleed: 150, a: 'Digitalisation & AI Stage branding', qty: 1, cost: null, hall: 'Hall 4', zone: 'Theatre', supplier: 0, target: 'artworked' },
  { code: 'F9.1', desc: 'VIP lounge inside wall', section: 'F9 VIP Lounge', type: 'Fabric wall', material: 'Stretch fabric', w: 8000, h: 2400, sides: 'single', bleed: 150, a: 'New UKCW logo and tagline', qty: 1, cost: null, hall: 'Hall 4', zone: 'VIP / partner lounge', supplier: 0, target: 'ready' },
  { code: 'F9.6', desc: 'VIP lounge entrance banner', section: 'F9 VIP Lounge', type: 'Banner', material: 'Fabric', w: 2400, h: 300, sides: 'single', a: 'VIP & Speaker Lounge', qty: 1, cost: 75, hall: 'Hall 4', zone: 'VIP / partner lounge', supplier: 1, target: 'ready' },
  { code: 'F10.1', desc: 'Sales lounge wall A', section: 'F10 Sales Lounge', type: 'Fabric wall', material: 'Stretch fabric', w: 1400, h: 2400, sides: 'single', bleed: 150, a: 'Sales lounge branding / save the date London 2028', qty: 1, cost: 175, hall: 'Hall 4', zone: 'Feature area', supplier: 0, target: 'artworked' },
  { code: 'F10.11', desc: 'Sales lounge low walling A', section: 'F10 Sales Lounge', type: 'Fabric wall', material: 'Stretch fabric', w: 3800, h: 1000, sides: 'single', bleed: 150, a: 'UKCW branding and slogan; two floorplans', qty: 1, cost: 245, hall: 'Hall 4', zone: 'Feature area', supplier: 0, target: 'ready' },
  { code: 'H4Banner', desc: 'Hall 4 entrance banner', section: 'Hall 4 – Entrance', type: 'Banner', material: 'Eco-friendly textile', w: 7500, h: 700, sides: 'single', a: 'UKCW branding', qty: 2, cost: null, hall: 'Hall 4', zone: 'Hall entrance', supplier: 2, target: 'sent' },
  { code: 'Reg1', desc: 'UKCW branding on kiosks', section: 'Hall 4 – Entrance', type: 'Kiosk graphic', material: '1mm foamex', w: 420, h: 297, sides: 'single', a: 'UKCW branding', qty: 1, cost: null, hall: 'Hall 4', zone: 'Entrance / registration', supplier: 2, target: 'installed' },
  { code: 'BadgeBIN1', desc: 'Badge collection bin', section: 'Hall 4 – Entrance', type: 'Bin wrap', material: 'Vinyl', w: 500, h: 500, sides: 'single', a: 'Recycle your badge here', qty: 1, cost: 15, hall: 'Hall 4', zone: 'Hall entrance', supplier: 3, target: 'approved' },
  { code: 'FS01', desc: 'Floor sticker to main stage', section: 'Floor stickers', type: 'Floor sticker', material: 'Lino', w: 1000, h: 1000, sides: 'single', a: 'Main Stage this way (arrow)', qty: 4, cost: 48, hall: 'Hall 4', zone: 'Aisles', supplier: 0, target: 'ready' },
  { code: 'GL1', desc: 'UKCW giant letters', section: 'G1 General', type: 'Giant letters', material: 'Vinyl wrap', w: null, h: null, sides: null, a: 'UKCW', qty: 1, cost: 680, hall: 'Hall 4', zone: 'Boulevard / concourse', supplier: 0, target: 'printed' },
];

const SPONSOR_LINES: Line[] = [
  { code: 'MS.1', desc: 'Main stage left of screen', sponsor: 'BuildRight Ltd', type: 'Fabric wall', material: 'Fabric', w: 5000, h: 3000, sides: 'single', a: 'UKCW branding with BuildRight logo', qty: 1, cost: 390, hall: 'Hall 4', zone: 'Main stage', supplier: 1, target: 'approved' },
  { code: 'MS.2', desc: 'Main stage right of screen', sponsor: 'BuildRight Ltd', type: 'Fabric wall', material: 'Fabric', w: 5000, h: 3000, sides: 'single', a: 'UKCW branding with BuildRight logo', qty: 1, cost: 390, hall: 'Hall 4', zone: 'Main stage', supplier: 1, target: 'approved' },
  { code: 'MS.5', desc: 'Main stage CPD sign with sponsor logo', sponsor: 'BuildRight Ltd', type: 'Freestanding sign', material: 'Falcon board', w: 600, h: 1500, sides: 'single', a: 'CPD accredited, sponsored by BuildRight', qty: 1, cost: 110, hall: 'Hall 4', zone: 'Main stage', supplier: 1, target: 'installed' },
  { code: 'F3.4', desc: 'Building envelope stage hub wall (reverse)', sponsor: 'SolarPeak Energy', type: 'Fabric wall', material: 'Stretch fabric', w: 6000, h: 2400, sides: 'single', bleed: 150, a: 'Media partners and SolarPeak logo', qty: 1, cost: 560, hall: 'Hall 4', zone: 'Theatre', supplier: 0, target: 'artworked' },
  { code: 'SP1', desc: 'SolarPeak counter board', sponsor: 'SolarPeak Energy', type: 'Counter graphic', material: 'Foamex', w: 400, h: 300, sides: 'single', a: 'SolarPeak logo, stand D21', qty: 1, cost: 15, hall: 'Hall 4', zone: 'Aisles', spot: 'Stand D21', supplier: 3, target: 'ready' },
  { code: 'MBar1', desc: 'Main bar header', sponsor: 'Zenith Software', type: 'Bar graphic', material: 'Vinyl', w: 1500, h: 700, sides: 'single', a: 'Bar sponsored by Zenith (logo)', qty: 1, cost: null, hall: 'Hall 4', zone: 'Café / catering', supplier: 2, target: 'sent' },
  { code: 'MBar5', desc: 'Table top stickers', sponsor: 'Zenith Software', type: 'Table sticker', material: 'Vinyl', w: 600, h: 600, sides: 'single', a: 'Bar sponsored by Zenith (logo)', qty: 8, cost: 20, hall: 'Hall 4', zone: 'Café / catering', supplier: 3, target: 'printed' },
  { code: 'TouchBar', desc: 'Touch-to-win pad sticker', sponsor: 'Zenith Software', type: 'Sticker', material: 'Vinyl', w: 210, h: 150, sides: 'single', a: 'TOUCH TO WIN: touch your badge for a chance to win', qty: 1, cost: null, hall: 'Hall 4', zone: 'Café / catering', supplier: 3, target: 'changes' },
  { code: 'F8.3', desc: 'Networking lounge back wall', sponsor: 'Steelway Systems', type: 'Fabric wall', material: 'Stretch fabric', w: 4000, h: 2300, sides: 'single', bleed: 150, a: 'Networking Lounge in partnership with Steelway', qty: 1, cost: 290, hall: 'Hall 4', zone: 'Networking lounge', supplier: 0, target: 'ready' },
  { code: 'F9.3', desc: 'VIP lounge end wall with sponsor logo', sponsor: 'Nordic Timber', type: 'Fabric wall', material: 'Stretch fabric', w: 2400, h: 2400, sides: 'single', bleed: 150, a: 'UKCW logo, tagline and Nordic Timber logo, step and repeat', qty: 1, cost: null, hall: 'Hall 4', zone: 'VIP / partner lounge', supplier: 0, target: 'ready' },
];

const PRODUCTION_FOR: Partial<Record<Target, ProductionStatus>> = { sent: 'sent_to_supplier', printed: 'in_production', installed: 'installed' };

export interface SampleResult { eventId: string; people: { name: string; email: string; role: Role; password: string }[]; lines: number }

/** Adds the sample show and everything in it. Refuses if sample data is already there. */
export async function addSampleData(sql: Sql, me: { id: string; full_name: string }): Promise<SampleResult> {
  if (await sampleRecord(sql)) throw new Error('Sample data is already there. Remove it first.');
  const [clash] = await sql`select 1 from events where lower(name) = lower(${SAMPLE_SHOW})`;
  if (clash) throw new Error(`A show called ${SAMPLE_SHOW} already exists.`);

  const people: SampleResult['people'] = [];
  const result = await sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    // The show, with the usual stages and deadlines counted back from the opening day
    const open = '2027-10-05';
    const d = suggestedDeadlines(open);
    const [ev] = await t<{ id: string }[]>`
      insert into events (name, venue, build_start, show_open, show_close, breakdown_end, budget, warn_days, turnaround_days,
        art_due_os, print_due_os, art_due_ss, print_due_ss, art_due_si, print_due_si)
      values (${SAMPLE_SHOW}, 'NEC Birmingham', '2027-10-02', ${open}, '2027-10-07', '2027-10-08', 25000, 7, 3,
        ${d.art_due_os}, ${d.print_due_os}, ${d.art_due_ss}, ${d.print_due_ss}, ${d.art_due_si}, ${d.print_due_si})
      returning id`;
    const depts = await t<{ id: string; name: string }[]>`select id, name from departments`;
    const deptId = (name: string | null) => (name ? depts.find((x) => x.name.toLowerCase() === name.toLowerCase())?.id ?? null : null);
    const stages = new Map<string, string>();
    let pos = 1;
    for (const s of DEFAULT_STAGES) {
      const [st] = await t<{ id: string }[]>`
        insert into stages (event_id, position, name, department_id, uses_account_manager, applies_os, applies_ss, applies_si)
        values (${ev.id}, ${pos++}, ${s.name}, ${deptId(s.department)}, ${s.uses_account_manager}, ${s.applies_os}, ${s.applies_ss}, ${s.applies_si}) returning id`;
      stages.set(s.name, st.id);
    }
    await t`insert into event_departments (event_id, department_id)
            select distinct ${ev.id}::uuid, department_id from stages where event_id = ${ev.id} and department_id is not null on conflict do nothing`;

    // The team: invited with temporary passwords, in their departments, approving their stages
    const userIds: string[] = [];
    const users = new Map<string, string>();
    for (const p of PEOPLE) {
      const email = `${p.key}@${SAMPLE_DOMAIN}`;
      const password = tempPassword();
      const [u] = await t<{ id: string }[]>`
        insert into users (email, full_name, job_title, role, password_hash, must_change_password, temp_password_expires_at, invited_by, invited_at)
        values (${email}, ${p.name}, ${p.title}, ${p.role}, ${await hashPassword(password)}, true, ${new Date(Date.now() + 30 * 86400000)}, ${me.id}, now())
        returning id`;
      users.set(p.key, u.id);
      userIds.push(u.id);
      people.push({ name: p.name, email, role: p.role, password });
      const did = deptId(p.dept);
      if (did) await t`insert into user_departments (user_id, department_id) values (${u.id}, ${did}) on conflict do nothing`;
      for (const stageName of p.approves ?? []) {
        const sid = stages.get(stageName);
        if (sid) {
          await t`insert into stage_approvers (stage_id, user_id) values (${sid}, ${u.id}) on conflict do nothing`;
          await t`update stages set approver_id = coalesce(approver_id, ${u.id}) where id = ${sid}`;
        }
      }
    }
    await t`update events set studio_owner_id = ${users.get('jordan')!}, production_owner_id = ${users.get('sam')!} where id = ${ev.id}`;

    // Suppliers (shared by every show, so named as sample)
    const supplierIds: string[] = [];
    for (const s of SUPPLIERS) {
      const [row] = await t<{ id: string }[]>`
        insert into suppliers (name, contact_name, scope_of_work, works_on_os, works_on_ss, works_on_si, notes)
        values (${s.name}, ${s.contact}, ${s.scope}, ${s.os}, ${s.ss}, ${s.si}, 'Sample data')
        on conflict ((lower(name))) do update set notes = 'Sample data' returning id`;
      supplierIds.push(row.id);
    }

    // Sponsors, with account managers from the sample team (one left without, so it shows up as needing attention)
    const sponsors = new Map<string, string>();
    for (const s of SPONSORS) {
      const [row] = await t<{ id: string }[]>`
        insert into sponsors (event_id, name, package, account_manager_id, contact_name)
        values (${ev.id}, ${s.name}, ${s.pkg}, ${s.am ? users.get(s.am)! : null}, ${s.contact}) returning id`;
      sponsors.set(s.name, row.id);
    }

    // Sections, in sheet order
    const sections = new Map<string, string>();
    for (let i = 0; i < SECTIONS.length; i++) {
      const [row] = await t<{ id: string }[]>`insert into sections (event_id, name, position) values (${ev.id}, ${SECTIONS[i]}, ${i + 1}) returning id`;
      sections.set(SECTIONS[i], row.id);
    }

    // Signage, created over the past weeks, with sign-off and production as far along as its target status
    const createdBase = Date.now() - 28 * 86400000;
    let n = 0;
    const addLines = async (lines: Line[], category: 'organiser_signage' | 'sponsor_signage') => {
      for (const l of lines) {
        n += 1;
        const createdAt = new Date(createdBase + n * 3600000);
        const started = l.target !== 'ready'; // sign-off under way or finished: no artwork step needed in the sample
        const [row] = await t<{ id: string; ref_no: number }[]>`
          insert into items (event_id, category, description, plan_code, section_id, sponsor_id, item_type, material, width_mm, height_mm, sides, bleed_mm,
            wording, wording_side2, qty, unit_cost, hall, zone, location_detail, artwork_by, supplier_id, production_status, po_number, created_by, created_at, updated_at)
          values (${ev.id}, ${category}, ${l.desc}, ${l.code}, ${l.section ? sections.get(l.section)! : null}, ${l.sponsor ? sponsors.get(l.sponsor)! : null},
            ${l.type}, ${l.material}, ${l.w}, ${l.h}, ${l.sides}, ${l.bleed ?? null}, ${l.a ?? null}, ${l.sides === 'double' ? l.b ?? null : null}, ${l.qty}, ${l.cost},
            ${l.hall}, ${l.zone}, ${l.spot ?? null}, ${started ? 'not_required' : category === 'sponsor_signage' ? 'sponsor' : 'in_house'},
            ${supplierIds[l.supplier]}, ${PRODUCTION_FOR[l.target] ?? null}, ${PRODUCTION_FOR[l.target] ? `PO-27${String(n).padStart(3, '0')}` : null},
            ${me.id}, ${createdAt}, ${createdAt})
          returning id, ref_no`;
        await logActivity(t, { eventId: ev.id, itemId: row.id, userId: me.id, actorName: me.full_name, kind: 'created', message: 'Added as sample data' });
        if (!started) continue;
        // Decisions in stage order, each a little after the last
        const order = category === 'sponsor_signage' ? ['Operations', 'Marketing', 'Sponsor', 'Final sign-off'] : ['Operations', 'Marketing', 'Final sign-off'];
        const decider = (stage: string): { id: string; name: string } => {
          if (stage === 'Sponsor') {
            const sp = SPONSORS.find((s) => s.name === l.sponsor);
            const am = sp?.am ? users.get(sp.am) : null;
            return am ? { id: am, name: PEOPLE.find((p) => p.key === sp!.am)!.name } : { id: me.id, name: me.full_name };
          }
          const key = stage === 'Operations' ? 'sam' : stage === 'Marketing' ? 'maya' : 'dev';
          return { id: users.get(key)!, name: PEOPLE.find((p) => p.key === key)!.name };
        };
        const upTo = l.target === 'artworked' ? 1 : l.target === 'changes' ? 1 : order.length; // approved through this many stages
        for (let i = 0; i < order.length; i++) {
          const stageId = stages.get(order[i])!;
          const at = new Date(createdAt.getTime() + (i + 1) * 86400000);
          const who = decider(order[i]);
          if (i < upTo) {
            await t`insert into decisions (item_id, event_id, stage_id, version, decision, comment, decided_by, decided_by_name, decided_at)
                    values (${row.id}, ${ev.id}, ${stageId}, 0, 'approved', null, ${who.id}, ${who.name}, ${at})`;
          } else if (l.target === 'changes' && i === upTo) {
            await t`insert into decisions (item_id, event_id, stage_id, version, decision, comment, decided_by, decided_by_name, decided_at)
                    values (${row.id}, ${ev.id}, ${stageId}, 0, 'changes_requested', 'Logo is too small on the proof, please enlarge.', ${who.id}, ${who.name}, ${at})`;
            break;
          } else break;
        }
      }
    };
    await addLines(ORGANISER, 'organiser_signage');
    await addLines(SPONSOR_LINES, 'sponsor_signage');

    const record: SampleRecord = { eventId: ev.id, userIds, supplierIds, createdAt: new Date().toISOString() };
    await writeSetting(t, SAMPLE_KEY, JSON.stringify(record));
    await logActivity(t, { eventId: ev.id, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings',
      message: `Added sample data: ${SAMPLE_SHOW} with ${n} lines, ${PEOPLE.length} people, ${SPONSORS.length} sponsors and ${SUPPLIERS.length} suppliers` });
    return { eventId: ev.id, lines: n };
  });
  return { ...result, people };
}

/** Removes everything the sample data made: the show (and all its lines), the sample people and suppliers. */
export async function removeSampleData(sql: Sql, me: { id: string; full_name: string }): Promise<{ removed: boolean }> {
  const rec = await sampleRecord(sql);
  if (!rec) return { removed: false };
  await sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    await t`delete from events where id = ${rec.eventId}`;
    for (const id of rec.userIds) await t`delete from users where id = ${id} and email like ${'%@' + SAMPLE_DOMAIN}`;
    for (const id of rec.supplierIds) {
      const [{ n }] = await t<{ n: number }[]>`select count(*)::int as n from items where supplier_id = ${id}`;
      if (n === 0) await t`delete from suppliers where id = ${id}`;
    }
    await t`delete from app_settings where key = ${SAMPLE_KEY}`;
    await logActivity(t, { eventId: null, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings', message: 'Removed the sample data' });
  });
  return { removed: true };
}
