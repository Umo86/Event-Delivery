import type { ScheduleRow } from './load';
import { urgencyCompare } from '@/lib/domain/engine';

export interface Filters {
  q?: string;
  status?: string; // group key, 'attention', 'open'
  waiting?: string; // user id, 'me', 'unassigned'
  sponsor?: string; // sponsor id or 'none'
  supplier?: string; // supplier id or 'none'
  flag?: string; // flag key or 'any'
  hall?: string;
  cancelled?: string; // '1' to include cancelled lines
  sort?: string; // 'ref' | 'due' | 'urgency' | 'waiting'
}

export function readFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : undefined;
  };
  return {
    q: one('q'), status: one('status'), waiting: one('waiting'), sponsor: one('sponsor'), supplier: one('supplier'),
    flag: one('flag'), hall: one('hall'), cancelled: one('cancelled'), sort: one('sort'),
  };
}

export function applyFilters(rows: ScheduleRow[], f: Filters, meId: string): ScheduleRow[] {
  const q = f.q?.toLowerCase();
  let out = rows.filter((r) => {
    const s = r.state;
    if (s.group === 'cancelled' && f.cancelled !== '1' && f.status !== 'cancelled') return false;
    if (f.status) {
      if (f.status === 'attention' && s.phase !== 3) return false;
      if (f.status === 'open' && !(s.phase >= 1 && s.phase <= 4)) return false;
      if (f.status === 'approved_plus' && s.phase !== 4 && s.phase !== 5) return false;
      if (!['attention', 'open', 'approved_plus'].includes(f.status) && s.group !== f.status) return false;
    }
    if (f.waiting) {
      if (f.waiting === 'me' && s.waitingOnUserId !== meId) return false;
      if (f.waiting === 'unassigned' && !(s.waitingOnLabel && !s.waitingOnUserId)) return false;
      if (!['me', 'unassigned'].includes(f.waiting) && s.waitingOnUserId !== f.waiting) return false;
    }
    if (f.sponsor) {
      if (f.sponsor === 'none' ? r.item.sponsor_id : r.item.sponsor_id !== f.sponsor) return false;
    }
    if (f.supplier) {
      if (f.supplier === 'none' ? r.item.supplier_id : r.item.supplier_id !== f.supplier) return false;
    }
    if (f.flag) {
      if (f.flag === 'any') { if (!s.flag) return false; }
      else if (f.flag === 'urgent') { if (s.rank !== 1) return false; }
      else if (s.flag !== f.flag) return false;
    }
    if (f.hall && r.item.hall !== f.hall) return false;
    if (q) {
      const hay = [r.code, r.item.description, r.item.wording, r.item.item_type, r.item.hall, r.item.zone, r.item.location_detail,
        r.sponsor?.name, r.item.po_number, r.item.notes].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  if (f.sort === 'due') out = [...out].sort((a, b) => (a.state.due ?? '9999').localeCompare(b.state.due ?? '9999') || a.item.ref_no - b.item.ref_no);
  else if (f.sort === 'urgency') out = [...out].sort((a, b) => urgencyCompare(a.state, b.state) || a.item.ref_no - b.item.ref_no);
  else if (f.sort === 'waiting') out = [...out].sort((a, b) => a.state.waitingOnLabel.localeCompare(b.state.waitingOnLabel) || a.item.ref_no - b.item.ref_no);
  return out;
}

export function filterQuery(f: Filters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}
