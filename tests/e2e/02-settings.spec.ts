import { expect, test, type Page } from '@playwright/test';
import {
  ADMIN, acceptNextDialog, errorMessage, latestEmail, login, okMessage, openPerson, panel, personRow, readState, saveUser,
  tempPasswordFrom, user, withDb,
} from './helpers';

test.describe.configure({ mode: 'serial' });

const PEOPLE = [
  { key: 'olivia', name: 'Olivia Ops', email: 'olivia@ukcw.test', title: 'Operations Manager', role: 'member' },
  { key: 'mark', name: 'Mark Marketing', email: 'mark@ukcw.test', title: 'Marketing Manager', role: 'member' },
  { key: 'amy', name: 'Amy Account', email: 'amy@ukcw.test', title: 'Account Manager', role: 'member' },
  { key: 'fiona', name: 'Fiona Final', email: 'fiona@ukcw.test', title: 'Event Director', role: 'member' },
  { key: 'pete', name: 'Pete Production', email: 'pete@ukcw.test', title: 'Production Manager', role: 'member' },
  { key: 'vic', name: 'Vic Viewer', email: 'vic@ukcw.test', title: 'Finance', role: 'viewer' },
] as const;

const asAdmin = (page: Page) => login(page, ADMIN.email, ADMIN.password);

async function stageNames(page: Page) {
  const titles = await page.locator('section > div > h2').allInnerTexts();
  return titles.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => /^\d/.test(t)).map((t) => t.replace(/^\d+\s*/, ''));
}

test('admin invites the team, and each person is emailed a temporary password', async ({ page }) => {
  await asAdmin(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
  for (const p of PEOPLE) {
    await page.fill('#inv-name', p.name);
    await page.fill('#inv-email', p.email);
    await page.fill('#inv-title', p.title);
    await page.getByRole('radio', { name: new RegExp(`^${p.role === 'viewer' ? 'Viewer' : 'Member'}`) }).check();
    await page.getByRole('button', { name: 'Send invite' }).click();
    await expect(okMessage(page, `Invite sent to ${p.email}.`)).toBeVisible();
    const mail = await latestEmail(p.email);
    expect(mail.subject).toBe(`${ADMIN.name} invited you to Event Delivery`);
    expect(mail.from).toBe('Event Delivery <invites@ukcw.test>');
    expect(mail.reply_to).toBe(ADMIN.email); // replies go to the admin who sent it
    expect(mail.text).toContain(`Hello ${p.name.split(' ')[0]},`);
    expect(mail.text).toContain('Sign in: http://127.0.0.1:3100/login');
    expect(mail.text).toContain(`Email: ${p.email}`);
    expect(mail.text).toContain('you’ll be asked to choose your own password');
    expect(mail.text).toContain(`Your access: ${p.role === 'viewer' ? 'Viewer' : 'Member'}.`);
    expect(mail.html).toContain('Sign in to Event Delivery');
    const pw = tempPasswordFrom(mail.text);
    expect(pw).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d{4}$/);
    expect(mail.html).toContain(pw);
    saveUser(p.key, { name: p.name, email: p.email, password: pw });
    await expect(page.locator('#inv-name')).toHaveValue(''); // the form clears for the next person
  }
  await expect(page.getByRole('heading', { name: `People (${PEOPLE.length + 1})` })).toBeVisible();
  await expect(page.getByText(`1 active, ${PEOPLE.length} waiting to sign in`)).toBeVisible();
  const vic = personRow(page, 'vic@ukcw.test').locator('summary');
  await expect(vic.getByText('Invited', { exact: true })).toBeVisible();
  await expect(vic.getByText('Viewer', { exact: true })).toBeVisible();

  // The same email can't be invited twice
  await page.fill('#inv-name', 'Olivia Again');
  await page.fill('#inv-email', 'OLIVIA@ukcw.test');
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expect(errorMessage(page, 'olivia@ukcw.test already has an account.')).toBeVisible();
  await expect(page.locator('#inv-name')).toHaveValue('Olivia Again'); // what was typed is kept after an error

  const log = panel(page, 'Access log');
  await expect(log).toContainText('Invited Vic Viewer (vic@ukcw.test) as Viewer');
  await expect(log).toContainText('Invited Olivia Ops (olivia@ukcw.test) as Member');
});

