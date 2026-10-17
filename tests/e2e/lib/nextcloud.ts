// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// A test Nextcloud with the app, shared by the specs nextcloud-*.spec.ts: occ, WebDAV as a test
// account, the login, Files' menus and the tabs the app opens.
//
// Environment (docs/development.md): NEXTCLOUD_URL; NEXTCLOUD_CONTAINER, the Docker container occ
// runs in, or NEXTCLOUD_OCC, a shell command that runs occ for a Nextcloud without Docker (such as
// "cd /srv/nextcloud && php occ"); NEXTCLOUD_PASSWORD for the administrator admin;
// E2E_PASSWORD_SUFFIX for the accounts e2e-user (in the group code, owns the code-server folder),
// e2e-admin2 (an administrator outside the group) and e2e-other (outside the group); CAPTURE_PORT,
// the stand-in for code-server.

import { execFileSync } from 'node:child_process';
import { expect, request as requests, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { decodeLaunchUrl } from '../../../codeserver_layer/src/launch.ts';

export const NC = (process.env.NEXTCLOUD_URL ?? '').replace(/\/+$/, '');
export const CAPTURE = `http://127.0.0.1:${process.env.CAPTURE_PORT || 8791}/`;
export const WORKSPACE = '/workspace';
/** Where the stand-in code-server has the whole account, for account access. */
export const ACCOUNT = '/nextcloud';
export const GROUP = 'code';

export interface Account { user: string; password: string }
const suffix = process.env.E2E_PASSWORD_SUFFIX ?? '-password-7f3a';
export const ADMIN: Account = { user: 'admin', password: process.env.NEXTCLOUD_PASSWORD ?? '' };
export const USER: Account = { user: 'e2e-user', password: `e2e-e2e-user${suffix}` };
export const ADMIN2: Account = { user: 'e2e-admin2', password: `e2e-e2e-admin2${suffix}` };
export const OTHER: Account = { user: 'e2e-other', password: `e2e-e2e-other${suffix}` };

/** Runs occ in the test Nextcloud (its container, or NEXTCLOUD_OCC) and returns its output. */
export function occ(...args: string[]): string {
  const local = process.env.NEXTCLOUD_OCC;
  if (local) return execFileSync('sh', ['-c', `${local} "$@"`, 'occ', ...args], { encoding: 'utf8' });
  const container = process.env.NEXTCLOUD_CONTAINER ?? 'nextcloud';
  return execFileSync('docker', ['exec', '-u', 'www-data', container, 'php', 'occ', ...args], { encoding: 'utf8' });
}

/** Runs a shell command in the test Nextcloud's container, as the web server's user. */
export function inContainer(script: string): string {
  const container = process.env.NEXTCLOUD_CONTAINER ?? 'nextcloud';
  return execFileSync('docker', ['exec', '-u', 'www-data', container, 'sh', '-c', script], { encoding: 'utf8' });
}

export function setApp(key: string, value: string | boolean | number): void {
  occ('config:app:set', 'codeserver_layer', key, `--value=${String(value)}`);
}

/**
 * Waits until the web server sees a setting occ changed: Nextcloud keeps the app config in a local
 * memory cache for 3 s (AppConfig::LOCAL_CACHE_TTL). Only needed for a page already open.
 */
export async function configSettled(page: Page): Promise<void> {
  // eslint-disable-next-line playwright/no-wait-for-timeout
  await page.waitForTimeout(3500);
}

const auth = (account: Account) => ({ Authorization: 'Basic ' + Buffer.from(`${account.user}:${account.password}`).toString('base64') });
const davPath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/**
 * WebDAV in an account's files; paths from the account's root, such as 'Projects/My App/a.ps1'.
 * Each account gets a request context of its own: Nextcloud answers Basic auth for one account
 * with 403 when the request also carries the session cookie of another.
 */
export class Dav {
  private constructor(private request: APIRequestContext, readonly account: Account) {}

  private static contexts = new Map<string, Promise<APIRequestContext>>();

  static async of(account: Account = USER): Promise<Dav> {
    let context = Dav.contexts.get(account.user);
    if (!context) {
      context = requests.newContext();
      Dav.contexts.set(account.user, context);
    }
    return new Dav(await context, account);
  }

  url(path: string): string {
    return `${NC}/remote.php/dav/files/${encodeURIComponent(this.account.user)}/${davPath(path)}`;
  }

  async mkdir(path: string): Promise<void> {
    let at = '';
    for (const part of path.split('/')) {
      at = at ? `${at}/${part}` : part;
      const res = await this.request.fetch(this.url(at), { method: 'MKCOL', headers: auth(this.account) });
      expect([201, 405], `MKCOL ${at}`).toContain(res.status());
    }
  }

  async put(path: string, data: string | Buffer = 'content\n', headers: Record<string, string> = {}): Promise<void> {
    const res = await this.request.fetch(this.url(path), { method: 'PUT', headers: { ...auth(this.account), ...headers }, data });
    expect(res.ok(), `PUT ${path}`).toBe(true);
  }

  async exists(path: string): Promise<boolean> {
    const res = await this.request.fetch(this.url(path), { method: 'PROPFIND', headers: { ...auth(this.account), Depth: '0' } });
    return res.status() === 207;
  }

  async remove(path: string): Promise<void> {
    await this.request.fetch(this.url(path), { method: 'DELETE', headers: auth(this.account) });
  }

  async move(from: string, to: string): Promise<void> {
    const res = await this.request.fetch(this.url(from), { method: 'MOVE', headers: { ...auth(this.account), Destination: this.url(to) } });
    expect([201, 204], `MOVE ${from}`).toContain(res.status());
  }

  private async prop(path: string, prop: string): Promise<string> {
    const res = await this.request.fetch(this.url(path), {
      method: 'PROPFIND',
      headers: { ...auth(this.account), Depth: '0', 'Content-Type': 'application/xml' },
      data: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop>${prop}</d:prop></d:propfind>`,
    });
    expect(res.status(), `PROPFIND ${path}`).toBe(207);
    return res.text();
  }

  async contentType(path: string): Promise<string> {
    return /<d:getcontenttype>([^<]*)</.exec(await this.prop(path, '<d:getcontenttype/>'))?.[1] ?? '';
  }

  async fileId(path: string): Promise<string> {
    return /<oc:fileid>(\d+)</.exec(await this.prop(path, '<oc:fileid/>'))?.[1] ?? '';
  }

  /** Shares path with another account (permissions: 1 read, 3 read and change, ...); returns the share's id. */
  async share(path: string, withUser: string, permissions: number): Promise<string> {
    const res = await this.request.fetch(`${NC}/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json`, {
      method: 'POST',
      headers: { ...auth(this.account), 'OCS-APIRequest': 'true' },
      form: { path: `/${path}`, shareType: '0', shareWith: withUser, permissions: String(permissions) },
    });
    expect(res.ok(), `share ${path}: ${res.status()}`).toBe(true);
    return String(((await res.json()) as { ocs: { data: { id: string | number } } }).ocs.data.id);
  }

  async unshare(id: string): Promise<void> {
    await this.request.fetch(`${NC}/ocs/v2.php/apps/files_sharing/api/v1/shares/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { ...auth(this.account), 'OCS-APIRequest': 'true' },
    });
  }

  /** Locks the file with this id as this account (files_lock), as Files' "Lock file" does, or unlocks it. */
  async lock(fileId: string, on: boolean): Promise<void> {
    const res = await this.request.fetch(`${NC}/ocs/v2.php/apps/files_lock/lock/${encodeURIComponent(fileId)}`, {
      method: on ? 'PUT' : 'DELETE',
      headers: { ...auth(this.account), 'OCS-APIRequest': 'true' },
    });
    expect(res.ok(), `${on ? 'lock' : 'unlock'} ${fileId} as ${this.account.user}: ${res.status()}`).toBe(true);
  }
}

export async function login(page: Page, account: Account): Promise<void> {
  await page.goto(`${NC}/index.php/login`);
  await page.locator('#user').fill(account.user);
  await page.locator('#password').fill(account.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/apps\//);
}

/**
 * Runs action with the trace stopped (what it recorded so far is dropped). Playwright gives a page
 * user activation whenever it runs a script there, which its trace snapshots do; the app opens a
 * tab at once only with user activation, and asks first without (as for a /f/<id> link).
 */
export async function untraced<T>(page: Page, action: () => Promise<T>): Promise<T> {
  const tracing = page.context().tracing;
  const stopped = await tracing.stop().then(() => true, () => false);
  try {
    return await action();
  } finally {
    if (stopped) await tracing.start({ screenshots: true, snapshots: true });
  }
}

/** A browser context that has seen the app's one-time explanations already, for both places. */
export async function introSeen(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('codeserver_layer:intro-seen', '1');
      window.localStorage.setItem('codeserver_layer:intro-seen-account', '1');
    } catch {
      // no storage
    }
  });
}

