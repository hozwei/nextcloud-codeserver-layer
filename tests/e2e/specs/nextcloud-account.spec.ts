// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Account access: files and folders anywhere in the user's files, from where code-server has the
// whole account (account_workspace), next to the code-server folder and its working copy.
//   click        outside the code-server folder a file opens on its own in an empty window, inside
//                still in its project folder; without account access nothing happens outside
//   default app  each place has its own: account_default_app outside, default_app inside
//   folders      "Open in code-server" in a folder's menu opens it as code-server's folder, in the
//                account and in the code-server folder; a click on a folder still opens it in Files;
//                the button next to the path opens the folder shown, but not the account's root
//   left out     folders the mount leaves out (account_exclude) have no entries through account access
//   + New        entries in every folder the user may create files in; the new file's empty window
//   read only    a file shared without edit rights warns first, also one shared on its own, whose
//                mount point the user may rename and which the mount would delete; a folder shared
//                so warns that it takes no new files
//   locks        another account's lock warns that the save replaces its changes once it ends; the
//                user's own lock does not bind the mount, which signs in as the user
//   intro        the first open through account access says how a lock of Text ends there
//   window       the warning about a recent change has a window of its own for account access
//   no folder    account access works without a code-server folder

import { test, expect, type Page } from '@playwright/test';
import {
  ACCOUNT, ADMIN, CAPTURE, clickMenuItem, configSettled, Dav, dialog, introSeen, login, menu, newMenu, occ, openFolder, opensNoTab, opensTab, row, setApp, USER, WORKSPACE,
} from '../lib/nextcloud.ts';

const click = (page: Page, name: string) => async () => {
  await row(page, name).locator('[data-cy-files-list-row-name-link]').click();
};

const accountOn = (on: boolean) => occ('codeserver_layer:account', USER.user, on ? 'on' : 'off');

test.beforeEach(async ({ context }) => {
  await introSeen(context);
  setApp('default_app', false);
  setApp('sync_hint_seconds', 0);
  setApp('account_workspace', ACCOUNT);
  setApp('account_default_app', false);
  setApp('account_sync_hint_seconds', 0);
  accountOn(true);
  const dav = await Dav.of(USER);
  for (const name of ['Projects', 'Other']) await dav.remove(name);
  await dav.mkdir('Projects/My App');
  await dav.mkdir('Other/Sub');
  await dav.put('Projects/My App/run.ps1');
  await dav.put('Projects/My App/notes.md', '# Notes\n');
  await dav.put('Other/out.ps1');
  await dav.put('Other/notes.md', '# Notes\n');
  await dav.put('Other/Sub/a #1 %.ps1');
  occ('codeserver_layer:folder', USER.user, '/Projects');
});

test.afterEach(() => {
  accountOn(false);
  for (const key of ['default_app', 'sync_hint_seconds', 'account_workspace', 'account_default_app', 'account_sync_hint_seconds', 'account_exclude']) {
    occ('config:app:delete', 'codeserver_layer', key);
  }
  occ('codeserver_layer:folder', USER.user, '/Projects');
});

test('click: outside the code-server folder an empty window from the account, inside the working copy', async ({ page }) => {
  await login(page, USER);

  await test.step('a .ps1 outside opens on its own, from the whole account', async () => {
    await openFolder(page, 'Other');
    const opened = await opensTab(page, click(page, 'out.ps1'));
    expect(opened.emptyWindow).toBe(true);
    expect(opened.folder).toBeNull();
    expect(opened.file).toBe(`${ACCOUNT}/Other/out.ps1`);
    expect(opened.authority).toBe(new URL(CAPTURE).host);
  });

  await test.step('awkward names deeper down reach code-server unchanged', async () => {
    await openFolder(page, 'Other/Sub');
    const opened = await opensTab(page, click(page, 'a #1 %.ps1'));
    expect(opened.file).toBe(`${ACCOUNT}/Other/Sub/a #1 %.ps1`);
  });

  await test.step('Text keeps its formats outside; the menu opens them in code-server', async () => {
    await openFolder(page, 'Other');
    expect(await menu(page, 'notes.md')).toContain('Open in code-server');
    const opened = await opensTab(page, () => clickMenuItem(page, 'Open in code-server'));
    expect(opened.file).toBe(`${ACCOUNT}/Other/notes.md`);
    await opensNoTab(page, click(page, 'notes.md'));
    await expect(page.locator('#viewer'), 'notes.md opens in the Viewer (Text)').toBeVisible();
    await page.locator('#viewer').getByRole('button', { name: 'Close' }).first().click();
    await expect(page.locator('#viewer')).toBeHidden();
  });

  await test.step('inside the code-server folder: still its project folder in the working copy', async () => {
    await openFolder(page, 'Projects/My App');
    const opened = await opensTab(page, click(page, 'run.ps1'));
    expect(opened.emptyWindow).toBe(false);
    expect(opened.folder).toBe(`${WORKSPACE}/My App`);
    expect(opened.file).toBe(`${WORKSPACE}/My App/run.ps1`);
  });

  await test.step('without account access: no entry outside the folder', async () => {
    accountOn(false);
    await openFolder(page, 'Other');
    expect(await menu(page, 'out.ps1')).not.toContain('Open in code-server');
    await page.keyboard.press('Escape');
  });
});

