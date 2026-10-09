import type { ArtworkBy, Category, DecisionValue, Flag, Group, ProductionStatus, Role } from './types';

export const APP_NAME = 'Event Delivery';

export const CATEGORIES: { key: Category; slug: 'os' | 'ss' | 'si'; label: string; short: string; prefix: string }[] = [
  { key: 'organiser_signage', slug: 'os', label: 'Organiser signage', short: 'Organiser', prefix: 'OS' },
  { key: 'sponsor_signage', slug: 'ss', label: 'Sponsor signage', short: 'Sponsor', prefix: 'SS' },
  { key: 'sponsor_item', slug: 'si', label: 'Sponsorship items', short: 'Sponsorship items', prefix: 'SI' },
];

export function categoryBySlug(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug) ?? null;
}
export function categoryInfo(key: Category) {
  return CATEGORIES.find((c) => c.key === key)!;
}
export function itemCode(category: Category, refNo: number): string {
  return `${categoryInfo(category).prefix}-${String(refNo).padStart(3, '0')}`;
}

// Who supplies the artwork. The form offers Media10 Studio or the sponsor; the other two are kept for older lines
// and for sample data (no artwork step: sign-off starts straight away).
export const ARTWORK_BY: { key: ArtworkBy; label: string; offered: boolean }[] = [
  { key: 'in_house', label: 'Media10 Studio', offered: true },
  { key: 'sponsor', label: 'Sponsor', offered: true },
  { key: 'supplier', label: 'Supplier', offered: false },
  { key: 'not_required', label: 'Not required', offered: false },
];
export const ARTWORK_BY_OFFERED = ARTWORK_BY.filter((a) => a.offered);
export const artworkByLabel = (k: ArtworkBy) => ARTWORK_BY.find((a) => a.key === k)?.label ?? k;

// Production steps, in the words the team uses on the signage sheet: Sent → Printed → Delivered → Installed.
export const PRODUCTION: { key: ProductionStatus; label: string; help: string }[] = [
  { key: 'sent_to_supplier', label: 'Sent', help: 'Sent to the supplier to print or make' },
  { key: 'in_production', label: 'Printed', help: 'Printed or made, not yet at the venue' },
  { key: 'delivered', label: 'Delivered', help: 'At the venue' },
  { key: 'installed', label: 'Installed', help: 'In place' },
];
export const productionLabel = (k: ProductionStatus) => PRODUCTION.find((p) => p.key === k)?.label ?? k;

/** Production steps as worded for a list: sponsorship items are handed out rather than installed. */
export function productionSteps(category: Category): { key: ProductionStatus; label: string }[] {
  return category === 'sponsor_item' ? PRODUCTION.map((p) => (p.key === 'installed' ? { ...p, label: 'Handed out' } : p)) : PRODUCTION;
}
export const productionLabelFor = (k: ProductionStatus, category: Category) =>
  productionSteps(category).find((p) => p.key === k)?.label ?? k;

export const DECISIONS: { key: DecisionValue; label: string; verb: string }[] = [
  { key: 'approved', label: 'Approved', verb: 'Approve' },
  { key: 'changes_requested', label: 'Changes requested', verb: 'Request changes' },
  { key: 'rejected', label: 'Rejected', verb: 'Reject' },
  { key: 'on_hold', label: 'On hold', verb: 'Put on hold' },
];
export const decisionLabel = (k: DecisionValue) => DECISIONS.find((d) => d.key === k)?.label ?? k;

export const GROUPS: { key: Group; label: string; tone: Tone }[] = [
  { key: 'awaiting_artwork', label: 'Ready to artwork', tone: 'grey' },
  { key: 'in_signoff', label: 'Artworked – in sign-off', tone: 'yellow' },
  { key: 'changes_requested', label: 'Changes requested', tone: 'orange' },
  { key: 'rejected', label: 'Rejected', tone: 'red' },
  { key: 'on_hold', label: 'On hold', tone: 'violet' },
  { key: 'approved', label: 'Approved – ready to send', tone: 'orange' },
  { key: 'sent_to_supplier', label: 'Sent', tone: 'teal' },
  { key: 'in_production', label: 'Printed', tone: 'green' },
  { key: 'delivered', label: 'Delivered', tone: 'green' },
  { key: 'installed', label: 'Installed', tone: 'blue' },
  { key: 'cancelled', label: 'Cancelled', tone: 'muted' },
  { key: 'for_sale', label: 'For sale', tone: 'yellow' },
];
export const groupInfo = (k: Group) => GROUPS.find((g) => g.key === k)!;

/**
 * The six words on the signage sheet, with its colours. Every line is one of these, worked out from what has
 * happened to it (artwork uploaded, stages signed off, production updated). Held-up lines (changes requested,
 * rejected, on hold) count as Artworked, with the hold-up shown alongside.
 */
export type SheetStatus = 'ready' | 'artworked' | 'approved' | 'sent' | 'printed' | 'installed';