export const openFolder = (page: Page, dir: string) => page.goto(`${NC}/index.php/apps/files/files?dir=${encodeURIComponent(`/${dir}`)}`);

export const row = (page: Page, name: string) => page.locator(`[data-cy-files-list-row-name="${name}"]`);

/** The entries of a file's action menu. Read in the page, as the Craft Suite Layer's tests do. */
export async function menu(page: Page, name: string): Promise<string[]> {
  await row(page, name).locator('[data-cy-files-list-row-actions] button.action-item__menutoggle').click();
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('[role="menuitem"]').length)).toBeGreaterThan(0);
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    .filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()).filter(Boolean));
}

/** A real click (with user activation) on a visible menu entry. */
export async function clickMenuItem(page: Page, text: string): Promise<void> {
  const at = await page.evaluate((t) => {
    const box = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((e) => e.offsetParent !== null && e.innerText.trim() === t)?.getBoundingClientRect();
    return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
  }, text);
  expect(at, `the menu entry ${text}`).not.toBeNull();
  await page.mouse.click(at!.x, at!.y);
}

/** The entries of Files' "+ New" menu. */
export async function newMenu(page: Page): Promise<string[]> {
  await page.locator('[data-cy-upload-picker] button.action-item__menutoggle').first().click();
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('[role="menuitem"]').length)).toBeGreaterThan(0);
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    .filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()).filter(Boolean));
}

