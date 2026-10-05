'use client';

import { Printer } from 'lucide-react';
import { btn, cx } from './ui';

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={cx(btn.base, btn.primary)}>
      <Printer size={16} aria-hidden /> Print or save as PDF
    </button>
  );
}
