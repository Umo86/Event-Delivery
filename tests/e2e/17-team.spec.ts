import { expect, test, type Page } from '@playwright/test';
import { acceptNextDialog, emailToSend, errorMessage, login, loginAs, okMessage, panel, saveUser } from './helpers';

// Show › Team: managers and super admins add people, put them in departments and choose what they approve.
test.describe.configure({ mode: 'serial' });

const SHOW = 'UKCW London 2027';
const addPanel = (page: Page) => panel(page, 'Add someone');
const approversPanel = (page: Page) => panel(page, `Approvers in ${SHOW}`);
const group = (page: Page, name: string | RegExp) => addPanel(page).getByRole('group', { name });

/** A person's row on the Team page. */
function member(page: Page, email: string) {
  return page.locator('li[id^="member-"]').filter({ has: page.locator('summary', { hasText: email }) });
}

async function openMember(page: Page, email: string) {
  const row = member(page, email);
  await expect(row).toHaveCount(1);
  if ((await row.locator('details[open]').count()) === 0) await row.locator('summary').click();
  await expect(row.locator('details[open]')).toHaveCount(1);
  return row;
}

test('managers find the team under Show, with departments and approvers at a glance', async ({ page }) => {
  await loginAs(page, 'pete');
  const show = page.getByRole('navigation', { name: 'Main' }).first();
  await show.getByRole('link', { name: 'Team', exact: true }).click();
  await expect(page).toHaveURL(/\/team$/);
  await expect(page.getByRole('heading', { name: 'Team', level: 1 })).toBeVisible();
  await expect(page.getByText(`Everyone who can sign in, the departments they’re in and what they approve in ${SHOW}.`)).toBeVisible();

  // Managers can add Managers and Users, never Super Admins
  await expect(addPanel(page).getByRole('radio')).toHaveCount(2);
  await expect(addPanel(page).getByRole('radio', { name: /^Manager/ })).toBeChecked();
  await expect(addPanel(page).getByRole('radio', { name: /^Super Admin/ })).toHaveCount(0);

  // Each stage's approvers, and each person's departments and stages, without opening anything
  await expect(approversPanel(page).locator('li').filter({ hasText: /^Operations/ })).toContainText('Olivia Ops');
  await expect(approversPanel(page).locator('li').filter({ hasText: /^Sponsor/ })).toContainText('Each sponsor’s account manager.');
  const mark = member(page, 'mark@ukcw.test').locator('summary');
  await expect(mark).toContainText('Content');
  await expect(mark).toContainText('Marketing');
  await expect(member(page, 'vic@ukcw.test').locator('summary')).toContainText('Not an approver');
  await expect(panel(page, 'Departments').locator('li').filter({ hasText: /^Content/ })).toContainText('Mark Marketing');
});

test('a manager adds someone in a department, as an approver, and gets the invite to send', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/team');
  await page.fill('#inv-name', 'Nina Newman');
  await page.fill('#inv-email', 'nina@ukcw.test');
  await page.fill('#inv-title', 'Marketing Executive');
  await group(page, 'Departments').getByRole('checkbox', { name: 'Marketing' }).check();
  const approver = group(page, `Approver in ${SHOW}`);
  await expect(approver.getByText('alongside Mark Marketing')).toBeVisible();
  await approver.getByRole('checkbox', { name: 'Marketing' }).check();
  await addPanel(page).getByRole('button', { name: 'Create invite' }).click();

  await expect(okMessage(addPanel(page), 'Nina Newman’s account is ready. Now send them the invite below from your own email.')).toBeVisible();
  await expect(okMessage(addPanel(page), `Nina is in Marketing and approves Marketing in ${SHOW}.`)).toBeVisible();
  const mail = await emailToSend(addPanel(page));
  expect(mail.to).toBe('nina@ukcw.test');
  expect(mail.body).toContain('Your access: Manager.');
  expect(mail.body).toContain(`Your department: Marketing. You sign off Marketing in ${SHOW}.`);
  expect(mail.body).toMatch(/Thanks,\nPete$/); // signed by the manager who sends it
  saveUser('nina', { name: 'Nina Newman', email: 'nina@ukcw.test', password: mail.password });
  await expect(page.locator('#inv-name')).toHaveValue(''); // ready for the next person

  // She's on the team, in Marketing, and approves the Marketing stage alongside Mark
  const nina = member(page, 'nina@ukcw.test').locator('summary');
  await expect(nina).toContainText('Invited');
  await expect(nina).toContainText('Marketing Executive');
  await expect(approversPanel(page).locator('li').filter({ hasText: /^Marketing/ })).toContainText('Mark Marketing, Nina Newman');
  await expect(panel(page, 'Departments').locator('li').filter({ hasText: /^Marketing/ })).toContainText('Nina Newman');
  await page.goto('/settings/stages');
  await expect(panel(page, /^\d+\s*Marketing$/).getByRole('checkbox', { name: /^Nina Newman/ })).toBeChecked();
});

