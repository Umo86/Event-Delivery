import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { loadItem } from '@/lib/data/load';
import { canEdit } from '@/lib/domain/permissions';
import { ItemForm } from '@/components/item-form';
import { PageHeader, Plate } from '@/components/ui';

export const metadata: Metadata = { title: 'Edit line' };

export default async function EditItemPage(props: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await props.params;
  const detail = await loadItem(id);
  if (!detail) notFound();
  if (!canEdit(user)) redirect(`/items/${id}`);
  const { row, bundle } = detail;
  return (
    <>
      <PageHeader title={<span className="flex items-center gap-3"><Plate className="text-[18px]">{row.code}</Plate> Edit line</span>}
        subtitle="Every part of the line, in the order it was added. Changes are recorded in the line’s history." />
      <div className="max-w-[980px]">
        <ItemForm bundle={bundle} category={row.item.category} item={row.item} cancelHref={`/items/${id}`} />
      </div>
    </>
  );
}