test('default app: one for each place', async ({ page }) => {
  setApp('account_default_app', true);
  await login(page, USER);

  await test.step('account_default_app: a click opens Text\'s formats outside the folder in code-server', async () => {
    await openFolder(page, 'Other');
    const opened = await opensTab(page, click(page, 'notes.md'));
    expect(opened.file).toBe(`${ACCOUNT}/Other/notes.md`);
  });

  await test.step('inside the folder default_app decides: Text keeps the click', async () => {
    await openFolder(page, 'Projects/My App');
    await opensNoTab(page, click(page, 'notes.md'));
    await expect(page.locator('#viewer')).toBeVisible();
    await page.locator('#viewer').getByRole('button', { name: 'Close' }).first().click();
  });

  await test.step('and the other way round', async () => {
    setApp('account_default_app', false);
    setApp('default_app', true);
    await configSettled(page);
    await openFolder(page, 'Projects/My App');
    const opened = await opensTab(page, click(page, 'notes.md'));
    expect(opened.file).toBe(`${WORKSPACE}/My App/notes.md`);
    await openFolder(page, 'Other');
    await opensNoTab(page, click(page, 'notes.md'));
    await expect(page.locator('#viewer')).toBeVisible();
    await page.locator('#viewer').getByRole('button', { name: 'Close' }).first().click();
  });
});

test('folders: "Open in code-server" in their menu opens them as code-server\'s folder', async ({ page }) => {
  await login(page, USER);

  await test.step('a folder anywhere in the account', async () => {
    await openFolder(page, 'Other');
    expect(await menu(page, 'Sub')).toContain('Open in code-server');
    const opened = await opensTab(page, () => clickMenuItem(page, 'Open in code-server'));
    expect(opened.folder).toBe(`${ACCOUNT}/Other/Sub`);
    expect(opened.file).toBeNull();
    expect(opened.emptyWindow).toBe(false);
  });

  await test.step('a folder in the code-server folder, and the folder itself: from the working copy', async () => {
    await openFolder(page, 'Projects');
    await menu(page, 'My App');
    const project = await opensTab(page, () => clickMenuItem(page, 'Open in code-server'));
    expect(project.folder).toBe(`${WORKSPACE}/My App`);
    await openFolder(page, '');
    await menu(page, 'Projects');
    const root = await opensTab(page, () => clickMenuItem(page, 'Open in code-server'));
    expect(root.folder).toBe(WORKSPACE);
  });

  await test.step('a click on a folder still opens it in Files', async () => {
    await openFolder(page, 'Other');
    await opensNoTab(page, click(page, 'Sub'));
    await expect(row(page, 'a #1 %.ps1')).toBeVisible();
  });

  await test.step('without account access only the code-server folder has the entry', async () => {
    accountOn(false);
    await openFolder(page, '');
    expect(await menu(page, 'Other')).not.toContain('Open in code-server');
    await page.keyboard.press('Escape');
    expect(await menu(page, 'Projects')).toContain('Open in code-server');
    await page.keyboard.press('Escape');
  });
});

