import { expect, test, type Page } from '@playwright/test';
import { loginAs, panel } from './helpers';

test.describe.configure({ mode: 'serial' });

const menu = (page: Page) => page.getByRole('navigation', { name: 'Main' }).first();

test('a super admin lands on the Control centre, with every show and what needs them', async ({ page }) => {
  await loginAs(page, 'admin');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Control centre', level: 1 })).toBeVisible();
  await expect(panel(page, 'Your shows')).toContainText('UKCW London 2027');
  await expect(panel(page, 'Your shows')).toContainText('Working in');
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
  const mine = panel(page, /^Your actions/);
  await expect(mine.getByRole('link').first()).toBeVisible();
  await expect(panel(page, 'Coming up')).toBeVisible();
  await expect(menu(page).getByRole('link', { name: 'Show setup', exact: true })).toBeVisible();
  await expect(menu(page).getByRole('link', { name: 'People', exact: true })).toHaveCount(0);
  await expect(menu(page).getByRole('link', { name: 'Platform', exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('manager-dashboard.png'), fullPage: true });
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
