import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getCurrentEvent, loadBundle } from '@/lib/data/load';
import { canEdit } from '@/lib/domain/permissions';
import { signageFormData } from '@/components/item-form';
import { SignageForm } from '@/components/signage-form';
import { PageHeader } from '@/components/ui';
import { NoEvent } from '@/components/no-event';

export const metadata: Metadata = { title: 'Add signage' };

/** One place to add signage: it asks which list first, then the rest in order. */
export default async function NewSignagePage(props: { searchParams: Promise<{ type?: string; sponsor?: string }> }) {
  const user = await requireUser();
  const { type, sponsor } = await props.searchParams;
  if (!canEdit(user)) redirect('/schedule/all');
  const event = await getCurrentEvent();
  if (!event) return <NoEvent />;
  const bundle = await loadBundle(event.id);
  if (!bundle) return <NoEvent />;
  const initialType = type === 'ss' || (sponsor && bundle.sponsors.some((s) => s.id === sponsor)) ? 'sponsor_signage' : 'organiser_signage';
  return (
    <>
      <PageHeader title="Add signage" subtitle={`${event.name}. A few questions in order; it gets its OS or SS number when you add it.`} />
      <div className="max-w-[980px]">
        <SignageForm data={signageFormData(bundle)} cancelHref={type === 'ss' ? '/schedule/ss' : type === 'os' ? '/schedule/os' : '/schedule/all'}
          initialType={initialType} defaultSponsorId={bundle.sponsors.some((s) => s.id === sponsor) ? sponsor : undefined} />
      </div>
    </>
  );
}
