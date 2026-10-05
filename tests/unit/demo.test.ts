import { describe, expect, it } from 'vitest';
import { demoSettings } from '@/lib/demo-settings';

describe('the shared demo login settings', () => {
  it('is off unless both the email and the password are set', () => {
    expect(demoSettings({})).toBeNull();
    expect(demoSettings({ DEMO_ACCOUNT_EMAIL: 'demo@x.test' })).toBeNull();
    expect(demoSettings({ DEMO_ACCOUNT_PASSWORD: 'long-enough-1' })).toBeNull();
  });

  it('needs a real-looking email and a password of at least 8 characters', () => {
    expect(demoSettings({ DEMO_ACCOUNT_EMAIL: 'not-an-email', DEMO_ACCOUNT_PASSWORD: 'long-enough-1' })).toBeNull();
    expect(demoSettings({ DEMO_ACCOUNT_EMAIL: 'demo@x.test', DEMO_ACCOUNT_PASSWORD: 'short' })).toBeNull();
  });

  it('defaults to a member called Demo User, with the email in lower case', () => {
    expect(demoSettings({ DEMO_ACCOUNT_EMAIL: ' Demo@X.test ', DEMO_ACCOUNT_PASSWORD: 'long-enough-1' }))
      .toEqual({ email: 'demo@x.test', password: 'long-enough-1', name: 'Demo User', role: 'member' });
  });

  it('can be a viewer, but never an admin, because anyone can use it', () => {
    const base = { DEMO_ACCOUNT_EMAIL: 'demo@x.test', DEMO_ACCOUNT_PASSWORD: 'long-enough-1', DEMO_ACCOUNT_NAME: 'Try Me' };
    expect(demoSettings({ ...base, DEMO_ACCOUNT_ROLE: 'Viewer' })).toMatchObject({ role: 'viewer', name: 'Try Me' });
    expect(demoSettings({ ...base, DEMO_ACCOUNT_ROLE: 'admin' })).toMatchObject({ role: 'member' });
  });
});
