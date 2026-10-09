import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PencilLine, Printer } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { loadItem } from '@/lib/data/load';
import { sponsorLinksEnabled } from '@/lib/settings';
import { fmtDate, fmtDateTime, relativeDue } from '@/lib/dates';
import { defaultArtworkDue, defaultPrintDeadline } from '@/lib/domain/engine';
import { artworkByLabel, categoryInfo } from '@/lib/domain/labels';
import { canEdit } from '@/lib/domain/permissions';
import { ActionForm, SubmitButton } from '@/components/forms';
import { ButtonLink, cx, FlagChip, money, Notice, Panel, Plate, StatusChip } from '@/components/ui';
import { ArtworkPanel } from '@/components/item/artwork-panel';
import { SignoffRoute } from '@/components/item/signoff';
import { ProductionPanel } from '@/components/item/production-panel';
import { ActivityPanel } from '@/components/item/activity-panel';
import { SalePanel } from '@/components/item/sale-panel';
import { deleteItem, setCancelled } from '@/app/actions/items';

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  const d = await loadItem(id).catch(() => null);
  return { title: d ? `${d.row.code} ${d.row.item.description}` : 'Line' };
}

export default async function ItemPage(props: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const detail = await loadItem(id);
  if (!detail) notFound();
  const { row, bundle, supplier } = detail;
  const { item, state, sponsor } = row;
  const cat = categoryInfo(item.category);
  const today = bundle.ctx.today;
  const names = bundle.ctx.userNames;
  const total = item.unit_cost ? item.unit_cost * (item.qty && item.qty > 0 ? item.qty : 1) : null;
  const defArt = defaultArtworkDue(bundle.event, item.category);
  const defPrint = defaultPrintDeadline(bundle.event, item.category);
  const dateOr = (d: string | null, fallback: string | null) =>
    d ? fmtDate(d, 'long') : fallback ? <span className="text-muted">{fmtDate(fallback, 'long')} (show default)</span> : <span className="text-muted">Not set</span>;

  const sponsorship = item.category === 'sponsor_item';
  const forSale = state.group === 'for_sale';
  const where = [item.hall, item.zone, item.location_detail].filter(Boolean).join(', ');
  // Sponsorship items: what's being sold and how it reaches visitors (the sale itself is in the Sale panel)
  const sectionName = item.section_id ? bundle.sections.find((x) => x.id === item.section_id)?.name ?? null : null;
  const sponsorshipSpec: [string, React.ReactNode][] = [
    ['Section', sectionName],
    ['Signage ID', item.plan_code],
    ['Type', item.item_type],
    ['What’s included', item.wording ? <span className="whitespace-pre-wrap">{item.wording}</span> : null],
    ['Material / spec', item.material],
    ['Quantity', item.qty?.toLocaleString('en-GB')],
    ['Cost price per unit', item.unit_cost !== null ? money(item.unit_cost, 2) : null],
    ['Total cost', total !== null ? money(total, 2) : null],
    ['Rate card price', item.rate_card_price !== null ? money(item.rate_card_price, 2) : null],
    ['Distribution', item.distribution_method],
    ['Where', where || null],
    ['Hand-out date', item.install_date ? fmtDate(item.install_date, 'long') : null],
    ['Artwork from', artworkByLabel(item.artwork_by)],
    ['Artwork due', dateOr(item.artwork_due, defArt)],
    ['Order deadline', dateOr(item.print_deadline, defPrint)],
    ['Supplier', supplier?.name],
    ['Notes', item.notes ? <span className="whitespace-pre-wrap">{item.notes}</span> : null],
  ];

  const signageSpec: [string, React.ReactNode][] = [
    ['Sponsor', sponsor ? <>{sponsor.name}{sponsor.account_manager_id ? <span className="text-muted">, managed by {names.get(sponsor.account_manager_id)}</span> : null}</> : <span className="text-muted">None</span>],
    ...(item.category === 'sponsor_signage' ? [] : [['Section', sectionName] as [string, React.ReactNode]]),
    ['Signage ID', item.plan_code],
    ['Type', item.item_type],
    [item.sides === 'double' ? 'Side A wording' : 'Wording / content', item.wording ? <span className="whitespace-pre-wrap">{item.wording}</span> : null],
    ...(item.sides === 'double' ? [['Side B wording', item.wording_side2 ? <span className="whitespace-pre-wrap">{item.wording_side2}</span> : null] as [string, React.ReactNode]] : []),
    ['Hall', item.hall ? <Plate tone="light">{item.hall}</Plate> : null],
    ['Zone / area', item.zone],
    ['Exact location', item.location_detail],
    ['Position', item.position],
    ['Size', item.width_mm || item.height_mm ? `${(item.width_mm ?? 0).toLocaleString('en-GB')} × ${(item.height_mm ?? 0).toLocaleString('en-GB')} mm` : null],
    ['Sides', item.sides === 'double' ? 'Double-sided' : item.sides === 'single' ? 'Single-sided' : null],
    ['Bleed', item.bleed_mm !== null && item.bleed_mm !== undefined ? `${item.bleed_mm} mm` : null],
    ['Quantity', item.qty?.toLocaleString('en-GB')],
    ['Material / spec', item.material],
    ['Artwork from', artworkByLabel(item.artwork_by)],
    ['Artwork due', dateOr(item.artwork_due, defArt)],
    ['Print / order deadline', dateOr(item.print_deadline, defPrint)],
    ['Supplier', supplier?.name],
    ['Unit cost', item.unit_cost !== null ? money(item.unit_cost, 2) : null],
    ['Total cost', total !== null ? money(total, 2) : null],
    ['Notes', item.notes ? <span className="whitespace-pre-wrap">{item.notes}</span> : null],
  ];
  const spec = sponsorship ? sponsorshipSpec : signageSpec;
  const createdNote = !sponsorship ? `Line ${row.code} added. Upload the artwork when it’s ready.`
    : sponsor ? `Line ${row.code} added, sold to ${sponsor.name}. Upload the artwork when it’s ready.`
      : `Line ${row.code} added. It’s for sale until someone marks it sold.`;

  return (
    <>
      <nav className="mb-3 text-[14px] text-muted" aria-label="Breadcrumb">
        <Link href={`/schedule/${cat.slug}`} className="font-semibold text-ink-2 hover:text-ink hover:underline">{cat.label}</Link>
        <span aria-hidden> / </span>{row.code}
      </nav>

      {sp.created && <div className="mb-4"><Notice tone="ok">{createdNote}</Notice></div>}
      {sp.saved && <div className="mb-4"><Notice tone="ok">Changes saved.</Notice></div>}
      {item.cancelled && <div className="mb-4"><Notice tone="warn">This line is cancelled. It’s left out of every count and list.</Notice></div>}

      <header className="mb-6 rounded-[10px] border border-line bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Plate className="text-[16px]">{row.code}</Plate>
              <StatusChip group={state.group} label={state.statusLabel} />
              <FlagChip flag={state.flag} />
            </div>
            <h1 className={cx('mt-2 text-[28px] font-semibold leading-tight text-ink', item.cancelled && 'line-through')}>{item.description}</h1>
            <p className="mt-1 text-[14px] text-muted">
              {sponsorship ? `Sponsorship item, ${sponsor ? `sold to ${sponsor.name}` : 'for sale'}` : `${cat.label}${sponsor ? ` for ${sponsor.name}` : ''}`}, added {fmtDateTime(item.created_at)}
            </p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            {canEdit(user) && <ButtonLink href={`/items/${item.id}/edit`}><PencilLine size={16} aria-hidden /> Edit</ButtonLink>}
            <ButtonLink href={`/proof/${item.id}`} target="_blank"><Printer size={16} aria-hidden /> Proof sheet</ButtonLink>
          </div>
        </div>
        {state.group !== 'cancelled' && (
          <dl className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
            <div>
              <dt className="text-[13px] text-muted">Next step</dt>
              <dd className="font-semibold text-ink">{forSale ? 'Sell it to a sponsor' : state.action || 'Nothing left to do'}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Waiting on</dt>
              <dd className={cx('font-semibold', state.waitingOnLabel && state.waitingOnUserIds.length === 0 ? 'text-red-700' : 'text-ink')}>
                {forSale ? 'Sales' : state.waitingOnLabel || 'Nobody'}
                {state.daysWaiting !== null && state.waitingOnLabel && (
                  <span className="font-normal text-muted">{state.daysWaiting > 0 ? ` for ${state.daysWaiting} day${state.daysWaiting === 1 ? '' : 's'}` : ' since today'}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Next deadline</dt>
              <dd className="font-semibold text-ink">
                {state.due ? <>{fmtDate(state.due, 'long')} <span className="font-normal text-muted">({relativeDue(state.due, today)})</span></> : 'None'}
              </dd>
            </div>
          </dl>
        )}
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-6">
          {forSale ? (
            <Panel title="Artwork and sign-off">
              <Notice tone="info">Artwork and sign-off start once it’s sold. The sponsor’s account manager then chases the artwork.</Notice>
            </Panel>
          ) : (
            <>
              <ArtworkPanel detail={detail} user={user} viewVersion={sp.v ? Number(sp.v) : undefined} />
              <Panel title="Sign-off" id="signoff">
                <SignoffRoute detail={detail} user={user} sponsorLinks={await sponsorLinksEnabled()} />
              </Panel>
            </>
          )}
        </div>
        <div className="space-y-6">
          {sponsorship && <SalePanel detail={detail} user={user} />}
          <Panel title="Details" actions={canEdit(user) ? <ButtonLink href={`/items/${item.id}/edit`} small variant="ghost">Edit</ButtonLink> : undefined}>
            <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-4 gap-y-2 text-[14px]">
              {spec.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-ink">{v ?? <span className="text-muted">Not set</span>}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          {!forSale && <ProductionPanel detail={detail} user={user} />}
          <ActivityPanel detail={detail} />
          {canEdit(user) && (
            <Panel title="Line options">
              <div className="flex flex-wrap items-start gap-3">
                <ActionForm action={setCancelled} confirm={item.cancelled ? undefined : 'Cancel this line? It will drop out of all counts. You can restore it later.'}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="cancel" value={item.cancelled ? '0' : '1'} />
                  <SubmitButton variant="secondary" small>{item.cancelled ? 'Restore line' : 'Cancel line'}</SubmitButton>
                </ActionForm>
                {canEdit(user) && (
                  <ActionForm action={deleteItem} confirm={`Delete ${row.code} permanently, including its artwork and history? This can’t be undone.`}>
                    <input type="hidden" name="item_id" value={item.id} />
                    <SubmitButton variant="danger" small pendingText="Deleting…">Delete permanently</SubmitButton>
                  </ActionForm>
                )}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
