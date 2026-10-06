// Runs the end-to-end tests: fresh local database and file store, a production build, then Playwright.
// Usage: node scripts/e2e.mjs [--no-build] [playwright args…]
// Two phases: the main suite, then (when the whole suite runs) the server restarts with a shared demo login
// configured and the tests tagged @demo run against the same data.
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
const DEMO_ENV = { DEMO_ACCOUNT_EMAIL: 'demo@ukcw.test', DEMO_ACCOUNT_PASSWORD: 'demo-pass-2027', DEMO_ACCOUNT_NAME: 'Demo User' };

function run(cmd, cmdArgs, extraEnv = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, cmdArgs, { stdio: 'inherit', env: { ...env, ...extraEnv } });
    p.on('exit', (code) => resolve(code ?? 1));
  });
}

const up = () => fetch(`http://127.0.0.1:${PORT}/api/health`).then(() => true, () => false);

async function startServer(extraEnv = {}) {
  const server = spawn('npx', ['next', 'start', '-p', String(PORT), '-H', '127.0.0.1'],
    { stdio: ['ignore', 'inherit', 'inherit'], env: { ...env, ...extraEnv }, detached: true });
  const started = Date.now();
  while (!(await up())) {
    if (Date.now() - started > 60_000) throw new Error('Server did not start');
    await new Promise((r) => setTimeout(r, 500));
  }
  return server;
}

async function stopServer(server) {
  if (!server?.pid) return;
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  const started = Date.now();
  while ((await up()) && Date.now() - started < 15_000) await new Promise((r) => setTimeout(r, 300));
}

const stack = await startStack({ reset: true });
let server;
let code = 1;
try {
  // npm run build (not next build directly) so the prebuild step copies the PDF.js worker into public/, as on a fresh clone
  if (!skipBuild && (await run('npm', ['run', 'build'])) !== 0) throw new Error('Build failed');
  server = await startServer();
  code = await run('npx', ['playwright', 'test', '--grep-invert', '@demo', ...pwArgs]);
  if (code === 0 && pwArgs.length === 0) {
    await stopServer(server);
    server = await startServer(DEMO_ENV);
    // Its own output folder, so the first phase's screenshots and traces are kept
    code = await run('npx', ['playwright', 'test', '--grep', '@demo', '--output', 'test-results/demo-phase'], DEMO_ENV);
  }
} catch (e) {
  console.error(e);
} finally {
  await stopServer(server);
  await stack.stop();
}
process.exit(code);
