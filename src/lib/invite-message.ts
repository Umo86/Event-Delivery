// The email an admin sends from their own mailbox when they invite someone or reset a password.
// The platform never sends email itself: it writes the message, and the admin sends it.
// No server-only imports, so it can be unit tested.

export type InviteKind = 'invite' | 'reset';

export interface InviteMessageInput {
  kind: InviteKind;
  appName: string;
  name: string;
  email: string;
  tempPassword: string;
  /** The admin who will send it. */
  senderName: string;
  roleLabel: string;
  roleHelp: string;
  signInUrl: string;
  expiresAt: Date;
}

export interface InviteMessage {
  to: string;
  subject: string;
  body: string;
  /** Opens a new email, already filled in, in the admin's own email app. */
  mailto: string;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName.trim();
}

export function formatExpiry(d: Date): string {
  return d.toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
  });
}

/** A mailto: link with the recipient, subject and body filled in (line breaks as CRLF, as RFC 6068 asks). */
export function mailtoLink(to: string, subject: string, body: string): string {
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, '\r\n'));
  return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?subject=${enc(subject)}&body=${enc(body)}`;
}

export function inviteMessage(m: InviteMessageInput): InviteMessage {
  const expiry = formatExpiry(m.expiresAt);
  const subject = m.kind === 'invite' ? `Your ${m.appName} invitation` : `Your ${m.appName} password has been reset`;
  const lines = m.kind === 'invite'
    ? [
      `Hello ${firstName(m.name)},`,
      '',
      `I’ve set you up on ${m.appName}, where we manage the signage and sponsorship artwork, sign-off and production for UK Construction Week.`,
      '',
      `Sign in here: ${m.signInUrl}`,
      `Email: ${m.email}`,
      `Temporary password: ${m.tempPassword}`,
      '',
      `When you first sign in, you’ll be asked to choose your own password. The temporary password stops working on ${expiry}.`,
      '',
      `Your access: ${m.roleLabel}. ${m.roleHelp}.`,
      '',
      'Thanks,',
      firstName(m.senderName),
    ]
    : [
      `Hello ${firstName(m.name)},`,
      '',
      `I’ve reset your ${m.appName} password. Sign in with this temporary password and you’ll be asked to choose a new one.`,
      '',
      `Sign in here: ${m.signInUrl}`,
      `Email: ${m.email}`,
      `Temporary password: ${m.tempPassword}`,
      '',
      `The temporary password stops working on ${expiry}.`,
      '',
      'Thanks,',
      firstName(m.senderName),
    ];
  const body = lines.join('\n');
  return { to: m.email, subject, body, mailto: mailtoLink(m.email, subject, body) };
}
