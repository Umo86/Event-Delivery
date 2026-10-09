import { expect, test, type Page } from '@playwright/test';
import {
  errorMessage, expectStatus, fillSignage, idFromUrl, itemId, loginAs, makePng, okMessage, parseCsv, saveItem, uploadArtwork, waitingOn,
} from './helpers';

test.describe.configure({ mode: 'serial' });

async function fillLine(page: Page, f: Record<string, string>) {
  for (const [id, value] of Object.entries(f)) {
    const el = page.locator(`#${id}`);
    const tag = await el.evaluate((e) => e.tagName);
    if (tag === 'SELECT') await el.selectOption({ label: value });
    else await el.fill(value);
  }
}

test('a member adds an organiser sign with full details, one step at a time', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/schedule/os');
  await expect(page.getByText('No organiser signage yet')).toBeVisible();
  await page.getByRole('link', { name: 'Add the first signage' }).click();
  await expect(page).toHaveURL(/\/signage\/new\?type=os$/);
  await expect(page.getByRole('heading', { name: 'Add signage', level: 1 })).toBeVisible();
  // It asks which list first, with organiser signage already chosen from the tab we came from
  await expect(page.getByText('Step 1 of 7: Which list')).toBeVisible();
  await expect(page.locator('input[name=category][value=organiser_signage]')).toBeChecked();
  await page.screenshot({ path: test.info().outputPath('add-signage-step1.png'), fullPage: true });

  await fillSignage(page, 'os', {
    description: 'Hall S1 entrance banner',
    item_type: 'Hall entrance banner',
    qty: '2',
    hall: 'S1',
    zone: 'Hall entrance',
    location_detail: 'Rigging point R12',
    position: 'Hanging (rigged)',
    width_mm: '6000',
    height_mm: '2000',
    sides: 'Double-sided',
    wording: 'Welcome to UK Construction Week\nHall S1',
    wording_side2: 'See you next year',
    material: 'PVC banner',
    artwork_link: 'https://example.sharepoint.com/ukcw/os-001',
    supplier_id: 'Signs Express',
    unit_cost: 'four hundred',
  }, async (title) => {
    if (title === 'Size and print') await page.screenshot({ path: test.info().outputPath('add-signage-print.png'), fullPage: true });
  });
  // The last step sums it up before anything is saved
  const check = page.locator('li[aria-current="step"]');
  await expect(check).toContainText('Hall S1 entrance banner · Hall entrance banner · ×2');
  await expect(check).toContainText('6,000 × 2,000 mm, double-sided, PVC banner');
  await expect(check).toContainText('Media10 Studio, due 30 Mar 2027 (show default)');
  await expect(check).toContainText('Side A: Welcome to UK Construction Week');
  await expect(check).toContainText('Side B: See you next year');
  await page.screenshot({ path: test.info().outputPath('add-signage-check.png'), fullPage: true });
  await page.getByRole('button', { name: 'Add signage' }).click();
  await expect(errorMessage(page, 'Unit cost must be a positive number.')).toBeVisible();
  // Nothing typed is lost after a mistake: go back to that step and fix it
  await page.getByRole('button', { name: 'Change production and cost' }).click();
  await expect(page.locator('#unit_cost')).toHaveValue('four hundred');
  await page.fill('#unit_cost', '450');
  await page.getByRole('button', { name: 'Next: check and add' }).click();
  await expect(page.locator('li[aria-current="step"]')).toContainText('£450.00 each');
  await page.getByRole('button', { name: 'Add signage' }).click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}\?created=1/);
  saveItem('os1', idFromUrl(page));
  await expect(page.getByText('Line OS-001 added.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hall S1 entrance banner');
  await expectStatus(page, 'Ready to artwork');
  await expect(waitingOn(page)).toContainText('Pete Production');
  await expect(page.getByText('Create the artwork', { exact: true })).toBeVisible();

  const details = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Details' }) });
  await expect(details).toContainText('6,000 × 2,000 mm');
  await expect(details).toContainText('Double-sided');
  await expect(details).toContainText('See you next year');
  await expect(details).toContainText('Signs Express');
  await expect(details).toContainText('£900.00'); // 2 × £450
  await expect(details).toContainText('30 Mar 2027 (show default)');
  await expect(page.getByRole('link', { name: 'Full-size files' })).toHaveAttribute('href', 'https://example.sharepoint.com/ukcw/os-001');
});

