import { expect, test, type Page } from '@playwright/test';
import {
  ADMIN, acceptNextDialog, errorMessage, itemId, latestEmail, login, loginAs, okMessage, openPerson, panel, saveUser, signoffStage,
  tempPasswordFrom, user,
} from './helpers';

test.describe.configure({ mode: 'serial' });

async function settingsTabs(page: Page) {
  return (await page.getByRole('navigation', { name: 'Settings' }).getByRole('link').allInnerTexts()).map((t) => t.trim());
}

test('signed-out visitors are sent to sign in, then back to the page they wanted', async ({ page, request }) => {
  await page.goto(`/items/${itemId('os1')}`);
  await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Fitems%2F${itemId('os1')}$`));
  await page.fill('#email', user('olivia').email);
  await page.fill('#password', user('olivia').password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${itemId('os1')}$`));

  expect((await request.get('/api/export/os')).status()).toBe(401);
  expect((await request.get('/api/selftest')).status()).toBe(404);
  expect((await request.get('/api/selftest?token=guess')).status()).toBe(404);
  const upload = await request.post('/api/upload', {
    data: { type: 'blob.generate-client-token', payload: { pathname: 'artwork/x/y/z.png', clientPayload: JSON.stringify({ itemId: itemId('os1'), kind: 'original' }), multipart: false } },
  });
  expect(upload.status()).toBe(400);
  expect((await upload.json()).error).toContain('signed in');
});

