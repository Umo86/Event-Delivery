import type { ItemDetail } from '@/lib/data/load';
import type { CurrentUser } from '@/lib/auth/session';
import { PRODUCTION } from '@/lib/domain/labels';
import { canEdit } from '@/lib/domain/permissions';
import { ActionForm, SubmitButton } from '../forms';
import { Field, inputCls, money, Notice, Panel } from '../ui';
import { updateProduction } from '@/app/actions/items';

export function ProductionPanel({ detail, user }: { detail: ItemDetail; user: CurrentUser }) {
  const { item, state } = detail.row;
  const editable = canEdit(user) && !item.cancelled;
  const total = item.unit_cost ? item.unit_cost * (item.qty && item.qty > 0 ? item.qty : 1) : null;
  return (
    <Panel title="Production">
      {!state.fullyApproved && !item.production_status && (
        <div className="mb-3"><Notice tone="info">Production unlocks once every sign-off stage has approved the current artwork.</Notice></div>
      )}
      {state.flag === 'not_signed_off' && (
        <div className="mb-3"><Notice tone="error">Production has started but this artwork isn’t fully signed off. Check before it goes any further.</Notice></div>
      )}
      {/* Keyed by the saved state so the fields refresh if someone else changes it (e.g. new artwork clears the status) */}
      <ActionForm key={`${item.production_status}-${state.version}-${state.fullyApproved}`} action={updateProduction} className="space-y-3">
        <input type="hidden" name="item_id" value={item.id} />
        <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-2">
          <Field label="Status" htmlFor="production_status">
            <select id="production_status" name="production_status" defaultValue={item.production_status ?? ''} className={inputCls}>
              <option value="">{state.fullyApproved ? 'Not started' : 'Locked until approved'}</option>
              {PRODUCTION.map((p) => (
                <option key={p.key} value={p.key} disabled={!state.fullyApproved && item.production_status !== p.key}>{p.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Supplier" htmlFor="p_supplier">
            <select id="p_supplier" name="supplier_id" defaultValue={item.supplier_id ?? ''} className={inputCls}>
              <option value="">Not chosen</option>
              {detail.bundle.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="PO number" htmlFor="p_po"><input id="p_po" name="po_number" defaultValue={item.po_number ?? ''} className={inputCls} /></Field>
          <Field label="Delivery to venue" htmlFor="p_delivery"><input id="p_delivery" type="date" name="delivery_date" defaultValue={item.delivery_date ?? ''} className={inputCls} /></Field>
          <Field label="Install by" htmlFor="p_install"><input id="p_install" type="date" name="install_date" defaultValue={item.install_date ?? ''} className={inputCls} /></Field>
          <div className="flex items-end">
            <p className="text-[14px] text-ink-2">
              Cost: <b className="text-ink">{total !== null ? money(total, 2) : 'not set'}</b>
              {item.unit_cost && item.qty && item.qty > 1 ? <span className="text-muted"> ({money(item.unit_cost, 2)} × {item.qty})</span> : null}
            </p>
          </div>
        </fieldset>
        {editable && <SubmitButton variant="dark" small>Save production</SubmitButton>}
      </ActionForm>
    </Panel>
  );
}
