import { expect, test, type Page } from '@playwright/test';
import { acceptNextDialog, loginAs, okMessage } from './helpers';

// Setting up a show after it's created: one step at a time, each saving as it goes and moving on to what's left.
test.describe.configure({ mode: 'serial' });

const SHOW = 'UKCW Guide Test 2029';
const open = (page: Page) => page.locator('li[aria-current="step"]');
const progress = (page: Page, text: string) => expect(page.getByText(text, { exact: true })).toBeVisible();

test('a show started from scratch is set up step by step', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/shows/new');
  await page.fill('#ne-name', SHOW);
  await page.selectOption('#ne-venue', 'ExCeL London');
  await page.getByRole('button', { name: 'Next: build-up' }).click();
  for (const [field, date, next] of [
    ['build', '2029-05-05', 'Next: opening day'], ['open', '2029-05-08', 'Next: closing day'],
    ['close', '2029-05-10', 'Next: breakdown'], ['breakdown', '2029-05-11', 'Next: copy from a past show'],
  ] as const) {
    await page.fill(`#ne-${field}`, date);
    await page.getByRole('button', { name: next }).click();
  }
  await page.locator('#ne-copy').selectOption({ label: 'Nothing: start with the standard stages' });
  await page.getByRole('button', { name: 'Next: check and create' }).click();
  await page.getByRole('button', { name: 'Create show' }).click();

  // Departments come from the standard stages and suppliers are shared, so it starts at the approvers
  await expect(page).toHaveURL(/\/shows\/setup\?created=1/);
  await expect(page.getByRole('heading', { name: `Set up ${SHOW}`, level: 1 })).toBeVisible();
  await expect(page.getByText(`${SHOW} is created. 3 things are left to set up. Each step saves as you go.`)).toBeVisible();
  await progress(page, 'Step 2 of 6: Who signs off');
  await expect(page.locator('li').filter({ has: page.getByRole('heading', { name: 'Who’s working on it' }) })).toContainText('Operations and Marketing');

  // Approvers for two of the three stages: it saves, says what's missing, and moves on
  await open(page).getByRole('group', { name: /^Operations/ }).getByRole('checkbox', { name: /^Olivia Ops/ }).check();
  await open(page).getByRole('group', { name: /^Marketing/ }).getByRole('checkbox', { name: /^Mark Marketing/ }).check();
  await expect(open(page)).toContainText('Sponsor: each sponsor’s account manager signs this stage off.');
  await open(page).getByRole('button', { name: 'Save and continue' }).click();
  await expect(okMessage(page, 'Saved. Final sign-off still has no approver.')).toBeVisible();
  await progress(page, 'Step 3 of 6: Artwork and production');
  await expect(page.locator('li').filter({ has: page.getByRole('heading', { name: 'Who signs off' }) }))
    .toContainText('Final sign-off has no approver yet');

  // Owners
  await page.selectOption('#gs-studio', { label: 'Mark Marketing' });
  await page.selectOption('#gs-production', { label: 'Pete Production' });
  await open(page).getByRole('button', { name: 'Save and continue' }).click();
  await progress(page, 'Step 4 of 6: Sponsors');
  await expect(page.locator('li').filter({ has: page.getByRole('heading', { name: 'Artwork and production' }) }))
    .toContainText('Artwork: Mark Marketing. Production: Pete Production.');

  // Sponsors: add one, then carry on (suppliers are already there, so it goes to the end)
  await expect(open(page).getByRole('button', { name: 'Skip for now' })).toBeVisible();
  await page.fill('#gs-sponsor', 'Guide Sponsor Ltd');
  await page.fill('#gs-package', 'Gold');
  await open(page).getByRole('button', { name: 'Add sponsor' }).click();
  await expect(okMessage(open(page), 'Guide Sponsor Ltd added.')).toBeVisible();
  await expect(open(page).getByRole('list', { name: 'Sponsors so far' })).toContainText('Guide Sponsor Ltd, Gold');
  await open(page).getByRole('button', { name: 'Continue' }).click();

  // The end lists what's left, and goes straight back to it
  await progress(page, 'Step 6 of 6: Ready to go');
  await expect(open(page).locator('li', { hasText: 'Who signs off:' })).toContainText('Final sign-off has no approver yet.');
  await open(page).getByRole('button', { name: 'Do it now' }).click();
  await progress(page, 'Step 2 of 6: Who signs off');
  await open(page).getByRole('group', { name: /^Final sign-off/ }).getByRole('checkbox', { name: /^Pete Production/ }).check();
  await open(page).getByRole('button', { name: 'Save and continue' }).click();
  await progress(page, 'Step 6 of 6: Ready to go');
  await expect(open(page)).toContainText(`${SHOW} is ready for signage.`);
  await expect(page.getByText('5 of 5 done.', { exact: false })).toBeVisible();
  await expect(open(page).getByRole('link', { name: 'Add signage' })).toHaveAttribute('href', '/signage/new');

  // Any step can be opened again; someone missing can be added from the first one
  await page.getByRole('button', { name: 'Change who’s working on it' }).click();
  await progress(page, 'Step 1 of 6: Who’s working on it');
  await open(page).getByRole('button', { name: 'Add someone to the team' }).click();
  await expect(page.locator('#inv-name')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('setup-guide.png'), fullPage: true });

  // The approvers really were saved on the show
  await page.goto('/settings/stages');
  await expect(page.locator('section').filter({ has: page.locator('h2', { hasText: /^\d+\s*Final sign-off$/ }) })
    .getByRole('checkbox', { name: /^Pete Production/ })).toBeChecked();
  // and Show setup has nothing left on its checklist
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Still to set up' })).toHaveCount(0);
});

test('a step can be opened straight from a link', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/shows/setup?step=sponsors');
  await progress(page, 'Step 4 of 6: Sponsors');
  // Tidy up: archive the test show so it doesn't get in the way
  await page.goto('/shows');
  acceptNextDialog(page);
  const row = page.locator('li').filter({ hasText: SHOW });
  await row.getByRole('button', { name: 'Archive' }).click();
  await expect(row.getByText('Archived', { exact: true })).toBeVisible();
});