/** The tab the app opens on action(), and what code-server would open from its address. */
export async function opensTab(page: Page, action: () => Promise<void>): Promise<ReturnType<typeof decodeLaunchUrl> & { url: string }> {
  const popup = page.context().waitForEvent('page', { timeout: 20_000 });
  await action();
  const tab = await popup;
  await tab.waitForLoadState();
  const url = tab.url();
  expect(url.startsWith(CAPTURE), `the tab goes to code-server's address: ${url}`).toBe(true);
  const opener = await tab.evaluate(() => window.opener === null);
  expect(opener, 'the tab has no handle on Nextcloud').toBe(true);
  await tab.close();
  return { ...decodeLaunchUrl(url), url };
}

/** Fails if action() opens a tab within ms. */
export async function opensNoTab(page: Page, action: () => Promise<void>, ms = 3000): Promise<void> {
  let opened: string | null = null;
  const listener = (tab: Page) => {
    opened = tab.url() || 'a tab';
    void tab.close();
  };
  page.context().on('page', listener);
  try {
    await action();
    // Nothing to wait for: the test shows that no tab comes within ms.
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await page.waitForTimeout(ms);
  } finally {
    page.context().off('page', listener);
  }
  expect(opened, 'no code-server tab').toBeNull();
}

/** The app's dialog, its text and buttons. */
export const dialog = (page: Page) => page.locator('dialog.codeserver-dialog[open]');

/**
 * After action, either a tab has opened, or the app asks "Open <name> in code-server?" and its
 * button opens it: without a click of the user the app asks first, but a browser may count an
 * address opened like a typed one as the user's.
 */
export async function confirmIfAsked(page: Page, name: string): Promise<void> {
  const asked = await dialog(page).waitFor({ timeout: 3000 }).then(() => true, () => false);
  if (!asked) return;
  await expect(dialog(page)).toContainText(`Open ${name} in code-server?`);
  await dialog(page).getByRole('button', { name: 'Open in code-server' }).click();
}