test('when the invite email can’t be sent, the admin gets the details to pass on', async ({ page }) => {
  await asAdmin(page);
  await page.goto('/admin');
  await page.fill('#inv-name', 'Fay Fail');
  await page.fill('#inv-email', 'fail@ukcw.test');
  await page.getByRole('radio', { name: /^Viewer/ }).check();
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expect(okMessage(page, 'Fay Fail’s account is ready. The email wasn’t sent: Resend can only send to its account owner')).toBeVisible();
  const message = page.getByRole('textbox', { name: 'Message with the sign-in details' });
  await expect(message).toBeVisible();
  const text = await message.inputValue();
  expect(text).toContain('Email: fail@ukcw.test');
  const temp = tempPasswordFrom(text);
  await expect(page.getByRole('button', { name: 'Copy message' })).toBeVisible();

  // The list and the attention panel show the problem
  await expect(page.getByText('Fay Fail’s invite email wasn’t sent.')).toBeVisible();
  const row = await openPerson(page, 'fail@ukcw.test');
  await expect(row).toContainText('The last email wasn’t sent: Resend can only send to its account owner');

  // The details work, so the person could sign in with them
  const ctx = await page.context().browser()!.newContext();
  const fay = await ctx.newPage();
  await login(fay, 'fail@ukcw.test', temp);
  await expect(fay).toHaveURL(/\/account\?first=1/);
  await ctx.close();

  // Cancelling an invite is only offered to people who have never signed in
  await page.reload();
  const again = await openPerson(page, 'fail@ukcw.test');
  await expect(again.getByRole('button', { name: 'Cancel invite' })).toHaveCount(0);
  await expect(again.getByRole('button', { name: 'Deactivate' })).toBeVisible();
  await withDb((sql) => sql`delete from users where email = 'fail@ukcw.test'`);
});

test('an invite can be cancelled before it is used', async ({ page }) => {
  await asAdmin(page);
  await page.goto('/admin');
  await page.fill('#inv-name', 'Temp Person');
  await page.fill('#inv-email', 'temp.person@ukcw.test');
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expect(okMessage(page, 'Invite sent to temp.person@ukcw.test.')).toBeVisible();
  const temp = tempPasswordFrom((await latestEmail('temp.person@ukcw.test')).text);
  const row = await openPerson(page, 'temp.person@ukcw.test');
  await expect(row).toContainText(`Invited by ${ADMIN.name}`);
  await expect(row).toContainText('Invite email sent');
  acceptNextDialog(page);
  await row.getByRole('button', { name: 'Cancel invite' }).click();
  await expect(personRow(page, 'temp.person@ukcw.test')).toHaveCount(0);
  await expect(panel(page, 'Access log')).toContainText('Cancelled the invite for Temp Person (temp.person@ukcw.test)');

  await page.context().clearCookies();
  await page.goto('/login');
  await page.fill('#email', 'temp.person@ukcw.test');
  await page.fill('#password', temp);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(errorMessage(page, 'don’t match an account')).toBeVisible();
});

test('new people must choose their own password when they first sign in', async ({ page }) => {
  for (const p of PEOPLE) {
    const temp = user(p.key).password;
    await login(page, p.email, temp);
    await expect(page).toHaveURL(/\/account\?first=1/);
    await expect(page.getByText('Welcome. Choose your own password before you carry on.')).toBeVisible();
    // Other pages stay locked until the password is changed
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/account\?first=1/);
    if (p.key === 'olivia') {
      await page.fill('#current', temp);
      await page.fill('#password', temp);
      await page.fill('#confirm', temp);
      await page.getByRole('button', { name: 'Change password' }).click();
      await expect(errorMessage(page, 'different from the current one')).toBeVisible();
      await page.fill('#current', 'not-the-password');
      await page.fill('#password', 'Olivia-pass-2027');
      await page.fill('#confirm', 'Olivia-pass-2027');
      await page.getByRole('button', { name: 'Change password' }).click();
      await expect(errorMessage(page, 'current password isn’t right')).toBeVisible();
    }
    const next = `${p.name.split(' ')[0]}-pass-2027`;
    await page.fill('#current', temp);
    await page.fill('#password', next);
    await page.fill('#confirm', next);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page).toHaveURL(/\/inbox$/);
    saveUser(p.key, { name: p.name, email: p.email, password: next });
  }
  await asAdmin(page);
  await page.goto('/admin');
  await expect(page.getByText(`${PEOPLE.length + 1} active`)).toBeVisible();
  await expect(panel(page, 'Access log')).toContainText('Olivia Ops: Signed in and chose their own password');
});

