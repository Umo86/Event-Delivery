import { expect, test, type Page } from '@playwright/test';
import {
  ADMIN, acceptNextDialog, asUser, emailToSend, errorMessage, login, loginAs, okMessage, openPerson, panel, personRow, user,
} from './helpers';

test.describe.configure({ mode: 'serial' });

const menu = (page: Page) => page.getByRole('navigation', { name: 'Main' }).first();
const adminTabs = (page: Page) => page.getByRole('navigation', { name: 'Admin' });

async function gsSignIn(page: Page, email: string, password: string) {
  await page.fill('#gs-email', email);
  await page.fill('#gs-password', password);
  await page.getByRole('button', { name: 'Sign in as super admin' }).click();
}

test('the super admin sign-in is for super admins only, and lands on the Control centre', async ({ page }) => {
  await page.goto('/gs');
  await expect(page.getByRole('heading', { name: 'Super admin', level: 1 })).toBeVisible();
  await gsSignIn(page, user('pete').email, user('pete').password);
  await expect(errorMessage(page, 'That account isn’t a super admin.')).toBeVisible();
  await gsSignIn(page, ADMIN.email, 'wrong-password');
  await expect(errorMessage(page, 'don’t match an account')).toBeVisible();

  // The admin who set the platform up is the first super admin
  await gsSignIn(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Control centre', level: 1 })).toBeVisible();
  await page.goto('/gs'); // already signed in, so straight back to the Control centre
  await expect(page).toHaveURL(/\/dashboard$/);

  // Admin is part of the same menu, with three tabs
  await menu(page).getByRole('link', { name: 'Platform', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/platform$/);
  await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
  await expect(adminTabs(page).getByRole('link')).toHaveText(['People', 'Platform', 'Activity']);
  await expect(adminTabs(page).getByRole('link', { name: 'Platform' })).toHaveAttribute('aria-current', 'page');
  await expect(menu(page).getByRole('link', { name: 'Platform', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: /People who can sign in/ })).toContainText(/\d+/);
  await adminTabs(page).getByRole('link', { name: 'Activity' }).click();
  await expect(page).toHaveURL(/\/admin\/activity$/);
  await expect(panel(page, 'Audit trail')).toContainText(`${ADMIN.name}: Signed in on the super admin sign-in`);
});

test('people who aren’t super admins can’t open the Admin pages', async ({ page }) => {
  await loginAs(page, 'pete');
  await expect(menu(page).getByRole('link', { name: 'Platform', exact: true })).toHaveCount(0);
  for (const path of ['/admin', '/admin/platform', '/admin/activity', '/settings/system']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/dashboard\?denied=1$/);
  }
  await page.goto('/gs');
  await expect(page.getByText('You’re signed in as Pete Production, who isn’t a super admin.')).toBeVisible();
  await expect(page.locator('#gs-email')).toBeVisible();
});

test('managers can’t manage people, but a super admin can promote and demote them', async ({ browser, page }) => {
  // Fiona is a Manager: she can’t open Admin, and the super admin sign-in turns her away
  const fiona = await asUser(browser, 'fiona');
  await fiona.page.goto('/admin');
  await expect(fiona.page).toHaveURL(/\/dashboard\?denied=1$/);
  await fiona.page.goto('/gs');
  await expect(fiona.page.getByText('You’re signed in as Fiona Final, who isn’t a super admin.')).toBeVisible();

  // A super admin makes her one from People, and takes it away again
  await loginAs(page, 'admin');
  await page.goto('/admin');
  const row = await openPerson(page, 'fiona@ukcw.test');
  const access = row.getByLabel('Access level', { exact: true });
  await expect(access.locator('option')).toHaveText(['Super Admin', 'Manager', 'User']);
  await access.selectOption('super_admin');
  await row.getByRole('button', { name: 'Save access' }).click();
  await expect(okMessage(row, 'Fiona Final is now a Super Admin.')).toBeVisible();
  await fiona.page.goto('/admin');
  await expect(fiona.page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
  await expect(menu(fiona.page).getByRole('link', { name: 'Platform', exact: true })).toBeVisible();

  await access.selectOption('manager');
  await row.getByRole('button', { name: 'Save access' }).click();
  await expect(okMessage(row, 'Fiona Final is now a Manager.')).toBeVisible();
  await fiona.page.goto('/admin');
  await expect(fiona.page).toHaveURL(/\/dashboard\?denied=1$/);
  await fiona.ctx.close();

  // A new super admin can be invited straight in, too
  const invite = panel(page, 'Invite someone');
  await page.fill('#inv-name', 'Sasha Super');
  await page.fill('#inv-email', 'sasha.super@ukcw.test');
  await invite.getByRole('radio', { name: /^Super Admin/ }).check();
  await invite.getByRole('button', { name: 'Create invite' }).click();
  expect((await emailToSend(invite)).body).toContain('Your access: Super Admin.');
  await invite.getByRole('button', { name: 'Done' }).click();
  const sasha = await openPerson(page, 'sasha.super@ukcw.test');
  await expect(sasha.locator('summary').getByText('Super Admin', { exact: true })).toBeVisible();
  acceptNextDialog(page);
  await sasha.getByRole('button', { name: 'Cancel invite' }).click();
  await expect(personRow(page, 'sasha.super@ukcw.test')).toHaveCount(0);
});

test('maintenance mode lets only super admins in', async ({ browser, page }) => {
  const pete = await asUser(browser, 'pete'); // signed in before maintenance starts
  await loginAs(page, 'admin');
  await page.goto('/admin/platform');
  const switches = panel(page, 'Platform switches');
  acceptNextDialog(page);
  await switches.getByRole('button', { name: 'Turn maintenance on' }).click();
  await expect(okMessage(switches, 'Maintenance mode is on.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Maintenance mode' })).toContainText('On');
  await expect(page.getByText('Maintenance mode is on: only super admins can use the platform')).toBeVisible();

  await pete.page.goto('/dashboard');
  await expect(pete.page).toHaveURL(/\/login/);
  await expect(pete.page.getByText('Event Delivery is closed for maintenance. Only super admins can sign in right now.')).toBeVisible();
  await pete.page.fill('#email', user('pete').email);
  await pete.page.fill('#password', user('pete').password);
  await pete.page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(errorMessage(pete.page, 'closed for maintenance, so only super admins can sign in')).toBeVisible();

  // Super admins carry on as normal, with a reminder on every page
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Control centre' })).toBeVisible();
  await expect(panel(page, /^Needs your attention/)).toContainText('Maintenance mode is on, so only super admins can sign in.');
  await page.getByRole('link', { name: 'Turn it off' }).click();
  await expect(page).toHaveURL(/\/admin\/platform$/);
  await panel(page, 'Platform switches').getByRole('button', { name: 'Turn maintenance off' }).click();
  await expect(okMessage(panel(page, 'Platform switches'), 'Maintenance mode is off.')).toBeVisible();
  await expect(page.getByText('Maintenance mode is on: only super admins can use the platform')).toHaveCount(0);
  await login(pete.page, user('pete').email, user('pete').password);
  await expect(pete.page).toHaveURL(/\/dashboard$/);
  await pete.ctx.close();
});

test('a super admin can see who is signed in and sign them out', async ({ browser, page }) => {
  const mark = await asUser(browser, 'mark');
  const olivia = await asUser(browser, 'olivia');
  await loginAs(page, 'admin');
  await page.goto('/admin/platform');
  const signedIn = panel(page, /^Signed in \(\d+\)$/);
  const markRow = signedIn.locator('li', { hasText: 'Mark Marketing' });
  await expect(markRow).toContainText(/\d+ sessions?, latest sign-in/);
  await markRow.getByRole('button', { name: 'Sign out' }).click();
  await expect(signedIn.locator('li', { hasText: 'Mark Marketing' })).toHaveCount(0);
  await mark.page.goto('/dashboard');
  await expect(mark.page).toHaveURL(/\/login/);

  acceptNextDialog(page);
  await signedIn.getByRole('button', { name: 'Sign everyone else out' }).click();
  await expect(okMessage(signedIn, 'Everyone else has been signed out')).toBeVisible();
  await olivia.page.goto('/dashboard');
  await expect(olivia.page).toHaveURL(/\/login/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible(); // still signed in
  await mark.ctx.close();
  await olivia.ctx.close();

  // Everything is in the audit trail
  await adminTabs(page).getByRole('link', { name: 'Activity' }).click();
  await page.getByRole('link', { name: 'Access', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/activity\?log=access$/);
  const trail = panel(page, 'Audit trail');
  await expect(trail).toContainText('Signed everyone else out');
  await expect(trail).toContainText('Signed Mark Marketing out everywhere');
  await expect(trail).toContainText('Turned maintenance mode on');
  await expect(trail).toContainText('Changed Fiona Final from Manager to Super Admin');
  await page.getByRole('link', { name: 'Lines', exact: true }).click();
  await expect(trail.getByRole('link', { name: /^(OS|SS|SI)-\d{3}$/ }).first()).toBeVisible(); // line entries link to the line
  await expect(trail).toContainText('Deleted SS-002'); // deleted lines keep their history here
  await page.getByRole('link', { name: 'Setup', exact: true }).click();
  await expect(trail).toContainText('Renamed the platform to UKCW Signage');
  await expect(trail).toContainText('Added sponsor BuildCo');
  await expect(trail).not.toContainText('Signed everyone else out');

  await page.goto('/admin/platform');
  await page.screenshot({ path: test.info().outputPath('platform.png'), fullPage: true });
  await page.goto('/admin/activity');
  await page.screenshot({ path: test.info().outputPath('activity.png'), fullPage: true });
  await page.context().clearCookies();
  await page.goto('/gs');
  await page.screenshot({ path: test.info().outputPath('super-admin-sign-in.png') });
});

test('a super admin changes their own password under Your account', async ({ page }) => {
  await loginAs(page, 'admin');
  await menu(page).getByRole('link', { name: new RegExp(ADMIN.name) }).click();
  await expect(page).toHaveURL(/\/account$/);
  const pw = panel(page, 'Change password');
  await pw.locator('#current').fill(ADMIN.password);
  await pw.getByRole('button', { name: 'Show password' }).first().click(); // the eye shows what you typed
  await expect(pw.locator('#current')).toHaveAttribute('type', 'text');
  await pw.locator('#password').fill('Umit-super-2027x');
  await pw.locator('#confirm').fill('Umit-super-2027x');
  await pw.getByRole('button', { name: 'Change password' }).click();
  await expect(okMessage(pw, 'Password changed.')).toBeVisible();
  await expect(pw.locator('#current')).toHaveValue(''); // saved and the form has cleared

  // Then back again, so the rest of the suite still signs in
  await pw.locator('#current').fill('Umit-super-2027x');
  await pw.locator('#password').fill(ADMIN.password);
  await pw.locator('#confirm').fill(ADMIN.password);
  await pw.getByRole('button', { name: 'Change password' }).click();
  await expect(okMessage(pw, 'Password changed.')).toBeVisible();
  await expect(pw.locator('#current')).toHaveValue('');

  // A wrong current password is rejected
  await pw.locator('#current').fill('not-the-password');
  await pw.locator('#password').fill('Another-pass-1');
  await pw.locator('#confirm').fill('Another-pass-1');
  await pw.getByRole('button', { name: 'Change password' }).click();
  await expect(errorMessage(pw, 'Your current password isn’t right.')).toBeVisible();
});
