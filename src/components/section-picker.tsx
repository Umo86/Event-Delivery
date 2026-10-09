'use client';

import { useState } from 'react';
import { inputCls } from './ui';

const NEW = '__new__';

/** The section a line sits under on the sheet: one of the show's, or a new one typed in. */
export function SectionPicker({ sections, value, id = 'section_id' }: {
  sections: { id: string; name: string }[]; value: string | null; id?: string;
}) {
  const [choice, setChoice] = useState<string>(value ?? (sections.length ? '' : NEW));
  const adding = choice === NEW;
  return (
    <div className="space-y-2">
      <select id={id} name="section_id" value={adding ? NEW : choice} onChange={(e) => setChoice(e.target.value)} className={inputCls}>
        <option value="">No section</option>
        {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        <option value={NEW}>New section…</option>
      </select>
      {adding && (
        <input name="section_new" aria-label="New section name" placeholder="e.g. F1 UKCW Main Stage" autoFocus={sections.length > 0}
          maxLength={80} className={inputCls} />
      )}
    </div>
  );
}