test('admin can reset a forgotten password, and the new one is emailed', async ({ page, browser }) => {
  await asAdmin(page);
  await page.goto('/admin');
  const row = await openPerson(page, 'vic@ukcw.test');
  acceptNextDialog(page);
  await row.getByRole('button', { name: 'Reset password' }).click();
  await expect(okMessage(row, 'Vic Viewer’s password has been reset and they’ve been signed out. The new temporary password has been emailed to vic@ukcw.test.')).toBeVisible();
  await expect(row.locator('summary').getByText('Password reset', { exact: true })).toBeVisible();
  const mail = await latestEmail('vic@ukcw.test');
  expect(mail.subject).toBe('Your Event Delivery password has been reset');
  const temp = tempPasswordFrom(mail.text);
  // The details can also be passed on by hand
  await row.getByText('Need to pass the details on yourself?').click();
  await expect(row.getByRole('textbox', { name: 'Message with the sign-in details' })).toHaveValue(new RegExp(temp));

  const ctx = await browser.newContext();
  const vic = await ctx.newPage();
  await vic.goto('/login');
  await vic.fill('#email', 'vic@ukcw.test');
  await vic.fill('#password', user('vic').password);
  await vic.getByRole('button', { name: 'Sign in' }).click();
  await expect(errorMessage(vic, 'don’t match an account')).toBeVisible(); // old password no longer works
  await login(vic, 'vic@ukcw.test', temp);
  await expect(vic).toHaveURL(/\/account\?first=1/);
  await vic.fill('#current', temp);
  await vic.fill('#password', 'Vic-pass-2027b');
  await vic.fill('#confirm', 'Vic-pass-2027b');
  await vic.getByRole('button', { name: 'Change password' }).click();
  await expect(vic).toHaveURL(/\/inbox$/);
  saveUser('vic', { ...user('vic'), password: 'Vic-pass-2027b' });
  await ctx.close();
});

test('sign-off stages: approvers, adding, reordering and removing', async ({ page }) => {
  await asAdmin(page);
  await page.goto('/settings/stages');
  expect(await stageNames(page)).toEqual(['Operations', 'Marketing', 'Sponsor', 'Final sign-off']);

  const stage = (name: string) => panel(page, new RegExp(`^\\d+\\s*${name}$`));
  const sponsorStage = stage('Sponsor');
  await expect(sponsorStage.getByLabel('The sponsor’s account manager approves this stage')).toBeChecked();
  await expect(sponsorStage.getByLabel('Organiser signage')).not.toBeChecked();
  await expect(stage('Operations').getByRole('button', { name: 'Move up' })).toHaveCount(0);
  await expect(stage('Final sign-off').getByRole('button', { name: 'Move down' })).toHaveCount(0);

  for (const [name, person] of [['Operations', 'Olivia Ops'], ['Marketing', 'Mark Marketing'], ['Final sign-off', 'Fiona Final']]) {
    const s = stage(name);
    await s.getByLabel('Approver').selectOption({ label: person });
    await s.getByRole('button', { name: 'Save stage' }).click();
    await expect(okMessage(s, `${name} saved.`)).toBeVisible();
  }

  // A stage must apply to at least one list
  const ops = stage('Operations');
  for (const l of ['Organiser signage', 'Sponsor signage', 'Sponsor items']) await ops.getByLabel(l, { exact: true }).uncheck();
  await ops.getByRole('button', { name: 'Save stage' }).click();
  await expect(errorMessage(ops, 'Tick at least one list')).toBeVisible();
  await page.reload();
  await expect(stage('Operations').getByLabel('Organiser signage')).toBeChecked();
  await expect(stage('Operations').locator('select option:checked')).toHaveText('Olivia Ops');

  await page.fill('#new-stage', 'Health and safety');
  await page.getByRole('button', { name: 'Add stage' }).click();
  await expect(okMessage(page, 'Health and safety added at the end.')).toBeVisible();
  await expect.poll(() => stageNames(page)).toEqual(['Operations', 'Marketing', 'Sponsor', 'Final sign-off', 'Health and safety']);

  await stage('Health and safety').getByRole('button', { name: 'Move up' }).click();
  await expect.poll(() => stageNames(page)).toEqual(['Operations', 'Marketing', 'Sponsor', 'Health and safety', 'Final sign-off']);

  acceptNextDialog(page);
  await stage('Health and safety').getByRole('button', { name: 'Remove' }).click();
  await expect.poll(() => stageNames(page)).toEqual(['Operations', 'Marketing', 'Sponsor', 'Final sign-off']);
});

