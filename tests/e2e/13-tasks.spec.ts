import { expect, test } from '@playwright/test';
import { acceptNextDialog, loginAs, makePdf, okMessage } from './helpers';

test.describe.configure({ mode: 'serial' });

test('the personal board: add a task, sub-tasks, a document, a deadline, and move it across columns', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/inbox');

  // Add a task with a deadline already in the past
  await page.fill('#nt-title', 'Order floor vinyl');
  await page.fill('#nt-deadline', '2020-01-01');
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(okMessage(page, 'Task added.')).toBeVisible();

  const todo = page.getByRole('region', { name: 'To do' });
  const card = todo.getByRole('article', { name: 'Order floor vinyl' });
  await expect(card).toBeVisible();
  await expect(card).toContainText(/\d+ days overdue/); // past deadline is flagged

  // Expand and add a sub-task
  await card.getByRole('button', { name: 'Expand' }).click();
  await card.getByPlaceholder('Add a sub-task').fill('Confirm dimensions');
  await card.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(card).toContainText('Confirm dimensions');
  await expect(card).toContainText('0/1');

  // Tick it off
  await card.getByRole('button', { name: 'Mark "Confirm dimensions" done' }).click();
  await expect(card).toContainText('1/1');

  // Attach a document
  await card.locator('input[type=file]').setInputFiles({ name: 'vinyl-spec.pdf', mimeType: 'application/pdf', buffer: makePdf('Vinyl spec') });
  await expect(card.getByRole('link', { name: /vinyl-spec\.pdf/ })).toBeVisible({ timeout: 30_000 });

  await page.screenshot({ path: test.info().outputPath('board.png'), fullPage: true });

  // Move it to In process, then Complete
  await card.getByRole('button', { name: 'In process' }).click();
  const inproc = page.getByRole('region', { name: 'In process' });
  await expect(inproc.getByRole('article', { name: 'Order floor vinyl' })).toBeVisible();

  const movedCard = inproc.getByRole('article', { name: 'Order floor vinyl' });
  await movedCard.getByRole('button', { name: 'Expand' }).click();
  await movedCard.getByRole('button', { name: 'Complete' }).click();
  const done = page.getByRole('region', { name: 'Complete' });
  await expect(done.getByRole('article', { name: 'Order floor vinyl' })).toBeVisible();

  // Delete it
  const doneCard = done.getByRole('article', { name: 'Order floor vinyl' });
  await doneCard.getByRole('button', { name: 'Expand' }).click();
  acceptNextDialog(page);
  await doneCard.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Order floor vinyl' })).toHaveCount(0);
});

test('each person has their own private board', async ({ page }) => {
  // The task admin created above isn't visible to anyone else, and vice-versa.
  await loginAs(page, 'admin');
  await page.goto('/inbox');
  await page.fill('#nt-title', 'Admin-only reminder');
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(okMessage(page, 'Task added.')).toBeVisible();

  await loginAs(page, 'pete');
  await page.goto('/inbox');
  await expect(page.getByRole('article', { name: 'Admin-only reminder' })).toHaveCount(0);
});
