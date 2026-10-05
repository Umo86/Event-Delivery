import { expect, test } from '@playwright/test';
import { ADMIN, SETUP_CODE, errorMessage, login, logout, writeState } from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => writeState({ users: {}, items: {} }));

test('health check reports the database and file storage', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.database).toMatchObject({ configured: true, ok: true, schemaUpToDate: true, setupComplete: false });
  expect(body.fileStorage).toMatchObject({ configured: true, access: 'private' });
  expect(body.email).toMatchObject({ configured: true, testSender: false });
});

test('search engines are told not to index the platform', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toMatch(/User-Agent: \*\s+Disallow: \/\s*$/);
});

test('security headers are sent', async ({ request }) => {
  const res = await request.get('/login');
  expect(res.headers()['x-frame-options']).toBe('DENY');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(res.headers()['x-powered-by']).toBeUndefined();
});

test('a fresh install sends people to the setup page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { name: 'Create the admin account' })).toBeVisible();
  await page.goto('/login');
  await expect(page).toHaveURL(/\/setup$/);
});

test('setup rejects a wrong code and mismatched passwords', async ({ page }) => {
  await page.goto('/setup');
  await page.fill('#code', 'ED-0000-0000-0000');
  await page.fill('#full_name', ADMIN.name);
  await page.fill('#email', ADMIN.email);
  await page.fill('#password', ADMIN.password);
  await page.fill('#confirm', ADMIN.password);
  await page.getByRole('button', { name: 'Create admin account' }).click();
  await expect(errorMessage(page, 'setup code isn’t right')).toBeVisible();

  await page.fill('#code', SETUP_CODE);
  await page.fill('#confirm', 'something-else');
  await page.getByRole('button', { name: 'Create admin account' }).click();
  await expect(errorMessage(page, 'two passwords don’t match')).toBeVisible();
});

test('setup creates the admin and the first event', async ({ page }) => {
  await page.goto('/setup');
  await page.fill('#code', SETUP_CODE.toLowerCase()); // codes are not case sensitive
  await page.fill('#full_name', ADMIN.name);
  await page.fill('#job_title', 'Operations Director');
  await page.fill('#email', ADMIN.email);
  await page.fill('#password', ADMIN.password);
  await page.fill('#confirm', ADMIN.password);
  await page.getByRole('button', { name: 'Create admin account' }).click();
  await expect(page).toHaveURL(/\/settings\?welcome=1/);
  await expect(page.getByRole('heading', { name: 'Welcome. Here’s how to get set up' })).toBeVisible();
  await expect(page.locator('#name')).toHaveValue('UKCW London 2027');
  await expect(page.locator('#venue')).toHaveValue('ExCeL London');
  await expect(page.locator('#show_open')).toHaveValue('2027-05-11');
  // Sidebar shows the platform name, the event and the signed-in person
  const nav = page.getByRole('navigation', { name: 'Main' }).first();
  await expect(nav.getByText('Event Delivery')).toBeVisible();
  await expect(nav.locator('#event-switch')).toHaveValue(/[0-9a-f-]{36}/);
  await expect(nav.getByText(ADMIN.name)).toBeVisible();
});

test('setup cannot be run a second time', async ({ page, request }) => {
  await page.goto('/setup');
  await expect(page).not.toHaveURL(/\/setup/);
  const health = await (await request.get('/api/health')).json();
  expect(health.database.setupComplete).toBe(true);
});

test('sign out, failed sign in and sign in', async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByRole('heading', { name: 'My actions' })).toBeVisible();
  await logout(page);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  await page.fill('#email', ADMIN.email);
  await page.fill('#password', 'wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(errorMessage(page, 'don’t match an account')).toBeVisible();

  // Email is not case sensitive, and the person returns to the page they asked for
  await page.fill('#email', ADMIN.email.toUpperCase());
  await page.fill('#password', ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('sign-in ignores links to other websites', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/login?next=' + encodeURIComponent('//evil.example.com/x'));
  await page.fill('#email', ADMIN.email);
  await page.fill('#password', ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:3100\/inbox$/);
});
