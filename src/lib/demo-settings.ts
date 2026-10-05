// The shared demo login, configured in the deployment settings. Its email and password are shown on the
// sign-in page, so it is deliberately public: it can never be an admin. No server-only imports, so it can be unit tested.

export interface DemoSettings {
  email: string;
  password: string;
  name: string;
  role: 'member' | 'viewer';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** DEMO_ACCOUNT_EMAIL and DEMO_ACCOUNT_PASSWORD turn it on; DEMO_ACCOUNT_NAME and DEMO_ACCOUNT_ROLE are optional. */
export function demoSettings(env: Record<string, string | undefined>): DemoSettings | null {
  const email = env.DEMO_ACCOUNT_EMAIL?.trim().toLowerCase();
  const password = env.DEMO_ACCOUNT_PASSWORD?.trim();
  if (!email || !password) return null;
  if (!EMAIL_RE.test(email) || password.length < 8) return null;
  return {
    email,
    password,
    name: env.DEMO_ACCOUNT_NAME?.trim().slice(0, 120) || 'Demo User',
    // Anyone can use this login, so it is never an admin
    role: env.DEMO_ACCOUNT_ROLE?.trim().toLowerCase() === 'viewer' ? 'viewer' : 'member',
  };
}
