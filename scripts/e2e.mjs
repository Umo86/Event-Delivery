// Runs the end-to-end tests: fresh local database and file store, a production build, then Playwright.
// Usage: node scripts/e2e.mjs [--no-build] [playwright args…]
// Child processes are awaited asynchronously because the file-store emulator runs inside this process.
import { spawn } from 'node:child_process';
import { startStack, stackEnv } from './stack.mjs';

const PORT = 3100;
const args = process.argv.slice(2);
const skipBuild = args.includes('--no-build');
const pwArgs = args.filter((a) => a !== '--no-build');
// Test-only codes, so the real setup code and self-test token never need to appear in the tests.
const env = {
  ...process.env, ...stackEnv(), INSECURE_COOKIES: '1', NEXT_TELEMETRY_DISABLED: '1',
  SETUP_CODE: 'ED-TEST-0000-0001', SELFTEST_TOKEN: 'local-selftest-token',
};

function run(cmd, cmdArgs) {
  return new Promise((resolve) => {
    const p = spawn(cmd, cmdArgs, { stdio: 'inherit', env });
    p.on('exit', (code) => resolve(code ?? 1));
  });
}

const stack = await startStack({ reset: true });
let server;
let code = 1;
try {
  if (!skipBuild && (await run('npx', ['next', 'build'])) !== 0) throw new Error('Build failed');
  server = spawn('npx', ['next', 'start', '-p', String(PORT), '-H', '127.0.0.1'], { stdio: ['ignore', 'inherit', 'inherit'], env, detached: true });
  const started = Date.now();
  for (;;) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/api/health`);
      break;
    } catch {
      if (Date.now() - started > 60_000) throw new Error('Server did not start');
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  code = await run('npx', ['playwright', 'test', ...pwArgs]);
} catch (e) {
  console.error(e);
} finally {
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  }
  await stack.stop();
}
process.exit(code);
