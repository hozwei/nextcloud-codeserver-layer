// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Opening files in code-server from Files.
//
//   click and menu   without the default app, a click opens code-server for the formats no other
//                    app opens (.ps1, .ini, .log, Dockerfile, .env.local) and Nextcloud Text keeps
//                    its formats (.yaml, .md), which have the entry in their menu; the address
//                    code-server gets, also for names with spaces, umlauts, # and %; files outside
//                    the folder have no entry
//   default app      a click opens code-server for Text's formats too; View still opens Text and
//                    no tab; a /f/<id> link, which Files opens without a click, opens code-server
//   blocked tab      when the browser blocks the tab, the app asks, and its button opens it
//   outside group    an account the app is not enabled for has no entries

import { test, expect } from '@playwright/test';
import {
  CAPTURE, clickMenuItem, confirmIfAsked, Dav, dialog, introSeen, login, menu, occ, OTHER, openFolder, opensNoTab, opensTab, row, setApp, untraced, USER, WORKSPACE, NC,
} from '../lib/nextcloud.ts';

const FILES = ['run.ps1', 'settings.ini', 'server.log', 'compose.yaml', 'notes.md', 'Dockerfile', '.env.local', 'a #1 %.ps1', 'Übersicht.ps1', 'Report.PS1'];

test.beforeEach(async ({ context }) => {
  await introSeen(context);
  setApp('default_app', false);
  setApp('sync_hint_seconds', 0);
  const dav = await Dav.of(USER);
  await dav.remove('Projects');
  await dav.remove('Other');
  await dav.mkdir('Projects/My App');
  await dav.mkdir('Other');
  for (const name of FILES) await dav.put(`Projects/My App/${name}`, `${name}\n`);
  await dav.put('Projects/top.ps1');
  await dav.put('Other/out.ps1');
  occ('codeserver_layer:folder', USER.user, '/Projects');
  occ('user:setting', USER.user, 'files', 'show_hidden', '1');
});

test.afterEach(() => {
  setApp('default_app', false);
  occ('config:app:delete', 'codeserver_layer', 'sync_hint_seconds');
});

const click = (page: import('@playwright/test').Page, name: string) => async () => {
  await row(page, name).locator('[data-cy-files-list-row-name-link]').click();
};

test('click and menu: code-server for the formats no other app opens, the menu for Text\'s', async ({ page }) => {
  await login(page, USER);
  await openFolder(page, 'Projects/My App');
  await row(page, 'run.ps1').waitFor();

  await test.step('a .ps1 opens on a click, in its project folder', async () => {
    const opened = await opensTab(page, click(page, 'run.ps1'));
    expect(opened.folder).toBe(`${WORKSPACE}/My App`);
    expect(opened.file).toBe(`${WORKSPACE}/My App/run.ps1`);
    expect(opened.authority).toBe(new URL(CAPTURE).host);
  });

  await test.step('.ini, .log, Dockerfile, .env.local and .PS1 open on a click too', async () => {
    for (const name of ['settings.ini', 'server.log', 'Dockerfile', '.env.local', 'Report.PS1']) {
      const opened = await opensTab(page, click(page, name));
      expect(opened.file, name).toBe(`${WORKSPACE}/My App/${name}`);
    }
  });

  await test.step('names with spaces, #, % and umlauts reach code-server unchanged', async () => {
    for (const name of ['a #1 %.ps1', 'Übersicht.ps1']) {
      const opened = await opensTab(page, click(page, name));
      expect(opened.file, name).toBe(`${WORKSPACE}/My App/${name}`);
    }
  });

  await test.step('.yaml and .md: a click opens Nextcloud Text, the menu has the entry', async () => {
    for (const name of ['compose.yaml', 'notes.md']) {
      expect(await menu(page, name), name).toContain('Open in code-server');
      const opened = await opensTab(page, () => clickMenuItem(page, 'Open in code-server'));
      expect(opened.file, name).toBe(`${WORKSPACE}/My App/${name}`);
      await opensNoTab(page, click(page, name));
      await expect(page.locator('#viewer'), `${name} opens in the Viewer (Text)`).toBeVisible();
      await page.locator('#viewer').getByRole('button', { name: 'Close' }).first().click();
      await expect(page.locator('#viewer')).toBeHidden();
    }
  });

  await test.step('a file directly in the folder opens the whole working copy', async () => {
    await openFolder(page, 'Projects');
    const opened = await opensTab(page, click(page, 'top.ps1'));
    expect(opened.folder).toBe(WORKSPACE);
    expect(opened.file).toBe(`${WORKSPACE}/top.ps1`);
  });

  await test.step('outside the folder: no entry, no tab', async () => {
    await openFolder(page, 'Other');
    expect(await menu(page, 'out.ps1')).not.toContain('Open in code-server');
    await page.keyboard.press('Escape');
  });
});

