import { expect, test } from '@playwright/test';
import {
  acceptNextDialog, asUser, decide, emailToSend, errorMessage, expectStatus, idFromUrl, login, loginAs, makePng, okMessage,
  openPerson, panel, signoffStage, uploadArtwork, withDb,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test('the admin page is for signed-in admins only', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
  await loginAs(page, 'admin');
  await page.goto('/dashboard');
  await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'People', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
  // The old team page address goes to Show › Team
  await page.goto('/settings/team');
  await expect(page).toHaveURL(/\/team$/);
});

test('changing someone’s access level takes effect straight away', async ({ browser, page }) => {
  await loginAs(page, 'admin');
  await page.goto('/admin');
  const row = await openPerson(page, 'vic@ukcw.test');
  await row.getByLabel('Access level', { exact: true }).selectOption('manager');
  await row.getByRole('button', { name: 'Save access' }).click();
  await expect(okMessage(row, 'Vic Viewer is now a Manager.')).toBeVisible();
  await expect(row.locator('summary').getByText('Manager', { exact: true })).toBeVisible();

  const vic = await asUser(browser, 'vic');
  await vic.page.goto('/schedule/os');
  await expect(vic.page.getByRole('link', { name: 'Add line' })).toBeVisible();

  await row.getByLabel('Access level', { exact: true }).selectOption('user');
  await row.getByRole('button', { name: 'Save access' }).click();
  await expect(okMessage(row, 'Vic Viewer is now a User.')).toBeVisible();
  await vic.page.reload();
  await expect(vic.page.getByRole('link', { name: 'Add line' })).toHaveCount(0);
  await vic.ctx.close();
  await expect(panel(page, 'Access log')).toContainText('Changed Vic Viewer from Manager to User');
});

test('sign-off responsibilities are handed over from each person’s row', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/admin');
  // Final sign-off is already approved by Fiona; add Pete as a second approver (any one can sign off)
  const pete = await openPerson(page, 'pete@ukcw.test');
  await expect(pete.getByText('also Fiona Final')).toBeVisible();
  await pete.getByLabel('Final sign-off', { exact: true }).check();
  await pete.getByRole('checkbox', { name: 'BuildCo', exact: true }).check();
  await pete.getByRole('button', { name: 'Save sign-off' }).click();
  await expect(okMessage(pete, 'Saved. Pete is now approver for Final sign-off and account manager for BuildCo.')).toBeVisible();

  // Both now approve Final sign-off
  await page.goto('/settings/stages');
  const finalStage = panel(page, /^\d+\s*Final sign-off$/);
  await expect(finalStage.getByRole('checkbox', { name: 'Pete Production' })).toBeChecked();
  await expect(finalStage.getByRole('checkbox', { name: 'Fiona Final' })).toBeChecked();
  await page.goto('/sponsors');
  await expect(page.locator('tr', { hasText: 'BuildCo' })).toContainText('Pete Production');

  // Remove Fiona, so only Pete approves it, and hand the sponsor back to Amy
  await page.goto('/admin');
  const f = await openPerson(page, 'fiona@ukcw.test');
  await expect(f.getByLabel('Final sign-off', { exact: true })).toBeChecked();
  await expect(f.getByText('also Pete Production').first()).toBeVisible();
  await f.getByLabel('Final sign-off', { exact: true }).uncheck();
  await f.getByRole('button', { name: 'Save sign-off' }).click();
  await expect(okMessage(f, 'Saved. Fiona is now no longer approver for Final sign-off.')).toBeVisible();
  const amy = await openPerson(page, 'amy@ukcw.test');
  await amy.getByRole('checkbox', { name: 'BuildCo', exact: true }).check();
  await amy.getByRole('button', { name: 'Save sign-off' }).click();
  await expect(okMessage(amy, 'Saved. Amy is now account manager for BuildCo.')).toBeVisible();
  await expect(panel(page, 'Access log')).toContainText('Made Pete Production approver for Final sign-off and account manager for BuildCo');

  // Users can't sign off, and making an approver a viewer is flagged
  const vic = await openPerson(page, 'vic@ukcw.test');
  await expect(vic).toContainText('Users can’t sign off.');
  await expect(vic.getByRole('button', { name: 'Save sign-off' })).toHaveCount(0);
  const olivia = await openPerson(page, 'olivia@ukcw.test');
  await olivia.getByLabel('Access level', { exact: true }).selectOption('user');
  await olivia.getByRole('button', { name: 'Save access' }).click();
  await expect(okMessage(olivia, 'They still look after Operations stage, but users can’t sign off')).toBeVisible();
  await expect(page.getByText('Olivia Ops approves Operations but is a User.')).toBeVisible();
  await olivia.getByLabel('Access level', { exact: true }).selectOption('manager');
  await olivia.getByRole('button', { name: 'Save access' }).click();
  await expect(okMessage(olivia, 'Olivia Ops is now a Manager.')).toBeVisible();
  await expect(page.getByText('Olivia Ops approves Operations but is a User.')).toHaveCount(0);
});

