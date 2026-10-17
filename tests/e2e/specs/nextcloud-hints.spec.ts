// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The warnings before a file opens in code-server, which works on a synced copy:
//   sync        a file changed moments ago warns that code-server may not have the change yet; not
//               after the administrator's window
//   locks       a file locked by an account (files_lock) and one open in Nextcloud Text, which
//               locks it, warn
//   intro       the first open in a browser explains why not to edit in Text and code-server at once
//   slow check  when the check does not answer in time, the file opens anyway and Files says so

import { test, expect, request as requests } from '@playwright/test';
import {
  clickMenuItem, configSettled, Dav, dialog, introSeen, login, menu, NC, occ, openFolder, opensTab, row, setApp, USER, WORKSPACE,
} from '../lib/nextcloud.ts';

test.beforeEach(async () => {
  setApp('default_app', false);
  const dav = await Dav.of(USER);
  await dav.remove('Projects');
  await dav.mkdir('Projects/My App');
  occ('codeserver_layer:folder', USER.user, '/Projects');
});

test.afterAll(() => {
  occ('config:app:delete', 'codeserver_layer', 'sync_hint_seconds');
});

const clickName = (page: import('@playwright/test').Page, name: string) => async () => {
  await row(page, name).locator('[data-cy-files-list-row-name-link]').click();
};

async function lock(fileId: string, on: boolean): Promise<void> {
  const context = await requests.newContext();
  const res = await context.fetch(`${NC}/ocs/v2.php/apps/files_lock/lock/${fileId}`, {
    method: on ? 'PUT' : 'DELETE',
    headers: { 'OCS-APIRequest': 'true', Authorization: 'Basic ' + Buffer.from(`${USER.user}:${USER.password}`).toString('base64') },
  });
  expect(res.ok(), `${on ? 'lock' : 'unlock'} ${fileId}: ${res.status()}`).toBe(true);
  await context.dispose();
}

test('sync: a file changed moments ago warns first; not after the window', async ({ page, context }) => {
  await introSeen(context);
  setApp('sync_hint_seconds', 60);
  const dav = await Dav.of(USER);
  await dav.put('Projects/My App/fresh.ps1');
  await login(page, USER);
  await openFolder(page, 'Projects/My App');

  await test.step('just uploaded: the warning, then code-server', async () => {
    await clickName(page, 'fresh.ps1')();
    await expect(dialog(page)).toContainText('Open fresh.ps1 in code-server?');
    await expect(dialog(page)).toContainText(/The file changed \d+ s ago/);
    const opened = await opensTab(page, () => dialog(page).getByRole('button', { name: 'Open in code-server' }).click());
    expect(opened.file).toBe(`${WORKSPACE}/My App/fresh.ps1`);
  });

  await test.step('Cancel opens nothing', async () => {
    await clickName(page, 'fresh.ps1')();
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog(page)).toHaveCount(0);
  });

  await test.step('a window of 2 s: three seconds later the file opens at once', async () => {
    setApp('sync_hint_seconds', 2);
    await configSettled(page);
    await openFolder(page, 'Projects/My App');
    await row(page, 'fresh.ps1').waitFor();
    const opened = await opensTab(page, clickName(page, 'fresh.ps1'));
    expect(opened.file).toBe(`${WORKSPACE}/My App/fresh.ps1`);
  });
});

test('locks: a lock of an account, and Nextcloud Text\'s, warn first', async ({ page, context, browser }) => {
  await introSeen(context);
  setApp('sync_hint_seconds', 0);
  const dav = await Dav.of(USER);
  await dav.put('Projects/My App/locked.ps1');
  await dav.put('Projects/My App/notes.md', '# Notes\n');
  const id = await dav.fileId('Projects/My App/locked.ps1');
  await login(page, USER);
  await openFolder(page, 'Projects/My App');

  await test.step('locked by the account itself (files_lock)', async () => {
    await lock(id, true);
    try {
      await clickName(page, 'locked.ps1')();
      await expect(dialog(page)).toContainText('The file is locked by e2e-user.');
      await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    } finally {
      await lock(id, false);
    }
  });

  await test.step('open in Nextcloud Text in another tab', async () => {
    const textContext = await browser.newContext();
    try {
      const textPage = await textContext.newPage();
      await login(textPage, USER);
      await openFolder(textPage, 'Projects/My App');
      await row(textPage, 'notes.md').locator('[data-cy-files-list-row-name-link]').click();
      await expect(textPage.locator('#viewer [contenteditable="true"]').first(), 'Text has the file open').toBeVisible();
      await expect.poll(async () => {
        await openFolder(page, 'Projects/My App');
        await row(page, 'notes.md').waitFor();
        await menu(page, 'notes.md');
        await clickMenuItem(page, 'Open in code-server');
        const shown = await dialog(page).waitFor({ timeout: 5000 }).then(() => dialog(page).innerText(), () => '');
        if (shown) await dialog(page).getByRole('button', { name: 'Cancel' }).click();
        return shown;
      }, { timeout: 60_000 }).toContain('The file is open in Nextcloud Text');
    } finally {
      await textContext.close();
    }
  });
});

test('intro: the first open in a browser explains the rule about Text, once', async ({ page }) => {
  setApp('sync_hint_seconds', 0);
  await (await Dav.of(USER)).put('Projects/My App/run.ps1');
  await login(page, USER);
  await openFolder(page, 'Projects/My App');
  await clickName(page, 'run.ps1')();
  await expect(dialog(page)).toContainText('Do not edit a file in Nextcloud Text and in code-server at the same time.');
  await opensTab(page, () => dialog(page).getByRole('button', { name: 'Open in code-server' }).click());
  const opened = await opensTab(page, clickName(page, 'run.ps1'));
  expect(opened.file).toBe(`${WORKSPACE}/My App/run.ps1`);
});

test('slow check: the file opens anyway, and Files says it could not check', async ({ page, context }) => {
  await introSeen(context);
  setApp('sync_hint_seconds', 60);
  await (await Dav.of(USER)).put('Projects/My App/slow.ps1');
  await login(page, USER);
  await openFolder(page, 'Projects/My App');
  await page.route(/\/slow\.ps1$/, async (route) => {
    if (route.request().method() !== 'PROPFIND') return route.fallback();
    await new Promise((resolve) => setTimeout(resolve, 3500));
    await route.fallback().catch(() => undefined);
  });
  const opened = await opensTab(page, clickName(page, 'slow.ps1'));
  expect(opened.file).toBe(`${WORKSPACE}/My App/slow.ps1`);
  await expect(page.locator('.codeserver-toast')).toContainText('Could not check');
});
