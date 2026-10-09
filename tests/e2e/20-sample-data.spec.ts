import { expect, test, type Page } from '@playwright/test';
import { acceptNextDialog, login, loginAs, okMessage, panel } from './helpers';

// Sample data: one click gives a show full of signage, a team, sponsors and suppliers to try everything with.
test.describe.configure({ mode: 'serial' });

const SHOW = 'UKCW Birmingham 2027 (sample)';
const sampleRows = (page: Page) => page.getByRole('table', { name: 'Sample people' }).locator('tbody tr');

test('a super admin adds the sample show and gets the sample team’s passwords', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/admin/platform');
  const box = panel(page, 'Sample data');
  await expect(box).toContainText('Adds a show called UKCW Birmingham 2027 (sample)');
  await box.getByRole('button', { name: 'Add sample data' }).click();
  await expect(box.getByRole('status')).toContainText(`${SHOW} is ready with 32 lines.`);
  await expect(sampleRows(page)).toHaveCount(8);
  const sam = sampleRows(page).filter({ hasText: 'Sam Okafor' });
  await expect(sam).toContainText('sam@sample.ukcw.test');
  await expect(sam).toContainText('Manager');
  const password = (await sam.locator('code').innerText()).trim();
  expect(password).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d{4}$/);
  // Once added, the panel offers to remove it
  await expect(box.getByRole('button', { name: 'Remove sample data' })).toBeVisible();
  await expect(box.getByRole('button', { name: 'Add sample data' })).toHaveCount(0);

  // We're now working in the sample show, and the sheet has every status
  await page.goto('/schedule/os');
  await expect(page.getByText(`${SHOW}: 22 lines`)).toBeVisible();
  // Every one of the six statuses is represented (6 + 4 + 3 + 2 + 3 + 4 = 22)
  const key = page.getByRole('list', { name: 'Status key' });
  for (const [w, n] of [['Ready to artwork', 6], ['Artworked', 4], ['Approved', 3], ['Sent', 2], ['Printed', 3], ['Installed', 4]] as const) {
    await expect(key.getByRole('listitem').filter({ hasText: w })).toContainText(`(${n})`);
  }
  await expect(page.locator('table tbody tr[data-line]')).toHaveCount(22);
  await expect(page.locator('th[scope=rowgroup]').filter({ hasText: 'F1 UKCW Main Stage' })).toBeVisible();
  await expect(page.locator('tr[data-line="OS-001"]')).toContainText('G1.1');
  await expect(page.locator('tr[data-line="OS-001"]')).toContainText('Installed');
  await expect(page.locator('tr[data-line="OS-012"]')).toContainText('Changes requested · Marketing');
  await page.screenshot({ path: test.info().outputPath('sample-sheet.png'), fullPage: true });

  // Sponsor signage is grouped by sponsor, with no section anywhere
  await page.goto('/schedule/ss');
  await expect(page.locator('th[scope=rowgroup]').filter({ hasText: 'BuildRight Ltd' })).toContainText('3 lines');
  await expect(page.getByLabel('Section', { exact: true })).toHaveCount(0);
  await expect(page.locator('table tbody tr[data-line]')).toHaveCount(10);

  // All signage, one Excel-like sheet, says which list each group belongs to
  await page.goto('/schedule/all');
  await expect(page.getByRole('group', { name: 'View' }).getByRole('link', { name: 'Sheet' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('columnheader', { name: 'List' })).toBeVisible();
  await expect(page.locator('th[scope=rowgroup]').filter({ hasText: 'Organiser signage · G1 General' })).toBeVisible();
  await expect(page.locator('th[scope=rowgroup]').filter({ hasText: 'Sponsor signage · Zenith Software' })).toBeVisible();
  await expect(page.locator('table tbody tr[data-line]')).toHaveCount(32);

  // The team, sponsors and suppliers are there too
  await page.goto('/team');
  await expect(page.locator('li[id^="member-"]').filter({ hasText: 'sam@sample.ukcw.test' }).locator('summary')).toContainText('Operations');
  await expect(page.locator('li[id^="member-"]').filter({ hasText: 'maya@sample.ukcw.test' }).locator('summary')).toContainText('Marketing');
  await page.goto('/sponsors');
  await expect(page.locator('tr', { hasText: 'Nordic Timber' })).toContainText('Not set'); // no account manager yet
  await expect(page.locator('tr', { hasText: 'BuildRight Ltd' })).toContainText('Alex Byrne');
  await page.goto('/suppliers');
  await expect(page.getByText('Printworks UK (sample)')).toBeVisible();

  // A sample person can sign in with the password shown
  await login(page, 'sam@sample.ukcw.test', password);
  await expect(page).toHaveURL(/\/account\?first=1/);
});

test('removing the sample data takes the show, people and suppliers away again', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/admin/platform');
  const box = panel(page, 'Sample data');
  await expect(box).toContainText('is loaded with 32 lines');
  acceptNextDialog(page);
  await box.getByRole('button', { name: 'Remove sample data' }).click();
  await expect(okMessage(page, 'Sample data removed')).toBeVisible();
  await expect(box.getByRole('button', { name: 'Add sample data' })).toBeVisible();
  await page.goto('/shows');
  await expect(page.getByText(SHOW)).toHaveCount(0);
  await page.goto('/team');
  await expect(page.locator('li[id^="member-"]').filter({ hasText: 'sample.ukcw.test' })).toHaveCount(0);
  await page.goto('/suppliers');
  await expect(page.getByText('Printworks UK (sample)')).toHaveCount(0);
});
