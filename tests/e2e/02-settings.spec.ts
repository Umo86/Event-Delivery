import { expect, test, type Page } from '@playwright/test';
import {
  ADMIN, acceptNextDialog, emailToSend, errorMessage, login, okMessage, openPerson, panel, personRow, readState, saveUser, user,
} from './helpers';

test.describe.configure({ mode: 'serial' });

const PEOPLE = [
  { key: 'olivia', name: 'Olivia Ops', email: 'olivia@ukcw.test', title: 'Operations Manager', role: 'manager' },
  { key: 'mark', name: 'Mark Marketing', email: 'mark@ukcw.test', title: 'Marketing Manager', role: 'manager' },
  { key: 'amy', name: 'Amy Account', email: 'amy@ukcw.test', title: 'Account Manager', role: 'manager' },
  { key: 'fiona', name: 'Fiona Final', email: 'fiona@ukcw.test', title: 'Event Director', role: 'manager' },
  { key: 'pete', name: 'Pete Production', email: 'pete@ukcw.test', title: 'Production Manager', role: 'manager' },
  { key: 'vic', name: 'Vic Viewer', email: 'vic@ukcw.test', title: 'Finance', role: 'user' },
] as const;

const asAdmin = (page: Page) => login(page, ADMIN.email, ADMIN.password);

async function stageNames(page: Page) {
  const titles = await page.locator('section > div > h2').allInnerTexts();
  return titles.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => /^\d/.test(t)).map((t) => t.replace(/^\d+\s*/, ''));
}

test('admin invites the team and gets a ready-made email to send each person', async ({ page }) => {
  await asAdmin(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
  const invitePanel = panel(page, 'Invite someone');
  for (const p of PEOPLE) {
    const level = p.role === 'user' ? 'User' : 'Manager';
    await page.fill('#inv-name', p.name);
    await page.fill('#inv-email', p.email);
    await page.fill('#inv-title', p.title);
    await page.getByRole('radio', { name: new RegExp(`^${level}`) }).check();
    await page.getByRole('button', { name: 'Create invite' }).click();
    await expect(okMessage(page, `${p.name}’s account is ready. Now send them the invite below from your own email.`)).toBeVisible();
    const mail = await emailToSend(invitePanel);
    expect(mail.to).toBe(p.email);
    expect(mail.subject).toBe('Your Event Delivery invitation');
    expect(mail.body).toContain(`Hello ${p.name.split(' ')[0]},`);
    expect(mail.body).toContain('Sign in here: http://127.0.0.1:3100/login');
    expect(mail.body).toContain(`Email: ${p.email}`);
    expect(mail.body).toContain('you’ll be asked to choose your own password');
    expect(mail.body).toContain(`Your access: ${level}.`);
    expect(mail.body).toMatch(/Thanks,\nUmit$/); // signed by the admin who sends it
    expect(mail.password).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d{4}$/);
    // One click opens it, already filled in, in the admin's own email app
    expect(mail.mailto).toBe(`mailto:${p.email}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body.replace(/\n/g, '\r\n'))}`);
    saveUser(p.key, { name: p.name, email: p.email, password: mail.password });
    await expect(page.locator('#inv-name')).toHaveValue(''); // the form clears for the next person
  }
  await expect(page.getByRole('heading', { name: `People (${PEOPLE.length + 1})` })).toBeVisible();
  await expect(page.getByText(`1 active, ${PEOPLE.length} waiting to sign in`)).toBeVisible();
  const vic = personRow(page, 'vic@ukcw.test').locator('summary');
  await expect(vic.getByText('Invited', { exact: true })).toBeVisible();
  await expect(vic.getByText('User', { exact: true })).toBeVisible();

  // The same email can't be invited twice
  await page.fill('#inv-name', 'Olivia Again');
  await page.fill('#inv-email', 'OLIVIA@ukcw.test');
  await page.getByRole('button', { name: 'Create invite' }).click();
  await expect(errorMessage(page, 'olivia@ukcw.test already has an account.')).toBeVisible();
  await expect(page.locator('#inv-name')).toHaveValue('Olivia Again'); // what was typed is kept after an error

  const log = panel(page, 'Access log');
  await expect(log).toContainText('Invited Vic Viewer (vic@ukcw.test) as User');
  await expect(log).toContainText('Invited Olivia Ops (olivia@ukcw.test) as Manager');
});

