import 'server-only';
import { describeSendFailure, emailConfig, type EmailConfig, type EmailContent } from './message';

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; status: 'not_set_up' | 'failed'; error: string };

export function currentEmailConfig(): EmailConfig {
  return emailConfig(process.env);
}

/** Sends one email through Resend's API. Never throws: failures come back as a reason to show the admin. */
export async function sendEmail(
  to: string,
  content: EmailContent,
  opts: { fromName: string; replyTo?: string | null },
): Promise<SendResult> {
  const cfg = currentEmailConfig();
  if (!cfg.configured || !cfg.apiKey || !cfg.fromAddress) {
    return { ok: false, status: 'not_set_up', error: cfg.problem ?? 'Email isn’t set up yet.' };
  }
  const name = (cfg.fromName ?? opts.fromName).replace(/["<>\r\n]/g, '').trim();
  const body: Record<string, unknown> = {
    from: name ? `${name} <${cfg.fromAddress}>` : cfg.fromAddress,
    to: [to],
    subject: content.subject,
    text: content.text,
    html: content.html,
  };
  if (opts.replyTo) body.reply_to = opts.replyTo;
  let res: Response;
  try {
    res = await fetch(`${cfg.apiUrl}/emails`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
  } catch (e) {
    console.error('Email send failed', (e as Error).message);
    return { ok: false, status: 'failed', error: describeSendFailure(null, null) };
  }
  let json: { id?: string; message?: string; error?: string } = {};
  try {
    json = await res.json();
  } catch {
    // some errors have no JSON body
  }
  if (!res.ok) {
    console.error('Email refused', res.status, json.message ?? json.error ?? '');
    return { ok: false, status: 'failed', error: describeSendFailure(res.status, json.message ?? json.error ?? null) };
  }
  return { ok: true, id: json.id ?? null };
}