test('editing a line records what changed', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto(`/items/${itemId('os1')}`);
  await page.getByRole('link', { name: 'Edit' }).first().click();
  await expect(page.locator('#qty')).toHaveValue('2');
  await page.fill('#qty', '3');
  await page.fill('#notes', 'Check rigging load with venue');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  const details = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Details' }) });
  await expect(details).toContainText('£1,350.00');
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: 'Comments and history' }) }))
    .toContainText('Edited quantity, notes');
});

test('the old add-line address goes to the one form, and artwork starts sign-off', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/schedule/os/new');
  await expect(page).toHaveURL(/\/signage\/new\?type=os$/);
  await fillSignage(page, 'os', {
    description: 'Registration directional totem',
    item_type: 'Freestanding totem',
    wording: '=1+2 (arrows to registration)',
    hall: 'Boulevard',
    unit_cost: '120',
  });
  await page.getByRole('button', { name: 'Add signage' }).click();
  await expect(page.getByText('Line OS-002 added.')).toBeVisible();
  saveItem('os2', idFromUrl(page));
  await expectStatus(page, 'Ready to artwork');
  await uploadArtwork(page, { name: 'totem.png', mimeType: 'image/png', buffer: makePng(300, 900) });
  await expectStatus(page, 'Artworked · with Operations');
  await expect(waitingOn(page)).toContainText('Olivia Ops');
});

test('sponsor lines are linked to the sponsor and their account manager', async ({ page }) => {
  await loginAs(page, 'amy');
  await page.goto('/sponsors');
  await page.getByRole('link', { name: 'Acme Steel' }).click();
  await expect(page.getByRole('heading', { name: 'Acme Steel' })).toBeVisible();
  await expect(page.getByText('Account manager: Amy Account.')).toBeVisible();
  await page.getByRole('link', { name: 'Add sponsor signage' }).click();
  // From a sponsor's page, sponsor signage for that sponsor is already chosen
  await expect(page.locator('input[name=category][value=sponsor_signage]')).toBeChecked();
  await expect(page.locator('#sponsor_id option:checked')).toHaveText('Acme Steel');
  await fillSignage(page, 'ss', { description: 'Acme Steel feature area banner', hall: 'S3', zone: 'Feature area', width_mm: '3000', height_mm: '1000', qty: '1', unit_cost: '300' });
  // Sponsor signage defaults to the sponsor supplying the artwork
  await expect(page.locator('li[aria-current="step"]')).toContainText('Sponsor, due');
  await page.getByRole('button', { name: 'Add signage' }).click();
  await expect(page.getByText('Line SS-001 added.')).toBeVisible();
  saveItem('ss1', idFromUrl(page));
  await expectStatus(page, 'Ready to artwork');
  await expect(waitingOn(page)).toContainText('Amy Account');
  await expect(page.getByText('Chase artwork from Acme Steel', { exact: true })).toBeVisible();

  // A sponsorship item already sold to a sponsor with no account manager, with an artwork date already past
  await page.goto('/schedule/si/new');
  await expect(page.getByRole('heading', { name: 'Add a sponsorship item', level: 1 })).toBeVisible();
  await fillLine(page, { description: 'BuildCo branded lanyards', sponsor_id: 'BuildCo', item_type: 'Lanyards', qty: '5000', unit_cost: '0.85', artwork_due: '2026-09-01' });
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByText('Line SI-001 added, sold to BuildCo.')).toBeVisible();
  saveItem('si1', idFromUrl(page));
  await expect(waitingOn(page)).toContainText('Account manager not set');
  await expect(page.locator('main header').getByText('Overdue', { exact: true })).toBeVisible();
});

