import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  acceptNextDialog, asUser, decide, errorMessage, expectImagesLoaded, expectStatus, idFromUrl, itemId, loginAs, makePdf,
  makePng, okMessage, panel, saveItem, signoffStage, uploadArtwork, user, waitingOn,
} from './helpers';

test.describe.configure({ mode: 'serial' });

/** Signs in as someone in a separate browser, opens a line and records a decision. */
async function decideAs(browser: Browser, who: string, item: string, stage: string,
  decision: Parameters<typeof decide>[2], comment?: string) {
  const { ctx, page } = await asUser(browser, who);
  await page.goto(`/items/${itemId(item)}`);
  await decide(page, stage, decision, comment);
  if (decision === 'Approve') await expect(signoffStage(page, stage)).toContainText(`Approved by ${user(who).name}`);
  else await expect(signoffStage(page, stage)).toContainText(comment ?? '');
  await ctx.close();
}

const versionIdFromPage = async (page: Page) =>
  (await page.getByRole('link', { name: 'Open', exact: true }).getAttribute('href'))!.split('/')[3];

test('uploading artwork starts sign-off, with a preview and thumbnail', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto(`/items/${itemId('os1')}`);
  await expect(page.getByText('Upload the artwork: drop a file here or')).toBeVisible();

  await page.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByText('Upload a PDF, PNG, JPG, WebP or GIF file.')).toBeVisible();

  await uploadArtwork(page, { name: 'OS-001 banner v1.png', mimeType: 'image/png', buffer: makePng(1200, 400) });
  await expectStatus(page, 'Artworked · with Operations');
  await expect(waitingOn(page)).toContainText('Olivia Ops');
  await expectImagesLoaded(page, 'img[alt="Artwork v1 for OS-001"]');
  await expect(signoffStage(page, 'Operations')).toContainText('Only Olivia Ops or a super admin can record this stage.');
  await expect(signoffStage(page, 'Sponsor')).toContainText('Not used for organiser signage.');
  await expect(signoffStage(page, 'Marketing')).toContainText('Opens when the stages before it approve.');

  await page.goto('/schedule/os');
  await expectImagesLoaded(page, 'table img');
});

test('each approver signs off in turn and can ask for changes', async ({ browser }) => {
  const olivia = await asUser(browser, 'olivia');
  await olivia.page.goto('/inbox');
  await expect(olivia.page.getByRole('region', { name: 'To do' })).toContainText('Hall S1 entrance banner');
  await olivia.page.getByRole('link', { name: /Hall S1 entrance banner/ }).first().click();
  await expect(olivia.page).toHaveURL(new RegExp(`/items/${itemId('os1')}`));
  await decide(olivia.page, 'Operations', 'Approve');
  await expect(signoffStage(olivia.page, 'Operations')).toContainText('Approved by Olivia Ops');
  await expectStatus(olivia.page, 'Artworked · with Marketing');
  // Olivia can reopen her own stage, but not decide Marketing
  await expect(signoffStage(olivia.page, 'Operations').getByRole('button', { name: 'Change this decision' })).toBeVisible();
  await expect(signoffStage(olivia.page, 'Marketing')).toContainText('Only Mark Marketing or a super admin can record this stage.');
  await olivia.ctx.close();

  const mark = await asUser(browser, 'mark');
  await mark.page.goto(`/items/${itemId('os1')}`);
  await expect(waitingOn(mark.page)).toContainText('Mark Marketing');
  await decide(mark.page, 'Marketing', 'Request changes');
  await expect(errorMessage(signoffStage(mark.page, 'Marketing'), 'Add a comment so the team knows what needs to happen.')).toBeVisible();
  await decide(mark.page, 'Marketing', 'Request changes', 'Make the UKCW logo bigger');
  await expectStatus(mark.page, 'Changes requested · Marketing');
  await expect(waitingOn(mark.page)).toContainText('Pete Production');
  await expect(signoffStage(mark.page, 'Marketing')).toContainText('Make the UKCW logo bigger');
  await expect(signoffStage(mark.page, 'Final sign-off')).toContainText('Opens when the stages before it approve.');
  await mark.ctx.close();
});

