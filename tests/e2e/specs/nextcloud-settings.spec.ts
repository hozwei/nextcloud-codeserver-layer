// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The settings:
//   administration   saves and refuses (address, working copy, lists, "+ New", sync warning), says
//                    what a click opens with and without the default app
//   outside group    an administrator the app is not enabled for sees why the page cannot save,
//                    instead of a bare "HTTP 412"
//   personal         the folder, kept as its file id: renaming it keeps the entries; a file is no
//                    folder; accounts outside the group have no such page; occ sets, shows, clears
//   German           the texts in German, informal and formal

import { test, expect, type Page } from '@playwright/test';
import { ADMIN, ADMIN2, CAPTURE, configSettled, Dav, introSeen, login, menu, NC, occ, openFolder, OTHER, row, setApp, USER } from '../lib/nextcloud.ts';

const ADMIN_PAGE = `${NC}/index.php/settings/admin/codeserver_layer`;
const PERSONAL_PAGE = `${NC}/index.php/settings/user/codeserver_layer`;
const admin = (page: Page) => page.locator('#codeserver-layer-admin');

async function saveAdmin(page: Page, fields: Partial<Record<'url' | 'workspace' | 'extensions' | 'filenames' | 'syncHintSeconds', string>>): Promise<string> {
  for (const [name, value] of Object.entries(fields)) await admin(page).locator(`[name="${name}"]`).fill(value);
  const saved = page.waitForResponse((r) => r.url().endsWith('/apps/codeserver_layer/settings/admin'));
  await admin(page).getByRole('button', { name: 'Save' }).click();
  await saved;
  return (await admin(page).locator('.codeserver-settings__status').innerText()).trim();
}

test.afterEach(() => {
  // What the other specs need.
  setApp('url', CAPTURE);
  setApp('workspace', '/workspace');
  for (const key of ['extensions', 'filenames', 'default_app', 'new_entries', 'sync_hint_seconds']) occ('config:app:delete', 'codeserver_layer', key);
  occ('user:setting', USER.user, 'core', 'lang', 'en');
  occ('user:setting', ADMIN.user, 'core', 'lang', 'en');
});

test('administration: saves, refuses what it cannot use, says what a click opens', async ({ page }) => {
  await login(page, ADMIN);
  await page.goto(ADMIN_PAGE);
  await expect(admin(page).locator('[name="url"]')).toHaveValue(CAPTURE);

  await test.step('refused: an address that is not https, has a query or a user; a relative working copy', async () => {
    for (const [fields, error, message] of [
      [{ url: 'http://example.com/' }, 'url', 'Use an https:// address'],
      [{ url: 'https://code.example.com/?a=b' }, 'url', 'Use an https:// address'],
      [{ url: 'https://user:pw@code.example.com/' }, 'url', 'Use an https:// address'],
      [{ url: CAPTURE, workspace: 'workspace' }, 'workspace', 'Use an absolute path'],
      [{ workspace: '/a/../b' }, 'workspace', 'Use an absolute path'],
      [{ workspace: '/workspace', extensions: 'ps1 .yaml *.md' }, 'extensions', 'Not a file extension: *.md'],
      [{ extensions: 'ps1', filenames: 'Dockerfile a/b' }, 'filenames', 'Not a file name: a/b'],
      [{ filenames: 'Dockerfile', syncHintSeconds: '99999' }, 'syncHintSeconds', 'from 0 to 3600'],
    ] as const) {
      expect(await saveAdmin(page, fields)).toBe('Nothing was saved. Correct the marked fields.');
      await expect(admin(page).locator(`#codeserver-layer-${error}-error`)).toContainText(message);
    }
    expect(occ('config:app:get', 'codeserver_layer', 'url').trim(), 'nothing stored').toBe(CAPTURE);
  });

  await test.step('saved: the address gets its slash, the lists are cleaned up, the hint follows', async () => {
    expect(await saveAdmin(page, { url: 'https://code.example.com:8443', workspace: '/data/Work Copy/', extensions: 'ps1, .YAML\nmd', filenames: 'Dockerfile .env.*', syncHintSeconds: '30' })).toBe('Saved');
    await expect(admin(page).locator('[name="url"]')).toHaveValue('https://code.example.com:8443/');
    await expect(admin(page).locator('[name="workspace"]')).toHaveValue('/data/Work Copy');
    await expect(admin(page).locator('[name="extensions"]')).toHaveValue('ps1 yaml md');
    expect(occ('config:app:get', 'codeserver_layer', 'extensions').trim()).toBe('ps1,yaml,md');
    await expect(admin(page).locator('#codeserver-layer-hint')).toContainText('A click opens these in code-server: ps1, and the file names in the list. The others (yaml md)');
    await admin(page).locator('#codeserver-layer-default-app').check();
    expect(await saveAdmin(page, {})).toBe('Saved');
    await expect(admin(page).locator('#codeserver-layer-hint')).toContainText('A click opens all these files in code-server.');
    expect(occ('config:app:get', 'codeserver_layer', 'default_app').trim()).toBe('1');
  });

  await test.step('"Restore the default list" fills in the lists the app comes with', async () => {
    await admin(page).locator('[data-target="codeserver-layer-extensions"]').click();
    await expect(admin(page).locator('[name="extensions"]')).toHaveValue(/^ps1 psm1 psd1 .* proto$/);
  });
});

