'use client';

import { useState } from 'react';
import { ActionForm, CopyButton, SubmitButton } from '@/components/forms';
import { Panel } from '@/components/ui';
import { addSample, removeSample } from '@/app/actions/superadmin';

interface SamplePerson { name: string; email: string; role: string; password: string }

/**
 * Admin › Platform: a sample show to try everything with, and the button to remove it again.
 * One form does both jobs (its action swaps with `present`), so the message and the passwords
 * from adding stay on screen when the page re-renders as "loaded".
 */
export function SampleDataPanel({ present, showName, lines }: { present: boolean; showName: string; lines: number }) {
  const [people, setPeople] = useState<SamplePerson[] | null>(null);
  return (
    <Panel title="Sample data" id="sample-data">
      {present ? (
        <p className="text-[14px] text-ink-2">
          <b className="text-ink">{showName}</b> is loaded with {lines} line{lines === 1 ? '' : 's'}, a sample team, sponsors and suppliers.
          Try the sheet, sign-off and production with it, then remove it here. Your own shows aren’t touched.
        </p>
      ) : (
        <p className="text-[14px] text-ink-2">
          Adds a show called <b className="text-ink">{showName}</b> with sections, 32 lines of organiser and sponsor signage in every status,
          five sponsors, four suppliers and eight sample people (approvers, account managers, a designer, a finance user and an agency user).
          Nothing of yours is changed, and it can all be removed in one go.
        </p>
      )}
      <ActionForm
        action={present ? removeSample : addSample}
        confirm={present ? `Remove the sample data? ${showName}, its lines, the sample people and sample suppliers will be deleted.` : undefined}
        className="mt-3"
        onSuccess={(r) => setPeople(r.ok && Array.isArray(r.data?.people) ? (r.data.people as SamplePerson[]) : null)}
      >
        {present
          ? <SubmitButton variant="danger" small pendingText="Removing…">Remove sample data</SubmitButton>
          : <SubmitButton variant="dark" small pendingText="Adding…">Add sample data</SubmitButton>}
      </ActionForm>
      {people && (
        <div className="mt-3 overflow-x-auto rounded-md border border-signal bg-white">
          <table className="w-full text-[13.5px]" aria-label="Sample people">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th scope="col" className="px-3 py-2 font-semibold">Name</th>
                <th scope="col" className="px-3 py-2 font-semibold">Email</th>
                <th scope="col" className="px-3 py-2 font-semibold">Access</th>
                <th scope="col" className="px-3 py-2 font-semibold">Temporary password</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.email} className="border-b border-line last:border-0">
                  <td className="px-3 py-1.5 font-semibold text-ink">{p.name}</td>
                  <td className="px-3 py-1.5 text-ink-2">{p.email}</td>
                  <td className="px-3 py-1.5 text-ink-2">{p.role === 'manager' ? 'Manager' : 'User'}</td>
                  <td className="px-3 py-1.5"><span className="flex items-center gap-2"><code className="rounded bg-paper px-1.5 py-0.5 text-[13px] text-ink">{p.password}</code><CopyButton text={p.password} label="Copy" ariaLabel={`Copy ${p.name}’s password`} /></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