test('Users can’t be approvers, and only super admins add Super Admins', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/team');
  const approver = group(page, `Approver in ${SHOW}`);
  await addPanel(page).getByRole('radio', { name: /^User/ }).check();
  await expect(approver.getByRole('checkbox').first()).toBeDisabled();
  await expect(addPanel(page).getByText('Users can’t sign off. Choose Manager to make them an approver.')).toBeVisible();

  await page.fill('#inv-name', 'Uma Underwood');
  await page.fill('#inv-email', 'uma@ukcw.test');
  await group(page, 'Departments').getByRole('checkbox', { name: 'Sales' }).check();
  await addPanel(page).getByRole('button', { name: 'Create invite' }).click();
  await expect(okMessage(addPanel(page), 'Uma Underwood’s account is ready.')).toBeVisible();
  await expect(okMessage(addPanel(page), 'Uma is in Sales.')).toBeVisible();
  expect((await emailToSend(addPanel(page))).body).toContain('Your access: User.');
  // The form goes back to Manager for the next person, with the approver choices open again
  await expect(addPanel(page).getByRole('radio', { name: /^Manager/ })).toBeChecked();
  await expect(approver.getByRole('checkbox').first()).toBeEnabled();
  await addPanel(page).getByRole('button', { name: 'Done' }).click();

  // The server refuses a Super Admin from a manager, even if the form is tampered with
  await page.fill('#inv-name', 'Sneaky Super');
  await page.fill('#inv-email', 'sneaky@ukcw.test');
  const user = addPanel(page).getByRole('radio', { name: /^User/ });
  await user.evaluate((el) => ((el as HTMLInputElement).value = 'super_admin'));
  await user.check();
  await addPanel(page).getByRole('button', { name: 'Create invite' }).click();
  await expect(errorMessage(addPanel(page), 'Only a super admin can add a Super Admin.')).toBeVisible();
  await expect(member(page, 'sneaky@ukcw.test')).toHaveCount(0);
});

