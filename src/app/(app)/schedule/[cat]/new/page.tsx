import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getCurrentEvent, loadBundle } from '@/lib/data/load';
import { categoryBySlug } from '@/lib/domain/labels';
import { canEdit } from '@/lib/domain/permissions';
import { ItemForm } from '@/components/item-form';
import { PageHeader } from '@/components/ui';
import { NoEvent } from '@/components/no-event';

export const metadata: Metadata = { title: 'Add line' };

export default async function NewItemPage(props: { params: Promise<{ cat: string }>; searchParams: Promise<{ sponsor?: string }> }) {
  const user = await requireUser();
  const { cat } = await props.params;
  const { sponsor } = await props.searchParams;
  const category = categoryBySlug(cat);
  if (!category) notFound();
  if (!canEdit(user)) redirect(`/schedule/${cat}`);
  const event = await getCurrentEvent();
  if (!event) return <NoEvent />;
  const bundle = await loadBundle(event.id);
  if (!bundle) return <NoEvent />;
  return (
    <>
      <PageHeader title={`Add ${category.label.toLowerCase()}`} subtitle={`${event.name}. It gets the next ${category.prefix} number automatically.`} />
      <ItemForm bundle={bundle} category={category.key} cancelHref={`/schedule/${category.slug}`}
        defaultSponsorId={bundle.sponsors.some((s) => s.id === sponsor) ? sponsor : undefined} />
    </>
  );
}
