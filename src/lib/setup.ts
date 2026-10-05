import 'server-only';
import { sha256, verifyPassword } from '@/lib/auth/password';

// One-time code for creating the first admin account. Only a slow (scrypt) hash lives in the code; the code
// itself was given to the owner. It stops working as soon as any user exists. Can be overridden with SETUP_CODE.
const SETUP_CODE_HASH =
  'scrypt$16384$8$1$TgkFK1PVkLbAUkDjpzvxQg==$jvnxxmDqDMdDfGojg2qyAZl06c6CimF8uAWz/DrAbK7NDoDlRtu6nrKjUHxmfTX0xCd/f/lDvUXFX0gZCS9RmQ==';

// Token for the end-to-end system check endpoint (/api/selftest). Override with SELFTEST_TOKEN.
const SELFTEST_TOKEN_HASH = '47ce0b3801268e87ca6398a54ffae92fd959300468bd299ed84c2f1eb73a5329';

export async function checkSetupCode(code: string): Promise<boolean> {
  const c = code.trim().toUpperCase();
  if (process.env.SETUP_CODE) return c === process.env.SETUP_CODE.trim().toUpperCase();
  return verifyPassword(c, SETUP_CODE_HASH);
}

export function checkSelfTestToken(token: string | null): boolean {
  if (!token) return false;
  if (process.env.SELFTEST_TOKEN) return token === process.env.SELFTEST_TOKEN;
  return sha256(token) === SELFTEST_TOKEN_HASH;
}