test('a manager changes someone’s access, departments and approvals from their row', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/team');
  let uma = await openMember(page, 'uma@ukcw.test');
  await expect(uma).toContainText('Users can’t sign off. Give Uma Manager access to make them an approver.');
  // Managers can choose Manager or User, not Super Admin
  await expect(uma.getByLabel('Access level', { exact: true }).locator('option')).toHaveText(['Manager', 'User']);
  await uma.getByLabel('Access level', { exact: true }).selectOption('manager');
  await uma.getByRole('button', { name: 'Save access' }).click();
  await expect(okMessage(uma, 'Uma Underwood is now a Manager.')).toBeVisible();

  // Now she can approve
  const approves = uma.getByRole('region', { name: `Approver in ${SHOW} for Uma Underwood` });
  await approves.getByRole('checkbox', { name: 'Operations' }).check();
  await approves.getByRole('button', { name: 'Save approvals' }).click();
  await expect(okMessage(approves, 'Saved. Uma now approves Operations.')).toBeVisible();
  await expect(approversPanel(page).locator('li').filter({ hasText: /^Operations/ })).toContainText('Olivia Ops, Uma Underwood');

  const depts = uma.getByRole('region', { name: 'Departments for Uma Underwood' });
  await depts.getByRole('checkbox', { name: 'Operations' }).check();
  await depts.getByRole('button', { name: 'Save departments' }).click();
  await expect(okMessage(depts, 'Saved. Uma is in Operations and Sales.')).toBeVisible();
  await expect(member(page, 'uma@ukcw.test').locator('summary')).toContainText('Operations, Sales');

  // A tampered request can't make her a Super Admin
  await uma.getByLabel('Access level', { exact: true }).evaluate((el) => {
    const o = document.createElement('option');
    o.value = 'super_admin';
    o.textContent = 'Super Admin';
    el.appendChild(o);
  });
  await uma.getByLabel('Access level', { exact: true }).selectOption('super_admin');
  await uma.getByRole('button', { name: 'Save access' }).click();
  await expect(errorMessage(uma, 'Only a super admin can make someone a Super Admin.')).toBeVisible();

  // Back to User: she's flagged until she's taken off the stage
  await page.reload();
  uma = await openMember(page, 'uma@ukcw.test');
  await uma.getByLabel('Access level', { exact: true }).selectOption('user');
  await uma.getByRole('button', { name: 'Save access' }).click();
  await expect(okMessage(uma, 'Uma Underwood is now a User. They still look after Operations stage, but users can’t sign off, so choose someone else.')).toBeVisible();
  await expect(member(page, 'uma@ukcw.test').locator('summary')).toContainText('can’t sign off as a User');
  await expect(approversPanel(page).locator('li').filter({ hasText: /^Operations/ })).toContainText('Uma Underwood (a User, so can’t sign off)');
  await uma.getByRole('button', { name: 'Take Uma off that stage' }).click();
  await expect(okMessage(uma, 'Saved. Uma no longer approves Operations.')).toBeVisible();
  await expect(approversPanel(page).locator('li').filter({ hasText: /^Operations/ })).not.toContainText('Uma Underwood');
});

test('managers handle invites nobody has used yet, but super admins stay out of reach', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/team');
  // A new invite replaces the old temporary password, and still says what she approves
  const nina = await openMember(page, 'nina@ukcw.test');
  await nina.getByRole('button', { name: 'New invite' }).click();
  await expect(okMessage(nina, 'New invite for Nina Newman. The old temporary password no longer works.')).toBeVisible();
  const mail = await emailToSend(nina);
  expect(mail.body).toContain(`You sign off Marketing in ${SHOW}.`);
  saveUser('nina', { name: 'Nina Newman', email: 'nina@ukcw.test', password: mail.password });

  const uma = await openMember(page, 'uma@ukcw.test');
  acceptNextDialog(page);
  await uma.getByRole('button', { name: 'Cancel invite' }).click();
  await expect(member(page, 'uma@ukcw.test')).toHaveCount(0);

  // Someone who has signed in gets a password reset rather than a new invite; super admins can't be changed at all
  const vic = await openMember(page, 'vic@ukcw.test');
  await expect(vic.getByRole('button', { name: 'New invite' })).toHaveCount(0);
  await expect(vic.getByRole('button', { name: 'Reset password' })).toBeVisible();
  const admin = await openMember(page, 'admin@ukcw.test');
  await expect(admin).toContainText('Only a super admin can change a super admin’s access.');
  await expect(admin).toContainText('Umit is a super admin, so only a super admin can change their sign-in or details.');
  await expect(admin.getByRole('region', { name: `Details for ${'Umit Admin'}` })).toContainText('Only a super admin can change these.');
  for (const name of ['Save access', 'Reset password', 'Set password', 'Deactivate', 'Save details']) {
    await expect(admin.getByRole('button', { name })).toHaveCount(0);
  }
  const me = await openMember(page, 'pete@ukcw.test');
  await expect(me.locator('summary')).toContainText('Pete Production (you)');
  await expect(me).toContainText('You can’t change your own access level. Ask a super admin.');
});

