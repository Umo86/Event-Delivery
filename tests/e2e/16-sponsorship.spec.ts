import { expect, test, type Page } from '@playwright/test';
import {
  acceptNextDialog, expectStatus, idFromUrl, itemId, loginAs, makePng, okMessage, panel, parseCsv, saveItem, uploadArtwork, waitingOn,
} from './helpers';

// Sponsorship items: things the show sells to sponsors. Set up by managers, sold by anyone except external people.
test.describe.configure({ mode: 'serial' });

const salePanel = (page: Page) => panel(page, /^Sale$/);
const details = (page: Page) => panel(page, /^Details/);

test('a manager sets up an item for sale, with its cost, rate card and how it’s handed out', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: /^Sponsorship items/ }).click();
  await expect(page.getByRole('heading', { name: 'Sponsorship items', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Add item' }).click();
  await expect(page.getByRole('heading', { name: 'Add a sponsorship item', level: 1 })).toBeVisible();
  // Signage-only fields aren't asked for
  await expect(page.locator('#width_mm')).toHaveCount(0);
  await expect(page.locator('#sides')).toHaveCount(0);
  await expect(page.locator('#sponsor_id option:checked')).toHaveText('For sale');

  await page.fill('#description', 'Visitor water bottles');
  await page.fill('#item_type', 'Water bottles');
  await page.fill('#wording', 'Logo on 2,000 recycled bottles, handed out at registration');
  await page.fill('#material', 'Recycled PET, 500ml, one-colour print');
  await page.fill('#qty', '2000');
  await page.fill('#unit_cost', '1.20');
  await page.fill('#rate_card_price', '6000');
  await page.fill('#distribution_method', 'Handed out at registration');
  await page.fill('#location_detail', 'Registration desks');
  await page.fill('#install_date', '2027-05-11');
  await page.getByRole('button', { name: 'Add item' }).click();

  await expect(page.getByText('Line SI-002 added. It’s for sale until someone marks it sold.')).toBeVisible();
  saveItem('si2', idFromUrl(page));
  await expectStatus(page, 'For sale');
  await expect(page.locator('main header')).toContainText('Sell it to a sponsor');
  await expect(salePanel(page)).toContainText('For sale at £6,000.00 on the rate card.');
  await expect(salePanel(page)).toContainText('It costs £2,400.00 to make.');
  await expect(details(page)).toContainText('Handed out at registration');
  await expect(details(page)).toContainText('Recycled PET, 500ml, one-colour print');
  // Nothing to do on artwork, sign-off or production until it's sold
  await expect(page.getByText('Artwork and sign-off start once it’s sold.')).toBeVisible();
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(panel(page, 'Production')).toHaveCount(0);

  // It isn't on anyone's board, and it doesn't count against signage progress
  await page.goto('/inbox');
  await expect(page.getByRole('region', { name: 'To do' })).not.toContainText('Visitor water bottles');
  await page.goto('/schedule/si');
  const sales = page.getByRole('group', { name: 'Sales' });
  await expect(sales.getByRole('link', { name: /^1\s*For sale$/ })).toBeVisible();
  await expect(sales.getByRole('link', { name: /£6,000\s*Still for sale at rate card/ })).toBeVisible();
  await expect(page.locator('table tbody tr', { hasText: 'SI-002' })).toContainText('Rate card £6,000');
  await page.screenshot({ path: test.info().outputPath('sponsorship-list.png'), fullPage: true });
});

test('people in an external department can’t mark items sold', async ({ browser, page }) => {
  await loginAs(page, 'admin');
  await page.goto('/settings/departments');
  const external = panel(page, /^External /);
  await expect(external).toContainText('Outside the company');
  await external.getByRole('checkbox', { name: 'Vic Viewer' }).check();
  await external.getByRole('button', { name: 'Save members' }).click();
  await expect(okMessage(external, /^Saved\. External has \d+ (person|people)\.$/)).toBeVisible();

  const vicCtx = await browser.newContext();
  const vic = await vicCtx.newPage();
  await loginAs(vic, 'vic');
  await vic.goto(`/items/${itemId('si2')}`);
  await expect(salePanel(vic)).toContainText('People in an external department can’t mark items sold.');
  await expect(salePanel(vic).getByRole('button', { name: 'Mark as sold' })).toHaveCount(0);
  await vicCtx.close();

  await page.reload();
  await external.getByRole('checkbox', { name: 'Vic Viewer' }).uncheck(); // back inside the company
  await external.getByRole('button', { name: 'Save members' }).click();
  await expect(okMessage(external, /^Saved\. External has \d+ (person|people)\.$/)).toBeVisible();
});

test('a User from the sales team marks it sold to a new sponsor at a price', async ({ page }) => {
  await loginAs(page, 'vic'); // a User: otherwise read-only
  await page.goto(`/items/${itemId('si2')}`);
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
  const sale = salePanel(page);
  await expect(sale.locator('#sale-price')).toHaveValue('6000'); // starts at the rate card
  await sale.locator('#sale-new').fill('Hydro Ltd');
  await sale.locator('#sale-price').fill('5500');
  await sale.getByRole('button', { name: 'Mark as sold' }).click();

  await expect(sale).toContainText('Hydro Ltd');
  await expect(sale).toContainText('£5,500.00');
  await expect(sale).toContainText('Margin');
  await expect(sale).toContainText('£3,100.00');
  await expect(sale).toContainText('by Vic Viewer');
  // Now the normal route starts: the new sponsor has no account manager yet
  await expectStatus(page, 'Awaiting artwork');
  await expect(waitingOn(page)).toContainText('Account manager not set');
  await expect(panel(page, 'Comments and history')).toContainText('Sold to Hydro Ltd for £5,500');
  await page.screenshot({ path: test.info().outputPath('sold-item.png'), fullPage: true });

  await page.goto('/sponsors');
  await expect(page.getByRole('link', { name: 'Hydro Ltd' })).toBeVisible();
});

test('sales add up on the list, the dashboard and All shows, and in the export', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/schedule/si');
  const sales = page.getByRole('group', { name: 'Sales' });
  await expect(sales.getByRole('link', { name: /^0\s*For sale$/ })).toBeVisible();
  await expect(sales.getByRole('link', { name: /^2\s*Sold$/ })).toBeVisible();
  await expect(sales.getByRole('link', { name: /^£5,500\s*Sales$/ })).toBeVisible();
  await expect(sales.getByRole('link', { name: /^£3,100\s*Margin on sold items$/ })).toBeVisible();

  await page.goto('/dashboard');
  const box = panel(page, 'Sponsorship sales');
  await expect(box).toContainText('£5,500');
  await expect(box).toContainText('2 of 2 items');
  await expect(box.locator('tr', { hasText: 'Margin' })).toContainText('£3,100');
  await expect(box.locator('tr', { hasText: 'Still for sale' })).toContainText('0 items');
  await expect(box).toContainText('1 sold item has no sale price yet.'); // SI-001 was sold before prices were recorded

  await page.goto('/shows');
  await expect(page.locator('li').filter({ hasText: 'UKCW London 2027' })).toContainText('£5,500');

  const csv = parseCsv(await (await page.request.get('/api/export/si')).text());
  const rec = Object.fromEntries(csv[0].map((h, i) => [h, csv.find((r) => r[0] === 'SI-002')![i]]));
  expect(rec.List).toBe('Sponsorship items');
  expect(rec.Sold).toBe('Yes');
  expect(rec['Sale price']).toBe('5500');
  expect(rec['Rate card price']).toBe('6000');
  expect(rec.Margin).toBe('3100');
  expect(rec['Sold by']).toBe('Vic Viewer');
  expect(rec['Distribution method']).toBe('Handed out at registration');
});