test('the folder shown: the button next to the path opens it; not at the account\'s root', async ({ page }) => {
  const button = page.locator('.files-list__header').getByRole('button', { name: 'Open in code-server' });
  await login(page, USER);

  await test.step('a folder in the account', async () => {
    await openFolder(page, 'Other/Sub');
    await row(page, 'a #1 %.ps1').waitFor();
    const opened = await opensTab(page, () => button.click());
    expect(opened.folder).toBe(`${ACCOUNT}/Other/Sub`);
    expect(opened.file).toBeNull();
  });

  await test.step('a folder in the code-server folder: from the working copy', async () => {
    await openFolder(page, 'Projects/My App');
    await row(page, 'run.ps1').waitFor();
    const opened = await opensTab(page, () => button.click());
    expect(opened.folder).toBe(`${WORKSPACE}/My App`);
  });

  await test.step('the account\'s root: no button', async () => {
    await openFolder(page, '');
    await row(page, 'Other').waitFor();
    await expect(button).toHaveCount(0);
  });
});

test('left out: folders the mount leaves out have no entries through account access', async ({ page }) => {
  setApp('account_exclude', '/Other/Sub');
  await login(page, USER);
  await openFolder(page, 'Other/Sub');
  await row(page, 'a #1 %.ps1').waitFor();
  expect(await menu(page, 'a #1 %.ps1')).not.toContain('Open in code-server');
  await page.keyboard.press('Escape');
  await opensNoTab(page, click(page, 'a #1 %.ps1'));
  for (const entry of ['New PowerShell script', 'New YAML file']) expect(await newMenu(page), entry).not.toContain(entry);
  await page.keyboard.press('Escape');
  await expect(page.locator('.files-list__header').getByRole('button', { name: 'Open in code-server' })).toHaveCount(0);
  await openFolder(page, 'Other');
  expect(await menu(page, 'Sub'), 'the folder itself').not.toContain('Open in code-server');
  await page.keyboard.press('Escape');
  expect(await menu(page, 'out.ps1'), 'next to it, account access as before').toContain('Open in code-server');
  await page.keyboard.press('Escape');
});

test('+ New: entries in every folder; the new file opens in an empty window', async ({ page }) => {
  const dav = await Dav.of(USER);
  await login(page, USER);
  await openFolder(page, 'Other');
  await row(page, 'out.ps1').waitFor();
  expect(await newMenu(page)).toContain('New PowerShell script');
  await clickMenuItem(page, 'New PowerShell script');
  const name = page.locator('dialog.codeserver-dialog[open] input');
  await name.fill('build');
  const opened = await opensTab(page, () => page.locator('dialog.codeserver-dialog[open]').getByRole('button', { name: 'Create in code-server' }).click());
  expect(opened.emptyWindow).toBe(true);
  expect(opened.file).toBe(`${ACCOUNT}/Other/build.ps1`);
  await expect(page.locator('.codeserver-toast')).toContainText('build.ps1 is created when you save it in code-server');
  expect(await dav.exists('Other/build.ps1'), 'no file in Nextcloud').toBe(false);
});

test('read only: a file or folder shared without edit rights warns first', async ({ page }) => {
  const admin = await Dav.of(ADMIN);
  for (const name of ['Read only', 'single read-only.ps1', 'Editable']) await admin.remove(name);
  await admin.mkdir('Read only');
  await admin.put('Read only/in folder.ps1');
  await admin.put('single read-only.ps1');
  await admin.mkdir('Editable');
  await admin.put('Editable/mine.ps1');
  const shares = [
    await admin.share('Read only', USER.user, 1),
    await admin.share('single read-only.ps1', USER.user, 1),
    await admin.share('Editable', USER.user, 31),
  ];
  try {
    await login(page, USER);

    await test.step('in a folder shared read-only', async () => {
      await openFolder(page, 'Read only');
      await click(page, 'in folder.ps1')();
      await expect(dialog(page)).toContainText('You can only read this file: Nextcloud refuses the changes you save in code-server.');
      await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    });

    await test.step('a file shared read-only on its own: deleting it leaves the share, as the mount would', async () => {
      await openFolder(page, '');
      await click(page, 'single read-only.ps1')();
      await expect(dialog(page)).toContainText('You can only read this file. Do not save it in code-server');
      const opened = await opensTab(page, () => dialog(page).getByRole('button', { name: 'Open in code-server' }).click());
      expect(opened.file).toBe(`${ACCOUNT}/single read-only.ps1`);
    });

    await test.step('the folder shared read-only: no new files in it', async () => {
      await openFolder(page, '');
      await menu(page, 'Read only');
      await clickMenuItem(page, 'Open in code-server');
      await expect(dialog(page)).toContainText('You cannot add files to this folder');
      const opened = await opensTab(page, () => dialog(page).getByRole('button', { name: 'Open in code-server' }).click());
      expect(opened.folder).toBe(`${ACCOUNT}/Read only`);
    });

    await test.step('shared with edit rights: no warning, also for the folder', async () => {
      await openFolder(page, 'Editable');
      const opened = await opensTab(page, click(page, 'mine.ps1'));
      expect(opened.file).toBe(`${ACCOUNT}/Editable/mine.ps1`);
      await openFolder(page, '');
      await menu(page, 'Editable');
      const folder = await opensTab(page, () => clickMenuItem(page, 'Open in code-server'));
      expect(folder.folder).toBe(`${ACCOUNT}/Editable`);
    });
  } finally {
    for (const id of shares) await admin.unshare(id);
    for (const name of ['Read only', 'single read-only.ps1', 'Editable']) await admin.remove(name);
  }
});

