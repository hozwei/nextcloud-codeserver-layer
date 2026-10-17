// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Where a file opens in code-server and the address that opens it (codeserver_layer/src/launch.ts):
// the target for each place, and what VS Code makes of the addresses, decoded as VS Code decodes
// them (URLSearchParams, JSON, URI.parse), for awkward names.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeLaunchUrl, fileUrl, fileUrlFor, folderUrl, folderUrlFor, launchUrl, projectOf, relativePath, target, type Places,
} from '../../codeserver_layer/src/launch.ts';

const ADDRESS = 'https://code.example.com/';

const AWKWARD = [
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

test('the example from the documentation, byte for byte', () => {
  assert.equal(
    launchUrl(ADDRESS, '/workspace', 'My App/src/a #1 %.ps1'),
    'https://code.example.com/?folder=/workspace/My%20App&payload=%5B%5B%22openFile%22%2C%22vscode-remote%3A%2F%2Fcode.example.com%2Fworkspace%2FMy%2520App%2Fsrc%2Fa%2520%25231%2520%2525.ps1%22%5D%5D',
  );
});

test('awkward names come back as they were', () => {
  for (const name of AWKWARD) {
    const decoded = decodeLaunchUrl(launchUrl(ADDRESS, '/workspace', name));
    assert.equal(decoded.file, `/workspace/${name}`, name);
    assert.equal(decoded.folder, `/workspace/${name.split('/')[0]}`, name);
    assert.equal(decoded.authority, 'code.example.com', name);
    assert.equal(decoded.emptyWindow, false, name);
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

const FOLDER: Places = { folder: { path: '/Projects', workspace: '/workspace' }, account: null };
const ACCOUNT: Places = { folder: null, account: { workspace: '/nextcloud', exclude: [] } };
const BOTH: Places = { folder: { path: '/Projects', workspace: '/workspace' }, account: { workspace: '/nextcloud', exclude: [] } };

test('target: the code-server folder comes first, then account access, else nothing', () => {
  assert.deepEqual(target(BOTH, '/Projects/My App/a.ps1'), { kind: 'folder', relative: 'My App/a.ps1' });
  assert.deepEqual(target(BOTH, '/Projects'), { kind: 'folder', relative: '' }, 'the folder itself');
  assert.deepEqual(target(BOTH, '/Projects/'), { kind: 'folder', relative: '' });
  assert.deepEqual(target(BOTH, '/ProjectsX/a.ps1'), { kind: 'account', path: '/ProjectsX/a.ps1' }, 'a sibling with the same start');
  assert.deepEqual(target(BOTH, '/Photos/2024/a.ps1'), { kind: 'account', path: '/Photos/2024/a.ps1' });
  assert.deepEqual(target(BOTH, '/'), { kind: 'account', path: '/' });
  assert.deepEqual(target(FOLDER, '/Projects/a.ps1'), { kind: 'folder', relative: 'a.ps1' });
  assert.equal(target(FOLDER, '/Photos/a.ps1'), null, 'outside the folder without account access');
  assert.deepEqual(target(ACCOUNT, '/Projects/a.ps1'), { kind: 'account', path: '/Projects/a.ps1' }, 'account access without a folder');
  assert.equal(target({ folder: null, account: null }, '/a.ps1'), null);
  assert.equal(target(BOTH, 'relative/a.ps1'), null);
  const all: Places = { folder: { path: '/', workspace: '/workspace' }, account: { workspace: '/nextcloud', exclude: [] } };
  assert.deepEqual(target(all, '/Photos/a.ps1'), { kind: 'folder', relative: 'Photos/a.ps1' }, 'a code-server folder of all files');
  assert.deepEqual(target(all, '/'), { kind: 'folder', relative: '' });
});

test('target: never in a folder the mount leaves out, unless it is the code-server folder', () => {
  const places: Places = { folder: { path: '/Projects', workspace: '/workspace' }, account: { workspace: '/nextcloud', exclude: ['/Projects', '/Work Copy'] } };
  assert.deepEqual(target(places, '/Projects/My App/a.ps1'), { kind: 'folder', relative: 'My App/a.ps1' }, 'the working copy comes first');
  assert.equal(target(places, '/Work Copy/a.ps1'), null);
  assert.equal(target(places, '/Work Copy'), null, 'the folder itself');
  assert.deepEqual(target(places, '/Work Copy 2/a.ps1'), { kind: 'account', path: '/Work Copy 2/a.ps1' }, 'a sibling with the same start');
  const noFolder: Places = { folder: null, account: places.account };
  assert.equal(target(noFolder, '/Projects/My App/a.ps1'), null, 'without the code-server folder: nothing, rather than the hidden path');
});

test('a file anywhere in the account: an empty window, byte for byte', () => {
  assert.equal(
    fileUrl(ADDRESS, '/nextcloud/files', '/Photos/2024/rename #1 %.ps1'),
    'https://code.example.com/?ew=true&payload=%5B%5B%22openFile%22%2C%22vscode-remote%3A%2F%2Fcode.example.com%2Fnextcloud%2Ffiles%2FPhotos%2F2024%2Frename%2520%25231%2520%2525.ps1%22%5D%5D',
  );
});

test('a file anywhere in the account: awkward names come back, no folder', () => {
  for (const name of AWKWARD) {
    const decoded = decodeLaunchUrl(fileUrl(ADDRESS, '/data/All Files/', `/${name}`));
    assert.equal(decoded.file, `/data/All Files/${name}`, name);
    assert.equal(decoded.folder, null, name);
    assert.equal(decoded.emptyWindow, true, name);
    assert.equal(decoded.authority, 'code.example.com', name);
  }
  assert.match(fileUrl('https://example.com/code', '/n', '/a.ps1'), /^https:\/\/example\.com\/code\/\?ew=true&payload=/);
});

test('a folder: the folder, encoded once, without a file', () => {
  assert.equal(folderUrl(ADDRESS, '/nextcloud/Photos/2024 #1 %'), 'https://code.example.com/?folder=/nextcloud/Photos/2024%20%231%20%25');
  for (const name of AWKWARD) {
    const folder = `/nextcloud/${name}`;
    const decoded = decodeLaunchUrl(folderUrl(ADDRESS, folder));
    assert.equal(decoded.folder, folder, name);
    assert.equal(decoded.file, null, name);
    assert.equal(decoded.emptyWindow, false, name);
  }
});

test('the address for each target', () => {
  const inFolder = decodeLaunchUrl(fileUrlFor(ADDRESS, BOTH, { kind: 'folder', relative: 'My App/a.ps1' })!);
  assert.deepEqual([inFolder.folder, inFolder.file, inFolder.emptyWindow], ['/workspace/My App', '/workspace/My App/a.ps1', false]);
  const inAccount = decodeLaunchUrl(fileUrlFor(ADDRESS, BOTH, { kind: 'account', path: '/Photos/a.ps1' })!);
  assert.deepEqual([inAccount.folder, inAccount.file, inAccount.emptyWindow], [null, '/nextcloud/Photos/a.ps1', true]);
  assert.equal(fileUrlFor(ADDRESS, FOLDER, { kind: 'account', path: '/Photos/a.ps1' }), null);

  assert.equal(decodeLaunchUrl(folderUrlFor(ADDRESS, BOTH, { kind: 'folder', relative: 'My App/src' })!).folder, '/workspace/My App/src');
  assert.equal(decodeLaunchUrl(folderUrlFor(ADDRESS, BOTH, { kind: 'folder', relative: '' })!).folder, '/workspace', 'the code-server folder itself');
  assert.equal(decodeLaunchUrl(folderUrlFor(ADDRESS, BOTH, { kind: 'account', path: '/Photos/2024' })!).folder, '/nextcloud/Photos/2024');
  assert.equal(folderUrlFor(ADDRESS, BOTH, { kind: 'account', path: '/' }), null, 'never the whole account');
});
