import { expect, test, type Page } from '@playwright/test';
import { errorMessage, expectStatus, idFromUrl, itemId, loginAs, okMessage, parseCsv, saveItem, waitingOn } from './helpers';

test.describe.configure({ mode: 'serial' });

async function fillLine(page: Page, f: Record<string, string>) {
  for (const [id, value] of Object.entries(f)) {
    const el = page.locator(`#${id}`);
    const tag = await el.evaluate((e) => e.tagName);
    if (tag === 'SELECT') await el.selectOption({ label: value });
    else await el.fill(value);
  }
}

test('a member adds an organiser sign with full details', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/schedule/os');
  await expect(page.getByText('No organiser signage yet')).toBeVisible();
  await page.getByRole('link', { name: 'Add the first line' }).click();
  await expect(page.getByRole('heading', { name: 'Add organiser signage' })).toBeVisible();
  await expect(page.locator('#artwork_by')).toHaveValue('in_house');

  await fillLine(page, {
    description: 'Hall S1 entrance banner',
    item_type: 'Hall entrance banner',
    material: 'PVC banner',
    wording: 'Welcome to UK Construction Week\nHall S1',
    hall: 'S1',
    zone: 'Hall entrance',
    location_detail: 'Rigging point R12',
    position: 'Hanging (rigged)',
    width_mm: '6000',
    height_mm: '2000',
    sides: 'Double-sided',
    qty: '2',
    artwork_link: 'https://example.sharepoint.com/ukcw/os-001',
    supplier_id: 'Signs Express',
    unit_cost: 'four hundred',
  });
  await page.getByRole('button', { name: 'Add line' }).click();
  await expect(errorMessage(page, 'Unit cost must be a positive number.')).toBeVisible();
  // Nothing typed is lost after a mistake
  await expect(page.locator('#description')).toHaveValue('Hall S1 entrance banner');
  await expect(page.locator('#wording')).toHaveValue('Welcome to UK Construction Week\nHall S1');

  await page.fill('#unit_cost', '450');
  await page.getByRole('button', { name: 'Add line' }).click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}\?created=1/);
  saveItem('os1', idFromUrl(page));
  await expect(page.getByText('Line OS-001 added.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hall S1 entrance banner');
  await expectStatus(page, 'Awaiting artwork');
  await expect(waitingOn(page)).toContainText('Pete Production');
  await expect(page.getByText('Create the artwork', { exact: true })).toBeVisible();

  const details = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Details' }) });
  await expect(details).toContainText('6,000 × 2,000 mm');
  await expect(details).toContainText('Double-sided');
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

test('a line with no artwork needed goes straight to sign-off', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/schedule/os/new');
  await fillLine(page, {
    description: 'Registration directional totem',
    item_type: 'Freestanding totem',
    wording: '=1+2 (arrows to registration)',
    hall: 'Boulevard',
    artwork_by: 'Not required',
    unit_cost: '120',
  });
  await page.getByRole('button', { name: 'Add line' }).click();
  await expect(page.getByText('Line OS-002 added.')).toBeVisible();
  saveItem('os2', idFromUrl(page));
  await expectStatus(page, 'With Operations');
  await expect(waitingOn(page)).toContainText('Olivia Ops');
  await expect(page.getByText('Artwork isn’t needed for this line, so sign-off has started.')).toBeVisible();
});

test('sponsor lines are linked to the sponsor and their account manager', async ({ page }) => {
  await loginAs(page, 'amy');
  await page.goto('/sponsors');
  await page.getByRole('link', { name: 'Acme Steel' }).click();
  await expect(page.getByRole('heading', { name: 'Acme Steel' })).toBeVisible();
  await expect(page.getByText('Account manager: Amy Account.')).toBeVisible();
  await page.getByRole('link', { name: 'Add sponsor signage' }).click();
  await expect(page.locator('#sponsor_id option:checked')).toHaveText('Acme Steel');
  await expect(page.locator('#artwork_by')).toHaveValue('sponsor');
  await fillLine(page, { description: 'Acme Steel feature area banner', hall: 'S3', zone: 'Feature area', width_mm: '3000', height_mm: '1000', qty: '1', unit_cost: '300' });
  await page.getByRole('button', { name: 'Add line' }).click();
  await expect(page.getByText('Line SS-001 added.')).toBeVisible();
  saveItem('ss1', idFromUrl(page));
  await expectStatus(page, 'Awaiting artwork');
  await expect(waitingOn(page)).toContainText('Amy Account');
  await expect(page.getByText('Chase artwork from Acme Steel', { exact: true })).toBeVisible();

  // A sponsor item for a sponsor with no account manager, with an artwork date already past
  await page.goto('/schedule/si/new');
  await fillLine(page, { description: 'BuildCo branded lanyards', sponsor_id: 'BuildCo', item_type: 'Lanyards', qty: '5000', unit_cost: '0.85', artwork_due: '2026-09-01' });
  await page.getByRole('button', { name: 'Add line' }).click();
  await expect(page.getByText('Line SI-001 added.')).toBeVisible();
  saveItem('si1', idFromUrl(page));
  await expect(waitingOn(page)).toContainText('Account manager not set');
  await expect(page.locator('main header').getByText('Overdue', { exact: true })).toBeVisible();
});

test('the schedule lists, filters, searches and exports lines', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/schedule/os');
  await expect(page.getByRole('heading', { name: 'Organiser signage' })).toBeVisible();
  const rows = page.locator('table tbody tr');
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
  expect(csv[0].slice(0, 5)).toEqual(['ID', 'List', 'Description', 'Status', 'Waiting on']);
  expect(csv[0]).toContain('Operations sign-off');
  const rec = Object.fromEntries(csv[0].map((h, i) => [h, csv[1][i]]));
  expect(rec.ID).toBe('OS-002');
  expect(rec.Status).toBe('With Operations');
  expect(rec['Waiting on']).toBe('Olivia Ops');
  expect(rec.Wording).toBe("'=1+2 (arrows to registration)"); // spreadsheet formulas are neutralised

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(rows).toHaveCount(2);
  await page.getByLabel('Status').selectOption({ label: 'In sign-off' });
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
  expect(os1.Wording).toBe('Welcome to UK Construction Week\r\nHall S1'); // line breaks survive inside quotes
  expect(os1['Total cost']).toBe('1350');
  expect(os1.Supplier).toBe('Signs Express');

  await page.getByRole('link', { name: 'All lines', exact: true }).click();
  await expect(rows).toHaveCount(4);
  await page.getByLabel('Flag').selectOption({ label: 'Overdue or not signed off' });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('SI-001');
});

test('the line form checks sponsor lines have a sponsor', async ({ page }) => {
  await loginAs(page, 'amy');
  await page.goto('/schedule/ss/new');
  await page.fill('#description', 'Banner with no sponsor');
  // Bypass the browser's own check to make sure the server refuses it too
  await page.locator('#sponsor_id').evaluate((e) => e.removeAttribute('required'));
  await page.getByRole('button', { name: 'Add line' }).click();
  await expect(errorMessage(page, 'Choose the sponsor for this line.')).toBeVisible();
  await expect(page).toHaveURL(/\/schedule\/ss\/new/);
  await expect(okMessage(page, /./)).toHaveCount(0);
});
