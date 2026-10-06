import { expect, test } from '@playwright/test';
import { ADMIN, acceptNextDialog, asUser, errorMessage, login, loginAs, okMessage, openPerson, panel, user } from './helpers';

test.describe.configure({ mode: 'serial' });

async function gsSignIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.fill('#gs-email', email);
  await page.fill('#gs-password', password);
  await page.getByRole('button', { name: 'Sign in as super admin' }).click();
}

test('the super admin page has its own sign-in, for super admins only', async ({ page }) => {
  await page.goto('/gs');
  await expect(page.getByRole('heading', { name: 'Super admin', level: 1 })).toBeVisible();
  await gsSignIn(page, user('pete').email, user('pete').password);
  await expect(errorMessage(page, 'That account isn’t a super admin.')).toBeVisible();
  await gsSignIn(page, ADMIN.email, 'wrong-password');
  await expect(errorMessage(page, 'don’t match an account')).toBeVisible();

  // The admin who set the platform up is the first super admin
  await gsSignIn(page, ADMIN.email, ADMIN.password);
  await expect(page.getByText(`Signed in as ${ADMIN.name}. Platform-wide controls`)).toBeVisible();
  await expect(page.locator('main ul li').filter({ hasText: 'Active people' })).toContainText(/\d+/);
  const admins = panel(page, 'Managers and super admins');
  await expect(admins.locator('li', { hasText: `${ADMIN.name} (you)` })).toContainText('Super admin');
  await expect(panel(page, 'Audit trail')).toContainText(`${ADMIN.name}: Signed in to the super admin panel`);
  await page.getByRole('link', { name: 'Back to the platform' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Super admin', exact: true })).toBeVisible();
});

test('people who aren’t super admins can’t open the panel', async ({ page }) => {
  await loginAs(page, 'pete');
  await expect(page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Super admin', exact: true })).toHaveCount(0);
  await page.goto('/gs');
  await expect(page.getByText('You’re signed in as Pete Production, who isn’t a super admin.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign everyone else out' })).toHaveCount(0);
});

test('managers can’t manage people, but a super admin can promote and demote them', async ({ browser, page }) => {
  // Fiona is a Manager: she can’t open the Admin page or the super admin panel
  const fiona = await asUser(browser, 'fiona');
  await fiona.page.goto('/admin');
  await expect(fiona.page).toHaveURL(/\/dashboard/);
  await fiona.page.goto('/gs');
  await expect(fiona.page.getByText('You’re signed in as Fiona Final, who isn’t a super admin.')).toBeVisible();

  // A super admin can make her one from the super admin panel, and take it away again
  await loginAs(page, 'admin');
  await page.goto('/gs');
  const row = panel(page, 'Managers and super admins').locator('li', { hasText: 'fiona@ukcw.test' });
  acceptNextDialog(page);
  await row.getByRole('button', { name: 'Make super admin' }).click();
  await expect(okMessage(row, 'Fiona Final is now a super admin.')).toBeVisible();
  await fiona.page.reload();
  await expect(fiona.page.getByText('Signed in as Fiona Final. Platform-wide controls')).toBeVisible();
  // Now she can open the Admin page
  await fiona.page.goto('/admin');
  await expect(fiona.page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
  acceptNextDialog(page);
  await row.getByRole('button', { name: 'Remove super admin' }).click();
  await expect(okMessage(row, 'Fiona Final is now a Manager.')).toBeVisible();
  await fiona.ctx.close();

  // And the access dropdown on the Admin page can set the three roles directly
  await page.goto('/admin');
  const again = await openPerson(page, 'fiona@ukcw.test');
  await expect(again.getByLabel('Access level', { exact: true }).locator('option')).toHaveText(['Super Admin', 'Manager', 'User']);
  await again.getByLabel('Access level', { exact: true }).selectOption('manager');
  await again.getByRole('button', { name: 'Save access' }).click();
  await expect(okMessage(again, 'Fiona Final is already a Manager.')).toBeVisible();
});

test('maintenance mode lets only super admins in', async ({ browser, page }) => {
  const pete = await asUser(browser, 'pete'); // signed in before maintenance starts
  await loginAs(page, 'admin');
  await page.goto('/gs');
  const switches = panel(page, 'Platform switches');
  acceptNextDialog(page);
  await switches.getByRole('button', { name: 'Turn maintenance on' }).click();
  await expect(okMessage(switches, 'Maintenance mode is on.')).toBeVisible();
  await expect(page.getByText('Maintenance mode is on: only super admins can use the platform')).toBeVisible();

  await pete.page.goto('/dashboard');
  await expect(pete.page).toHaveURL(/\/login/);
  await expect(pete.page.getByText('Event Delivery is closed for maintenance. Only super admins can sign in right now.')).toBeVisible();
  await pete.page.fill('#email', user('pete').email);
  await pete.page.fill('#password', user('pete').password);
  await pete.page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(errorMessage(pete.page, 'closed for maintenance, so only super admins can sign in')).toBeVisible();

  await page.goto('/dashboard'); // super admins carry on as normal
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.goto('/gs');
  await panel(page, 'Platform switches').getByRole('button', { name: 'Turn maintenance off' }).click();
  await expect(okMessage(panel(page, 'Platform switches'), 'Maintenance mode is off.')).toBeVisible();
  await login(pete.page, user('pete').email, user('pete').password);
  await expect(pete.page).toHaveURL(/\/inbox$/);
  await pete.ctx.close();
});

test('a super admin can see who is signed in and sign them out', async ({ browser, page }) => {
  const mark = await asUser(browser, 'mark');
  const olivia = await asUser(browser, 'olivia');
  await loginAs(page, 'admin');
  await page.goto('/gs');
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
  await expect(page.getByText(`Signed in as ${ADMIN.name}.`)).toBeVisible(); // still signed in
  await mark.ctx.close();
  await olivia.ctx.close();

  // Everything is in the audit trail
  await page.getByRole('link', { name: 'Access', exact: true }).click();
  await expect(page).toHaveURL(/\/gs\?log=access$/);
  const trail = panel(page, 'Audit trail');
  await expect(trail).toContainText('Signed everyone else out');
  await expect(trail).toContainText('Signed Mark Marketing out everywhere');
  await expect(trail).toContainText('Turned maintenance mode on');
  await expect(trail).toContainText('Made Fiona Final a super admin');
  await page.goto('/gs');
  await page.screenshot({ path: test.info().outputPath('super-admin.png'), fullPage: true });
  await page.context().clearCookies();
  await page.goto('/gs');
  await page.screenshot({ path: test.info().outputPath('super-admin-sign-in.png') });
});

test('the super admin dashboard has event info, signage info, quick links and change password', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/gs');

  // Quick links to everything a manager (and more) can reach
  const links = panel(page, 'Go to the platform');
  for (const name of ['All shows', 'Organiser signage', 'Sponsors', 'Suppliers', 'Settings', 'Admin (people)']) {
    await expect(links.getByRole('link', { name, exact: true })).toBeVisible();
  }

  // Signage info for the current show
  const signage = page.locator('section').filter({ has: page.getByRole('heading', { name: /^Signage/ }) });
  await expect(signage).toContainText('Total lines');
  await expect(signage.getByRole('link', { name: 'Organiser signage' })).toBeVisible();

  // Event info
  const events = panel(page, /^Events \(/);
  await expect(events).toContainText('UKCW London 2027');
  await expect(events.getByRole('link', { name: 'Create or manage events' })).toBeVisible();

  // Change your own password, right here — then change it back so the rest of the suite still signs in
  const pw = panel(page, 'Your password');
  await pw.locator('#gs-cur').fill(ADMIN.password);
  await pw.locator('#gs-new').fill('Umit-super-2027x');
  await pw.locator('#gs-confirm').fill('Umit-super-2027x');
  await pw.getByRole('button', { name: 'Change password' }).click();
  await expect(okMessage(pw, 'Password changed.')).toBeVisible();

  await pw.locator('#gs-cur').fill('Umit-super-2027x');
  await pw.locator('#gs-new').fill(ADMIN.password);
  await pw.locator('#gs-confirm').fill(ADMIN.password);
  await pw.getByRole('button', { name: 'Change password' }).click();
  await expect(okMessage(pw, 'Password changed.')).toBeVisible();

  // Wrong current password is rejected
  await pw.locator('#gs-cur').fill('not-the-password');
  await pw.locator('#gs-new').fill('Another-pass-1');
  await pw.locator('#gs-confirm').fill('Another-pass-1');
  await pw.getByRole('button', { name: 'Change password' }).click();
  await expect(errorMessage(pw, 'Your current password isn’t right.')).toBeVisible();
});