test('a new version (PDF) restarts sign-off and keeps older versions', async ({ page }) => {
  await loginAs(page, 'pete');
  await page.goto('/inbox');
  await expect(page.getByRole('region', { name: 'To do' })).toBeVisible();
  await page.goto(`/items/${itemId('os1')}`);
  await expect(page.getByText('Upload a revised version')).toBeVisible();
  await uploadArtwork(page, { name: 'OS-001 banner v2.pdf', mimeType: 'application/pdf', buffer: makePdf('UKCW S1') }, 'Logo enlarged');
  await expectStatus(page, 'Artworked · with Operations · v2');
  // The PDF is turned into a preview image in the browser
  await expectImagesLoaded(page, 'img[alt="Artwork v2 for OS-001"]');
  await expect(page.getByText('“Logo enlarged”')).toBeVisible();
  await expect(page.getByText(/OS-001 banner v2\.pdf, \d+ KB, 2 pages/)).toBeVisible();
  await expect(signoffStage(page, 'Operations')).toContainText('Waiting for a decision');
  await expect(signoffStage(page, 'Marketing')).not.toContainText('Make the UKCW logo bigger');

  await page.getByRole('link', { name: 'v1', exact: true }).click();
  await expect(page.getByText('Older version')).toBeVisible();
  await expectImagesLoaded(page, 'img[alt="Artwork v1 for OS-001"]');
  await page.getByRole('link', { name: 'v2 (current)' }).click();
  await expect(page.getByText('Older version')).toHaveCount(0);
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: 'Comments and history' }) }))
    .toContainText('Uploaded artwork v2 (OS-001 banner v2.pdf) – Logo enlarged. Sign-off restarts from the first stage.');
});

test('every stage approves, then production moves the line on', async ({ browser, page }) => {
  await decideAs(browser, 'olivia', 'os1', 'Operations', 'Approve');
  await decideAs(browser, 'mark', 'os1', 'Marketing', 'Approve');

  const fiona = await asUser(browser, 'fiona');
  await fiona.page.goto('/inbox');
  await expect(fiona.page.getByRole('region', { name: 'To do' })).toContainText('Hall S1 entrance banner');
  await fiona.page.goto(`/items/${itemId('os1')}`);
  await decide(fiona.page, 'Final sign-off', 'Approve');
  await expectStatus(fiona.page, 'Approved – ready to send');
  await fiona.page.goto('/inbox');
  await expect(fiona.page.getByText('You’re all caught up')).toBeVisible();
  await fiona.ctx.close();

  await loginAs(page, 'pete');
  await page.goto(`/items/${itemId('os1')}`);
  await expect(waitingOn(page)).toContainText('Pete Production');
  const prod = panel(page, /^Production$/);
  await prod.getByLabel('Status').selectOption({ label: 'Sent' });
  await prod.getByLabel('PO number').fill('PO-1001');
  await prod.getByLabel('Delivery to venue').fill('2027-05-06');
  await prod.getByRole('button', { name: 'Save production' }).click();
  await expectStatus(page, 'Sent');
  await expect(prod.getByLabel('PO number')).toHaveValue('PO-1001');
  await prod.getByLabel('Status').selectOption({ label: 'Installed' });
  await prod.getByRole('button', { name: 'Save production' }).click();
  await expectStatus(page, 'Installed');
  await expect(waitingOn(page)).toContainText('Nobody');
  await prod.getByLabel('PO number').fill('PO-1001A');
  await prod.getByRole('button', { name: 'Save production' }).click();
  await expect(okMessage(prod, 'Production updated.')).toBeVisible();
});

