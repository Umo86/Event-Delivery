import { expect, test, type Page } from '@playwright/test';
import { acceptNextDialog, asUser, loginAs } from './helpers';

test.describe.configure({ mode: 'serial' });

const column = (page: Page, status: 'to_do' | 'in_progress' | 'complete') => page.locator(`section[data-column="${status}"]`);
const card = (page: Page, name: string | RegExp) => page.getByRole('article', { name });

async function addTask(page: Page, status: 'to_do' | 'in_progress' | 'complete', title: string, extra: { due?: string; notes?: string; line?: string } = {}) {
  const col = column(page, status);
  await col.getByRole('button', { name: /^Add a task to/ }).click();
  await col.getByLabel('Task', { exact: true }).fill(title);
  if (extra.due) await col.getByLabel('Due', { exact: true }).fill(extra.due);
  if (extra.notes) await col.getByLabel('Notes', { exact: true }).fill(extra.notes);
  if (extra.line) await col.getByLabel('Line', { exact: true }).selectOption({ label: extra.line });
  await col.getByRole('button', { name: 'Add task' }).click();
  await expect(col.getByRole('article', { name: title })).toBeVisible();
}

test('my actions: add tasks to each column, move them with the arrows and by dragging, edit and delete', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/inbox');
  const todo = column(page, 'to_do');
  const doing = column(page, 'in_progress');
  const done = column(page, 'complete');
  await expect(todo.getByRole('article')).toHaveCount(3); // the three lines waiting on Pete

  // A task in To do, with a due date, notes and a link to a line
  await addTask(page, 'to_do', 'Order cable ties', { due: '2026-09-01', notes: 'Black, 300mm, two boxes', line: 'OS-001 Hall S1 entrance banner' });
  const ties = card(page, 'Order cable ties');
  await expect(ties).toContainText('Black, 300mm, two boxes');
  await expect(ties).toContainText('Due 1 Sep 26');
  await expect(ties.getByRole('link', { name: /OS-001/ })).toBeVisible();
  await expect(todo.getByRole('heading', { name: /To do/ })).toContainText('(4)');
  await expect(page.getByRole('link', { name: 'My board (4)' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: /My actions/ })).toContainText('4');
  // Lines come first, then the person's own tasks
  await expect(todo.getByRole('article').last()).toHaveAccessibleName('Order cable ties');

  // Tasks can be added straight into In progress and Complete
  await addTask(page, 'in_progress', 'Chase Signs Express for the revised quote');
  await addTask(page, 'complete', 'Book the van for build day');
  await expect(card(page, 'Book the van for build day')).toContainText('Done');
  await expect(page.getByRole('link', { name: 'My board (5)' })).toBeVisible(); // finished tasks don't count

  // Move with the arrows: To do -> In progress -> Complete, then reopen
  await ties.getByRole('button', { name: 'Move to In progress' }).click();
  await expect(doing.getByRole('article', { name: 'Order cable ties' })).toBeVisible();
  await doing.getByRole('article', { name: 'Order cable ties' }).getByRole('button', { name: 'Move to Complete' }).click();
  await expect(done.getByRole('article', { name: 'Order cable ties' })).toBeVisible();
  await expect(done.getByRole('article', { name: 'Order cable ties' })).toContainText('Done');
  await page.reload();
  await expect(done.getByRole('article', { name: 'Order cable ties' })).toBeVisible(); // it stuck
  await done.getByRole('article', { name: 'Order cable ties' }).getByRole('button', { name: 'Reopen' }).click();
  await expect(todo.getByRole('article', { name: 'Order cable ties' })).toBeVisible();

  // Mark complete in one click from To do
  await todo.getByRole('article', { name: 'Order cable ties' }).getByRole('button', { name: 'Mark complete' }).click();
  await expect(done.getByRole('article', { name: 'Order cable ties' })).toBeVisible();

  // Drag a card between columns
  await card(page, 'Chase Signs Express for the revised quote').dragTo(todo);
  await expect(todo.getByRole('article', { name: 'Chase Signs Express for the revised quote' })).toBeVisible();
  await page.reload();
  await expect(todo.getByRole('article', { name: 'Chase Signs Express for the revised quote' })).toBeVisible();

  // Edit a task
  const chase = todo.getByRole('article', { name: 'Chase Signs Express for the revised quote' });
  await chase.getByRole('button', { name: 'Edit task' }).click();
  await chase.getByLabel('Task', { exact: true }).fill('Chase Signs Express for the quote');
  await chase.getByLabel('Due', { exact: true }).fill('2099-01-01');
  await chase.getByRole('button', { name: 'Save' }).click();
  await expect(todo.getByRole('article', { name: 'Chase Signs Express for the quote' })).toContainText('Due 1 Jan 99');
  await expect(todo.getByRole('article', { name: 'Chase Signs Express for the revised quote' })).toHaveCount(0);

  // A blank title is refused
  await todo.getByRole('button', { name: 'Add a task to To do' }).click();
  await todo.getByLabel('Task', { exact: true }).fill('   ');
  await todo.getByLabel('Task', { exact: true }).evaluate((el) => (el as HTMLInputElement).removeAttribute('required'));
  await todo.getByRole('button', { name: 'Add task' }).click();
  await expect(todo.getByRole('alert')).toContainText('Task is required.');
  await todo.getByRole('button', { name: 'Cancel' }).click();

  await page.screenshot({ path: test.info().outputPath('board.png'), fullPage: true });

  // Delete a task
  acceptNextDialog(page);
  await todo.getByRole('article', { name: 'Chase Signs Express for the quote' }).getByRole('button', { name: 'Delete task' }).click();
  await expect(card(page, 'Chase Signs Express for the quote')).toHaveCount(0);
  await page.reload();
  await expect(card(page, 'Chase Signs Express for the quote')).toHaveCount(0);
});