test('locks: another account\'s warns that the save replaces its changes; the user\'s own does not bind the mount', async ({ page }) => {
  const admin = await Dav.of(ADMIN);
  await admin.remove('Locked');
  await admin.mkdir('Locked');
  await admin.put('Locked/theirs.ps1');
  const share = await admin.share('Locked', USER.user, 31);
  const theirs = await admin.fileId('Locked/theirs.ps1');
  const dav = await Dav.of(USER);
  const mine = await dav.fileId('Other/out.ps1');
  try {
    await login(page, USER);

    await test.step('locked by the account that shares it', async () => {
      await admin.lock(theirs, true);
      await openFolder(page, 'Locked');
      await click(page, 'theirs.ps1')();
      await expect(dialog(page)).toContainText(/The file is locked by .+\. A save in code-server reaches Nextcloud once the lock ends, and then replaces the changes made meanwhile\./);
      await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    });

    await test.step('locked by the user: opens at once', async () => {
      await dav.lock(mine, true);
      await openFolder(page, 'Other');
      const opened = await opensTab(page, click(page, 'out.ps1'));
      expect(opened.file).toBe(`${ACCOUNT}/Other/out.ps1`);
    });
  } finally {
    await admin.lock(theirs, false).catch(() => undefined);
    await dav.lock(mine, false).catch(() => undefined);
    await admin.unshare(share);
    await admin.remove('Locked');
  }
});

test('intro: the first open through account access explains how a lock ends there', async ({ browser }) => {
  const fresh = await browser.newContext();
  try {
    const page = await fresh.newPage();
    await login(page, USER);
    await openFolder(page, 'Other');
    await click(page, 'out.ps1')();
    await expect(dialog(page)).toContainText('a save in code-server meanwhile reaches Nextcloud once the lock ends, and then replaces the changes made in Text');
  } finally {
    await fresh.close();
  }
});

test('window: account access warns about a recent change in its own window', async ({ page }) => {
  setApp('account_sync_hint_seconds', 60);
  const dav = await Dav.of(USER);
  await dav.put('Other/fresh.ps1');
  await dav.put('Projects/My App/fresh.ps1');
  await login(page, USER);

  await test.step('outside the folder: the warning', async () => {
    await openFolder(page, 'Other');
    await click(page, 'fresh.ps1')();
    await expect(dialog(page)).toContainText(/The file changed \d+ s ago/);
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  });

  await test.step('inside the folder, with its window at 0: none', async () => {
    await openFolder(page, 'Projects/My App');
    const opened = await opensTab(page, click(page, 'fresh.ps1'));
    expect(opened.file).toBe(`${WORKSPACE}/My App/fresh.ps1`);
  });
});

test('no folder: account access alone opens every file from the account', async ({ page }) => {
  occ('codeserver_layer:folder', USER.user, '--clear');
  await login(page, USER);
  await openFolder(page, 'Projects/My App');
  const opened = await opensTab(page, click(page, 'run.ps1'));
  expect(opened.emptyWindow).toBe(true);
  expect(opened.file).toBe(`${ACCOUNT}/Projects/My App/run.ps1`);
});
