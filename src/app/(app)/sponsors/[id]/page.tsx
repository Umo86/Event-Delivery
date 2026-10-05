import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { loadSchedule } from '@/lib/data/load';
import { urgencyCompare } from '@/lib/domain/engine';
import { canEdit, isAdmin } from '@/lib/domain/permissions';
import { ActionForm, SubmitButton } from '@/components/forms';
import { ItemTable } from '@/components/item-table';
import { ButtonLink, Empty, PageHeader, Panel } from '@/components/ui';
import { SponsorForm } from '@/components/sponsor-form';
import { deleteSponsor } from '@/app/actions/sponsors';

export const metadata: Metadata = { title: 'Sponsor' };

export default async function SponsorPage(props: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sql = await db();
  const [sp] = await sql<{ event_id: string }[]>`select event_id from sponsors where id = ${id}`;
  if (!sp) notFound();
  const sched = await loadSchedule(sp.event_id);
  if (!sched) notFound();
  const sponsor = sched.bundle.sponsors.find((s) => s.id === id)!;
  const rows = sched.rows.filter((r) => r.item.sponsor_id === id).sort((a, b) => urgencyCompare(a.state, b.state));
  const am = sponsor.account_manager_id ? sched.bundle.ctx.userNames.get(sponsor.account_manager_id) : null;

  return (
    <>
      <nav className="mb-3 text-[14px] text-muted"><Link href="/sponsors" className="font-semibold text-ink-2 hover:underline">Sponsors</Link> / {sponsor.name}</nav>
      <PageHeader title={sponsor.name}
        subtitle={<>{sponsor.package ? `${sponsor.package}. ` : ''}{am ? `Account manager: ${am}.` : 'No account manager set.'}{sponsor.contact_name ? ` Contact: ${sponsor.contact_name}${sponsor.contact_email ? ` (${sponsor.contact_email})` : ''}.` : ''}</>}
        actions={canEdit(user) ? (
          <>
            <ButtonLink href={`/schedule/ss/new?sponsor=${sponsor.id}`} small>Add sponsor signage</ButtonLink>
            <ButtonLink href={`/schedule/si/new?sponsor=${sponsor.id}`} small>Add sponsor item</ButtonLink>
          </>
        ) : undefined}
      />
      <section className="mb-6">
        <h2 className="mb-2 text-[19px] font-semibold text-ink">Their lines ({rows.length})</h2>
        <ItemTable rows={rows} today={sched.bundle.ctx.today} showCategory
          empty={<Empty title="No lines for this sponsor yet">Add their signage or items and choose {sponsor.name} as the sponsor.</Empty>} />
      </section>
      {canEdit(user) && (
        <Panel title="Sponsor details">
          <SponsorForm eventId={sp.event_id} users={sched.bundle.users} sponsor={sponsor} canChooseManager={isAdmin(user)} />
          {isAdmin(user) && (
            <div className="mt-4 border-t border-line pt-4">
              <ActionForm action={deleteSponsor} confirm={`Remove ${sponsor.name}?`}>
                <input type="hidden" name="sponsor_id" value={sponsor.id} />
                <SubmitButton variant="danger" small pendingText="Removing…">Remove sponsor</SubmitButton>
              </ActionForm>
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