test('default app: a click opens Text\'s formats in code-server; View still opens Text; a link asks first', async ({ page }) => {
  setApp('default_app', true);
  await login(page, USER);
  await openFolder(page, 'Projects/My App');
  await row(page, 'notes.md').waitFor();

  await test.step('.yaml and .md open in code-server on a click', async () => {
    for (const name of ['compose.yaml', 'notes.md']) {
      const opened = await opensTab(page, click(page, name));
      expect(opened.file, name).toBe(`${WORKSPACE}/My App/${name}`);
    }
  });

  await test.step('View opens Nextcloud Text and no code-server tab', async () => {
    const items = await menu(page, 'notes.md');
    expect(items).toContain('View');
    expect(items).toContain('Open in code-server');
    await opensNoTab(page, () => clickMenuItem(page, 'View'));
    await expect(page.locator('#viewer')).toBeVisible();
    await page.locator('#viewer').getByRole('button', { name: 'Close' }).first().click();
  });

  await test.step('a /f/<id> link: Files opens the file by itself; code-server opens, at once or after a question', async () => {
    // Without a click of the user the app asks first, so that the browser does not block the tab.
    // Chrome counts an address opened like a typed one as the user's, and then the tab opens at once.
    const id = await (await Dav.of(USER)).fileId('Projects/My App/run.ps1');
    const opened = await opensTab(page, async () => {
      await untraced(page, async () => {
        const checked = page.waitForRequest((r) => r.method() === 'PROPFIND' && r.url().endsWith('/run.ps1'));
        await page.goto(`${NC}/index.php/f/${id}`);
        await checked;
      });
      await confirmIfAsked(page, 'run.ps1');
    });
    expect(opened.file).toBe(`${WORKSPACE}/My App/run.ps1`);
  });
});

test('a blocked tab: the app asks, and its button opens the tab', async ({ page, context }) => {
  // The browser blocks the first tab, as a pop-up blocker would.
  await context.addInitScript(() => {
    const open = window.open.bind(window);
    let blocked = false;
    window.open = (...args: Parameters<typeof window.open>) => {
      if (!blocked) {
        blocked = true;
        return null;
      }
      return open(...args);
    };
  });
  await login(page, USER);
  await openFolder(page, 'Projects/My App');
  await row(page, 'run.ps1').locator('[data-cy-files-list-row-name-link]').click();
  await expect(dialog(page)).toContainText('Open run.ps1 in code-server?');
  const opened = await opensTab(page, () => dialog(page).getByRole('button', { name: 'Open in code-server' }).click());
  expect(opened.file).toBe(`${WORKSPACE}/My App/run.ps1`);
});

test('outside the group: no entries', async ({ page }) => {
  const dav = await Dav.of(OTHER);
  await dav.remove('Projects');
  await dav.mkdir('Projects');
  await dav.put('Projects/run.ps1');
  occ('codeserver_layer:folder', OTHER.user, '/Projects');
  await login(page, OTHER);
  await openFolder(page, 'Projects');
  expect(await menu(page, 'run.ps1')).not.toContain('Open in code-server');
  occ('codeserver_layer:folder', OTHER.user, '--clear');
});
