// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Which files open in code-server, and whether on a click (codeserver_layer/src/match.ts).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extensionOf, kindOf, matchesFilename } from '../../codeserver_layer/src/match.ts';

const FORMATS = { click: ['ps1', 'ini', 'log'], menu: ['md', 'yaml'], filenames: ['Dockerfile', 'Dockerfile.*', '.env', '.env.*', '.gitignore'] };

test('extension: after the last dot, in lower case, not a leading dot', () => {
  assert.equal(extensionOf('a.PS1'), 'ps1');
  assert.equal(extensionOf('archive.tar.gz'), 'gz');
  assert.equal(extensionOf('.gitignore'), '');
  assert.equal(extensionOf('.eslintrc.json'), 'json');
  assert.equal(extensionOf('Makefile'), '');
  assert.equal(extensionOf('trailing.'), '');
});

test('file names in any letter case, * for any characters', () => {
  assert.ok(matchesFilename(FORMATS.filenames, 'dockerfile'));
  assert.ok(matchesFilename(FORMATS.filenames, 'Dockerfile.dev'));
  assert.ok(matchesFilename(FORMATS.filenames, '.env.local'));
  assert.ok(!matchesFilename(FORMATS.filenames, 'my.env'));
  assert.ok(!matchesFilename(FORMATS.filenames, 'xDockerfile'));
  assert.ok(matchesFilename(['a+b(c).*'], 'A+B(C).txt'), 'special characters are literal');
});

test('click, menu or nothing', () => {
  assert.equal(kindOf(FORMATS, 'run.ps1'), 'click');
  assert.equal(kindOf(FORMATS, 'RUN.PS1'), 'click');
  assert.equal(kindOf(FORMATS, 'notes.md'), 'menu');
  assert.equal(kindOf(FORMATS, 'compose.yaml'), 'menu');
  assert.equal(kindOf(FORMATS, 'Dockerfile'), 'click');
  assert.equal(kindOf(FORMATS, '.env.local'), 'click', 'a file name wins over its extension');
  assert.equal(kindOf(FORMATS, 'photo.jpg'), null);
  assert.equal(kindOf(FORMATS, 'README'), null);
});
