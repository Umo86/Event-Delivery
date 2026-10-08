import { addDays } from '@/lib/dates';

// Artwork and print deadlines for a new show, counted back from its opening day.
// No server-only imports: the New show page previews them before the show is created.

export const DEADLINE_RULES = [
  { key: 'art_due_os', list: 'Organiser signage', what: 'artwork due', weeks: 6 },
  { key: 'print_due_os', list: 'Organiser signage', what: 'print deadline', weeks: 3 },
  { key: 'art_due_ss', list: 'Sponsor signage', what: 'artwork due', weeks: 8 },
  { key: 'print_due_ss', list: 'Sponsor signage', what: 'print deadline', weeks: 3 },
  { key: 'art_due_si', list: 'Sponsorship items', what: 'artwork due', weeks: 10 },
  { key: 'print_due_si', list: 'Sponsorship items', what: 'order deadline', weeks: 8 },
] as const;

export type DeadlineKey = (typeof DEADLINE_RULES)[number]['key'];

/** Suggested deadlines for a show opening on `showOpen`, or all empty when there's no opening day yet. */
export function suggestedDeadlines(showOpen: string | null): Record<DeadlineKey, string | null> {
  const out = {} as Record<DeadlineKey, string | null>;
  for (const r of DEADLINE_RULES) out[r.key] = showOpen ? addDays(showOpen, -7 * r.weeks) : null;
  return out;
}
