'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cx, inputCls } from './ui';

/** A password field with a show/hide eye toggle. */
export function PasswordInput({ id, name, autoComplete, required, minLength, className }: {
  id?: string; name: string; autoComplete?: string; required?: boolean; minLength?: number; className?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className={cx(inputCls, 'pr-11', className)}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-ink focus:outline-none focus-visible:text-ink"
      >
        {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  );
}
