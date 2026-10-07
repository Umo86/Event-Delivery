import { describe, expect, it } from 'vitest';
import { firstName, inviteMessage, mailtoLink, teamNote } from '@/lib/invite-message';
import { canCancelInvite, levelsFor, personStatus } from '@/lib/domain/access';
import { listText } from '@/lib/text';

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

describe('the invite email the admin sends', () => {
  it('has the sign-in link, the email, the temporary password, the access level and the sender’s name', () => {
    const m = inviteMessage(base);
    expect(m.to).toBe('mark@ukcw.test');
    expect(m.subject).toBe('Your Event Delivery invitation');
    expect(m.body).toContain('Hello Mark,');
    expect(m.body).toContain('I’ve set you up on Event Delivery');
    expect(m.body).toContain('Sign in here: https://event-delivery.vercel.app/login');
    expect(m.body).toContain('Email: mark@ukcw.test');
    expect(m.body).toContain('Temporary password: amber-birch-cedar-1234');
    expect(m.body).toContain('stops working on Monday 12 October at 14:00'); // London time
    expect(m.body).toContain('Your access: Member. You can add and edit lines.');
    expect(m.body.endsWith('Thanks,\nUmit')).toBe(true);
  });

  it('a reset says the password was reset and leaves out the access level', () => {
    const m = inviteMessage({ ...base, kind: 'reset' });
    expect(m.subject).toBe('Your Event Delivery password has been reset');
    expect(m.body).toContain('I’ve reset your Event Delivery password.');
    expect(m.body).toContain('Temporary password: amber-birch-cedar-1234');
    expect(m.body).not.toContain('Your access:');
  });

  it('opens in an email app with everything filled in', () => {
    const m = inviteMessage(base);
    expect(m.mailto.startsWith('mailto:mark@ukcw.test?subject=Your%20Event%20Delivery%20invitation&body=Hello%20Mark%2C%0D%0A%0D%0A')).toBe(true);
    const url = new URL(m.mailto);
    expect(url.searchParams.get('body')).toBe(m.body.replace(/\n/g, '\r\n'));
  });

  it('tells new people their departments and what they sign off, show by show', () => {
    expect(teamNote([], [])).toBe('');
    expect(teamNote(['Marketing'], [])).toBe('Your department: Marketing.');
    expect(teamNote(['Marketing', 'Content'], [{ show: 'UKCW London 2027', stage: 'Marketing' }]))
      .toBe('Your departments: Marketing and Content. You sign off Marketing in UKCW London 2027.');
    expect(teamNote([], [
      { show: 'UKCW London 2027', stage: 'Marketing' }, { show: 'UKCW London 2027', stage: 'Final sign-off' },
      { show: 'UKCW Birmingham 2028', stage: 'Marketing' },
    ])).toBe('You sign off Marketing and Final sign-off in UKCW London 2027 and Marketing in UKCW Birmingham 2028.');

    const m = inviteMessage({ ...base, teamNote: 'Your department: Marketing. You sign off Marketing in UKCW London 2027.' });
    expect(m.body).toContain('Your access: Member. You can add and edit lines.\nYour department: Marketing. You sign off Marketing in UKCW London 2027.\n\nThanks,');
    expect(inviteMessage({ ...base, teamNote: '' }).body).toContain('You can add and edit lines.\n\nThanks,');
    expect(inviteMessage({ ...base, kind: 'reset', teamNote: 'Your department: Marketing.' }).body).not.toContain('Your department');
  });

  it('lists things the way people write them', () => {
    expect(listText([])).toBe('');
    expect(listText(['A'])).toBe('A');
    expect(listText(['A', 'B'])).toBe('A and B');
    expect(listText(['A', 'B', 'C'])).toBe('A, B and C');
    expect(listText(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('A, B, C and 3 more');
  });

  it('keeps odd characters from breaking the link', () => {
    const link = mailtoLink('jo+ukcw@example.com', 'A & B?', 'Line one\nLine two #3');
    expect(link).toBe('mailto:jo%2Bukcw@example.com?subject=A%20%26%20B%3F&body=Line%20one%0D%0ALine%20two%20%233');
    expect(firstName('  Jo  Bloggs ')).toBe('Jo');
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

  it('managers can add Managers and Users; only super admins add Super Admins', () => {
    expect(levelsFor(true).map((l) => l.key)).toEqual(['super_admin', 'manager', 'user']);
    expect(levelsFor(false).map((l) => l.key)).toEqual(['manager', 'user']);
  });
});
