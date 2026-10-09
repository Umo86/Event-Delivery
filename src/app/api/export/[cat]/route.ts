import { getCurrentUser } from '@/lib/auth/session';
import { getCurrentEvent, loadSchedule } from '@/lib/data/load';
import { applyFilters, readFilters } from '@/lib/data/filter';
import { artworkByLabel, categoryBySlug, categoryInfo, decisionLabel, productionLabelFor, sheetStatus, sheetStatusInfo } from '@/lib/domain/labels';

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''; // numbers (even negative margins) are never formulas
  const s = String(v);
  // Neutralise spreadsheet formulas and quote when needed
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(request: Request, ctx: { params: Promise<{ cat: string }> }) {
  const me = await getCurrentUser();
  if (!me) return new Response('Sign in first', { status: 401 });
  const { cat } = await ctx.params;
  const category = cat === 'all' ? null : categoryBySlug(cat);
  if (!category && cat !== 'all') return new Response('Not found', { status: 404 });
  const event = await getCurrentEvent();
  if (!event) return new Response('No event', { status: 404 });
  const sched = await loadSchedule(event.id);
  if (!sched) return new Response('No event', { status: 404 });
  const url = new URL(request.url);
  const filters = readFilters(Object.fromEntries(url.searchParams));
  const rows = applyFilters(category ? sched.rows.filter((r) => r.item.category === category.key) : sched.rows, filters, me.id, event.turnaround_days);
  const names = sched.bundle.ctx.userNames;
  const suppliers = new Map(sched.bundle.suppliers.map((s) => [s.id, s.name]));
  const stages = sched.bundle.stages;

  const sections = new Map(sched.bundle.sections.map((s) => [s.id, s.name]));
  const header = ['ID', 'Signage ID', 'Section', 'List', 'Description', 'Status', 'Sheet status', 'Waiting on', 'Next deadline', 'Flag', 'Days waiting', 'Sponsor', 'Account manager',
    'Type', 'Side A', 'Side B', 'Hall', 'Zone', 'Location', 'Position', 'Width mm', 'Height mm', 'Sides', 'Bleed mm', 'Qty', 'Material', 'Artwork by',
    'Artwork due', 'Artwork version', 'Artwork link', ...stages.map((s) => `${s.name} sign-off`), 'Supplier', 'Print/order deadline',
    'Production status', 'PO number', 'Delivery date', 'Install date', 'Unit cost', 'Total cost',
    // Sponsorship items
    'Rate card price', 'Sold', 'Sale price', 'Margin', 'Sold on', 'Sold by', 'Distribution method',
    'Cancelled', 'Notes'];
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) {
    const it = r.item;
    const total = it.unit_cost ? it.unit_cost * (it.qty && it.qty > 0 ? it.qty : 1) : null;
    const si = it.category === 'sponsor_item';
    const margin = si && it.sponsor_id && it.sale_price !== null ? it.sale_price - (total ?? 0) : null;
    const so = stages.map((s) => {
      const st = r.state.stages.find((x) => x.stage.id === s.id);
      if (!st || !st.applies) return 'N/A';
      if (st.kind === 'approved') return `Approved by ${st.decision?.decided_by_name}`;
      if (st.decision && (st.kind === 'current' || st.kind === 'stale')) return `${decisionLabel(st.decision.decision)} by ${st.decision.decided_by_name}`;
      return st.kind === 'current' ? 'Waiting' : 'Pending';
    });
    const sheet = sheetStatus(r.state.group);
    lines.push([
      r.code, it.plan_code, it.section_id ? sections.get(it.section_id) : '', categoryInfo(it.category).label, it.description, r.state.statusLabel,
      sheet ? sheetStatusInfo(sheet).label : '', r.state.waitingOnLabel, r.state.due,
      r.state.flag ? r.state.flag.replace(/_/g, ' ') : '', r.state.daysWaiting, r.sponsor?.name,
      r.sponsor?.account_manager_id ? names.get(r.sponsor.account_manager_id) : '', it.item_type, it.wording, it.sides === 'double' ? it.wording_side2 : '', it.hall, it.zone,
      it.location_detail, it.position, it.width_mm, it.height_mm, it.sides, it.bleed_mm, it.qty, it.material, artworkByLabel(it.artwork_by),
      it.artwork_due, r.version?.version ?? '', it.artwork_link, ...so, it.supplier_id ? suppliers.get(it.supplier_id) : '',
      it.print_deadline, it.production_status ? productionLabelFor(it.production_status, it.category) : '', it.po_number, it.delivery_date,
      it.install_date, it.unit_cost, total,
      si ? it.rate_card_price : '', si ? (it.sponsor_id ? 'Yes' : 'For sale') : '', si ? it.sale_price : '', margin,
      si && it.sold_at ? new Date(it.sold_at).toISOString().slice(0, 10) : '', si && it.sold_by ? names.get(it.sold_by) : '',
      si ? it.distribution_method : '',
      it.cancelled ? 'Yes' : '', it.notes,
    ].map(csvCell).join(','));
  }
  const fname = `${event.name.replace(/[^A-Za-z0-9]+/g, '-')}-${category?.slug ?? 'all'}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fname}"`,
      'cache-control': 'no-store',
    },
  });
}
