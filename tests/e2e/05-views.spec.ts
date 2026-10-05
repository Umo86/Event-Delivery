import { expect, test } from '@playwright/test';
import { acceptNextDialog, errorMessage, expectImagesLoaded, itemId, loginAs, okMessage, panel } from './helpers';

test.describe.configure({ mode: 'serial' });

test('my actions shows what is waiting on me, grouped by kind of work', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/inbox');
  await expect(page.getByText('3 things waiting on you in UKCW London 2027, most urgent first.')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Main' }).first();
  await expect(nav.getByRole('link', { name: /My actions/ })).toContainText('3');
  const artwork = page.locator('section').filter({ has: page.getByRole('heading', { name: /Artwork to create, chase or revise/ }) });
  await expect(artwork.getByRole('heading')).toContainText('(2)');
  await expect(artwork).toContainText('Upload new artwork (rejected by Marketing)');
  await expect(artwork).toContainText('Create the artwork');
  const production = page.locator('section').filter({ has: page.getByRole('heading', { name: /Production and delivery/ }) });
  await expect(production).toContainText('Acme Steel feature area banner');
  await expect(production).toContainText('Send to supplier / place order');

  await page.getByRole('link', { name: 'Whole team' }).click();
  await expect(page).toHaveURL(/view=team/);
  const unassigned = page.locator('details').filter({ hasText: 'Account manager not set' });
  await expect(unassigned).toHaveAttribute('open', '');
  await expect(unassigned).toContainText('Give the sponsor an account manager on the Sponsors page.');
  await expect(unassigned).toContainText('1 overdue');
  await expect(page.locator('details').filter({ hasText: 'Pete Production (you)' })).toContainText('3 lines');
});

