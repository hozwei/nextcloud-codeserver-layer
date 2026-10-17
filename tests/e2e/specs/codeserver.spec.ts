// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The addresses the app builds (codeserver_layer/src/launch.ts), opened in a real code-server
// (CODESERVER_URL; its working copy at CODESERVER_WORKSPACE, which this machine sees at
// CODESERVER_HOST_DIR; tests/e2e/tools/start-codeserver.sh starts one):
//   open        the project folder opens and the file is in the editor, marked in the Explorer,
//               also for names with spaces, umlauts, #, %, + and &
//   new file    a path that does not exist yet opens as an unnamed editor under that name, and
//               Ctrl+S writes the file, also in a folder that does not exist yet; a file that
//               appeared meanwhile is not overwritten without a question
//   account     a file anywhere in the account opens on its own in an empty window, also with
//               awkward names, and a new one there is saved with Ctrl+S; a folder opens as the
//               folder. The account is CODESERVER_ACCOUNT (as this machine sees it:
//               CODESERVER_ACCOUNT_HOST_DIR), by default the working copy: any folder code-server
//               sees will do.
//   trust       an empty window takes the trust of its file: not in Restricted Mode below a folder
//               trusted with its parent, in it elsewhere and in another browser profile, as trust
//               lives in the browser. Needs a code-server with workspace trust on
//               (CODESERVER_TRUST_URL, start-codeserver.sh with CODESERVER_TRUST=1) that sees the
//               same working copy.
//
// Only the hand-over is tested here; code-server itself (highlighting, extensions) is not.

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { fileUrl, folderUrl, launchUrl } from '../../../codeserver_layer/src/launch.ts';

const URL = process.env.CODESERVER_URL ?? '';
const WORKSPACE = process.env.CODESERVER_WORKSPACE ?? '';
const HOST = process.env.CODESERVER_HOST_DIR ?? WORKSPACE;
const ACCOUNT = process.env.CODESERVER_ACCOUNT ?? WORKSPACE;
const ACCOUNT_HOST = process.env.CODESERVER_ACCOUNT_HOST_DIR ?? (process.env.CODESERVER_ACCOUNT ? ACCOUNT : HOST);
const TRUST_URL = process.env.CODESERVER_TRUST_URL ?? '';

