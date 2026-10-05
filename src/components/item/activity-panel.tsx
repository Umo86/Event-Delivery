import { CheckCircle2, FileUp, Link2, MessageSquare, PencilLine, Plus, Truck, Ban, RotateCcw } from 'lucide-react';
import type { ItemDetail } from '@/lib/data/load';
import { fmtDateTime } from '@/lib/dates';
import { ActionForm, SubmitButton } from '../forms';
import { Panel, textareaCls } from '../ui';
import { addComment } from '@/app/actions/items';

const ICONS: Record<string, typeof Plus> = {
  created: Plus, updated: PencilLine, artwork: FileUp, decision: CheckCircle2, production: Truck,
  comment: MessageSquare, share_link: Link2, cancelled: Ban, restored: RotateCcw,
};

export function ActivityPanel({ detail }: { detail: ItemDetail }) {
  return (
    <Panel title="Comments and history">
      <ActionForm action={addComment} resetOnSuccess className="mb-4">
        <input type="hidden" name="item_id" value={detail.row.item.id} />
        <label htmlFor="comment" className="sr-only">Add a comment</label>
        <textarea id="comment" name="comment" rows={2} required maxLength={2000} placeholder="Add a comment for the team" className={textareaCls} />
        <div className="mt-2"><SubmitButton small variant="dark" pendingText="Posting…">Post comment</SubmitButton></div>
      </ActionForm>
      {detail.activity.length === 0 ? (
        <p className="text-[14px] text-muted">Nothing yet.</p>
      ) : (
        <ol className="space-y-3">
          {detail.activity.map((a) => {
            const Icon = ICONS[a.kind] ?? PencilLine;
            const isComment = a.kind === 'comment';
            return (
              <li key={a.id} className="flex gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paper text-ink-2"><Icon size={13} aria-hidden /></span>
                <div className="min-w-0 flex-1 text-[14px]">
                  <p className="text-muted"><b className="text-ink">{a.actor_name}</b>, {fmtDateTime(a.created_at)}</p>
                  <p className={isComment ? 'mt-0.5 whitespace-pre-wrap rounded-md bg-paper px-2.5 py-1.5 text-ink' : 'text-ink-2'}>{a.message}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