export const SHEET_STATUSES: { key: SheetStatus; label: string; tone: Tone; swatch: string }[] = [
  { key: 'ready', label: 'Ready to artwork', tone: 'grey', swatch: '#f1f5f9' },
  { key: 'artworked', label: 'Artworked', tone: 'yellow', swatch: '#fef08a' },
  { key: 'approved', label: 'Approved', tone: 'orange', swatch: '#fdba74' },
  { key: 'sent', label: 'Sent', tone: 'teal', swatch: '#99f6e4' },
  { key: 'printed', label: 'Printed', tone: 'green', swatch: '#86efac' },
  { key: 'installed', label: 'Installed', tone: 'blue', swatch: '#bfdbfe' },
];

export function sheetStatus(group: Group): SheetStatus | null {
  switch (group) {
    case 'awaiting_artwork': return 'ready';
    case 'in_signoff': case 'changes_requested': case 'rejected': case 'on_hold': return 'artworked';
    case 'approved': return 'approved';
    case 'sent_to_supplier': return 'sent';
    case 'in_production': case 'delivered': return 'printed';
    case 'installed': return 'installed';
    default: return null; // cancelled, for sale
  }
}
export const sheetStatusInfo = (k: SheetStatus) => SHEET_STATUSES.find((s) => s.key === k)!;

/** Row background for the sheet view, pale so the text stays readable. */
export const SHEET_ROW_CLASSES: Record<SheetStatus, string> = {
  ready: 'bg-white',
  artworked: 'bg-yellow-50',
  approved: 'bg-orange-50',
  sent: 'bg-teal-50',
  printed: 'bg-green-50',
  installed: 'bg-blue-50',
};

/** What kind of job a line is waiting on: new artwork, a sign-off decision, or ordering and delivery. */
export type ActionKind = 'artwork' | 'signoff' | 'production';

export function actionKind(group: Group): ActionKind {
  if (group === 'awaiting_artwork' || group === 'changes_requested' || group === 'rejected') return 'artwork';
  if (group === 'in_signoff' || group === 'on_hold') return 'signoff';
  return 'production';
}

export const ACTION_KIND: Record<ActionKind, { label: string; tone: Tone }> = {
  artwork: { label: 'Artwork', tone: 'violet' },
  signoff: { label: 'Sign-off', tone: 'amber' },
  production: { label: 'Production', tone: 'blue' },
};

export const FLAGS: { key: Flag; label: string; tone: Tone }[] = [
  { key: 'not_signed_off', label: 'Not signed off', tone: 'darkred' },
  { key: 'overdue', label: 'Overdue', tone: 'red' },
  { key: 'due_soon', label: 'Due soon', tone: 'amber' },
  { key: 'slow', label: 'Slow sign-off', tone: 'yellow' },
];
export const flagInfo = (k: Flag) => FLAGS.find((f) => f.key === k)!;

export const ROLES: { key: Role; label: string; help: string }[] = [
  { key: 'super_admin', label: 'Super Admin', help: 'Full control of everything, including people and settings' },
  { key: 'manager', label: 'Manager', help: 'Add, edit and remove signage, change status, create events, sign off their stages' },
  { key: 'user', label: 'User', help: 'Read only' },
];

export const VENUES = ['ExCeL London', 'NEC Birmingham', 'Other'] as const;

export type Tone =
  | 'grey' | 'amber' | 'orange' | 'red' | 'darkred' | 'violet' | 'lime' | 'teal' | 'cyan' | 'blue' | 'green' | 'muted' | 'yellow';

/** Tailwind classes for each tone (chips, badges). */
export const TONE_CLASSES: Record<Tone, string> = {
  grey: 'bg-slate-100 text-slate-700 ring-slate-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  orange: 'bg-orange-50 text-orange-800 ring-orange-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  darkred: 'bg-red-700 text-white ring-red-800',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  lime: 'bg-lime-50 text-lime-800 ring-lime-200',
  teal: 'bg-teal-50 text-teal-800 ring-teal-200',
  cyan: 'bg-cyan-50 text-cyan-800 ring-cyan-200',
  blue: 'bg-blue-50 text-blue-800 ring-blue-200',
  green: 'bg-green-100 text-green-900 ring-green-300',
  muted: 'bg-slate-50 text-slate-400 ring-slate-200 line-through',
  yellow: 'bg-yellow-100 text-yellow-900 ring-yellow-300',
};

/** Solid colours for charts (kept in step with the tones above). */
export const GROUP_CHART_COLOURS: Record<Group, string> = {
  awaiting_artwork: '#94a3b8',
  in_signoff: '#eab308',
  changes_requested: '#f97316',
  rejected: '#dc2626',
  on_hold: '#8b5cf6',
  approved: '#fb923c',
  sent_to_supplier: '#14b8a6',
  in_production: '#22c55e',
  delivered: '#16a34a',
  installed: '#3b82f6',
  for_sale: '#facc15',
  cancelled: '#cbd5e1',
};