test('event settings: owners, budget and suggested deadlines', async ({ page }) => {
  await asAdmin(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Still to set up' })).toBeVisible();

  await page.selectOption('#studio_owner_id', { label: 'Pete Production' });
  await page.selectOption('#production_owner_id', { label: 'Pete Production' });
  await page.fill('#budget', '£25,000');
  await page.fill('#build_start', '2027-05-07');
  await page.fill('#show_close', '2027-05-01');
  await page.getByRole('button', { name: 'Save event settings' }).click();
  await expect(errorMessage(page, 'closing day must be on or after the opening day')).toBeVisible();
  await expect(page.locator('#budget')).toHaveValue('£25,000'); // kept after the error

  await page.fill('#show_close', '2027-05-13');
  await page.getByRole('button', { name: 'Save event settings' }).click();
  await expect(okMessage(page, 'Event settings saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Suggest from opening day' }).click();
  await expect(okMessage(page, 'Suggested deadlines filled in and saved.')).toBeVisible();
  await page.reload();
  await expect(page.locator('#budget')).toHaveValue('25000');
  await expect(page.locator('#build_start')).toHaveValue('2027-05-07');
  await expect(page.locator('#studio_owner_id option:checked')).toHaveText('Pete Production');
  await expect(page.locator('#production_owner_id option:checked')).toHaveText('Pete Production');
  await expect(page.getByLabel('Organiser signage artwork due')).toHaveValue('2027-03-30');
  await expect(page.getByLabel('Organiser signage print deadline')).toHaveValue('2027-04-20');
  await expect(page.getByLabel('Sponsor signage artwork due')).toHaveValue('2027-03-16');
  await expect(page.getByLabel('Sponsor items artwork due')).toHaveValue('2027-03-02');
  await expect(page.getByLabel('Sponsor items print deadline')).toHaveValue('2027-03-16');
});

test('suppliers can be added, edited and checked for duplicates', async ({ page }) => {
  await asAdmin(page);
  await page.goto('/settings/suppliers');
  await expect(page.getByText('No suppliers yet')).toBeVisible();
  const add = async (name: string, contact: string, email: string) => {
    await page.fill('#sp-new-name', name);
    await page.fill('#sp-new-contact', contact);
    await page.fill('#sp-new-email', email);
    await page.getByRole('button', { name: 'Add supplier' }).click();
    await expect(okMessage(page, `${name} added.`)).toBeVisible();
  };
  await add('Signs Express', 'Sam Print', 'sam@signsexpress.test');
  await add('Promo Direct', 'Pat Promo', 'pat@promodirect.test');
  await expect(page.getByRole('heading', { name: 'Suppliers (2)' })).toBeVisible();

  await page.fill('#sp-new-name', 'signs express');
  await page.getByRole('button', { name: 'Add supplier' }).click();
  await expect(errorMessage(page, 'signs express is already on the list.')).toBeVisible();

  const promo = page.locator('li').filter({ has: page.locator('input[value="Promo Direct"]') });
  await promo.getByLabel('Phone').fill('0121 496 0000');
  await promo.getByRole('button', { name: 'Save' }).click();
  await expect(okMessage(promo, 'Saved.')).toBeVisible();
  await page.reload();
  await expect(page.locator('li').filter({ has: page.locator('input[value="Promo Direct"]') }).getByLabel('Phone')).toHaveValue('0121 496 0000');
});

test('dropdown lists can be edited', async ({ page }) => {
  await asAdmin(page);
  await page.goto('/settings/lists');
  const zone = page.locator('#list-zone');
  const before = (await zone.inputValue()).split('\n').filter(Boolean);
  expect(before.length).toBeGreaterThan(3);
  await zone.fill([...before, 'Innovation Zone', 'innovation zone', '  '].join('\n'));
  await panel(page, 'Zones and areas').getByRole('button', { name: 'Save list' }).click();
  await expect(okMessage(page, `Saved ${before.length + 1} options.`)).toBeVisible();
  await page.reload();
  await expect(page.locator('#list-zone')).toHaveValue(/Innovation Zone$/);
});

test('sponsors are added with their account managers', async ({ page }) => {
  await asAdmin(page);
  await page.goto('/sponsors');
  await expect(page.getByText('No sponsors yet')).toBeVisible();
  await page.fill('#new-name', 'Acme Steel');
  await page.fill('#new-package', 'Headline partner');
  await page.selectOption('#new-am', { label: 'Amy Account' });
  await page.fill('#new-cname', 'Jo Bloggs');
  await page.fill('#new-cemail', 'jo@acme.test');
  await page.getByRole('button', { name: 'Add sponsor' }).click();
  await expect(okMessage(page, 'Acme Steel added.')).toBeVisible();

  await page.fill('#new-name', 'BuildCo');
  await page.getByRole('button', { name: 'Add sponsor' }).click();
  await expect(okMessage(page, 'BuildCo added.')).toBeVisible();

  await page.fill('#new-name', 'acme steel');
  await page.getByRole('button', { name: 'Add sponsor' }).click();
  await expect(errorMessage(page, 'acme steel is already on the list.')).toBeVisible();

  const table = page.locator('table');
  await expect(table.locator('tr', { hasText: 'Acme Steel' })).toContainText('Amy Account');
  await expect(table.locator('tr', { hasText: 'BuildCo' })).toContainText('Not set');
  expect(Object.keys(readState().users)).toHaveLength(PEOPLE.length);
});

test('the set-up checklist is complete and the admin can edit their details', async ({ page }) => {
  await asAdmin(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Still to set up' })).toHaveCount(0);
  await page.goto('/account');
  await page.fill('#job_title', 'Head of Operations');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(okMessage(page, 'Saved.')).toBeVisible();
  await page.reload();
  await expect(page.locator('#job_title')).toHaveValue('Head of Operations');
});