test('the dashboard summarises progress, workload, cost and sponsors', async ({ page }) => {
  await loginAs(page, 'fiona');
  await page.goto('/dashboard');
  await expect(page.getByText('1 line is waiting on nobody because an approver, owner or account manager isn’t set.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Overdue or not signed off/ })).toContainText('1');
  await expect(page.getByRole('link', { name: /Approved or later/ })).toContainText('40%');
  await expect(page.getByRole('link', { name: /Approved or later/ })).toContainText('2 of 5 lines');

  const where = panel(page, 'Where everything is');
  await expect(where.getByRole('img').first()).toHaveAttribute('aria-label', 'Awaiting artwork 1, In sign-off 0, Needs attention 1, Approved or in production 0, Installed 1');
  await expect(where.getByRole('list', { name: 'Legend' })).toContainText('Installed 1');

  const stages = panel(page, 'Sign-off by stage');
  await expect(stages.locator('tr', { hasText: 'Operations' }).locator('td').last()).toHaveText('3');
  await expect(stages.locator('tr', { hasText: 'Marketing' }).locator('td').nth(5)).toHaveText('1'); // rejected

  const load = panel(page, 'Waiting on each person');
  await expect(load.locator('tr', { hasText: 'Pete Production' })).toContainText('3');
  await expect(load.locator('tr', { hasText: 'Account manager not set' })).toContainText('1 overdue');

  const cost = panel(page, /^Cost$/);
  await expect(cost).toContainText('£6,020');
  await expect(cost).toContainText('of £25,000 budget');
  await expect(cost.locator('tr', { hasText: 'Organiser signage' })).toContainText('£1,470');
  await expect(cost.locator('tr', { hasText: 'Sponsor items' })).toContainText('£4,250');
  await expect(cost.locator('tr', { hasText: 'Remaining' })).toContainText('£18,980');

  const sponsors = panel(page, 'Sponsors needing attention');
  await expect(sponsors.locator('tr').first()).toContainText('BuildCo');
  await expect(sponsors.locator('tr').first()).toContainText('1 overdue');
  await expect(sponsors.locator('tr', { hasText: 'Acme Steel' })).toContainText('1 of 1 approved');

  await expect(panel(page, 'Latest activity').locator('li').first()).toBeVisible();
  await page.getByRole('link', { name: /Overdue or not signed off/ }).click();
  await expect(page).toHaveURL(/\/schedule\/all\?flag=urgent/);
  await expect(page.locator('table tbody tr')).toHaveCount(1);
});

test('the proof sheet shows the artwork, spec and sign-off record', async ({ page }) => {
  await loginAs(page, 'mark');
  await page.goto(`/proof/${itemId('os1')}`);
  await expect(page.getByRole('heading', { name: 'Hall S1 entrance banner' })).toBeVisible();
  await expectImagesLoaded(page, 'img[alt="Artwork for OS-001"]');
  await expect(page.getByText('6,000 × 2,000 mm, double-sided')).toBeVisible();
  const signoff = page.locator('table');
  await expect(signoff.locator('tr')).toHaveCount(3); // the sponsor stage doesn't apply to organiser signage
  await expect(signoff.locator('tr', { hasText: 'Marketing' })).toContainText('Mark Marketing');
  for (const label of ['Name', 'Company', 'Signature', 'Date']) await expect(page.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Print/ })).toBeVisible();
  await page.getByRole('link', { name: 'Back to the line' }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${itemId('os1')}$`));
});

test('sponsor pages: details, account manager and removal rules', async ({ page }) => {
  await loginAs(page, 'amy');
  await page.goto('/sponsors');
  const acme = page.locator('tr', { hasText: 'Acme Steel' });
  await expect(acme).toContainText('Headline partner');
  await expect(acme).toContainText('1 of 1');
  const buildco = page.locator('tr', { hasText: 'BuildCo' });
  await expect(buildco).toContainText('Not set');
  await expect(buildco).toContainText('1 overdue');

  await buildco.getByRole('link', { name: 'BuildCo' }).click();
  await expect(page.getByText('No account manager set.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Their lines (1)' })).toBeVisible();
  // Members can edit sponsor details, but the account manager (who signs off for the sponsor) is chosen by an admin
  await expect(page.locator('[id$="-am"]')).toBeDisabled();
  await page.locator('[id$="-cname"]').fill('Ben Builder');
  await page.getByRole('button', { name: 'Save sponsor' }).click();
  await expect(okMessage(page, 'Saved.')).toBeVisible();
  await expect(page.getByText('No account manager set. Contact: Ben Builder.')).toBeVisible();
  // Only admins can remove sponsors
  await expect(page.getByRole('button', { name: 'Remove sponsor' })).toHaveCount(0);

  await loginAs(page, 'admin');
  await page.goto('/sponsors');
  await page.getByRole('link', { name: 'BuildCo' }).click();
  await expect(page).toHaveURL(/\/sponsors\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Sponsor details' })).toBeVisible();
  await page.locator('[id$="-am"]').selectOption({ label: 'Amy Account' });
  await page.getByRole('button', { name: 'Save sponsor' }).click();
  await expect(okMessage(page, 'Saved.')).toBeVisible();
  await expect(page.getByText('Account manager: Amy Account.')).toBeVisible();
  await expect(page.locator('table tbody tr').first()).toContainText('Amy Account');
  acceptNextDialog(page);
  await page.getByRole('button', { name: 'Remove sponsor' }).click();
  await expect(errorMessage(page, 'BuildCo still has 1 line. Move or delete them first.')).toBeVisible();

  await page.goto('/sponsors');
  await page.fill('#new-name', 'Temporary Sponsor Ltd');
  await page.getByRole('button', { name: 'Add sponsor' }).click();
  await expect(okMessage(page, 'Temporary Sponsor Ltd added.')).toBeVisible();
  await page.getByRole('link', { name: 'Temporary Sponsor Ltd' }).click();
  acceptNextDialog(page);
  await page.getByRole('button', { name: 'Remove sponsor' }).click();
  await expect(page).toHaveURL(/\/sponsors$/);
  await expect(page.getByRole('link', { name: 'Temporary Sponsor Ltd' })).toHaveCount(0);
});

test('my actions updates when a sponsor gets an account manager', async ({ page }) => {
  await loginAs(page, 'amy');
  await page.goto('/inbox');
  await expect(page.getByRole('link', { name: 'Waiting on me (1)' })).toBeVisible();
  await expect(page.locator('main')).toContainText('BuildCo branded lanyards');
  await expect(page.locator('main')).toContainText('Chase artwork from BuildCo');
});
