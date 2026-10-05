import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import postgres from 'postgres';

export const SETUP_CODE = process.env.SETUP_CODE ?? 'ED-TEST-0000-0001';
export const ADMIN = { name: 'Umit Admin', email: 'admin@ukcw.test', password: 'Admin-pass-123' };

const STATE_FILE = path.join(__dirname, '.auth', 'state.json');
type State = { users: Record<string, { name: string; email: string; password: string }>; items: Record<string, string> };

export function readState(): State {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as State;
  } catch {
    return { users: {}, items: {} };
  }
}
export function writeState(s: State) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}
export function user(key: string) {
  const u = readState().users[key];
  if (!u) throw new Error(`No test user ${key}`);
  return u;
}
export function itemId(key: string) {
  const id = readState().items[key];
  if (!id) throw new Error(`No test item ${key}`);
  return id;
}
export function saveItem(key: string, id: string) {
  const s = readState();
  s.items[key] = id;
  writeState(s);
}
export function saveUser(key: string, u: { name: string; email: string; password: string }) {
  const s = readState();
  s.users[key] = u;
  writeState(s);
}

/** Accepts the next confirm() dialog (Playwright dismisses dialogs by default). */
export function acceptNextDialog(page: Page) {
  page.once('dialog', (d) => void d.accept());
}

/** The success message shown by a form after saving. */
export function okMessage(scope: Page | Locator, text: string | RegExp) {
  return scope.locator('p[role=status]').filter({ hasText: text });
}

/** The error message shown by a form. */
export function errorMessage(scope: Page | Locator, text: string | RegExp) {
  return scope.locator('p[role=alert]').filter({ hasText: text });
}

/** A settings panel (or any <section>) by its heading text. */
export function panel(page: Page, heading: string | RegExp) {
  return page.locator('section').filter({ has: page.locator('h2').filter({ hasText: heading }) });
}

/** Waits for every <img> matching the selector to finish loading with real pixels. */
export async function expectImagesLoaded(page: Page, selector: string) {
  const imgs = page.locator(selector);
  await expect(imgs.first()).toBeVisible();
  await expect.poll(async () => imgs.evaluateAll((els) => els.every((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0))).toBe(true);
}

// ---- Invites ------------------------------------------------------------------------
export interface EmailToSend { to: string; subject: string; body: string; mailto: string; password: string }

/** The ready-made email the Admin page gives you after an invite or a password reset. */
export async function emailToSend(scope: Page | Locator): Promise<EmailToSend> {
  const box = scope.getByRole('region', { name: 'Email to send' });
  await expect(box).toHaveCount(1);
  const body = await box.getByLabel('Message', { exact: true }).inputValue();
  return {
    to: await box.getByLabel('To', { exact: true }).inputValue(),
    subject: await box.getByLabel('Subject', { exact: true }).inputValue(),
    body,
    mailto: (await box.getByRole('link', { name: 'Open in your email app' }).getAttribute('href'))!,
    password: tempPasswordFrom(body),
  };
}

/** Reads the temporary password out of an invite or reset email. */
export function tempPasswordFrom(text: string): string {
  const m = text.match(/Temporary password: (\S+)/);
  if (!m) throw new Error('No temporary password in the message');
  return m[1];
}

/** A person's row on the Admin page. */
export function personRow(page: Page, email: string) {
  return page.locator('li[id^="person-"]').filter({ has: page.locator('summary', { hasText: email }) });
}

/** Opens a person's row on the Admin page (if it isn't open already) and returns it. */
export async function openPerson(page: Page, email: string) {
  const row = personRow(page, email);
  await expect(row).toHaveCount(1);
  if ((await row.locator('details[open]').count()) === 0) await row.locator('summary').click();
  await expect(row.locator('details[open]')).toHaveCount(1);
  return row;
}

/** Runs a query against the local test database (for things a test can't wait for, like an invite expiring). */
export async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

export async function login(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** Signs out using the menu button. */
export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/login/);
}

export async function loginAs(page: Page, key: string) {
  const u = key === 'admin' ? ADMIN : user(key);
  await login(page, u.email, u.password);
}

/** Opens a fresh browser context signed in as a user. */
export async function asUser(browser: Browser, key: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, key);
  return { ctx, page };
}

export function idFromUrl(page: Page): string {
  const m = page.url().match(/\/items\/([0-9a-f-]{36})/);
  if (!m) throw new Error(`Not on an item page: ${page.url()}`);
  return m[1];
}

/** Reads the visible status chip text in the item header. */
export async function itemStatus(page: Page): Promise<string> {
  return (await page.locator('main header').first().locator('span.rounded-full').first().innerText()).trim();
}

export async function expectStatus(page: Page, text: string | RegExp) {
  await expect(page.locator('main header').first().locator('span.rounded-full').first()).toHaveText(text);
}

/** The "Waiting on" value in the item header. */
export function waitingOn(page: Page) {
  return page.locator('main header dt', { hasText: 'Waiting on' }).locator('xpath=following-sibling::dd[1]');
}

/** Minimal CSV reader (quoted fields, doubled quotes, line breaks inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' && s[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ---- Test files -------------------------------------------------------------------
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A simple artwork-like PNG: coloured band with a darker block. */
export function makePng(w = 600, h = 300, rgb: [number, number, number] = [255, 194, 14]): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      const block = x > w * 0.1 && x < w * 0.5 && y > h * 0.3 && y < h * 0.7;
      raw[o] = block ? 19 : rgb[0];
      raw[o + 1] = block ? 35 : rgb[1];
      raw[o + 2] = block ? 59 : rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A valid two-page PDF with a filled rectangle and text, built by hand. */
export function makePdf(text = 'UKCW proof'): Buffer {
  const content = `0.07 0.14 0.23 rg 50 400 500 300 re f 1 0.76 0.05 rg 80 430 200 80 re f BT /F1 36 Tf 1 1 1 rg 300 600 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** Uploads artwork on the item page and waits until the new version is shown. */
export async function uploadArtwork(page: Page, file: { name: string; mimeType: string; buffer: Buffer }, note?: string) {
  const input = page.locator('input[type=file]');
  await input.setInputFiles(file);
  if (note) await page.locator('input[id^="note-"]').fill(note);
  const btn = page.getByRole('button', { name: /^Upload v\d+$/ });
  const label = await btn.innerText();
  const v = label.replace('Upload ', '');
  await btn.click();
  await expect(page.getByText(new RegExp(`^${v} `)).first()).toBeVisible({ timeout: 30_000 });
  return v;
}

/** Records a decision on a stage from the item page. */
export async function decide(page: Page, stageName: string, decision: 'Approve' | 'Request changes' | 'Reject' | 'Put on hold', comment?: string) {
  const stage = signoffStage(page, stageName);
  const reopen = stage.getByRole('button', { name: 'Change this decision' });
  const form = stage.locator('form').filter({ has: page.locator('textarea[name=comment]') }).first();
  await expect(form.or(reopen)).toBeVisible();
  if (await reopen.isVisible()) await reopen.click();
  if (comment !== undefined) await form.locator('textarea[name=comment]').fill(comment);
  await form.getByRole('button', { name: decision, exact: true }).click();
}

/** One stage in the item page's sign-off route. */
export function signoffStage(page: Page, stageName: string) {
  return page.locator('#signoff li').filter({ has: page.getByRole('heading', { name: stageName, exact: true }) });
}