test('a sale can be undone until artwork arrives, then it stays sold', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto(`/items/${itemId('si2')}`);
  const sale = salePanel(page);
  await sale.getByText('Change the sale').click();
  acceptNextDialog(page);
  await sale.getByRole('button', { name: 'Put back on sale' }).click();
  await expect(sale).toContainText('For sale at £6,000.00 on the rate card.');
  await expectStatus(page, 'For sale');
  await expect(panel(page, 'Comments and history')).toContainText('Put back on sale (was sold to Hydro Ltd)');

  // Sold again, this time to a sponsor with an account manager, and the artwork arrives
  await sale.locator('#sale-sponsor').selectOption({ label: 'Acme Steel' });
  await sale.locator('#sale-price').fill('5800');
  await sale.getByRole('button', { name: 'Mark as sold' }).click();
  await expect(sale).toContainText('Acme Steel');
  await expect(waitingOn(page)).toContainText('Amy Account');
  await uploadArtwork(page, { name: 'acme-bottle.png', mimeType: 'image/png', buffer: makePng() });
  await sale.getByText('Change the sale').click();
  await expect(sale).toContainText('Artwork or sign-off has started for Acme Steel, so it can’t go back on sale.');
  await expect(sale.getByRole('button', { name: 'Put back on sale' })).toHaveCount(0);
});
