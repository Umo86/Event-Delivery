import { expect, test } from '@playwright/test';
import { acceptNextDialog, loginAs, okMessage, openPerson, panel } from './helpers';

test.describe.configure({ mode: 'serial' });

test('departments: the catalogue, people, and assigning to a show and stage', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/settings/departments');
  await expect(page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Departments' })).toBeVisible();
  for (const d of ['Operations', 'Sales', 'Marketing', 'Content', 'External']) {
    await expect(panel(page, new RegExp(`^${d} `))).toBeVisible(); // seeded defaults
  }

  // Add a custom department
  await page.fill('#nd-name', 'Design studio');
  await page.getByRole('button', { name: 'Add department' }).click();
  await expect(okMessage(page, 'Design studio added.')).toBeVisible();

  // Put someone in a department from the full people list
  const content = panel(page, /^Content /);
  await content.getByRole('checkbox', { name: 'Mark Marketing' }).check();
  await content.getByRole('button', { name: 'Save members' }).click();
  await expect(okMessage(content, 'Saved. Content has 1 person.')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('departments.png'), fullPage: true });

  // A person's departments show on their Admin row and can be changed there too
  await page.goto('/admin');
  const mark = await openPerson(page, 'mark@ukcw.test');
  await expect(mark.getByRole('checkbox', { name: 'Content', exact: true })).toBeChecked();
  await mark.getByRole('checkbox', { name: 'Design studio' }).check();
  await mark.getByRole('button', { name: 'Save departments' }).click();
  await expect(okMessage(mark, 'Saved.')).toBeVisible();

  // Assign departments to the current show
  await page.goto('/settings');
  const involved = panel(page, 'Departments involved');
  await involved.getByRole('checkbox', { name: 'Content', exact: true }).check();
  await involved.getByRole('button', { name: 'Save departments' }).click();
  await expect(okMessage(involved, 'Saved.')).toBeVisible();

  // A stage draws its approvers from a department
  await page.goto('/settings/stages');
  const marketing = panel(page, /^\d+\s*Marketing$/);
  await marketing.getByLabel('Department', { exact: true }).selectOption({ label: 'Content' });
  await marketing.getByRole('button', { name: 'Save stage' }).click();
  await expect(okMessage(marketing, 'Marketing saved.')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('stage-approvers.png') });

  // The overview lists the show's departments
  await page.goto('/shows');
  await expect(panel(page, 'Shows').locator('form').filter({ hasText: 'UKCW London 2027' })).toContainText('Content');

  // Archive the custom department — it leaves the active list and drops into Archived
  await page.goto('/settings/departments');
  acceptNextDialog(page);
  await panel(page, /^Design studio /).getByRole('button', { name: 'Archive' }).click();
  await expect(panel(page, 'Archived (1)')).toContainText('Design studio');
  await expect(panel(page, /^Design studio /)).toHaveCount(0);
});
