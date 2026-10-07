import type { Category, SupplierRow } from './types';

const WORKS_ON: Record<Category, 'works_on_os' | 'works_on_ss' | 'works_on_si'> = {
  organiser_signage: 'works_on_os',
  sponsor_signage: 'works_on_ss',
  sponsor_item: 'works_on_si',
};

/** Whether the supplier's scope covers this list (organiser signage, sponsor signage or sponsorship items). */
export function worksOn(s: Pick<SupplierRow, 'works_on_os' | 'works_on_ss' | 'works_on_si'>, category: Category): boolean {
  return s[WORKS_ON[category]];
}

/** Suppliers who work on this list first, then everyone else. */
export function suppliersFor<T extends Pick<SupplierRow, 'works_on_os' | 'works_on_ss' | 'works_on_si'>>(suppliers: T[], category: Category) {
  return { match: suppliers.filter((s) => worksOn(s, category)), others: suppliers.filter((s) => !worksOn(s, category)) };
}
