import { expect, test, type Page } from '@playwright/test';
import { acceptNextDialog, itemId, loginAs, okMessage, panel } from './helpers';

// The sheet view: every line's spec, cost, supplier and status, grouped by section, in the team's six status words.
test.describe.configure({ mode: 'serial' });

const lines = (page: Page) => page.locator('table tbody tr[data-line]');
const line = (page: Page, code: string) => page.locator(`table tbody tr[data-line="${code}"]`);
// A section on Show setup › Sections (its name is in a text box, so match on the value)
const sectionItem = (page: Page, name: string) => page.locator('ol li').filter({ has: page.locator(`input[name=name][value="${name}"]`) });
const sectionHeader = (page: Page, name: string) => page.locator('table tbody tr').filter({ has: page.locator('th[scope=rowgroup]') }).filter({ hasText: name });

test('organiser signage opens on the sheet, with the status key and a total', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/schedule/os');
  await expect(page.getByRole('group', { name: 'View' }).getByRole('link', { name: 'Sheet' })).toHaveAttribute('aria-current', 'page');
  const key = page.getByRole('list', { name: 'Status key' });
  for (const w of ['Ready to artwork', 'Artworked', 'Approved', 'Sent', 'Printed', 'Installed']) await expect(key).toContainText(w);
  // Spec columns, like the spreadsheet
  for (const h of ['ID', 'Signage ID', 'Description', 'Status', 'Supplier', 'Material', 'Size (mm)', 'Sides', 'Bleed', 'Side A', 'Side B', 'Qty', 'Unit cost', 'Total']) {
    await expect(page.getByRole('columnheader', { name: h, exact: true })).toBeVisible();
  }
  // Nothing has a section yet, so everything sits under one header
  await expect(sectionHeader(page, 'No section')).toBeVisible();
  await expect(lines(page)).toHaveCount(3);
  const os1 = line(page, 'OS-001');
  await expect(os1).toContainText('6,000 × 2,000');
  await expect(os1).toContainText('DS');
  await expect(os1).toContainText('£450.00');
  await expect(os1).toContainText('£1,350.00'); // 3 × £450
  await expect(os1).toContainText('Installed');
  await expect(os1.getByRole('combobox', { name: 'Supplier for OS-001' })).toHaveValue(/[0-9a-f-]{36}/); // Signs Express
  await expect(page.locator('table tfoot')).toContainText('Total: 3 lines');
  await expect(page.locator('table tfoot')).toContainText('£1,470.00'); // OS-001 £1,350 + OS-002 £120; OS-004 has no cost yet

  // The workflow view is a click away and keeps the filters
  await page.getByRole('group', { name: 'View' }).getByRole('link', { name: 'Workflow' }).click();
  await expect(page).toHaveURL(/view=workflow/);
  await expect(page.getByRole('combobox', { name: 'Waiting on' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Next deadline' })).toBeVisible();
});

test('a line gets a section, signage ID, bleed and side B wording, and the sheet groups by section', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto(`/items/${itemId('os1')}/edit`);
  await page.locator('#section_id').selectOption('__new__');
  await page.getByLabel('New section name').fill('G4 Registration and cross over');
  await page.fill('#plan_code', 'REF01');
  await page.fill('#bleed_mm', '150');
  await page.fill('#wording_side2', 'Thank you for visiting');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/saved=1/);
  const details = panel(page, /^Details/);
  await expect(details).toContainText('G4 Registration and cross over');
  await expect(details).toContainText('REF01');
  await expect(details).toContainText('150 mm');
  await expect(details).toContainText('Thank you for visiting');

  // The new section appears in Show setup, and the sheet groups under it
  await page.goto('/settings/sections');
  await expect(page.getByRole('heading', { name: 'Sections (1)' })).toBeVisible();
  await expect(sectionItem(page, 'G4 Registration and cross over')).toContainText('1 line');
  await page.fill('#ns-name', 'G1 General');
  await page.getByRole('button', { name: 'Add section' }).click();
  await expect(okMessage(page, 'G1 General added.')).toBeVisible();
  await sectionItem(page, 'G1 General').getByRole('button', { name: 'Move up' }).click();
  await expect(page.locator('ol li').first().getByRole('textbox', { name: 'Name' })).toHaveValue('G1 General');

  await page.goto('/schedule/os');
  await expect(sectionHeader(page, 'G4 Registration and cross over')).toContainText('1 line');
  await expect(sectionHeader(page, 'G4 Registration and cross over')).toContainText('£1,350.00');
  await expect(sectionHeader(page, 'No section')).toContainText('2 lines');
  await expect(line(page, 'OS-001')).toContainText('REF01');
  await expect(line(page, 'OS-001')).toContainText('150 mm');
  await expect(line(page, 'OS-001')).toContainText('Thank you for visiting');
  // Filter to one section
  await page.getByLabel('Section', { exact: true }).selectOption({ label: 'G4 Registration and cross over' });
  await expect(lines(page)).toHaveCount(1);
  await expect(page.getByText('Showing 1 of 3.')).toBeVisible();
  await page.getByLabel('Section', { exact: true }).selectOption({ label: 'No section' });
  await expect(lines(page)).toHaveCount(2);
  await expect(line(page, 'OS-002')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('sheet.png'), fullPage: true });
});