test('reopening a decision after production started raises a warning', async ({ browser, page }) => {
  await loginAs(page, 'admin');
  await page.goto(`/items/${itemId('os1')}`);
  await decide(page, 'Final sign-off', 'Request changes', 'Hall number is wrong on the proof');
  await expectStatus(page, 'Changes requested · Final sign-off');
  await expect(page.locator('main header').getByText('Not signed off')).toBeVisible();
  await expect(page.getByText('Production has started but this artwork isn’t fully signed off.')).toBeVisible();

  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: /Overdue or not signed off/ })).toContainText('2');

  await decideAs(browser, 'fiona', 'os1', 'Final sign-off', 'Approve');
  await page.goto(`/items/${itemId('os1')}`);
  await expectStatus(page, 'Installed');
  await expect(page.locator('main header').getByText('Not signed off')).toHaveCount(0);
});

test('artwork files open and download for signed-in people only', async ({ page, request }) => {
  await loginAs(page, 'vic');
  await page.goto(`/items/${itemId('os1')}`);
  const href = (await page.getByRole('link', { name: 'Open', exact: true }).getAttribute('href'))!;
  const res = await page.request.get(href);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/pdf');
  expect(res.headers()['content-disposition']).toContain('inline; filename="OS-001 banner v2.pdf"');
  expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).click()]);
  expect(download.suggestedFilename()).toBe('OS-001 banner v2.pdf');

  const anon = await request.get(href);
  expect(anon.status()).toBe(404);
  const thumb = await page.request.get(href.replace('/original', '/thumb'));
  expect(thumb.headers()['content-type']).toBe('image/jpeg');
});

test('admins can record on behalf of others; holds and rejections', async ({ browser, page }) => {
  await loginAs(page, 'admin');
  await page.goto(`/items/${itemId('os2')}`);
  await expect(signoffStage(page, 'Operations')).toContainText('You’re recording this as a super admin on behalf of Olivia Ops.');
  await decide(page, 'Operations', 'Put on hold', 'Waiting for the final floorplan');
  await expectStatus(page, 'On hold · Operations');
  await expect(waitingOn(page)).toContainText('Olivia Ops');
  await expect(signoffStage(page, 'Operations')).toContainText('On hold by Umit Admin');

  await decideAs(browser, 'olivia', 'os2', 'Operations', 'Approve');
  await decideAs(browser, 'mark', 'os2', 'Marketing', 'Reject', 'Wrong location, totem not needed here');
  await page.reload();
  await expectStatus(page, 'Rejected · Marketing');
  await expect(waitingOn(page)).toContainText('Pete Production');
  await expect(page.getByText('Upload new artwork (rejected by Marketing)', { exact: true })).toBeVisible();
});

test('comments, cancelling and restoring a line', async ({ browser, page }) => {
  const vic = await asUser(browser, 'vic');
  await vic.page.goto(`/items/${itemId('os2')}`);
  await vic.page.fill('#comment', 'Can we reuse last year’s totem?');
  await vic.page.getByRole('button', { name: 'Post comment' }).click();
  const history = panel(vic.page, 'Comments and history');
  await expect(history.locator('li').first()).toContainText('Can we reuse last year’s totem?');
  await expect(history.locator('li').first()).toContainText('Vic Viewer');
  await expect(vic.page.locator('#comment')).toHaveValue('');
  await vic.ctx.close();

  await loginAs(page, 'pete');
  await page.goto(`/items/${itemId('os2')}`);
  acceptNextDialog(page);
  await page.getByRole('button', { name: 'Cancel line' }).click();
  await expect(page.getByText('This line is cancelled. It’s left out of every count and list.')).toBeVisible();
  await expectStatus(page, 'Cancelled');

  await page.goto('/schedule/os');
  await expect(page.locator('table tbody tr[data-line]')).toHaveCount(1);
  await page.getByLabel('Show cancelled').check();
  await expect(page.locator('table tbody tr[data-line]')).toHaveCount(2);

  await page.goto(`/items/${itemId('os2')}`);
  await page.getByRole('button', { name: 'Restore line' }).click();
  await expectStatus(page, 'Rejected · Marketing');
});

