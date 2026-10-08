import type { Metadata } from 'next';
import { requireManager } from '@/lib/auth/session';
import { getCurrentEvent, listEvents } from '@/lib/data/load';
import { londonDate } from '@/lib/dates';
import { VENUES } from '@/lib/domain/labels';
import { PageHeader } from '@/components/ui';
import { NewShowWizard, type ReferenceShow } from '@/components/shows/new-show-wizard';

export const metadata: Metadata = { title: 'New show' };

export default async function NewShowPage() {
  await requireManager();
  const [events, current] = await Promise.all([listEvents(), getCurrentEvent()]);
  // The latest show with all four dates in order, so its timings can be offered for the new one
  const ref = events.find((e) => e.build_start && e.show_open && e.show_close && e.breakdown_end
    && e.build_start <= e.show_open && e.show_open <= e.show_close && e.show_close <= e.breakdown_end);
  const reference: ReferenceShow | null = ref
    ? { name: ref.name, build_start: ref.build_start!, show_open: ref.show_open!, show_close: ref.show_close!, breakdown_end: ref.breakdown_end! }
    : null;

  return (
    <>
      <PageHeader title="New show" subtitle="Set up the next show step by step. Pick a day on the calendar and you’ll move straight on to the next step." />
      <div className="max-w-[980px]">
        <NewShowWizard
          venues={VENUES}
          events={events.map((e) => ({ id: e.id, name: e.name, archived: e.archived }))}
          defaultCopy={current?.id ?? ''}
          reference={reference}
          today={londonDate()} />
      </div>
    </>
  );
}
