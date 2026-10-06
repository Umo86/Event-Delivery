'use client';

import { useRef, useState, useTransition } from 'react';
import { upload } from '@vercel/blob/client';
import { Paperclip } from 'lucide-react';
import { attachDocument } from '@/app/actions/tasks';
import { btn, cx } from '../ui';

const MAX_BYTES = 25 * 1024 * 1024;

export function TaskUploader({ taskId, userId, access }: { taskId: string; userId: string; access: 'public' | 'private' }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function send(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError('That file is over 25 MB. Attach a link in the notes instead.');
      return;
    }
    setBusy(true);
    try {
      const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+/, '').slice(-80) || 'file';
      const r = await upload(`task-docs/${userId}/${taskId}/${Date.now().toString(36)}-${safeName}`, file, {
        access,
        handleUploadUrl: '/api/upload',
        clientPayload: JSON.stringify({ kind: 'task', taskId }),
        contentType: file.type || 'application/octet-stream',
      });
      const fd = new FormData();
      fd.set('task_id', taskId);
      fd.set('url', r.url);
      fd.set('name', file.name);
      fd.set('size', String(file.size));
      fd.set('content_type', file.type || '');
      const res = await attachDocument(null, fd);
      if (!res.ok) throw new Error(res.error);
      if (input.current) input.current.value = '';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.replace(/^Vercel Blob: /, '') || 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        className="sr-only"
        id={`task-file-${taskId}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) startTransition(() => void send(f));
        }}
      />
      <label htmlFor={`task-file-${taskId}`} className={cx(btn.base, btn.secondary, btn.small, busy && 'pointer-events-none opacity-50', 'cursor-pointer')}>
        <Paperclip size={14} aria-hidden /> {busy ? 'Uploading…' : 'Attach file'}
      </label>
      {error && <p role="alert" className="mt-1.5 text-[13px] text-red-700">{error}</p>}
    </div>
  );
}
