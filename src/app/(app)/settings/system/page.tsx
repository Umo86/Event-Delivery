import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getAppName } from '@/lib/data/load';
import { LATEST_VERSION } from '@/lib/db/migrations';
import { blobAccess, blobSetupProblem, isBlobConfigured } from '@/lib/storage';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Field, inputCls, Notice, Panel } from '@/components/ui';
import { runCheck } from '@/app/actions/system';
import { setAppName } from '@/app/actions/settings';

export const metadata: Metadata = { title: 'System' };

const FREE_BLOB_BYTES = 1024 ** 3;

export default async function SystemPage() {
  await requireAdminPage();
  const sql = await db();
  const [stats] = await sql<{ files: number; bytes: number; items: number; users: number; v: number }[]>`
    select (select count(*)::int from artwork_versions) as files,
           (select coalesce(sum(size_bytes), 0)::bigint from artwork_versions) as bytes,
           (select count(*)::int from items) as items,
           (select count(*)::int from users) as users,
           (select coalesce(max(version), 0)::int from schema_migrations) as v`;
  const appName = await getAppName();
  const mb = stats.bytes / 1024 / 1024;
  const pct = Math.min(100, (stats.bytes / FREE_BLOB_BYTES) * 100);
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Health">
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-y-2 text-[14.5px]">
          <dt className="text-muted">Database</dt><dd className="font-semibold text-green-700">Connected (schema v{stats.v}{stats.v === LATEST_VERSION ? ', up to date' : ''})</dd>
          <dt className="text-muted">File storage</dt>
          <dd className={isBlobConfigured() ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>
            {isBlobConfigured() ? `Connected (${blobAccess()} store)` : 'Not connected'}
          </dd>
          <dt className="text-muted">Lines</dt><dd>{stats.items}</dd>
          <dt className="text-muted">People</dt><dd>{stats.users}</dd>
          <dt className="text-muted">Artwork files</dt><dd>{stats.files} versions, {mb.toFixed(1)} MB of originals</dd>
        </dl>
        <div className="mt-3">
          <div className="h-2.5 w-full rounded-full bg-paper"><div className="h-2.5 rounded-full bg-ink" style={{ width: `${pct}%` }} /></div>
          <p className="mt-1 text-[13px] text-muted">{pct.toFixed(0)}% of the 1 GB included in Vercel’s free plan (previews add a little more).</p>
        </div>
        {blobSetupProblem() && <div className="mt-3"><Notice tone="error">{blobSetupProblem()}</Notice></div>}
      </Panel>
      <Panel title="System check">
        <p className="mb-3 text-[14px] text-ink-2">Runs a test line through the database, file storage and every sign-off stage, then deletes it. Takes a few seconds.</p>
        <ActionForm action={runCheck}>
          <SubmitButton variant="dark" pendingText="Checking…">Run system check</SubmitButton>
        </ActionForm>
      </Panel>
      <Panel title="Platform name">
        <ActionForm action={setAppName} className="flex flex-wrap items-end gap-3">
          <Field label="Name shown in the menu, sign-in page and proof sheets" htmlFor="app_name" className="min-w-[240px]">
            <input id="app_name" name="app_name" required maxLength={40} defaultValue={appName} className={inputCls} />
          </Field>
          <SubmitButton variant="secondary" small>Save</SubmitButton>
        </ActionForm>
      </Panel>
    </div>
  );
}
