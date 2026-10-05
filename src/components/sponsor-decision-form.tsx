'use client';

import { ActionForm, SubmitButton } from './forms';
import { Field, inputCls, textareaCls } from './ui';
import { submitSponsorDecision } from '@/app/actions/sponsor-link';

export function SponsorDecisionForm({ token, defaultName }: { token: string; defaultName: string }) {
  return (
    <ActionForm action={submitSponsorDecision} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your name" htmlFor="sp-name"><input id="sp-name" name="name" required defaultValue={defaultName} className={inputCls} /></Field>
      </div>
      <Field label="Comments (needed if you want changes)" htmlFor="sp-comment">
        <textarea id="sp-comment" name="comment" rows={3} className={textareaCls} placeholder="What should we change?" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="approved">Approve this artwork</SubmitButton>
        <SubmitButton name="decision" value="changes_requested" variant="secondary">Request changes</SubmitButton>
      </div>
    </ActionForm>
  );
}
