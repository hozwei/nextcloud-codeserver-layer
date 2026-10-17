// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Screenshots for the documentation (docs/img/), taken in the test Nextcloud of the nextcloud-e2e
// job into SCREENSHOTS_DIR; the project screenshots-chromium exists only when that is set. Only
// example names: the folder /Projects, the project My App, the address https://code.example.com/.
// It checks nothing the other specs do not; CI keeps it from failing the job.

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { ADMIN, Dav, introSeen, login, NC, occ, openFolder, row, setApp, USER } from '../lib/nextcloud.ts';

const DIR = process.env.SCREENSHOTS_DIR ?? 'docs-screenshots';
const FILES = ['run.ps1', 'deploy.ps1', 'settings.ini', 'compose.yaml', 'notes.md', 'Dockerfile', 'server.log'];
const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: path.join(DIR, `${name}.png`) });

test.use({ viewport: { width: 1280, height: 720 } });

test.beforeAll(async () => {
  setApp('default_app', false);
  setApp('sync_hint_seconds', 0);
  const dav = await Dav.of(USER);
  await dav.remove('Projects');
  await dav.mkdir('Projects/My App/src');
  for (const name of FILES) await dav.put(`Projects/My App/${name}`, `${name}\n`);
  occ('codeserver_layer:folder', USER.user, '/Projects');
});

test.afterAll(() => {
  occ('config:app:delete', 'codeserver_layer', 'sync_hint_seconds');
});

test('Files: the menu of a file, "+ New" and its name dialog', async ({ page, context }) => {
  await introSeen(context);
  await login(page, USER);
  await openFolder(page, 'Projects/My App');
  await row(page, 'run.ps1').waitFor();

  await row(page, 'run.ps1').locator('[data-cy-files-list-row-actions] button.action-item__menutoggle').click();
  await expect(page.getByRole('menuitem', { name: 'Open in code-server' })).toBeVisible();
  await shot(page, 'files-menu');
  await page.keyboard.press('Escape');

  await page.locator('[data-cy-upload-picker] button.action-item__menutoggle').first().click();
  await expect(page.getByRole('menuitem', { name: 'New PowerShell script' })).toBeVisible();
  await shot(page, 'new-menu');
  await page.getByRole('menuitem', { name: 'New PowerShell script' }).click();
  await page.locator('dialog.codeserver-dialog[open] input').fill('backup');
  await shot(page, 'new-dialog');
});

test('the settings pages', async ({ page }) => {
  // The page shows the stored address; the tests' own is a local stand-in.
  const url = occ('config:app:get', 'codeserver_layer', 'url').trim();
  setApp('url', 'https://code.example.com/');
  try {
    await login(page, ADMIN);
    await page.goto(`${NC}/index.php/settings/admin/codeserver_layer`);
    await page.locator('#codeserver-layer-url').waitFor();
    await shot(page, 'admin-settings');
  } finally {
    setApp('url', url);
  }
  await page.context().clearCookies();
  await login(page, USER);
  await page.goto(`${NC}/index.php/settings/user/codeserver_layer`);
  await expect(page.locator('#codeserver-layer-folder')).toHaveValue('/Projects');
  await shot(page, 'personal-settings');
});