test('an expired invite is refused at sign-in and can be sent again', async ({ browser, page }) => {
  await loginAs(page, 'admin');
  await page.goto('/admin');
  await page.fill('#inv-name', 'Erin Expired');
  await page.fill('#inv-email', 'erin@ukcw.test');
  await page.getByRole('button', { name: 'Create invite' }).click();
  const first = (await emailToSend(panel(page, 'Invite someone'))).password;
  // A week passes
  await withDb((sql) => sql`update users set temp_password_expires_at = now() - interval '1 minute' where email = 'erin@ukcw.test'`);

  const ctx = await browser.newContext();
  const erin = await ctx.newPage();
  await erin.goto('/login');
  await erin.fill('#email', 'erin@ukcw.test');
  await erin.fill('#password', 'not-it');
  await erin.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(errorMessage(erin, 'don’t match an account')).toBeVisible(); // nothing about the invite is given away
  await erin.fill('#password', first);
  await erin.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(errorMessage(erin, 'That temporary password has expired. Ask an admin to send you a new invite.')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Erin Expired’s invite has expired.')).toBeVisible();
  const row = await openPerson(page, 'erin@ukcw.test');
  await expect(row.locator('summary').getByText('Invite expired', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'New invite' }).click();
  await expect(okMessage(row, 'New invite for Erin Expired. The old temporary password no longer works.')).toBeVisible();
  const resent = await emailToSend(row);
  expect(resent.subject).toBe('Your Event Delivery invitation');
  const second = resent.password;
  expect(second).not.toBe(first);
  await login(erin, 'erin@ukcw.test', second);
  await expect(erin).toHaveURL(/\/account\?first=1/);
  await ctx.close();
  await expect(page.getByText('Erin Expired’s invite has expired.')).toHaveCount(0);
});

test('sponsor approval links can be switched off and back on', async ({ browser, page }) => {
  await loginAs(page, 'admin');
  await page.goto('/schedule/ss/new');
  await page.fill('#description', 'Acme Steel aisle sign');
  await page.locator('#sponsor_id').selectOption({ label: 'Acme Steel' });
  await page.getByRole('button', { name: 'Add line' }).click();
  await expect(page.getByText(/^Line SS-\d{3} added\./)).toBeVisible();
  const id = idFromUrl(page);
  await uploadArtwork(page, { name: 'aisle.png', mimeType: 'image/png', buffer: makePng(400, 200) });
  await decide(page, 'Operations', 'Approve');
  await expectStatus(page, 'Artworked · with Marketing');
  await decide(page, 'Marketing', 'Approve');
  await expectStatus(page, 'Artworked · with Sponsor');
  await signoffStage(page, 'Sponsor').getByRole('button', { name: 'Create approval link' }).click();
  const link = await page.getByTestId('share-url').inputValue();

  const guest = await browser.newContext();
  const g = await guest.newPage();
  await g.goto(link);
  await expect(g.getByRole('heading', { name: 'Please review this artwork' })).toBeVisible();
  const fileHref = (await g.getByRole('link', { name: /Open the full file/ }).getAttribute('href'))!;

  await page.goto('/admin/platform');
  const links = page.getByRole('region', { name: 'Sponsor approval links' });
  await expect(links).toContainText('On');
  await expect(links).toContainText(/\d+ links? (is|are) waiting for a sponsor’s answer\./);
  acceptNextDialog(page);
  await links.getByRole('button', { name: 'Turn links off' }).click();
  await expect(okMessage(links, 'Sponsor approval links are off. Every existing link has stopped working.')).toBeVisible();
  await expect(links).toContainText('Sponsors can’t open links, and lines don’t offer them.');
  await page.goto('/dashboard'); // the Control centre flags it
  await expect(panel(page, /^Needs your attention/)).toContainText('Sponsor approval links are switched off');

  await g.reload();
  await expect(g.getByText('Approval links are switched off at the moment.')).toBeVisible();
  await expect(g.getByRole('heading', { name: 'Please review this artwork' })).toHaveCount(0);
  expect((await g.request.get(fileHref)).status()).toBe(404);
  await page.goto(`/items/${id}`);
  await expect(signoffStage(page, 'Sponsor')).toContainText('Waiting for a decision');
  await expect(page.getByText('Ask Acme Steel to approve it themselves')).toHaveCount(0);

  await page.goto('/admin/platform');
  await links.getByRole('button', { name: 'Turn links on' }).click();
  await expect(okMessage(links, 'Sponsor approval links are on.')).toBeVisible();
  await page.goto('/admin');
  await expect(panel(page, 'Access log')).toContainText('Turned sponsor approval links off');
  await g.reload();
  await expect(g.getByRole('heading', { name: 'Please review this artwork' })).toBeVisible();
  expect((await g.request.get(fileHref)).status()).toBe(200);
  await guest.close();

  await page.goto(`/items/${id}`);
  acceptNextDialog(page);
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page).toHaveURL(/\/schedule\/ss\?deleted=1/);
});

test('the admin page, with an invite ready to send', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/admin');
  await page.fill('#inv-name', 'Sam Supplier');
  await page.fill('#inv-email', 'sam@ukcw.test');
  await page.fill('#inv-title', 'Print Manager');
  await page.getByRole('radio', { name: /^User/ }).check();
  await page.getByRole('button', { name: 'Create invite' }).click();
  await expect(panel(page, 'Invite someone').getByRole('region', { name: 'Email to send' })).toBeVisible();
  await openPerson(page, 'mark@ukcw.test');
  await page.screenshot({ path: test.info().outputPath('admin-page.png'), fullPage: true });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the admin page fits a small screen', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin');
    await openPerson(page, 'amy@ukcw.test');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('admin-phone.png'), fullPage: true });
  });
});
