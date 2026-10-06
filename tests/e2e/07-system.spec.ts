import { expect, test } from '@playwright/test';
import { acceptNextDialog, errorMessage, itemId, loginAs, okMessage, panel } from './helpers';

test.describe.configure({ mode: 'serial' });

const SELFTEST_TOKEN = process.env.SELFTEST_TOKEN ?? 'local-selftest-token';

test('the system page shows health and runs a full check', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/settings/system');
  const health = panel(page, 'Health');
  await expect(health).toContainText('Connected (schema v9, up to date)');
  await expect(health).toContainText('Connected (private store)');
  await expect(health).toContainText(/\d+ versions, [\d.]+ MB of originals/);

  await page.getByRole('button', { name: 'Run system check' }).click();
  const result = okMessage(page, 'Everything works:');
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toContainText('✓ Upload a file to Blob storage (private store)');
  await expect(result).not.toContainText('✗');
});

test('the self-test endpoint runs the same check for monitoring', async ({ request }) => {
  const res = await request.get(`/api/selftest?token=${SELFTEST_TOKEN}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.steps.length).toBeGreaterThan(5);
  expect(body.steps.every((s: { ok: boolean }) => s.ok)).toBe(true);
  // The temporary event it creates is cleaned up afterwards
  const health = await (await request.get('/api/health')).json();
  expect(health.ok).toBe(true);
  // One run every few minutes, so it can't be used to run down the free file-storage allowance
  const again = await request.get(`/api/selftest?token=${SELFTEST_TOKEN}`);
  expect(again.status()).toBe(429);
});

test('the platform can be renamed', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/settings/system');
  await page.fill('#app_name', 'UKCW Signage');
  await panel(page, 'Platform name').getByRole('button', { name: 'Save' }).click();
  await expect(okMessage(page, 'Saved.')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Main' }).first();
  await expect(nav.getByText('UKCW Signage')).toBeVisible();
  await page.fill('#app_name', 'Event Delivery');
  await panel(page, 'Platform name').getByRole('button', { name: 'Save' }).click();
  await expect(nav.getByText('Event Delivery')).toBeVisible();
});

test('a new event copies stages and sponsors, and people can switch between events', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/settings/events');
  await page.fill('#ne-name', 'UKCW Birmingham 2027');
  await page.selectOption('#ne-venue', 'NEC Birmingham');
  await page.fill('#ne-build', '2027-09-25');
  await page.fill('#ne-open', '2027-09-28');
  await page.fill('#ne-close', '2027-09-30');
  await page.fill('#ne-breakdown', '2027-10-01');
  await expect(page.locator('#ne-copy option:checked')).toHaveText('UKCW London 2027');
  await page.getByLabel('Also copy the sponsor list').check();
  // Breakdown can't be before the closing day
  await page.fill('#ne-breakdown', '2027-09-29');
  await page.getByRole('button', { name: 'Create event' }).click();
  await expect(errorMessage(page, 'Breakdown must end on or after the closing day.')).toBeVisible();
  await page.fill('#ne-breakdown', '2027-10-01');
  await page.getByRole('button', { name: 'Create event' }).click();
  await expect(page).toHaveURL(/\/settings\?created=1/);
  await expect(page.getByText('Event created. Check its dates and deadlines below.')).toBeVisible();
  await expect(page.locator('#name')).toHaveValue('UKCW Birmingham 2027');
  await expect(page.locator('#build_start')).toHaveValue('2027-09-25');
  await expect(page.locator('#breakdown_end')).toHaveValue('2027-10-01');
  await expect(page.getByLabel('Organiser signage artwork due')).toHaveValue('2027-08-17');
  await expect(page.locator('#budget')).toHaveValue('25000');

  // The events list shows the run of dates
  await page.goto('/settings/events');
  await expect(page.locator('li').filter({ hasText: 'UKCW Birmingham 2027' }))
    .toContainText('Build-up from 25 Sep 2027 · Open 28–30 Sep 2027 · Breakdown to 1 Oct 2027');
  await page.screenshot({ path: test.info().outputPath('events.png'), fullPage: true });
  await page.goto('/suppliers');
  await page.locator('aside').first().screenshot({ path: test.info().outputPath('sidebar.png') });
  await page.goto('/settings/events'); // back for the rest of the test

  const switcher = page.locator('#event-switch');
  await expect(switcher.locator('option:checked')).toHaveText('UKCW Birmingham 2027');
  await page.goto('/settings/stages');
  await expect(panel(page, /^\d+\s*Operations$/).getByRole('checkbox', { name: 'Olivia Ops' })).toBeChecked();
  await page.goto('/sponsors');
  await expect(page.getByRole('link', { name: 'Acme Steel' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'BuildCo' })).toBeVisible();
  await page.goto('/schedule/os');
  await expect(page.getByText('No organiser signage yet')).toBeVisible();
  await page.goto('/schedule/os/new');
  await expect(page.locator('#dl-hall option').first()).toHaveAttribute('value', 'Hall 1');

  // Switch back to London from the menu
  await page.goto('/schedule/os');
  await page.locator('#event-switch').selectOption({ label: 'UKCW London 2027' });
  await expect(page.getByText(/^UKCW London 2027: \d+ lines?$/)).toBeVisible();
  await page.goto(`/items/${itemId('os1')}`);
  await page.locator('#event-switch').selectOption({ label: 'UKCW Birmingham 2027' });
  await expect(page).toHaveURL(/\/dashboard$/); // a line belongs to one event, so switching goes to the dashboard
  await expect(page.getByRole('heading', { name: 'UKCW Birmingham 2027', level: 2 })).toBeVisible();
});

test('events can be archived, but one must stay active', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/settings/events');
  const bham = page.locator('li').filter({ hasText: 'UKCW Birmingham 2027' });
  acceptNextDialog(page);
  await bham.getByRole('button', { name: 'Archive' }).click();
  await expect(bham.getByText('Archived', { exact: true })).toBeVisible();
  const london = page.locator('li').filter({ hasText: 'UKCW London 2027' });
  acceptNextDialog(page);
  await london.getByRole('button', { name: 'Archive' }).click();
  await expect(errorMessage(london, 'Keep at least one active event.')).toBeVisible();
  await bham.getByRole('button', { name: 'Restore' }).click();
  await expect(bham.getByText('Archived', { exact: true })).toHaveCount(0);
  await page.locator('#event-switch').selectOption({ label: 'UKCW London 2027' });
  await expect(page.locator('#event-switch option:checked')).toHaveText('UKCW London 2027');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the menu, lists and line pages work on a small screen', async ({ page }) => {
    await loginAs(page, 'pete');
    await page.goto('/inbox');
    await expect(page.getByRole('link', { name: /^\d+ for you$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Open menu' }).click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu).toBeVisible();
    await menu.getByRole('link', { name: /Organiser signage/ }).click();
    await expect(page).toHaveURL(/\/schedule\/os$/);
    await expect(menu).toHaveCount(0);
    const cards = page.locator('main ul li a[href^="/items/"]');
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText('Hall S1 entrance banner');
    const noSideScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(await noSideScroll()).toBe(true);
    await cards.first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hall S1 entrance banner');
    expect(await noSideScroll()).toBe(true);
    await page.goto('/dashboard');
    expect(await noSideScroll()).toBe(true);
  });

  test('no page scrolls sideways on a phone', async ({ page }) => {
    await loginAs(page, 'admin');
    const pages = ['/inbox', '/inbox?view=team', '/dashboard', '/schedule/os', '/schedule/all', '/schedule/ss/new', '/sponsors',
      `/items/${itemId('os1')}`, `/items/${itemId('ss1')}`, `/proof/${itemId('os1')}`, '/settings', '/settings/stages', '/admin',
      '/suppliers', '/settings/lists', '/settings/events', '/settings/system', '/account', '/gs'];
    const wide: string[] = [];
    for (const p of pages) {
      await page.goto(p);
      const ok = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
      if (!ok) wide.push(p);
    }
    expect(wide).toEqual([]);
  });
});