test('a sponsor approves through a private link', async ({ browser, page }) => {
  const amy = await asUser(browser, 'amy');
  const a = amy.page;
  await a.goto(`/items/${itemId('ss1')}`);
  await uploadArtwork(a, { name: 'Acme banner.png', mimeType: 'image/png', buffer: makePng(900, 300, [0, 102, 204]) });
  await expectStatus(a, 'Artworked · with Operations');

  await decideAs(browser, 'olivia', 'ss1', 'Operations', 'Approve');
  await decideAs(browser, 'mark', 'ss1', 'Marketing', 'Approve');

  // Only the account manager (or a super admin) can sign off or send the sponsor a link
  const pete = await asUser(browser, 'pete');
  await pete.page.goto(`/items/${itemId('ss1')}`);
  await expect(signoffStage(pete.page, 'Sponsor')).toContainText('Only Amy Account or a super admin can record this stage.');
  await expect(pete.page.getByRole('button', { name: 'Create approval link' })).toHaveCount(0);
  await pete.ctx.close();

  await a.reload();
  await expectStatus(a, 'Artworked · with Sponsor');
  await expect(waitingOn(a)).toContainText('Amy Account');
  const sponsorStage = signoffStage(a, 'Sponsor');
  await expect(sponsorStage).toContainText('Amy Account (sponsor’s account manager)');
  await expect(sponsorStage).toContainText('Ask Acme Steel to approve it themselves');

  // First link: created, then turned off
  await sponsorStage.getByLabel('Sending to (optional)').fill('Jo Bloggs');
  await sponsorStage.getByRole('button', { name: 'Create approval link' }).click();
  const first = await a.getByTestId('share-url').inputValue();
  expect(first).toMatch(/^http:\/\/127\.0\.0\.1:3100\/p\/[A-Za-z0-9_-]{32}$/);
  await expect(sponsorStage).toContainText('Link for Jo Bloggs');
  acceptNextDialog(a);
  await sponsorStage.getByRole('button', { name: 'Turn off' }).click();
  await expect(sponsorStage.getByText('Turned off')).toBeVisible();

  const guest = await browser.newContext();
  const g = await guest.newPage();
  await g.goto(first);
  await expect(g.getByText('This approval link has expired or been turned off.')).toBeVisible();
  await g.goto('/p/not-a-real-token');
  await expect(g.getByText('This approval link isn’t valid.')).toBeVisible();

  // Second link: used by the sponsor
  await sponsorStage.getByLabel('Sending to (optional)').fill('Jo Bloggs');
  await sponsorStage.getByRole('button', { name: 'Create approval link' }).click();
  await expect(a.getByTestId('share-url')).not.toHaveValue(first);
  const link = await a.getByTestId('share-url').inputValue();

  await g.goto(link);
  await expect(g.getByRole('heading', { name: 'Please review this artwork' })).toBeVisible();
  await expect(g.getByText('For Acme Steel.')).toBeVisible();
  await expectImagesLoaded(g, 'img[alt="Artwork for SS-001"]');
  // Internal names and comments stay private
  await expect(g.getByText('Olivia Ops')).toHaveCount(0);
  await expect(g.getByText('Mark Marketing')).toHaveCount(0);
  const fileHref = (await g.getByRole('link', { name: /Open the full file \(Acme banner\.png\)/ }).getAttribute('href'))!;
  const file = await g.request.get(fileHref);
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toBe('image/png');
  // The token only opens this line's files
  await loginAs(page, 'admin');
  await page.goto(`/items/${itemId('os1')}`);
  const otherVersion = await versionIdFromPage(page);
  const token = link.split('/p/')[1];
  expect((await g.request.get(`/api/files/${otherVersion}/original?s=${token}`)).status()).toBe(404);

  await expect(g.locator('#sp-name')).toHaveValue('Jo Bloggs');
  await g.screenshot({ path: test.info().outputPath('sponsor-approval-page.png'), fullPage: true });
  await g.getByRole('button', { name: 'Request changes' }).click();
  await expect(errorMessage(g, 'Tell us what needs to change.')).toBeVisible();
  await g.fill('#sp-comment', 'Looks great, thank you');
  await g.getByRole('button', { name: 'Approve this artwork' }).click();
  await expect(g.getByText(/Thank you\. Your (approval|response) has been recorded\./).first()).toBeVisible();
  await g.reload();
  await expect(g.getByText('Thank you. Your response has been recorded.')).toBeVisible();
  await expect(g.getByRole('button', { name: 'Approve this artwork' })).toHaveCount(0);
  await guest.close();

  await a.reload();
  await expect(signoffStage(a, 'Sponsor')).toContainText('Approved by Jo Bloggs (sponsor)');
  await expect(signoffStage(a, 'Sponsor')).toContainText('Recorded by the sponsor through their approval link.');
  await expectStatus(a, 'Artworked · with Final sign-off');
  await expect(waitingOn(a)).toContainText('Fiona Final');
  await amy.ctx.close();

  await decideAs(browser, 'fiona', 'ss1', 'Final sign-off', 'Approve');
  await page.goto(`/items/${itemId('ss1')}`);
  await expectStatus(page, 'Approved – ready to send');
});

