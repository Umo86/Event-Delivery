import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getAppName, loadItem } from '@/lib/data/load';
import { ProofSheet } from '@/components/proof-sheet';
import { PrintButton } from '@/components/print-button';

export const metadata: Metadata = { title: 'Proof sheet' };

export default async function ProofPage(props: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await props.params;
  const detail = await loadItem(id);
  if (!detail) notFound();
  const v = detail.versions[0] ?? null;
  const img = v && (v.preview_url || v.mime_type.startsWith('image/')) ? `/api/files/${v.id}/preview` : null;
  return (
    <div className="min-h-screen bg-paper px-4 py-6 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-[800px] items-center justify-between gap-3">
        <a href={`/items/${id}`} className="text-[14px] font-semibold text-ink underline">Back to the line</a>
        <PrintButton />
      </div>
      <div className="mx-auto max-w-[860px] rounded-[10px] border border-line bg-white p-6 print:border-0 print:p-0">
        <ProofSheet row={detail.row} event={detail.bundle.event} version={v} imageSrc={img} stages={detail.bundle.stages} appName={await getAppName()} />
      </div>
    </div>
  );
}
