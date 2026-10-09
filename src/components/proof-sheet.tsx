import type { ScheduleRow } from '@/lib/data/load';
import type { EventRow, StageRow, VersionRow } from '@/lib/domain/types';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { artworkByLabel, categoryInfo, decisionLabel } from '@/lib/domain/labels';
import { Plate } from './ui';

/** The printable proof: artwork, spec and sign-off record. Shared by the internal proof page and the sponsor link page. */
export function ProofSheet({ row, event, version, imageSrc, stages, appName, showSignatures = true, external = false }: {
  row: ScheduleRow; event: EventRow; version: VersionRow | null; imageSrc: string | null; stages: StageRow[]; appName: string; showSignatures?: boolean;
  /** For people outside the team (the sponsor link): shows each stage's outcome without internal names or comments. */
  external?: boolean;
}) {
  const { item, sponsor, state } = row;
  const spec: [string, string | null | undefined][] = [
    ['Line', `${row.code}, ${categoryInfo(item.category).label}`],
    ['Sponsor', sponsor?.name],
    ['Type', item.item_type],
    [item.category === 'sponsor_item' ? 'What’s included' : item.sides === 'double' ? 'Side A' : 'Wording', item.wording],
    ...(item.sides === 'double' && item.wording_side2 ? [['Side B', item.wording_side2] as [string, string]] : []),
    ['Location', [item.hall, item.zone, item.location_detail].filter(Boolean).join(', ')],
    ['Distribution', item.category === 'sponsor_item' ? item.distribution_method : null],
    ['Position', item.position],
    ['Size', item.width_mm || item.height_mm ? `${(item.width_mm ?? 0).toLocaleString('en-GB')} × ${(item.height_mm ?? 0).toLocaleString('en-GB')} mm${item.sides ? `, ${item.sides === 'double' ? 'double' : 'single'}-sided` : ''}` : null],
    ['Quantity', item.qty?.toLocaleString('en-GB')],
    ['Material', item.material],
    ['Artwork', version ? `v${version.version}, ${version.file_name}, uploaded ${fmtDateTime(version.uploaded_at)}` : artworkByLabel(item.artwork_by)],
  ];
  const signoff = state.stages.filter((s) => s.applies);
  return (
    <article className="mx-auto max-w-[800px] bg-white">
      <header className="flex items-center justify-between gap-4 border-b-4 border-ink pb-3">
        <div>
          <p className="font-display text-[14px] font-semibold text-muted">{appName} artwork proof</p>
          <h1 className="font-display text-[28px] font-semibold leading-tight text-ink">{item.description}</h1>
        </div>
        <div className="text-right">
          <Plate className="text-[18px]">{row.code}</Plate>
          <p className="mt-1 text-[13px] text-muted">{event.name}</p>
        </div>
      </header>
      <div className="mt-4 flex min-h-[200px] items-center justify-center rounded-md border border-line bg-paper p-3">
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSrc} alt={`Artwork for ${row.code}`} className="max-h-[440px] w-auto max-w-full object-contain" />
        ) : <p className="text-muted">No artwork uploaded yet.</p>}
      </div>
      <dl className="mt-4 grid grid-cols-[130px_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[14px]">
        {spec.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="contents"><dt className="font-semibold text-ink-2">{k}</dt><dd className="whitespace-pre-wrap text-ink">{v}</dd></div>
        ))}
      </dl>
      <h2 className="mt-5 border-b border-line pb-1 text-[17px] font-semibold text-ink">Sign-off</h2>
      <table className="mt-1 w-full text-[14px]">
        <tbody>
          {signoff.map((s) => (
            <tr key={s.stage.id} className="border-b border-line">
              <td className="py-1.5 pr-3 font-semibold text-ink">{s.stage.name}</td>
              <td className="py-1.5 pr-3">
                {s.kind === 'approved' ? <b className="text-green-700">Approved</b>
                  : !external && s.decision && (s.kind === 'current' || s.kind === 'stale') ? <b>{s.kind === 'stale' ? 'Needs re-approval' : decisionLabel(s.decision.decision)}</b>
                    : <span className="text-muted">Pending</span>}
              </td>
              <td className="py-1.5 text-ink-2">
                {!external && s.decision && s.kind !== 'locked' ? `${s.decision.decided_by_name}, ${fmtDateTime(s.decision.decided_at)}${s.decision.comment ? `: ${s.decision.comment}` : ''}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {showSignatures && (
        <section className="mt-6 break-inside-avoid">
          <p className="text-[14px] text-ink-2">Please check spelling, logos, colours, size and position, then sign below or reply with the changes you need.</p>
          <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-8 text-[13px] text-muted">
            {['Name', 'Company', 'Signature', 'Date'].map((l) => <div key={l} className="border-b border-ink-2 pb-1">{l}</div>)}
          </div>
        </section>
      )}
      <p className="mt-6 text-center text-[12px] text-muted">
        {external
          ? `Sent from ${appName} for ${event.name}.`
          : `Printed ${fmtDate(new Date().toISOString().slice(0, 10), 'long')} from ${appName}. ${stages.length} sign-off stage${stages.length === 1 ? '' : 's'} set up for this show.`}
      </p>
    </article>
  );
}