test('outside the group: the page says why it cannot save', async ({ page }) => {
  await login(page, ADMIN2);
  await page.goto(ADMIN_PAGE);
  await expect(page.locator('.codeserver-settings__notice')).toContainText('The app is enabled only for the groups code, and not for your account');
  const save = admin(page).getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  // Saving anyway (the button enabled in the page): the clear text, not "HTTP 412".
  await save.evaluate((button: HTMLButtonElement) => { button.disabled = false; });
  await save.click();
  await expect(admin(page).locator('.codeserver-settings__status')).toHaveText(/the app is not enabled for your account/);
  expect(occ('config:app:get', 'codeserver_layer', 'url').trim()).toBe(CAPTURE);
});

test('personal: the folder follows a rename; a file is no folder; only for the group; occ', async ({ page, context }) => {
  await introSeen(context);
  setApp('sync_hint_seconds', 0);
  const dav = await Dav.of(USER);
  for (const name of ['Projects', 'Renamed', 'file.txt']) await dav.remove(name);
  await dav.mkdir('Projects/My App');
  await dav.put('Projects/My App/run.ps1');
  await dav.put('file.txt');
  occ('codeserver_layer:folder', USER.user, '--clear');
  await login(page, USER);
  await page.goto(PERSONAL_PAGE);
  const personal = page.locator('#codeserver-layer-personal');
  const folder = personal.locator('[name="folder"]');
  const save = async () => {
    const saved = page.waitForResponse((r) => r.url().endsWith('/apps/codeserver_layer/settings/personal'));
    await personal.getByRole('button', { name: 'Save' }).click();
    await saved;
  };

  await test.step('a file is refused', async () => {
    await folder.fill('/file.txt');
    await save();
    await expect(personal.locator('#codeserver-layer-folder-error')).toHaveText('This is a file, not a folder.');
  });

  await test.step('the folder is kept as its file id', async () => {
    await folder.fill('Projects/');
    await save();
    await expect(folder).toHaveValue('/Projects');
    expect(occ('user:setting', USER.user, 'codeserver_layer', 'folder').trim()).toBe(await dav.fileId('Projects'));
  });

  await test.step('renamed, the folder still has the entries', async () => {
    await dav.move('Projects', 'Renamed');
    await page.goto(PERSONAL_PAGE);
    await expect(folder).toHaveValue('/Renamed');
    await openFolder(page, 'Renamed/My App');
    expect(await menu(page, 'run.ps1')).toContain('Open in code-server');
    await page.keyboard.press('Escape');
    await dav.move('Renamed', 'Projects');
  });

  await test.step('occ shows, sets and clears', async () => {
    expect(occ('codeserver_layer:folder', USER.user)).toContain('/Projects (file id');
    expect(occ('codeserver_layer:folder', USER.user, '--clear')).toContain('Cleared');
    expect(occ('codeserver_layer:folder', USER.user)).toContain('has no code-server folder');
    expect(occ('codeserver_layer:folder', USER.user, '/Projects')).toContain('/Projects (file id');
  });

  await test.step('an account outside the group has no such page', async () => {
    const other = await page.context().browser()!.newContext();
    try {
      const otherPage = await other.newPage();
      await login(otherPage, OTHER);
      await otherPage.goto(PERSONAL_PAGE);
      await expect(otherPage.locator('#codeserver-layer-personal')).toHaveCount(0);
    } finally {
      await other.close();
    }
  });
});

test('German: informal and formal', async ({ page, context }) => {
  await introSeen(context);
  setApp('sync_hint_seconds', 0);
  occ('codeserver_layer:folder', USER.user, '/Projects');
  const dav = await Dav.of(USER);
  await dav.mkdir('Projects/My App');
  await dav.put('Projects/My App/notes.md');
  occ('user:setting', USER.user, 'core', 'lang', 'de');
  await login(page, USER);
  await openFolder(page, 'Projects/My App');
  await row(page, 'notes.md').waitFor();
  expect(await menu(page, 'notes.md')).toContain('In code-server öffnen');
  await page.keyboard.press('Escape');
  await page.goto(PERSONAL_PAGE);
  await expect(page.locator('#codeserver-layer-personal')).toContainText('Sein Pfad in deinen Dateien.');

  occ('user:setting', USER.user, 'core', 'lang', 'de_DE');
  await configSettled(page);
  await page.goto(PERSONAL_PAGE);
  await expect(page.locator('#codeserver-layer-personal')).toContainText('Sein Pfad in Ihren Dateien.');
});
