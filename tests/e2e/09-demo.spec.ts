import { expect, test } from '@playwright/test';
import { acceptNextDialog, errorMessage, loginAs, okMessage, openPerson, panel } from './helpers';

// Runs in the second phase of scripts/e2e.mjs, after the server restarts with a shared demo login configured.
test.describe.configure({ mode: 'serial' });

const DEMO = { email: process.env.DEMO_ACCOUNT_EMAIL ?? 'demo@ukcw.test', password: process.env.DEMO_ACCOUNT_PASSWORD ?? 'demo-pass-2027' };

test.describe('shared demo login @demo', () => {
  test('the sign-in page shows the demo login, which goes straight in', async ({ page }) => {
    await page.goto('/login');
    const box = page.getByRole('region', { name: 'Trying it out?' });
    await expect(box).toContainText(DEMO.email);
    await expect(box).toContainText(DEMO.password);
    await box.getByRole('button', { name: 'Sign in with the demo account' }).click();
    await expect(page).toHaveURL(/\/inbox$/); // no forced password change
    const nav = page.getByRole('navigation', { name: 'Main' }).first();
    await expect(nav.getByText('Demo User')).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
    await page.goto('/account');
    await expect(page.getByText('You’re using the shared demo account')).toBeVisible();
    await expect(page.locator('#password')).toHaveCount(0); // its password can't be changed
  });

  test('wrong passwords can’t lock everyone out of the demo login', async ({ page }) => {
    await page.goto('/login');
    for (let i = 0; i < 9; i++) {
      await page.fill('#email', DEMO.email);
      await page.fill('#password', `wrong-${i}`);
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/login'),
        page.getByRole('button', { name: 'Sign in', exact: true }).click(),
      ]);
      await expect(errorMessage(page, 'don’t match an account')).toBeVisible();
    }
    await page.getByRole('region', { name: 'Trying it out?' }).getByRole('button', { name: 'Sign in with the demo account' }).click();
    await expect(page).toHaveURL(/\/inbox$/);
  });

  test('admins see the demo login flagged and can take it off the sign-in page', async ({ browser, page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin');
    await expect(page.getByText('The demo login is on the sign-in page, so anyone with the link can sign in as Demo User.')).toBeVisible();
    await expect(panel(page, 'Access log')).toContainText(`Created the shared demo login Demo User (${DEMO.email}) as Member`);
    const row = await openPerson(page, DEMO.email);
    await expect(row.locator('summary').getByText('Demo login', { exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Reset password' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Cancel invite' })).toHaveCount(0);
    await expect(row.getByLabel('Access level', { exact: true }).locator('option')).toHaveText(['Member', 'Viewer']); // never admin

    acceptNextDialog(page);
    await row.getByRole('button', { name: 'Deactivate' }).click();
    await expect(okMessage(row, 'The demo login is off the sign-in page and no longer works.')).toBeVisible();
    const guest = await browser.newContext();
    const g = await guest.newPage();
    await g.goto('/login');
    await expect(g.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(g.getByRole('region', { name: 'Trying it out?' })).toHaveCount(0);

    await row.getByRole('button', { name: 'Reactivate' }).click();
    await expect(okMessage(row, 'The demo login is back on the sign-in page.')).toBeVisible();
    await g.reload();
    await expect(g.getByRole('region', { name: 'Trying it out?' })).toBeVisible();
    await guest.close();
  });
});
