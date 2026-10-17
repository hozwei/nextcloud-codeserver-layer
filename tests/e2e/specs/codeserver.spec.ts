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
//
// Only the hand-over is tested here; code-server itself (highlighting, extensions) is not.

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { launchUrl } from '../../../codeserver_layer/src/launch.ts';

const URL = process.env.CODESERVER_URL ?? '';
const WORKSPACE = process.env.CODESERVER_WORKSPACE ?? '';
const HOST = process.env.CODESERVER_HOST_DIR ?? WORKSPACE;

function put(relative: string, content: string): void {
  const file = path.join(HOST, ...relative.split('/'));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function contentOf(relative: string): string | null {
  const file = path.join(HOST, ...relative.split('/'));
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

async function openInCodeServer(page: Page, relative: string): Promise<void> {
  await page.goto(launchUrl(URL, WORKSPACE, relative));
  await expect(page.locator('.monaco-workbench')).toBeVisible({ timeout: 60_000 });
}

// The active tab, by its accessible name: VS Code 1.141 shows the name without its extension in
// the tab and the full name in aria-label (an unnamed editor with a path: the whole path).
const activeTab = (page: Page) => page.locator('.tabs-container .tab.active');
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const named = (name: string) => new RegExp(`(^|[\\\\/ ])${escaped(name)}(,|$)`);

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
      await expect(page.locator('.monaco-editor .view-lines').first(), 'with its content').toContainText(`marker${' '}${name.length}`);
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
    await page.locator('.monaco-editor .view-lines').first().click();
    await page.keyboard.type('Write-Output "saved"');
    await page.keyboard.press('Control+S');
    await expect.poll(() => content('deploy.ps1'), { timeout: 20_000 }).toBe('Write-Output "saved"');
  });

  await test.step('the file appears on disk before the save: code-server asks before replacing it', async () => {
    await openInCodeServer(page, `${folder}/synced.ps1`);
    await expect(activeTab(page)).toHaveAttribute('aria-label', named('synced.ps1'));
    put(`${folder}/synced.ps1`, 'from the sync\n');
    await page.locator('.monaco-editor .view-lines').first().click();
    await page.keyboard.type('mine');
    await page.keyboard.press('Control+S');
    await expect(page.locator('.monaco-dialog-box')).toContainText("'synced.ps1' already exists. Do you want to replace it?");
    await page.locator('.monaco-dialog-box').getByRole('button', { name: 'Cancel' }).click();
    expect(content('synced.ps1')).toBe('from the sync\n');
  });
});