test('an admin can delete a line, its artwork files and keep the number retired', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/schedule/os/new');
  await page.fill('#description', 'Temporary test sign');
  await page.getByRole('button', { name: 'Add line' }).click();
  await expect(page.getByText('Line OS-003 added.')).toBeVisible();
  const id = idFromUrl(page);
  await uploadArtwork(page, { name: 'temp.png', mimeType: 'image/png', buffer: makePng(200, 200) });
  await decide(page, 'Operations', 'Reject', 'Not this one');
  await expectStatus(page, 'Rejected · Operations');

  // Removing a version never frees its number, so old decisions can't attach to new artwork
  await uploadArtwork(page, { name: 'temp-2.png', mimeType: 'image/png', buffer: makePng(220, 200) });
  await expectStatus(page, 'Artworked · with Operations · v2');
  acceptNextDialog(page);
  await page.getByRole('button', { name: 'Remove this version' }).click();
  await expectStatus(page, 'Rejected · Operations'); // back to v1 and its decision
  const v = await uploadArtwork(page, { name: 'temp-3.png', mimeType: 'image/png', buffer: makePng(240, 200) });
  expect(v).toBe('v3');
  await expectStatus(page, 'Artworked · with Operations · v3');
  await expect(signoffStage(page, 'Operations')).toContainText('Waiting for a decision');

  const versionHref = (await page.getByRole('link', { name: 'Open', exact: true }).getAttribute('href'))!;
  const blobDir = path.join(__dirname, '..', '..', '.local', 'blob');
  const filesFor = () => fs.readdirSync(blobDir).filter((f) => decodeURIComponent(f).includes(id));
  expect(filesFor().length).toBe(4); // v1 and v3: original and thumbnail each (a small image is its own preview)

  acceptNextDialog(page);
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page).toHaveURL(/\/schedule\/os\?deleted=1/);
  await expect(page.locator('table tbody tr[data-line]')).toHaveCount(2);
  expect((await page.request.get(versionHref)).status()).toBe(404);
  await expect.poll(filesFor).toHaveLength(0);

  // Numbers are never reused
  await page.goto('/schedule/os/new');
  await page.fill('#description', 'Seminar theatre timetable board');
  await page.getByRole('button', { name: 'Add line' }).click();
  await expect(page.getByText('Line OS-004 added.')).toBeVisible();
  saveItem('os4', idFromUrl(page));
});
