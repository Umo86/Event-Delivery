import crypto from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  const key = await new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(password, salt, expected.length, { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]), maxmem: 64 * 1024 * 1024 },
      (err, k) => (err ? reject(err) : resolve(k))),
  );
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

const WORDS = ['amber', 'birch', 'cedar', 'delta', 'ember', 'flint', 'grove', 'harbor', 'ivory', 'jade', 'kite',
  'lemon', 'maple', 'north', 'olive', 'pearl', 'quartz', 'river', 'slate', 'tiger', 'umber', 'violet', 'willow', 'zephyr',
  'anchor', 'beacon', 'canyon', 'dune', 'falcon', 'glacier', 'heron', 'island', 'juniper', 'lagoon', 'meadow', 'nectar',
  'orchid', 'pepper', 'raven', 'saffron', 'thistle', 'walnut', 'yarrow', 'copper', 'marble', 'cobalt', 'linen', 'summit'];

/** Readable temporary password, e.g. "plum-raft-cobalt-7342" (about 30 bits, plus the sign-in lockout). */
export function tempPassword(): string {
  const pick = () => WORDS[crypto.randomInt(WORDS.length)];
  return `${pick()}-${pick()}-${pick()}-${crypto.randomInt(1000, 10000)}`;
}

export const PASSWORD_MIN = 8;
