import { categoryInfo } from '@/lib/domain/labels';
import { suppliersFor } from '@/lib/domain/suppliers';
import type { Category, SupplierRow } from '@/lib/domain/types';

/** The options for a line's supplier list: suppliers who work on this kind of line first. */
export function SupplierOptions({ suppliers, category }: { suppliers: SupplierRow[]; category: Category }) {
  const { match, others } = suppliersFor(suppliers, category);
  const opt = (s: SupplierRow) => <option key={s.id} value={s.id}>{s.name}</option>;
  if (!match.length || !others.length) return <>{suppliers.map(opt)}</>;
  return (
    <>
      <optgroup label={`Work on ${categoryInfo(category).label.toLowerCase()}`}>{match.map(opt)}</optgroup>
      <optgroup label="Other suppliers">{others.map(opt)}</optgroup>
    </>
  );
}
