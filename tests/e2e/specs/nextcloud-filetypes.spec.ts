// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The file types (codeserver_layer/lib/Service/FileTypes.php):
//   types and icons  every extension of MAPPINGS gets its type, files from before are retyped, and
//                    every type of ALIASES shows Nextcloud's code icon
//   next to Craft    with the Craft Suite Layer, which writes the same files, enabling and disabling
//                    either app keeps the other's entries; disabling gives files their type back
//   administrator    an entry the administrator changed stays as it is

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { Dav, GROUP, inContainer, login, NC, occ, USER } from '../lib/nextcloud.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, '../../../codeserver_layer/lib/Service/FileTypes.php'), 'utf8');
const block = (name: string) => source.slice(source.indexOf(`public const ${name} = [`), source.indexOf('];', source.indexOf(`public const ${name} = [`)));
const MAPPINGS = Object.fromEntries([...block('MAPPINGS').matchAll(/'([^']+)' => \['([^']+)'/g)].map((m) => [m[1], m[2]]));
const ALIASES = [...block('ALIASES').matchAll(/'([^']+)' => 'text\/code'/g)].map((m) => m[1]);

const config = (name: 'mimetypemapping' | 'mimetypealiases'): Record<string, unknown> => {
  const text = inContainer(`cat /var/www/html/config/${name}.json 2>/dev/null || echo '{}'`);
  return JSON.parse(text) as Record<string, unknown>;
};
const enable = () => occ('app:enable', '-g', GROUP, 'codeserver_layer');
// Whose entries the config files hold: this app's (.ps1) and the Craft Suite Layer's (.pcraft).
const both = () => {
  const mapping = config('mimetypemapping');
  const aliases = config('mimetypealiases');
  return { ours: 'ps1' in mapping && 'application/x-powershell' in aliases, craft: 'pcraft' in mapping && 'application/x-photocraft' in aliases };
};
const craftInstalled = () => occ('app:list').includes('craftsuite_layer');
const disable = () => occ('app:disable', 'codeserver_layer');

test.afterAll(() => {
  occ('app:disable', 'craftsuite_layer');
  enable();
});

test('types and icons: every extension gets its type, older files are retyped, the code icon for all', async ({ page }) => {
  expect(Object.keys(MAPPINGS), 'mappings read from FileTypes.php').toHaveLength(68);
  expect(ALIASES, 'aliases read from FileTypes.php').toHaveLength(44);
  const dav = await Dav.of(USER);
  await dav.remove('Types');
  await dav.mkdir('Types');

  await test.step('a file from before the app gets its type when the app is enabled', async () => {
    disable();
    await dav.put('Types/old.ps1');
    expect(await dav.contentType('Types/old.ps1')).toBe('application/octet-stream');
    enable();
    expect(await dav.contentType('Types/old.ps1')).toBe('application/x-powershell');
  });

  await test.step('every extension gets its type', async () => {
    for (const [ext, type] of Object.entries(MAPPINGS)) {
      await dav.put(`Types/x.${ext}`);
      expect.soft(await dav.contentType(`Types/x.${ext}`), ext).toBe(type);
    }
  });

  await test.step('every alias leads to the code icon', async () => {
    await login(page, USER);
    for (const type of ALIASES) {
      const res = await page.request.get(`${NC}/index.php/core/mimeicon?mime=${encodeURIComponent(type)}`, { maxRedirects: 0 });
      expect.soft(res.headers().location ?? '', type).toMatch(/\/core\/img\/filetypes\/text-code\.svg/);
    }
  });

  await test.step('disabling gives the files their type back', async () => {
    disable();
    expect(await dav.contentType('Types/x.ps1')).toBe('application/octet-stream');
    expect(await dav.contentType('Types/x.jsonc')).toBe('application/octet-stream');
    expect(config('mimetypemapping').ps1, 'no entry left').toBeUndefined();
    enable();
    expect(await dav.contentType('Types/x.ps1')).toBe('application/x-powershell');
  });
});

test('next to the Craft Suite Layer: each app keeps the other\'s entries', async () => {
  // tests/e2e/tools/setup-nextcloud.sh unpacks it, given the release archive (CI does).
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!craftInstalled(), 'craftsuite_layer is not installed in the test Nextcloud');
  const dav = await Dav.of(USER);
  await dav.remove('Craft');
  await dav.mkdir('Craft');
  await dav.put('Craft/x.ps1');
  await dav.put('Craft/x.pcraft');

  await test.step('Craft enabled after this app: both', async () => {
    occ('app:enable', 'craftsuite_layer');
    expect(both()).toEqual({ ours: true, craft: true });
    expect(await dav.contentType('Craft/x.pcraft')).toBe('application/x-photocraft');
  });

  await test.step('this app disabled and enabled: Craft\'s entries stay', async () => {
    disable();
    expect(both()).toEqual({ ours: false, craft: true });
    expect(await dav.contentType('Craft/x.ps1')).toBe('application/octet-stream');
    expect(await dav.contentType('Craft/x.pcraft')).toBe('application/x-photocraft');
    enable();
    expect(both()).toEqual({ ours: true, craft: true });
  });

  await test.step('Craft disabled and enabled: this app\'s entries stay', async () => {
    occ('app:disable', 'craftsuite_layer');
    expect(both()).toEqual({ ours: true, craft: false });
    expect(await dav.contentType('Craft/x.ps1')).toBe('application/x-powershell');
    occ('app:enable', 'craftsuite_layer');
    expect(both()).toEqual({ ours: true, craft: true });
  });

  await test.step('both disabled: the files are as without either', async () => {
    disable();
    occ('app:disable', 'craftsuite_layer');
    expect(both()).toEqual({ ours: false, craft: false });
    expect(await dav.contentType('Craft/x.pcraft')).toBe('application/octet-stream');
    enable();
  });
});

test('administrator: an entry the administrator changed stays as it is', async () => {
  const edit = (script: string) => inContainer(`php -r '${script}'`);
  const file = '/var/www/html/config/mimetypemapping.json';
  // The administrator types .ini as plain text.
  edit(`$f="${file}"; $d=json_decode(file_get_contents($f), true); $d["ini"]=["text/plain"]; file_put_contents($f, json_encode($d, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES));`);
  disable();
  expect(config('mimetypemapping').ini, 'the administrator\'s entry stays').toEqual(['text/plain']);
  enable();
  expect(config('mimetypemapping').ini, 'and is not taken over').toEqual(['text/plain']);
  expect(occ('config:app:get', 'codeserver_layer', 'file_types')).not.toContain('"ini"');
  edit(`$f="${file}"; $d=json_decode(file_get_contents($f), true); unset($d["ini"]); file_put_contents($f, json_encode($d, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES));`);
  disable();
  enable();
  expect(config('mimetypemapping').ini).toEqual(['text/x-ini']);
});
