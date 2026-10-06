import { expect, test } from '@playwright/test';
import { loginAs, panel } from './helpers';

test.describe.configure({ mode: 'serial' });

test('admins get an overview of every show and can open one', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/dashboard');
  await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'All shows' }).click();
  await expect(page).toHaveURL(/\/shows$/);
  await expect(page.getByRole('heading', { name: 'All shows', level: 1 })).toBeVisible();

  // Both live shows are listed, with their stats
  const shows = panel(page, 'Shows');
  const london = shows.locator('form').filter({ hasText: 'UKCW London 2027' });
  const bham = shows.locator('form').filter({ hasText: 'UKCW Birmingham 2027' });
  await expect(london).toBeVisible();
  await expect(bham).toBeVisible();
  await expect(london).toContainText('Lines');
  await expect(bham).toContainText('Opens in'); // Birmingham is in the future
  await page.screenshot({ path: test.info().outputPath('shows.png'), fullPage: true });

  // Opening a show switches to it and lands on its dashboard
  await bham.getByRole('button').click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'UKCW Birmingham 2027', level: 2 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).first().locator('#event-switch option:checked')).toHaveText('UKCW Birmingham 2027');
});