test('the schedule lists, filters, searches and exports lines', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/schedule/os?view=workflow'); // the workflow view: waiting on, deadlines and flags
  await expect(page.getByRole('heading', { name: 'Organiser signage' })).toBeVisible();
  const rows = page.locator('table tbody tr[data-line]');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('OS-001');
  await expect(rows.nth(1)).toContainText('OS-002');

  await page.getByPlaceholder('Search ID, description, location…').fill('totem');
  await expect(page).toHaveURL(/q=totem/);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Registration directional totem');
  await expect(page.getByText('Showing 1 of 2.')).toBeVisible();

  // Export uses the same filters
  const csv = parseCsv(await (await page.request.get('/api/export/os?q=totem')).text());
  expect(csv).toHaveLength(2);
  expect(csv[0].slice(0, 7)).toEqual(['ID', 'Signage ID', 'Section', 'List', 'Description', 'Status', 'Sheet status']);
  expect(csv[0]).toContain('Operations sign-off');
  const rec = Object.fromEntries(csv[0].map((h, i) => [h, csv[1][i]]));
  expect(rec.ID).toBe('OS-002');
  expect(rec.Status).toBe('Artworked · with Operations');
  expect(rec['Sheet status']).toBe('Artworked');
  expect(rec['Waiting on']).toBe('Olivia Ops');
  expect(rec['Side A']).toBe("'=1+2 (arrows to registration)"); // spreadsheet formulas are neutralised

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(rows).toHaveCount(2);
  await page.getByLabel('Status').selectOption({ label: 'Artworked – in sign-off' });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('OS-002');
  await page.getByLabel('Status').selectOption({ label: 'All statuses' });
  await page.getByLabel('Waiting on').selectOption({ label: 'Waiting on me' });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('OS-001');
  await page.getByLabel('Waiting on').selectOption({ label: 'Waiting on anyone' });
  await page.getByLabel('Hall').selectOption('S1');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('OS-001');
  await page.getByRole('button', { name: 'Clear filters' }).click();

  const full = await page.request.get('/api/export/all');
  expect(full.headers()['content-type']).toContain('text/csv');
  expect(full.headers()['content-disposition']).toMatch(/attachment; filename="UKCW-London-2027-all-\d{4}-\d{2}-\d{2}\.csv"/);
  const all = parseCsv(await full.text());
  expect(all.map((r) => r[0])).toEqual(['ID', 'OS-001', 'OS-002', 'SS-001', 'SI-001']);
  const os1 = Object.fromEntries(all[0].map((h, i) => [h, all[1][i]]));
  expect(os1['Side A']).toBe('Welcome to UK Construction Week\r\nHall S1'); // line breaks survive inside quotes
  expect(os1['Total cost']).toBe('1350');
  expect(os1.Supplier).toBe('Signs Express');

  await page.getByRole('link', { name: 'All signage', exact: true }).click();
  await expect(rows).toHaveCount(4);
  // Flags belong to the workflow view
  await expect(page.getByLabel('Flag')).toHaveCount(0);
  await page.getByRole('group', { name: 'View' }).getByRole('link', { name: 'Workflow' }).click();
  await page.getByLabel('Flag').selectOption({ label: 'Overdue or not signed off' });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('SI-001');
  // Back on the sheet, the flag filter is dropped, since the sheet has no control for it
  await page.getByRole('group', { name: 'View' }).getByRole('link', { name: 'Sheet' }).click();
  await expect(page).toHaveURL(/view=sheet/);
  await expect(page).not.toHaveURL(/flag=/);
  await expect(rows).toHaveCount(4);
});

test('the form checks sponsor signage has a sponsor', async ({ page }) => {
  await loginAs(page, 'amy');
  await page.goto('/signage/new?type=ss');
  // The browser won't move on without a sponsor
  await page.getByRole('button', { name: 'Next: what it is' }).click();
  await expect(page.getByText('Step 1 of 7: Which list')).toBeVisible();
  expect(await page.locator('#sponsor_id').evaluate((e) => (e as HTMLSelectElement).validity.valueMissing)).toBe(true);
  // Bypass that check to make sure the server refuses it too
  await page.locator('#sponsor_id').evaluate((e) => e.removeAttribute('required'));
  await fillSignage(page, 'ss', { description: 'Banner with no sponsor' });
  await page.getByRole('button', { name: 'Add signage' }).click();
  await expect(errorMessage(page, 'Choose the sponsor for this line.')).toBeVisible();
  await expect(page).toHaveURL(/\/signage\/new/);
  await expect(okMessage(page, /./)).toHaveCount(0);
});
