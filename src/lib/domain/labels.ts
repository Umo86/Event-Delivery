import type { ArtworkBy, Category, DecisionValue, Flag, Group, ProductionStatus, Role } from './types';

export const APP_NAME = 'Event Delivery';

export const CATEGORIES: { key: Category; slug: 'os' | 'ss' | 'si'; label: string; short: string; prefix: string }[] = [
  { key: 'organiser_signage', slug: 'os', label: 'Organiser signage', short: 'Organiser', prefix: 'OS' },
  { key: 'sponsor_signage', slug: 'ss', label: 'Sponsor signage', short: 'Sponsor signage', prefix: 'SS' },
  { key: 'sponsor_item', slug: 'si', label: 'Sponsor items', short: 'Sponsor items', prefix: 'SI' },
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

export const ARTWORK_BY: { key: ArtworkBy; label: string }[] = [
  { key: 'in_house', label: 'In-house design' },
  { key: 'sponsor', label: 'Sponsor' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'not_required', label: 'Not required' },
];
export const artworkByLabel = (k: ArtworkBy) => ARTWORK_BY.find((a) => a.key === k)?.label ?? k;

export const PRODUCTION: { key: ProductionStatus; label: string }[] = [
  { key: 'sent_to_supplier', label: 'Sent to supplier' },
  { key: 'in_production', label: 'In production' },
  { key: 'delivered', label: 'Delivered to venue' },
  { key: 'installed', label: 'Installed' },
];
export const productionLabel = (k: ProductionStatus) => PRODUCTION.find((p) => p.key === k)?.label ?? k;

export const DECISIONS: { key: DecisionValue; label: string; verb: string }[] = [
  { key: 'approved', label: 'Approved', verb: 'Approve' },
  { key: 'changes_requested', label: 'Changes requested', verb: 'Request changes' },
  { key: 'rejected', label: 'Rejected', verb: 'Reject' },
  { key: 'on_hold', label: 'On hold', verb: 'Put on hold' },
];
export const decisionLabel = (k: DecisionValue) => DECISIONS.find((d) => d.key === k)?.label ?? k;

export const GROUPS: { key: Group; label: string; tone: Tone }[] = [
  { key: 'awaiting_artwork', label: 'Awaiting artwork', tone: 'grey' },
  { key: 'in_signoff', label: 'In sign-off', tone: 'amber' },
  { key: 'changes_requested', label: 'Changes requested', tone: 'orange' },
  { key: 'rejected', label: 'Rejected', tone: 'red' },
  { key: 'on_hold', label: 'On hold', tone: 'violet' },
  { key: 'approved', label: 'Approved – ready to order', tone: 'lime' },
  { key: 'sent_to_supplier', label: 'Sent to supplier', tone: 'teal' },
  { key: 'in_production', label: 'In production', tone: 'cyan' },
  { key: 'delivered', label: 'Delivered to venue', tone: 'blue' },
  { key: 'installed', label: 'Installed', tone: 'green' },
  { key: 'cancelled', label: 'Cancelled', tone: 'muted' },
];
export const groupInfo = (k: Group) => GROUPS.find((g) => g.key === k)!;

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
  green: 'bg-green-600 text-white ring-green-700',
  muted: 'bg-slate-50 text-slate-400 ring-slate-200 line-through',
  yellow: 'bg-yellow-100 text-yellow-900 ring-yellow-300',
};

/** Solid colours for charts (kept in step with the tones above). */
export const GROUP_CHART_COLOURS: Record<Group, string> = {
  awaiting_artwork: '#94a3b8',
  in_signoff: '#f59e0b',
  changes_requested: '#f97316',
  rejected: '#dc2626',
  on_hold: '#8b5cf6',
  approved: '#84cc16',
  sent_to_supplier: '#14b8a6',
  in_production: '#06b6d4',
  delivered: '#3b82f6',
  installed: '#15803d',
  cancelled: '#cbd5e1',
};
