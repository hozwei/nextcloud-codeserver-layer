// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The "+ New" entries: only in the code-server folder and below; the name dialog appends the
// extension, refuses names Windows clients cannot hold and names taken in any letter case, and
// opens code-server with the new path. Nextcloud creates no file: code-server does, on save.

import { test, expect } from '@playwright/test';
import { clickMenuItem, configSettled, Dav, introSeen, login, newMenu, occ, openFolder, opensTab, row, setApp, USER, WORKSPACE } from '../lib/nextcloud.ts';

test.beforeEach(async ({ context }) => {
  await introSeen(context);
  setApp('sync_hint_seconds', 0);
  occ('config:app:delete', 'codeserver_layer', 'new_entries');
  const dav = await Dav.of(USER);
  await dav.remove('Projects');
  await dav.remove('Other');
  await dav.mkdir('Projects/My App');
  await dav.mkdir('Other');
  await dav.put('Projects/My App/Deploy.ps1');
  occ('codeserver_layer:folder', USER.user, '/Projects');
});

test.afterEach(() => {
  occ('config:app:delete', 'codeserver_layer', 'sync_hint_seconds');
  occ('config:app:delete', 'codeserver_layer', 'new_entries');
});

const ENTRIES = ['New PowerShell script', 'New PowerShell module', 'New YAML file', 'New JSON file', 'New shell script', 'New Python script'];

test('new files: entries in the folder only, a checked name, code-server opens the new path', async ({ page }) => {
  const dav = await Dav.of(USER);
  await login(page, USER);

  await test.step('outside the folder: none of the entries', async () => {
    await openFolder(page, 'Other');
    const items = await newMenu(page);
    for (const entry of ENTRIES) expect(items, entry).not.toContain(entry);
    await page.keyboard.press('Escape');
  });

  await openFolder(page, 'Projects/My App');
  await row(page, 'Deploy.ps1').waitFor();
  const name = page.locator('dialog.codeserver-dialog[open] input');
  const create = page.locator('dialog.codeserver-dialog[open]').getByRole('button', { name: 'Create in code-server' });
  const error = page.locator('dialog.codeserver-dialog[open] .codeserver-dialog__error');

  await test.step('in the folder: the six entries; the dialog proposes a free name', async () => {
    const items = await newMenu(page);
    for (const entry of ENTRIES) expect(items, entry).toContain(entry);
    await clickMenuItem(page, 'New PowerShell script');
    await expect(name).toHaveValue('New PowerShell script');
    await expect(page.locator('dialog.codeserver-dialog[open] .codeserver-dialog__ext')).toHaveText('.ps1');
  });

  await test.step('names Windows cannot hold, and one taken in another letter case, are refused', async () => {
    for (const [typed, message] of [['CON', 'Windows reserves this name.'], ['a<b', 'cannot contain'], ['x'.repeat(260), 'This name is too long.'], ['', 'Enter a name.'], ['deploy', 'in this or another letter case']]) {
      await name.fill(typed);
      await expect(error, typed).toContainText(message);
      await expect(create, typed).toBeDisabled();
    }
  });

  await test.step('a free name opens code-server with the new path; Nextcloud has no file', async () => {
    await name.fill('build');
    await expect(create).toBeEnabled();
    const opened = await opensTab(page, () => create.click());
    expect(opened.folder).toBe(`${WORKSPACE}/My App`);
    expect(opened.file).toBe(`${WORKSPACE}/My App/build.ps1`);
    await expect(page.locator('.codeserver-toast')).toContainText('build.ps1 is created when you save it in code-server');
    expect(await dav.exists('Projects/My App/build.ps1'), 'no file in Nextcloud').toBe(false);
  });

  await test.step('the extension typed is not doubled; a subfolder keeps its project', async () => {
    await dav.mkdir('Projects/My App/src');
    await openFolder(page, 'Projects/My App/src');
    await newMenu(page);
    await clickMenuItem(page, 'New YAML file');
    await name.fill('config.yaml');
    const opened = await opensTab(page, () => create.click());
    expect(opened.folder).toBe(`${WORKSPACE}/My App`);
    expect(opened.file).toBe(`${WORKSPACE}/My App/src/config.yaml`);
  });

  await test.step('the administrator chooses the entries', async () => {
    setApp('new_entries', 'md,bat');
    await configSettled(page);
    await openFolder(page, 'Projects');
    const items = await newMenu(page);
    expect(items).toContain('New Markdown file');
    expect(items).toContain('New batch file');
    expect(items).not.toContain('New PowerShell script');
    await page.keyboard.press('Escape');
  });
});
