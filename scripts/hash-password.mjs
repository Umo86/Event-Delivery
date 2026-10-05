// Prints a scrypt hash of a password, for BOOTSTRAP_ADMIN_PASSWORD_HASH. The password is read from the
// terminal without echoing it, so it never ends up in your shell history.
// Usage: node scripts/hash-password.mjs
import crypto from 'node:crypto';
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
rl._writeToOutput = (s) => { if (!s.includes('Password')) rl.output.write('*'); else rl.output.write(s); };
rl.question('Password: ', (password) => {
  rl.close();
  process.stdout.write('\n');
  if (password.length < 8) {
    console.error('Use at least 8 characters.');
    process.exit(1);
  }
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  console.log(`scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`);
});
