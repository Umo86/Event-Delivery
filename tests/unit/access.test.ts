import { describe, expect, it } from 'vitest';
import { accessEmail, describeSendFailure, emailConfig, escapeHtml, firstName } from '@/lib/email/message';
import { canCancelInvite, personStatus } from '@/lib/domain/access';

const base = {
  kind: 'invite' as const,
  appName: 'Event Delivery',
  name: 'Mark Marketing',
  email: 'mark@ukcw.test',
  tempPassword: 'amber-birch-cedar-1234',
  senderName: 'Umit Bozdag',
  roleLabel: 'Member',
  roleHelp: 'You can add and edit lines',
  signInUrl: 'https://event-delivery.vercel.app/login',
  expiresAt: new Date('2026-10-12T13:00:00Z'),
};

describe('invite and reset emails', () => {
  it('an invite has the sign-in link, the email, the temporary password and the access level', () => {
    const m = accessEmail(base);
    expect(m.subject).toBe('Umit Bozdag invited you to Event Delivery');
    expect(m.text).toContain('Hello Mark,');
    expect(m.text).toContain('Sign in: https://event-delivery.vercel.app/login');
    expect(m.text).toContain('Email: mark@ukcw.test');
    expect(m.text).toContain('Temporary password: amber-birch-cedar-1234');
    expect(m.text).toContain('you’ll be asked to choose your own password');
    expect(m.text).toContain('stops working on Monday 12 October at 14:00');
    expect(m.text).toContain('Your access: Member. You can add and edit lines.');
    expect(m.html).toContain('href="https://event-delivery.vercel.app/login"');
    expect(m.html).toContain('amber-birch-cedar-1234');
  });

  it('a reset says the password was reset and leaves out the access level', () => {
    const m = accessEmail({ ...base, kind: 'reset' });
    expect(m.subject).toBe('Your Event Delivery password has been reset');
    expect(m.text).toContain('Umit Bozdag has reset your Event Delivery password.');
    expect(m.text).not.toContain('Your access:');
  });

  it('names and addresses are escaped in the HTML version', () => {
    const m = accessEmail({ ...base, name: '<img src=x>', senderName: '<b>Umit</b> & Co' });
    expect(m.html).not.toContain('<img');
    expect(m.html).not.toContain('<b>Umit');
    expect(m.html).toContain('Hello &lt;img,');
    expect(m.html).toContain('&lt;b&gt;Umit&lt;/b&gt; &amp; Co has invited you');
    expect(escapeHtml(`"'`)).toBe('&quot;&#39;');
    expect(firstName('  Jo  Bloggs ')).toBe('Jo');
  });
});

describe('email settings', () => {
  it('is not set up without an API key', () => {
    const c = emailConfig({});
    expect(c.configured).toBe(false);
    expect(c.problem).toBe('No email service is connected.');
  });

  it('uses Resend’s test sender when only the API key is there', () => {
    const c = emailConfig({ RESEND_API_KEY: 're_123' });
    expect(c).toMatchObject({ configured: true, fromAddress: 'onboarding@resend.dev', testSender: true, apiUrl: 'https://api.resend.com' });
  });

  it('finds a prefixed key and the domain the integration adds', () => {
    const c = emailConfig({ MESSAGING_RESEND_API_KEY: 're_123', MESSAGING_RESEND_EMAIL_DOMAIN: 'events.example.com' });
    expect(c).toMatchObject({ configured: true, apiKey: 're_123', fromAddress: 'invites@events.example.com', testSender: false });
  });

  it('EMAIL_FROM chooses the sender and its display name', () => {
    expect(emailConfig({ RESEND_API_KEY: 're_1', EMAIL_FROM: 'UKCW Signage <signage@m10.example>' }))
      .toMatchObject({ configured: true, fromAddress: 'signage@m10.example', fromName: 'UKCW Signage' });
    expect(emailConfig({ RESEND_API_KEY: 're_1', EMAIL_FROM: 'signage@m10.example' }))
      .toMatchObject({ configured: true, fromAddress: 'signage@m10.example', fromName: null });
    expect(emailConfig({ RESEND_API_KEY: 're_1', EMAIL_FROM: 'not an address' }))
      .toMatchObject({ configured: false, problem: 'EMAIL_FROM isn’t a valid email address.' });
  });

  it('turns email-service errors into something an admin can act on', () => {
    expect(describeSendFailure(403, 'You can only send testing emails to your own email address (a@b.com).'))
      .toContain('until a sending domain is verified');
    expect(describeSendFailure(403, 'The m10group.co.uk domain is not verified.')).toContain('isn’t verified in Resend');
    expect(describeSendFailure(401, 'API key is invalid')).toContain('Reconnect Resend');
    expect(describeSendFailure(429, 'Too many requests')).toContain('limit');
    expect(describeSendFailure(503, null)).toContain('Try again in a minute');
    expect(describeSendFailure(null, null)).toContain('didn’t respond');
    expect(describeSendFailure(422, 'Invalid `to` field')).toBe('The email service said: Invalid `to` field');
  });
});

describe('where someone is with their invite', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  const later = new Date('2026-10-12T12:00:00Z');
  const earlier = new Date('2026-10-01T12:00:00Z');
  const p = { active: true, must_change_password: false, last_login_at: null, temp_password_expires_at: null };

  it('covers every state', () => {
    expect(personStatus({ ...p, last_login_at: earlier }, now)).toBe('active');
    expect(personStatus(p, now)).toBe('active'); // e.g. the first admin, who chose their own password
    expect(personStatus({ ...p, must_change_password: true, temp_password_expires_at: later }, now)).toBe('invited');
    expect(personStatus({ ...p, must_change_password: true, temp_password_expires_at: earlier }, now)).toBe('invite_expired');
    expect(personStatus({ ...p, must_change_password: true, last_login_at: earlier, temp_password_expires_at: later }, now)).toBe('temp_password');
    expect(personStatus({ ...p, must_change_password: true, last_login_at: earlier, temp_password_expires_at: earlier }, now)).toBe('temp_expired');
    expect(personStatus({ ...p, active: false, must_change_password: true }, now)).toBe('deactivated');
  });

  it('only invites nobody has used can be cancelled', () => {
    expect(canCancelInvite(p)).toBe(true);
    expect(canCancelInvite({ ...p, last_login_at: earlier })).toBe(false);
  });
});
