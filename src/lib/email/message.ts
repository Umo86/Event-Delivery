// Invitation and password emails, and how the email service is configured. No server-only imports, so it can be unit tested.

export type AccessEmailKind = 'invite' | 'reset';

export interface AccessEmailInput {
  kind: AccessEmailKind;
  appName: string;
  name: string;
  email: string;
  tempPassword: string;
  /** The admin who sent it. */
  senderName: string;
  roleLabel: string;
  roleHelp: string;
  signInUrl: string;
  expiresAt: Date;
}

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName.trim();
}

export function formatExpiry(d: Date): string {
  return d.toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
  });
}

/** The email a person gets when they are invited, or when an admin resets their password. */
export function accessEmail(m: AccessEmailInput): EmailContent {
  const hello = `Hello ${firstName(m.name)},`;
  const expiry = formatExpiry(m.expiresAt);
  const intro = m.kind === 'invite'
    ? `${m.senderName} has invited you to ${m.appName}, where the UK Construction Week team manages signage and sponsorship artwork, sign-off and production.`
    : `${m.senderName} has reset your ${m.appName} password. Use this temporary password to sign in.`;
  const subject = m.kind === 'invite' ? `${m.senderName} invited you to ${m.appName}` : `Your ${m.appName} password has been reset`;
  const change = `When you sign in you’ll be asked to choose your own password. The temporary password stops working on ${expiry}.`;
  const access = `Your access: ${m.roleLabel}. ${m.roleHelp}.`;
  const ignore = m.kind === 'invite'
    ? 'If you weren’t expecting this invitation, you can ignore this email.'
    : `If you didn’t ask for this, tell ${m.senderName}.`;

  const text = [
    hello, '', intro, '',
    `Sign in: ${m.signInUrl}`,
    `Email: ${m.email}`,
    `Temporary password: ${m.tempPassword}`, '',
    change, '',
    ...(m.kind === 'invite' ? [access, ''] : []),
    ignore,
  ].join('\n');

  const e = escapeHtml;
  const ink = '#13233b';
  const html = `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:${ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dde2e9;border-radius:10px;overflow:hidden;">
<tr><td style="background:${ink};padding:18px 24px;font-size:20px;font-weight:bold;color:#ffffff;">${e(m.appName)}</td></tr>
<tr><td style="height:6px;background:#ffc20e;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.5;">
<p style="margin:0 0 14px;">${e(hello)}</p>
<p style="margin:0 0 18px;">${e(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;border-radius:8px;margin:0 0 18px;">
<tr><td style="padding:14px 16px;font-size:14px;line-height:1.7;">
<span style="color:#6a7689;">Email</span><br><b>${e(m.email)}</b><br>
<span style="color:#6a7689;">Temporary password</span><br><b style="font-family:Consolas,Menlo,monospace;font-size:17px;letter-spacing:0.5px;">${e(m.tempPassword)}</b>
</td></tr></table>
<p style="margin:0 0 20px;"><a href="${e(m.signInUrl)}" style="display:inline-block;background:#ffc20e;color:${ink};font-weight:bold;text-decoration:none;padding:11px 20px;border-radius:6px;border:1px solid #e0a800;">Sign in to ${e(m.appName)}</a></p>
<p style="margin:0 0 14px;">${e(change)}</p>
${m.kind === 'invite' ? `<p style="margin:0 0 14px;">${e(access)}</p>` : ''}
<p style="margin:0;color:#6a7689;font-size:13px;">${e(ignore)}</p>
</td></tr></table>
<p style="margin:14px 0 0;font-size:12px;color:#6a7689;">If the button doesn’t work, copy this address into your browser: ${e(m.signInUrl)}</p>
</td></tr></table>
</body></html>`;

  return { subject, text, html };
}

// ---- Configuration -----------------------------------------------------------------

export interface EmailConfig {
  configured: boolean;
  apiKey: string | null;
  apiUrl: string;
  /** Sender address only, e.g. invites@example.com */
  fromAddress: string | null;
  /** Display name from EMAIL_FROM, if it had one. */
  fromName: string | null;
  /** Resend's shared test sender: it can only deliver to the Resend account owner. */
  testSender: boolean;
  problem: string | null;
}

const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/**
 * Reads the email settings from the environment. Resend's Vercel integration adds RESEND_API_KEY
 * (sometimes with a prefix, such as MESSAGING_RESEND_API_KEY) and may add the sending domain.
 * EMAIL_FROM chooses the sender, e.g. "Event Delivery <invites@events.example.com>".
 */
export function emailConfig(env: Record<string, string | undefined>): EmailConfig {
  const pick = (name: string): string | null => {
    const direct = env[name]?.trim();
    if (direct) return direct;
    const hit = Object.entries(env).find(([k, v]) => k.endsWith(`_${name}`) && v?.trim());
    return hit?.[1]?.trim() ?? null;
  };
  const apiKey = pick('RESEND_API_KEY');
  const domain = pick('RESEND_EMAIL_DOMAIN')?.replace(/^@/, '') ?? null;
  const apiUrl = (env.RESEND_API_URL?.trim() || 'https://api.resend.com').replace(/\/+$/, '');

  let fromAddress: string | null = null;
  let fromName: string | null = null;
  let problem: string | null = null;
  const raw = env.EMAIL_FROM?.trim();
  if (raw) {
    const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    const addr = (m ? m[2] : raw).trim();
    if (ADDRESS.test(addr)) {
      fromAddress = addr;
      fromName = m?.[1]?.trim() || null;
    } else {
      problem = 'EMAIL_FROM isn’t a valid email address.';
    }
  } else if (domain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    fromAddress = `invites@${domain}`;
  } else if (apiKey) {
    fromAddress = 'onboarding@resend.dev';
  }
  if (!apiKey) problem = 'No email service is connected.';
  const testSender = !!fromAddress && fromAddress.toLowerCase().endsWith('@resend.dev');
  return { configured: !!apiKey && !!fromAddress && !problem, apiKey, apiUrl, fromAddress, fromName, testSender, problem };
}

/** Turns an email-service error into something an admin can act on. */
export function describeSendFailure(status: number | null, message: string | null): string {
  const msg = (message ?? '').trim();
  if (status === null) return 'The email service didn’t respond. Try again in a minute.';
  if (/only send testing emails/i.test(msg)) {
    return 'Resend can only send to its account owner until a sending domain is verified. Verify your domain in Resend, then set EMAIL_FROM.';
  }
  if (/not verified/i.test(msg)) return 'The sender’s domain isn’t verified in Resend yet.';
  if (status === 401 || (status === 403 && /api key/i.test(msg))) return 'The email service didn’t accept the API key. Reconnect Resend to this project in Vercel.';
  if (status === 429) return 'The email sending limit has been reached for now. Try again later.';
  if (status >= 500) return 'The email service had a problem. Try again in a minute.';
  return msg ? `The email service said: ${msg.slice(0, 240)}` : `The email service refused the message (error ${status}).`;
}