test('an invite can be cancelled before it is used, and its password is never shown again', async ({ page }) => {
  await asAdmin(page);
  await page.goto('/admin');
  await page.fill('#inv-name', 'Temp Person');
  await page.fill('#inv-email', 'temp.person@ukcw.test');
  await page.getByRole('button', { name: 'Create invite' }).click();
  const invitePanel = panel(page, 'Invite someone');
  const temp = (await emailToSend(invitePanel)).password;
  await invitePanel.getByRole('button', { name: 'Done' }).click();
  await expect(invitePanel.getByRole('region', { name: 'Email to send' })).toHaveCount(0);

  const row = await openPerson(page, 'temp.person@ukcw.test');
  await expect(row).toContainText(`Invited by ${ADMIN.name}`);
  await expect(row).toContainText('Their temporary password works until');
  await expect(page.getByText(temp)).toHaveCount(0); // only a hash is kept, so it can't be shown again
  acceptNextDialog(page);
  await row.getByRole('button', { name: 'Cancel invite' }).click();
  await expect(personRow(page, 'temp.person@ukcw.test')).toHaveCount(0);
  await expect(panel(page, 'Access log')).toContainText('Cancelled the invite for Temp Person (temp.person@ukcw.test)');

  await page.context().clearCookies();
  await page.goto('/login');
  await page.fill('#email', 'temp.person@ukcw.test');
  await page.fill('#password', temp);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
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
    await expect(page).toHaveURL(/\/dashboard$/);
    saveUser(p.key, { name: p.name, email: p.email, password: next });
  }
  await asAdmin(page);
  await page.goto('/admin');
  await expect(page.getByText(`${PEOPLE.length + 1} active`)).toBeVisible();
  await expect(panel(page, 'Access log')).toContainText('Olivia Ops: Signed in and chose their own password');
});