test('managers change people’s details and passwords, and deactivate and reactivate them', async ({ browser, page }) => {
  await loginAs(page, 'pete');
  await page.goto('/team');
  await page.fill('#inv-name', 'Dan Driver');
  await page.fill('#inv-email', 'dan@ukcw.test');
  await addPanel(page).getByRole('radio', { name: /^User/ }).check();
  await addPanel(page).getByRole('button', { name: 'Create invite' }).click();
  await expect(okMessage(addPanel(page), 'Dan Driver’s account is ready.')).toBeVisible();

  // A password the manager types, which Dan can keep
  let dan = await openMember(page, 'dan@ukcw.test');
  const signIn = dan.getByRole('region', { name: 'Sign-in for Dan Driver' });
  await signIn.getByRole('button', { name: /^Set a password yourself/ }).click();
  const password = signIn.getByLabel('New password for Dan');
  await password.fill('short');
  await signIn.getByLabel('Ask Dan to choose their own password when they next sign in').uncheck();
  await signIn.getByRole('button', { name: 'Set password' }).click();
  expect(await password.evaluate((el) => (el as HTMLInputElement).validity.tooShort)).toBe(true); // the browser asks for 8 or more
  await password.fill('Dan-pass-2028');
  await signIn.getByRole('button', { name: 'Set password' }).click();
  await expect(okMessage(signIn, 'Dan’s password is set and they’ve been signed out. Tell them the new password: they can keep using it.')).toBeVisible();

  const danCtx = await browser.newContext();
  const danPage = await danCtx.newPage();
  await login(danPage, 'dan@ukcw.test', 'Dan-pass-2028');
  await expect(danPage).toHaveURL(/\/dashboard$/); // straight in, no forced change

  // Name, job title and sign-in email
  await page.reload();
  dan = await openMember(page, 'dan@ukcw.test');
  const details = dan.getByRole('region', { name: 'Details for Dan Driver' });
  await details.getByLabel('Name', { exact: true }).fill('Dan Driver-Smith');
  await details.getByLabel('Job title', { exact: true }).fill('Logistics');
  await details.getByLabel('Email (used to sign in)').fill('dan.smith@ukcw.test');
  await details.getByRole('button', { name: 'Save details' }).click();
  // The row now goes by the new name and email, and keeps the message
  await expect(okMessage(member(page, 'dan.smith@ukcw.test').getByRole('region', { name: 'Details for Dan Driver-Smith' }), 'Saved.')).toBeVisible();
  await expect(member(page, 'dan.smith@ukcw.test').locator('summary')).toContainText('Dan Driver-Smith');
  await expect(member(page, 'dan.smith@ukcw.test').locator('summary')).toContainText('Logistics');

  // Deactivating signs him out straight away and moves him to the end of the list
  dan = await openMember(page, 'dan.smith@ukcw.test');
  acceptNextDialog(page);
  await dan.getByRole('button', { name: 'Deactivate' }).click();
  await expect(okMessage(dan, 'Dan Driver-Smith can no longer sign in and has been signed out.')).toBeVisible();
  await expect(dan.locator('summary').getByText('Deactivated', { exact: true })).toBeVisible();
  await expect(page.getByText('Deactivated: they can’t sign in until they’re reactivated')).toBeVisible();
  await danPage.reload();
  await expect(danPage).toHaveURL(/\/login/);

  await dan.getByRole('button', { name: 'Reactivate' }).click();
  await expect(okMessage(dan, 'Dan Driver-Smith can sign in again.')).toBeVisible();
  await login(danPage, 'dan.smith@ukcw.test', 'Dan-pass-2028');
  await expect(danPage).toHaveURL(/\/dashboard$/);

  // A reset gives a temporary password to send him
  acceptNextDialog(page);
  await dan.getByRole('button', { name: 'Reset password' }).click();
  await expect(okMessage(dan, 'Dan Driver-Smith’s password has been reset and they’ve been signed out.')).toBeVisible();
  expect((await emailToSend(dan)).subject).toBe('Your Event Delivery password has been reset');
  await danPage.reload();
  await expect(danPage).toHaveURL(/\/login/);
  await danCtx.close();

  // Managers can't lock themselves out
  const me = await openMember(page, 'pete@ukcw.test');
  await expect(me).toContainText('This is you.');
  await expect(me.getByRole('button', { name: 'Deactivate' })).toHaveCount(0);
  await expect(me.getByRole('button', { name: 'Reset password' })).toHaveCount(0);
  await expect(me.getByRole('region', { name: 'Details for Pete Production' }).getByRole('button', { name: 'Save details' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('team-account.png'), fullPage: true });

  // Tidy up
  acceptNextDialog(page);
  await (await openMember(page, 'dan.smith@ukcw.test')).getByRole('button', { name: 'Deactivate' }).click();
  await expect(member(page, 'dan.smith@ukcw.test').locator('summary').getByText('Deactivated', { exact: true })).toBeVisible();
});

test('super admins can add Super Admins from Team, and every change is in the access log', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/team');
  await expect(addPanel(page).getByRole('radio')).toHaveCount(3);
  await expect(addPanel(page).getByRole('radio', { name: /^Super Admin/ })).toBeVisible();
  const nina = await openMember(page, 'nina@ukcw.test');
  await expect(nina.getByRole('link', { name: 'Admin › People' })).toHaveAttribute('href', /\/admin\?person=/);
  await page.screenshot({ path: test.info().outputPath('team.png'), fullPage: true });

  await page.goto('/admin');
  const log = panel(page, 'Access log');
  await expect(log).toContainText(`Invited Nina Newman (nina@ukcw.test) as Manager, in Marketing, approving Marketing in ${SHOW}`);
  await expect(log).toContainText('Invited Uma Underwood (uma@ukcw.test) as User, in Sales');
  await expect(log).toContainText(`Uma Underwood now approves Operations in ${SHOW}`);
  await expect(log).toContainText('Changed Uma Underwood from User to Manager');
  await expect(log).toContainText('Cancelled the invite for Uma Underwood (uma@ukcw.test)');
  await expect(log).toContainText('Set a new password for Dan Driver that they can keep');
  await expect(log).toContainText('Changed Dan Driver-Smith’s sign-in email from dan@ukcw.test to dan.smith@ukcw.test');
  await expect(log).toContainText('Deactivated Dan Driver-Smith');
  await expect(log).toContainText('Reset the password for Dan Driver-Smith');

  // Tidy up: cancelling Nina leaves Marketing with Mark, so nothing needs a new approver
  await page.goto('/team');
  const row = await openMember(page, 'nina@ukcw.test');
  acceptNextDialog(page);
  await row.getByRole('button', { name: 'Cancel invite' }).click();
  await expect(member(page, 'nina@ukcw.test')).toHaveCount(0);
  await expect(approversPanel(page).locator('li').filter({ hasText: /^Marketing/ })).toContainText('Mark Marketing');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the team page fits a phone', async ({ page }) => {
    await loginAs(page, 'pete');
    await page.goto('/team');
    await expect(page.getByRole('heading', { name: 'Team', level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await openMember(page, 'mark@ukcw.test');
    await page.screenshot({ path: test.info().outputPath('team-phone.png'), fullPage: true });
  });
});