test('viewers can look but not change anything', async ({ page }) => {
  await loginAs(page, 'vic');
  await page.goto('/schedule/os');
  await expect(page.getByRole('link', { name: 'Add line' })).toHaveCount(0);
  await page.goto('/schedule/os/new');
  await expect(page).toHaveURL(/\/schedule\/os$/);

  await page.goto(`/items/${itemId('os4')}`);
  await expect(page.getByText('Upload the artwork')).toHaveCount(0);
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel line' })).toHaveCount(0);
  await page.goto(`/items/${itemId('os2')}`);
  await expect(page.locator('#signoff textarea')).toHaveCount(0);
  await expect(page.locator('#production_status')).toBeDisabled();

  await page.goto('/settings');
  await expect(page).toHaveURL(/\/settings\/suppliers$/);
  expect(await settingsTabs(page)).toEqual(['Suppliers', 'Dropdown lists']);
  await expect(page.getByRole('button', { name: 'Add supplier' })).toHaveCount(0);
  await page.goto('/settings/lists');
  await expect(page.locator('#list-zone')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save list' })).toHaveCount(0);
  for (const path of ['/admin', '/settings/team']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/dashboard\?denied=1$/);
    await expect(page.getByText('That page is for admins only.')).toBeVisible();
  }
  await expect(page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
  await page.goto('/sponsors');
  await expect(page.getByRole('heading', { name: 'Add a sponsor' })).toHaveCount(0);

  // The upload service refuses viewers too
  const res = await page.request.post('/api/upload', {
    data: { type: 'blob.generate-client-token', payload: { pathname: 'artwork/x/y/z.png', clientPayload: JSON.stringify({ itemId: itemId('os4'), kind: 'original' }), multipart: false } },
  });
  expect(res.status()).toBe(400);
});

test('members can work on lines but not reach admin settings', async ({ page }) => {
  await loginAs(page, 'mark');
  for (const path of ['/admin', '/settings/team', '/settings/stages', '/settings/events', '/settings/system']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/dashboard\?denied=1$/);
  }
  await page.goto('/settings/suppliers');
  expect(await settingsTabs(page)).toEqual(['Suppliers', 'Dropdown lists']);
  await expect(page.getByRole('button', { name: 'Add supplier' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0); // removing suppliers is for admins

  await page.goto(`/items/${itemId('os4')}`);
  await expect(page.locator('input[type=file]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Cancel line' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete permanently' })).toHaveCount(0);
});

test('the server refuses a decision from someone who is not the approver', async ({ browser, page }) => {
  // Find the Operations stage id from the admin's view, where every stage has a form
  const admin = await browser.newContext();
  const ap = await admin.newPage();
  await login(ap, ADMIN.email, ADMIN.password);
  await ap.goto(`/items/${itemId('os2')}`);
  await signoffStage(ap, 'Operations').getByRole('button', { name: 'Change this decision' }).click();
  const opsStageId = (await signoffStage(ap, 'Operations').locator('textarea').getAttribute('id'))!.replace(/^c-/, '');
  await admin.close();

  await loginAs(page, 'mark');
  await page.goto(`/items/${itemId('os2')}`);
  const marketing = signoffStage(page, 'Marketing');
  const form = marketing.locator('form').filter({ has: page.locator('textarea') });
  await form.locator('input[name=stage_id]').evaluate((el, v) => ((el as HTMLInputElement).value = v), opsStageId);
  await form.locator('textarea').fill('Trying to change the Operations stage');
  await form.getByRole('button', { name: 'Request changes' }).click();
  await expect(errorMessage(marketing, 'Only the approver for this stage (or an admin) can record it.')).toBeVisible();
  await page.reload();
  await expect(signoffStage(page, 'Operations')).toContainText('Approved by Olivia Ops');
});

test('deactivated people are signed out and cannot sign back in', async ({ browser, page }) => {
  const vicCtx = await browser.newContext();
  const vic = await vicCtx.newPage();
  await loginAs(vic, 'vic');
  await vic.goto('/dashboard');
  await expect(vic.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await login(page, ADMIN.email, ADMIN.password);
  await page.goto('/admin');
  // Admins can't lock themselves out
  const me = await openPerson(page, ADMIN.email);
  await expect(me.locator('summary')).toContainText(`${ADMIN.name} (you)`);
  await expect(me).toContainText('This is you.');
  await expect(me.getByRole('button', { name: 'Deactivate' })).toHaveCount(0);
  await expect(me.getByRole('button', { name: 'Save access' })).toHaveCount(0);

  const row = await openPerson(page, 'vic@ukcw.test');
  acceptNextDialog(page);
  await row.getByRole('button', { name: 'Deactivate' }).click();
  await expect(okMessage(row, 'Vic Viewer can no longer sign in and has been signed out.')).toBeVisible();
  await expect(row.locator('summary').getByText('Deactivated', { exact: true })).toBeVisible();
  await expect(panel(page, 'Access log')).toContainText('Deactivated Vic Viewer');

  await vic.reload();
  await expect(vic).toHaveURL(/\/login/);
  await vic.fill('#email', user('vic').email);
  await vic.fill('#password', user('vic').password);
  await vic.getByRole('button', { name: 'Sign in' }).click();
  await expect(errorMessage(vic, 'don’t match an account')).toBeVisible();

  await row.getByRole('button', { name: 'Reactivate' }).click();
  await expect(okMessage(row, 'Vic Viewer can sign in again.')).toBeVisible();
  await expect(row.locator('summary').getByText('Deactivated', { exact: true })).toHaveCount(0);
  await login(vic, user('vic').email, user('vic').password);
  await expect(vic).toHaveURL(/\/inbox$/);
  await vicCtx.close();
});

test('too many wrong passwords lock the account until it is reset', async ({ page }) => {
  const mark = user('mark');
  await page.goto('/login');
  const attempt = async (password: string) => {
    await page.fill('#email', mark.email);
    await page.fill('#password', password);
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/login'),
      page.getByRole('button', { name: 'Sign in' }).click(),
    ]);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  };
  for (let i = 0; i < 8; i++) {
    await attempt(`wrong-${i}`);
    await expect(errorMessage(page, 'don’t match an account')).toBeVisible();
  }
  await attempt(mark.password);
  await expect(errorMessage(page, 'Too many attempts.')).toBeVisible();

  await login(page, ADMIN.email, ADMIN.password);
  await page.goto('/admin');
  await expect(page.getByText('Mark Marketing is locked out after too many wrong passwords.')).toBeVisible();
  await expect(panel(page, 'Access log')).toContainText('Locked Mark Marketing’s account for 15 minutes after 8 wrong passwords');
  const row = await openPerson(page, mark.email);
  await expect(row.locator('summary').getByText('Locked out')).toBeVisible();
  acceptNextDialog(page);
  await row.getByRole('button', { name: 'Reset password' }).click();
  await expect(okMessage(row, 'password has been reset')).toBeVisible();
  const temp = tempPasswordFrom((await latestEmail(mark.email)).text);

  await login(page, mark.email, temp);
  await page.fill('#current', temp);
  await page.fill('#password', 'Mark-pass-2027b');
  await page.fill('#confirm', 'Mark-pass-2027b');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  saveUser('mark', { ...mark, password: 'Mark-pass-2027b' });
});
