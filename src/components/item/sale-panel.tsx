import type { ItemDetail } from '@/lib/data/load';
import type { CurrentUser } from '@/lib/auth/session';
import { fmtDateTime } from '@/lib/dates';
import { canSell } from '@/lib/domain/permissions';
import { ActionForm, SubmitButton } from '../forms';
import { cx, Field, inputCls, money, Panel } from '../ui';
import { putBackOnSale, saveSale } from '@/app/actions/items';

/**
 * A sponsorship item's sale: for sale (with its rate card) until someone marks it sold to a sponsor at a price.
 * Everyone with an account can do that, except people in an external department.
 */
export function SalePanel({ detail, user }: { detail: ItemDetail; user: CurrentUser }) {
  const { item, sponsor } = detail.row;
  const names = detail.bundle.ctx.userNames;
  const cost = item.unit_cost !== null ? item.unit_cost * (item.qty && item.qty > 0 ? item.qty : 1) : null;
  const sold = !!item.sponsor_id;
  const seller = canSell(user) && !item.cancelled;
  const started = detail.versions.length > 0 || detail.decisions.length > 0;
  const margin = sold && item.sale_price !== null && cost !== null ? item.sale_price - cost : null;
  const dt = 'text-muted';

  const form = (submit: string) => (
    <ActionForm action={saveSale} className="space-y-3">
      <input type="hidden" name="item_id" value={item.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sold to" htmlFor="sale-sponsor">
          <select id="sale-sponsor" name="sponsor_id" defaultValue={item.sponsor_id ?? ''} className={inputCls}>
            <option value="">Choose a sponsor</option>
            {detail.bundle.sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Or a new sponsor" htmlFor="sale-new" help="Adds them to the Sponsors list.">
          <input id="sale-new" name="new_sponsor" maxLength={120} autoComplete="off" className={inputCls} />
        </Field>
        <Field label="Sale price (£)" htmlFor="sale-price" help={item.rate_card_price !== null ? `Rate card: ${money(item.rate_card_price, 2)}` : undefined}>
          <input id="sale-price" name="sale_price" inputMode="decimal" required defaultValue={item.sale_price ?? item.rate_card_price ?? ''} className={inputCls} />
        </Field>
      </div>
      <SubmitButton variant="dark" small>{submit}</SubmitButton>
    </ActionForm>
  );

  return (
    <Panel title="Sale" id="sale">
      {sold ? (
        <>
          <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-4 gap-y-2 text-[14px]">
            <dt className={dt}>Sold to</dt>
            <dd className="font-semibold text-ink">{sponsor?.name ?? 'A sponsor'}</dd>
            <dt className={dt}>Sale price</dt>
            <dd className="font-semibold text-ink">{item.sale_price !== null ? money(item.sale_price, 2) : <span className="font-normal text-muted">Not entered</span>}</dd>
            {item.rate_card_price !== null && <><dt className={dt}>Rate card</dt><dd className="text-ink">{money(item.rate_card_price, 2)}</dd></>}
            {cost !== null && <><dt className={dt}>Cost</dt><dd className="text-ink">{money(cost, 2)}</dd></>}
            {margin !== null && (
              <><dt className={dt}>Margin</dt><dd className={cx('font-semibold', margin < 0 ? 'text-red-700' : 'text-green-700')}>{money(margin, 2)}</dd></>
            )}
            <dt className={dt}>Sold</dt>
            <dd className="text-ink">{item.sold_at ? fmtDateTime(item.sold_at) : 'Date not recorded'}{item.sold_by ? ` by ${names.get(item.sold_by) ?? 'someone'}` : ''}</dd>
          </dl>
          {seller && (
            <details className="mt-4 border-t border-line pt-3">
              <summary className="cursor-pointer text-[14px] font-semibold text-ink">Change the sale</summary>
              <div className="mt-3">{form('Save sale')}</div>
              {started ? (
                <p className="mt-3 text-[13px] text-muted">
                  Artwork or sign-off has started for {sponsor?.name ?? 'this sponsor'}, so it can’t go back on sale. If the deal falls through, cancel it and add a new item to sell.
                </p>
              ) : (
                <ActionForm action={putBackOnSale} className="mt-3"
                  confirm={`Put this back on sale? ${sponsor?.name ?? 'The sponsor'} will no longer be the buyer.`}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <SubmitButton variant="secondary" small>Put back on sale</SubmitButton>
                </ActionForm>
              )}
            </details>
          )}
        </>
      ) : (
        <>
          <p className="text-[15px] text-ink">
            For sale{item.rate_card_price !== null ? <> at <b>{money(item.rate_card_price, 2)}</b> on the rate card</> : null}.
          </p>
          {cost !== null && <p className="text-[13.5px] text-muted">It costs {money(cost, 2)} to make.</p>}
          {item.cancelled ? null : seller ? <div className="mt-3">{form('Mark as sold')}</div> : (
            <p className="mt-2 text-[13.5px] text-muted">People in an external department can’t mark items sold.</p>
          )}
        </>
      )}
    </Panel>
  );
}