function put(relative: string, content: string, root = HOST): void {
  const file = path.join(root, ...relative.split('/'));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function contentOf(relative: string, root = HOST): string | null {
  const file = path.join(root, ...relative.split('/'));
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

async function load(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.locator('.monaco-workbench')).toBeVisible({ timeout: 60_000 });
}

const openInCodeServer = (page: Page, relative: string) => load(page, launchUrl(URL, WORKSPACE, relative));

// The active tab, by its accessible name: VS Code 1.141 shows the name without its extension in
// the tab and the full name in aria-label (an unnamed editor with a path: the whole path).
const activeTab = (page: Page) => page.locator('.tabs-container .tab.active');
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const named = (name: string) => new RegExp(`(^|[\\\\/ ])${escaped(name)}(,|$)`);
const editorLines = (page: Page) => page.locator('.monaco-editor .view-lines').first();
// Whether the window has no folder: VS Code 1.141 hides the side bar in such a window, and its
// Explorer then says so.
async function expectNoFolder(page: Page): Promise<void> {
  await page.keyboard.press('Control+Shift+E');
  await expect(page.locator('.explorer-viewlet').getByText('You have not yet opened a folder.'), 'no folder is open').toBeVisible();
}
// The status bar entry of a window in Restricted Mode.
const restricted = (page: Page) => page.locator('[id="status.workspaceTrust"]');

// The account's folder stays: a retry runs beforeAll again, and CI then looks in Nextcloud for the
// file the account's new-file test saved there. The tests write their files anew anyway.
test.beforeAll(() => {
  rmSync(path.join(HOST, 'My App'), { recursive: true, force: true });
});

test('open: the project folder and the file, also with awkward names', async ({ page }) => {
  const names = ['src/run.ps1', 'src/a #1 %.ps1', 'Übersicht/über ä.yaml', 'a+b&c=d.json'];
  for (const name of names) put(`My App/${name}`, `marker ${name.length}\n`);
  for (const name of names) {
    await test.step(name, async () => {
      await openInCodeServer(page, `My App/${name}`);
      const base = name.split('/').pop()!;
      await expect(activeTab(page), 'the file is in the editor').toHaveAttribute('aria-label', named(base));
      await expect(editorLines(page), 'with its content').toContainText(`marker${' '}${name.length}`);
      await expect(page.locator('.explorer-folders-view .monaco-list-row.selected'), 'marked in the Explorer').toContainText(base);
      await expect(page.locator('.explorer-viewlet .pane-header .title').first(), 'the project folder is open').toHaveText(/my app/i);
    });
  }
});

test('new file: an unnamed editor under the new name, saved with Ctrl+S; no overwrite without a question', async ({ page }) => {
  // code-server brings back the unsaved editors of an earlier run in the same folder: a folder of
  // this run's own keeps them apart.
  const folder = `My App/new-${Date.now().toString(36)}`;
  const content = (name: string) => contentOf(`${folder}/${name}`);

  await test.step('a file in a folder that does not exist yet', async () => {
    await openInCodeServer(page, `${folder}/deploy.ps1`);
    await expect(activeTab(page)).toHaveAttribute('aria-label', named('deploy.ps1'));
    await editorLines(page).click();
    await page.keyboard.type('Write-Output "saved"');
    await page.keyboard.press('Control+S');
    await expect.poll(() => content('deploy.ps1'), { timeout: 20_000 }).toBe('Write-Output "saved"');
  });

  await test.step('the file appears on disk before the save: code-server asks before replacing it', async () => {
    await openInCodeServer(page, `${folder}/synced.ps1`);
    await expect(activeTab(page)).toHaveAttribute('aria-label', named('synced.ps1'));
    put(`${folder}/synced.ps1`, 'from the sync\n');
    await editorLines(page).click();
    await page.keyboard.type('mine');
    await page.keyboard.press('Control+S');
    await expect(page.locator('.monaco-dialog-box')).toContainText("'synced.ps1' already exists. Do you want to replace it?");
    await page.locator('.monaco-dialog-box').getByRole('button', { name: 'Cancel' }).click();
    expect(content('synced.ps1')).toBe('from the sync\n');
  });
});

test('account: a file on its own in an empty window, also with awkward names', async ({ page }) => {
  const names = ['Photos/rename.ps1', 'Photos/2024/a #1 %.ps1', 'Dokumente/über ä.yaml', 'a+b&c=d.json'];
  for (const name of names) put(`All Files/${name}`, `account ${name.length}\n`, ACCOUNT_HOST);
  for (const name of names) {
    await test.step(name, async () => {
      await load(page, fileUrl(URL, ACCOUNT, `/All Files/${name}`));
      const base = name.split('/').pop()!;
      await expect(activeTab(page), 'the file is in the editor').toHaveAttribute('aria-label', named(base));
      await expect(editorLines(page), 'with its content').toContainText(`account${' '}${name.length}`);
      await expectNoFolder(page);
    });
  }
});

test('account: a new file in an empty window, saved with Ctrl+S', async ({ page }) => {
  // A folder of this run's own, as for the new file above.
  const folder = `All Files/new-${Date.now().toString(36)}`;
  await load(page, fileUrl(URL, ACCOUNT, `/${folder}/neu.ps1`));
  await expect(activeTab(page)).toHaveAttribute('aria-label', named('neu.ps1'));
  await editorLines(page).click();
  await page.keyboard.type('Write-Output "neu"');
  await page.keyboard.press('Control+S');
  await expect.poll(() => contentOf(`${folder}/neu.ps1`, ACCOUNT_HOST), { timeout: 20_000 }).toBe('Write-Output "neu"');
  await expectNoFolder(page);
});

test('account: a folder opens as code-server\'s folder', async ({ page }) => {
  put('All Files/Skripte/run.ps1', 'run\n', ACCOUNT_HOST);
  await load(page, folderUrl(URL, `${ACCOUNT}/All Files/Skripte`));
  await expect(page.locator('.explorer-viewlet .pane-header .title').first(), 'the folder is open').toHaveText(/skripte/i);
  await expect(page.locator('.explorer-folders-view .monaco-list-row'), 'with its files').toContainText(['run.ps1']);
});

test('trust: an empty window takes the trust of its file, as trusted in this browser', async ({ browser }) => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!TRUST_URL, 'needs a code-server with workspace trust on (CODESERVER_TRUST_URL)');
  // A folder of this run's own: trust is kept in the browser profile, which is new for each run.
  const root = `Trust-${Date.now().toString(36)}`;
  put(`${root}/trusted/sub/keep.txt`, 'keep\n');
  put(`${root}/trusted/other/x.ps1`, 'Write-Output x-trusted\n');
  put(`${root}/untrusted/y.ps1`, 'Write-Output y-untrusted\n');
  const context = await browser.newContext();
  const other = await browser.newContext();
  try {
    const page = await context.newPage();
    // Settled once the file is shown: the status bar entry comes with the trust state, before.
    const openFile = async (on: Page, file: string, marker: string) => {
      await load(on, fileUrl(TRUST_URL, WORKSPACE, `/${root}/${file}`));
      await expect(editorLines(on)).toContainText(marker);
    };

    await test.step('trust the folder "trusted" from a folder window below it, with its parent', async () => {
      await load(page, folderUrl(TRUST_URL, `${WORKSPACE}/${root}/trusted/sub`));
      const dialog = page.locator('.monaco-dialog-box');
      await expect(dialog).toContainText('Do you trust the authors of the files in this folder?');
      await dialog.getByText("Trust the authors of all files in the parent folder 'trusted'").click();
      await dialog.getByRole('button', { name: /Yes, I trust the authors/ }).click();
      await expect(dialog).toHaveCount(0);
    });

    await test.step('an empty window with a file below it: not in Restricted Mode', async () => {
      const ew = await context.newPage();
      await openFile(ew, 'trusted/other/x.ps1', 'x-trusted');
      await expect(restricted(ew), 'not in Restricted Mode').toHaveCount(0);
      await ew.close({ runBeforeUnload: true });
    });

    await test.step('an empty window with a file elsewhere: in Restricted Mode', async () => {
      const ew = await context.newPage();
      await openFile(ew, 'untrusted/y.ps1', 'y-untrusted');
      await expect(restricted(ew)).toContainText('Restricted Mode');
      await ew.close({ runBeforeUnload: true });
    });

    await test.step('the same file in another browser profile: in Restricted Mode, trust is the browser\'s', async () => {
      const ew = await other.newPage();
      await openFile(ew, 'trusted/other/x.ps1', 'x-trusted');
      await expect(restricted(ew)).toContainText('Restricted Mode');
      await ew.close({ runBeforeUnload: true });
    });
  } finally {
    await context.close();
    await other.close();
  }
});