test('supplier and status change from the row and save straight away', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/schedule/os');
  const os2 = line(page, 'OS-002');
  // OS-002 was rejected at Marketing: it counts as Artworked, says why it's held up, and can't be moved along yet
  await expect(os2).toContainText('Artworked');
  await expect(os2).toContainText('Rejected · Marketing');
  await expect(os2.getByRole('combobox', { name: 'Status for OS-002' })).toHaveCount(0);
  // but its supplier can be chosen
  await os2.getByRole('combobox', { name: 'Supplier for OS-002' }).selectOption({ label: 'Promo Direct' });
  await expect(os2.getByRole('status')).toContainText('Saved');
  await page.reload();
  await expect(line(page, 'OS-002').getByRole('combobox', { name: 'Supplier for OS-002' }).locator('option:checked')).toHaveText('Promo Direct');

  // OS-001 is installed: it can go back a step, and forward again
  const os1 = line(page, 'OS-001');
  const status = os1.getByRole('combobox', { name: 'Status for OS-001' });
  await expect(status.locator('option:checked')).toHaveText('Installed');
  await status.selectOption({ label: 'Printed' });
  await expect(os1.getByRole('status')).toContainText('Saved');
  await expect(line(page, 'OS-001')).toHaveClass(/bg-green-50/);
  await line(page, 'OS-001').getByRole('combobox', { name: 'Status for OS-001' }).selectOption({ label: 'Installed' });
  await expect(line(page, 'OS-001').getByRole('status')).toContainText('Saved');
  await expect(line(page, 'OS-001')).toHaveClass(/bg-blue-50/);
  await page.goto(`/items/${itemId('os1')}`);
  await expect(panel(page, 'Comments and history')).toContainText('Production status: Printed');
  await page.goto(`/items/${itemId('os2')}`);
  await expect(panel(page, 'Comments and history')).toContainText('Supplier: Promo Direct');

  // Users see the sheet but can't change it
  await loginAs(page, 'vic');
  await page.goto('/schedule/os');
  await expect(lines(page)).toHaveCount(3);
  await expect(page.getByRole('combobox', { name: /^Supplier for/ })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: /^Status for/ })).toHaveCount(0);
  await expect(line(page, 'OS-002')).toContainText('Promo Direct');
});

test('the sheet’s six words filter every tab, and a removed section leaves its lines in place', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/schedule/all?view=sheet');
  const statusFilter = page.getByRole('combobox', { name: 'Status', exact: true });
  await statusFilter.selectOption({ label: 'Installed' });
  await expect(page).toHaveURL(/status=sheet%3Ainstalled/);
  await expect(line(page, 'OS-001')).toBeVisible();
  for (const row of await lines(page).all()) await expect(row).toContainText('Installed');
  await statusFilter.selectOption({ label: 'Artworked' });
  await expect(lines(page).first()).toBeVisible();
  for (const row of await lines(page).all()) await expect(row).toContainText('Artworked');

  await page.goto('/settings/sections');
  acceptNextDialog(page);
  await sectionItem(page, 'G4 Registration and cross over').getByRole('button', { name: 'Remove' }).click();
  await expect(sectionItem(page, 'G4 Registration and cross over')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Sections (1)' })).toBeVisible();
  await expect(page.getByText(/^\d+ lines have no section\./)).toBeVisible();
  await page.goto('/schedule/os');
  await expect(sectionHeader(page, 'No section')).toContainText('3 lines');
  await expect(line(page, 'OS-001')).toContainText('REF01'); // the line itself is untouched
});