test('admin can reset a forgotten password and send the new one', async ({ page, browser }) => {
  await asAdmin(page);
  await page.goto('/admin');
  const row = await openPerson(page, 'vic@ukcw.test');
  acceptNextDialog(page);
  await row.getByRole('button', { name: 'Reset password' }).click();
  await expect(okMessage(row, 'Vic Viewer’s password has been reset and they’ve been signed out. Send them the new temporary password below.')).toBeVisible();
  await expect(row.locator('summary').getByText('Temporary password', { exact: true })).toBeVisible();
  const mail = await emailToSend(row);
  expect(mail.to).toBe('vic@ukcw.test');
  expect(mail.subject).toBe('Your Event Delivery password has been reset');
  expect(mail.body).toContain('I’ve reset your Event Delivery password.');
  const temp = mail.password;

  const ctx = await browser.newContext();
  const vic = await ctx.newPage();
  await vic.goto('/login');
  await vic.fill('#email', 'vic@ukcw.test');
  await vic.fill('#password', user('vic').password);
  await vic.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(errorMessage(vic, 'don’t match an account')).toBeVisible(); // old password no longer works
  await login(vic, 'vic@ukcw.test', temp);
  await expect(vic).toHaveURL(/\/account\?first=1/);
  await vic.fill('#current', temp);
  await vic.fill('#password', 'Vic-pass-2027b');
  await vic.fill('#confirm', 'Vic-pass-2027b');
  await vic.getByRole('button', { name: 'Change password' }).click();
  await expect(vic).toHaveURL(/\/dashboard$/);
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

  // Each stage draws its approvers from a department; tick one or more (any can sign off)
  for (const [name, person] of [['Operations', 'Olivia Ops'], ['Marketing', 'Mark Marketing'], ['Final sign-off', 'Fiona Final']]) {
    const s = stage(name);
    await s.getByRole('checkbox', { name: person }).check();
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
  await expect(stage('Operations').getByRole('checkbox', { name: 'Olivia Ops' })).toBeChecked();

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

test('suppliers are added with their scope of work, and edited', async ({ page }) => {
  await asAdmin(page);
  await page.goto('/suppliers');
  await expect(page.getByText('No suppliers yet')).toBeVisible();
  const add = panel(page, 'Add a supplier');

  await page.fill('#sp-new-name', 'Signs Express');
  await page.fill('#sp-new-contact', 'Sam Print');
  await page.fill('#sp-new-email', 'sam@signsexpress.test');
  await add.getByLabel('Sponsor items').uncheck();
  await page.fill('#sp-new-scope', 'Print and install all hall entrance and hanging banners.\nRemove everything at breakdown.');
  await page.fill('#sp-new-link', 'https://sharepoint.example/sow/signs-express.pdf');
  await page.getByRole('button', { name: 'Add supplier' }).click();
  await expect(okMessage(page, 'Signs Express added.')).toBeVisible();
  await expect(add.getByLabel('Sponsor items')).toBeChecked(); // the form resets for the next supplier

  await page.fill('#sp-new-name', 'Promo Direct');
  await page.fill('#sp-new-contact', 'Pat Promo');
  await page.fill('#sp-new-email', 'pat@promodirect.test');
  await add.getByLabel('Organiser signage').uncheck();
  await add.getByLabel('Sponsor signage').uncheck();
  await page.fill('#sp-new-scope', 'Supply branded lanyards and show bags.');
  await page.getByRole('button', { name: 'Add supplier' }).click();
  await expect(okMessage(page, 'Promo Direct added.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Suppliers (2)' })).toBeVisible();

  // Each supplier shows what it's contracted to do and which lists it works on
  const signs = page.locator('li[id^="supplier-"]').filter({ hasText: 'Signs Express' });
  await expect(signs).toContainText('Print and install all hall entrance and hanging banners.');
  await expect(signs.getByRole('list', { name: 'Works on' }).getByRole('listitem')).toHaveText(['Organiser signage', 'Sponsor signage']);
  await expect(signs.getByRole('link', { name: 'Signed scope of work' })).toHaveAttribute('href', 'https://sharepoint.example/sow/signs-express.pdf');
  await expect(page.locator('li[id^="supplier-"]').filter({ hasText: 'Promo Direct' }).getByRole('list', { name: 'Works on' }).getByRole('listitem'))
    .toHaveText(['Sponsor items']);

  // A supplier must work on at least one list, and names can't be used twice
  await page.fill('#sp-new-name', 'signs express');
  for (const l of ['Organiser signage', 'Sponsor signage', 'Sponsor items']) await add.getByLabel(l).uncheck();
  await page.getByRole('button', { name: 'Add supplier' }).click();
  await expect(errorMessage(page, 'Tick at least one list they work on.')).toBeVisible();
  await add.getByLabel('Sponsor items').check();
  await page.getByRole('button', { name: 'Add supplier' }).click();
  await expect(errorMessage(page, 'signs express is already on the list.')).toBeVisible();

  // Editing: open a supplier's edit panel
  const promo = page.locator('li[id^="supplier-"]').filter({ hasText: 'Promo Direct' });
  await promo.locator('summary', { hasText: 'Edit' }).click();
  await promo.getByLabel('Phone').fill('0121 496 0000');
  await promo.getByLabel('Scope of work', { exact: true }).fill('Supply branded lanyards, show bags and water bottles.');
  await promo.getByRole('button', { name: 'Save' }).click();
  await expect(okMessage(promo, 'Saved.')).toBeVisible();
  await page.reload();
  const saved = page.locator('li[id^="supplier-"]').filter({ hasText: 'Promo Direct' });
  await expect(saved).toContainText('Supply branded lanyards, show bags and water bottles.');
  await expect(saved).toContainText('Pat Promo, 0121 496 0000');
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
