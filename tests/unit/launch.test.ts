// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The address that opens a file in code-server (codeserver_layer/src/launch.ts): what VS Code makes
// of it, decoded as VS Code decodes it (URLSearchParams, JSON, URI.parse), for awkward names.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeLaunchUrl, launchUrl, projectOf, relativePath } from '../../codeserver_layer/src/launch.ts';

const ADDRESS = 'https://code.example.com/';

test('the example from the documentation, byte for byte', () => {
  assert.equal(
    launchUrl(ADDRESS, '/workspace', 'My App/src/a #1 %.ps1'),
    'https://code.example.com/?folder=/workspace/My%20App&payload=%5B%5B%22openFile%22%2C%22vscode-remote%3A%2F%2Fcode.example.com%2Fworkspace%2FMy%2520App%2Fsrc%2Fa%2520%25231%2520%2525.ps1%22%5D%5D',
  );
});

test('awkward names come back as they were', () => {
  const names = [
    'Projekt/Übersicht.ps1',
    'Projekt/a b/c d.yaml',
    'p/hash#tag.md',
    'p/100%.txt',
    'p/a+b&c=d.json',
    'p/what?.log',
    "p/it's (1) [x].sh",
    'p/emoji 😀.py',
    'p/semi;colon,comma.ini',
    'p/%2F not a slash.txt',
    'p/back\\slash.txt',
    'p/ä/ö/ü/ß.toml',
    'p/.env.local',
  ];
  for (const name of names) {
    const decoded = decodeLaunchUrl(launchUrl(ADDRESS, '/workspace', name));
    assert.equal(decoded.file, `/workspace/${name}`, name);
    assert.equal(decoded.folder, `/workspace/${name.split('/')[0]}`, name);
    assert.equal(decoded.authority, 'code.example.com', name);
  }
});

test('a file directly in the folder opens the working copy as the folder', () => {
  const decoded = decodeLaunchUrl(launchUrl(ADDRESS, '/workspace', 'notes.ps1'));
  assert.equal(decoded.folder, '/workspace');
  assert.equal(decoded.file, '/workspace/notes.ps1');
});

test('the host is the browser\'s: port kept, default port and case dropped, base path kept', () => {
  assert.equal(decodeLaunchUrl(launchUrl('https://Code.Example.com:8443/', '/w', 'p/a.ps1')).authority, 'code.example.com:8443');
  assert.equal(decodeLaunchUrl(launchUrl('https://code.example.com:443/', '/w', 'p/a.ps1')).authority, 'code.example.com');
  assert.equal(decodeLaunchUrl(launchUrl('http://[::1]:8080/', '/w', 'p/a.ps1')).authority, '[::1]:8080');
  assert.match(launchUrl('https://example.com/code', '/w', 'p/a.ps1'), /^https:\/\/example\.com\/code\/\?folder=/);
  assert.equal(decodeLaunchUrl(launchUrl('https://example.com/code/', '/w', 'p/a.ps1')).authority, 'example.com');
});

test('the working copy may have spaces and a trailing slash', () => {
  const decoded = decodeLaunchUrl(launchUrl(ADDRESS, '/data/My Copy/', 'p/a.ps1'));
  assert.equal(decoded.folder, '/data/My Copy/p');
  assert.equal(decoded.file, '/data/My Copy/p/a.ps1');
});

test('relativePath: inside the folder or not', () => {
  assert.equal(relativePath('/Projects', '/Projects/My App/a.ps1'), 'My App/a.ps1');
  assert.equal(relativePath('/Projects', '/Projects/a.ps1'), 'a.ps1');
  assert.equal(relativePath('/Projects', '/Projects'), null);
  assert.equal(relativePath('/Projects', '/ProjectsX/a.ps1'), null);
  assert.equal(relativePath('/Projects', '/Other/a.ps1'), null);
  assert.equal(relativePath('/', '/a/b.ps1'), 'a/b.ps1');
  assert.equal(projectOf('My App/src/a.ps1'), 'My App');
  assert.equal(projectOf('a.ps1'), null);
});
