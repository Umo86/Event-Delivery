import { expect, test, type Page } from '@playwright/test';
import { acceptNextDialog, loginAs, panel } from './helpers';

test.describe.configure({ mode: 'serial' });

const menu = (page: Page) => page.getByRole('navigation', { name: 'Main' }).first();

test('a super admin lands on the Control centre, with every show and what needs them', async ({ page }) => {
  await loginAs(page, 'admin');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Control centre', level: 1 })).toBeVisible();
  await expect(panel(page, 'Your shows')).toContainText('UKCW London 2027');
  await expect(panel(page, 'Your shows')).toContainText('Working in');
  await expect(panel(page, 'Your shows').getByRole('link', { name: 'New show' })).toBeVisible();
  await expect(panel(page, /^Needs your attention/)).toBeVisible();
  await expect(panel(page, /^Your actions/)).toBeVisible();
  await expect(panel(page, 'Where everything is')).toBeVisible();
  // One menu, grouped, with the admin tools in it
  for (const name of ['Control centre', 'My actions', 'Organiser signage', 'Sponsors', 'Show setup', 'People', 'Platform', 'All shows']) {
    await expect(menu(page).getByRole('link', { name: new RegExp(`^${name}( \\d+)?$`) })).toBeVisible();
  }
  await page.screenshot({ path: test.info().outputPath('control-centre.png'), fullPage: true });
});

test('a manager lands on their dashboard, with their actions first', async ({ page }) => {
  await loginAs(page, 'pete');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  // Every show at a glance first, then the one they're working in
  await expect(panel(page, 'Your shows')).toContainText('UKCW London 2027');
  await expect(panel(page, 'Your shows')).toContainText('UKCW Birmingham 2027');
  await expect(page.getByRole('heading', { name: 'UKCW London 2027', level: 2 })).toBeVisible();
  await expect(menu(page).getByRole('link', { name: 'All shows', exact: true })).toBeVisible();
  const mine = panel(page, /^Your actions/);
  await expect(mine.getByRole('link').first()).toBeVisible();
  // Each action says what kind of job it is
  await expect(mine.getByRole('link', { name: /Registration directional totem/ })).toContainText('Artwork');
  await expect(mine.getByRole('link', { name: /Acme Steel feature area banner/ })).toContainText('Production');
  await expect(panel(page, 'Coming up')).toBeVisible();
  await expect(menu(page).getByRole('link', { name: 'Show setup', exact: true })).toBeVisible();
  await expect(menu(page).getByRole('link', { name: 'People', exact: true })).toHaveCount(0);
  await expect(menu(page).getByRole('link', { name: 'Platform', exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('manager-dashboard.png'), fullPage: true });

  // The same badges on their board
  await menu(page).getByRole('link', { name: /^My actions/ }).click();
  const todo = page.getByRole('region', { name: 'To do' });
  await expect(todo.getByRole('link', { name: /Acme Steel feature area banner/ })).toContainText('Production');
  await expect(todo.getByRole('link', { name: /Registration directional totem/ })).toContainText('Artwork');
  await page.screenshot({ path: test.info().outputPath('manager-board.png'), fullPage: true });
});

test('a manager can set up a new show and manage it from All shows', async ({ page }) => {
  await loginAs(page, 'pete');
  await panel(page, 'Your shows').getByRole('link', { name: 'New show' }).click();
  await expect(page).toHaveURL(/\/shows\/new$/);
  await page.fill('#ne-name', 'UKCW Manchester 2028');
  await page.fill('#ne-open', '2028-03-14');
  await page.fill('#ne-close', '2028-03-16');
  await page.getByRole('button', { name: 'Create show' }).click();
  await expect(page).toHaveURL(/\/settings\?created=1/);
  await expect(page.getByText('Show created. Check its dates and deadlines below.')).toBeVisible();
  await expect(page.locator('#name')).toHaveValue('UKCW Manchester 2028');

  // All shows summarises it alongside the others, and it can be archived from there
  await menu(page).getByRole('link', { name: 'All shows', exact: true }).click();
  await expect(page).toHaveURL(/\/shows$/);
  await expect(page.getByRole('heading', { name: 'All shows', level: 1 })).toBeVisible();
  const row = page.locator('li').filter({ hasText: 'UKCW Manchester 2028' });
  await expect(row).toContainText('Open 14–16 Mar 2028');
  await expect(page.locator('li').filter({ hasText: 'UKCW London 2027' })).toContainText('Lines');
  await page.screenshot({ path: test.info().outputPath('manager-all-shows.png'), fullPage: true });
  acceptNextDialog(page);
  await row.getByRole('button', { name: 'Archive' }).click();
  await expect(panel(page, /^Archived \(1\)$/)).toContainText('UKCW Manchester 2028');
});

test('a user lands on a read-only overview and can find any line', async ({ page }) => {
  await loginAs(page, 'vic');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
  await expect(panel(page, /^Your actions/)).toHaveCount(0); // users can't be given work
  await expect(menu(page).getByRole('link', { name: 'My tasks', exact: true })).toBeVisible();
  await expect(menu(page).getByRole('link', { name: 'Show setup', exact: true })).toHaveCount(0);
  await expect(menu(page).getByRole('link', { name: 'All shows' })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('user-overview.png'), fullPage: true });

  await page.getByLabel('Find a line').fill('entrance banner');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/\/schedule\/all\?q=entrance\+banner/);
  await expect(page.locator('table tbody')).toContainText('Hall S1 entrance banner');
});