test('my actions: lines move to In progress and come back, but are completed by doing the work', async ({ page, browser }) => {
  await loginAs(page, 'pete');
  await page.goto('/inbox');
  const todo = column(page, 'to_do');
  const doing = column(page, 'in_progress');
  const banner = page.getByRole('article', { name: /Acme Steel feature area banner/ });
  await expect(todo.getByRole('article', { name: /Acme Steel feature area banner/ })).toBeVisible();
  await banner.getByRole('button', { name: 'Move to In progress' }).click();
  await expect(doing.getByRole('article', { name: /Acme Steel feature area banner/ })).toBeVisible();
  await expect(doing.getByRole('article', { name: /Acme Steel feature area banner/ })).toContainText('Send to supplier / place order');
  await page.reload();
  const started = doing.getByRole('article', { name: /Acme Steel feature area banner/ });
  await expect(started).toBeVisible();
  await expect(started.getByRole('button', { name: 'Move to Complete' })).toHaveCount(0);
  await expect(started.getByRole('button', { name: 'Mark complete' })).toHaveCount(0);
  await expect(page.getByText('3 lines waiting on you and 0 open tasks')).toBeVisible(); // still waiting on Pete
  await expect(started.getByRole('link', { name: 'Open line' })).toHaveAttribute('href', /\/items\/[0-9a-f-]{36}$/);

  // Dropping a line on Complete is refused with an explanation
  await started.dragTo(column(page, 'complete'));
  await expect(page.getByText('SS-001 is completed by doing the work on its line page: it moves to Complete by itself.')).toBeVisible();
  await expect(started.getByRole('button', { name: 'Clear from board' })).toHaveCount(0); // only once it stops waiting on Pete
  await expect(doing.getByRole('article', { name: /Acme Steel feature area banner/ })).toBeVisible();

  await started.getByRole('button', { name: 'Move to To do' }).click();
  await expect(todo.getByRole('article', { name: /Acme Steel feature area banner/ })).toBeVisible();

  // Boards are personal: Olivia doesn't see Pete's tasks
  const olivia = await asUser(browser, 'olivia');
  await olivia.page.goto('/inbox');
  await expect(olivia.page.getByRole('article', { name: 'Order cable ties' })).toHaveCount(0);
  await expect(olivia.page.getByRole('article', { name: 'Book the van for build day' })).toHaveCount(0);
  await olivia.ctx.close();

  // Clear the Complete column
  const done = column(page, 'complete');
  await expect(done.getByRole('article')).toHaveCount(2);
  acceptNextDialog(page);
  await done.getByRole('button', { name: 'Clear all' }).click();
  await expect(done.getByRole('article')).toHaveCount(0);
  await expect(done).toContainText('Finished tasks and lines you’ve dealt with end up here.');
  await page.reload();
  await expect(done.getByRole('article')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'My board (3)' })).toBeVisible();
});
