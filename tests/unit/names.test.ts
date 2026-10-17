// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Names of new files from "+ New" (codeserver_layer/src/names.ts): valid on Windows clients, free
// in the folder in any letter case.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeName, isTaken, newName, windowsProblem, withExtension } from '../../codeserver_layer/src/names.ts';

test('the extension is appended once', () => {
  assert.equal(withExtension('deploy', 'ps1'), 'deploy.ps1');
  assert.equal(withExtension('deploy.ps1', 'ps1'), 'deploy.ps1');
  assert.equal(withExtension('deploy.PS1', 'ps1'), 'deploy.ps1');
  assert.equal(withExtension('  deploy  ', 'ps1'), 'deploy.ps1');
  assert.equal(withExtension('deploy.yaml', 'ps1'), 'deploy.yaml.ps1');
});

test('names Windows clients cannot hold', () => {
  for (const name of ['a<b.ps1', 'a>b.ps1', 'a:b.ps1', 'a"b.ps1', 'a/b.ps1', 'a\\b.ps1', 'a|b.ps1', 'a?b.ps1', 'a*b.ps1', 'a\u0001b.ps1']) {
    assert.equal(windowsProblem(name), 'character', name);
  }
  for (const name of ['CON.ps1', 'con', 'Prn.txt', 'AUX.yaml', 'nul.json', 'COM1.ps1', 'lpt9.sh', 'COM¹.ps1']) {
    assert.equal(windowsProblem(name), 'reserved', name);
  }
  assert.equal(windowsProblem('console.ps1'), null, 'only the whole name is reserved');
  assert.equal(windowsProblem('a.ps1 '), 'end');
  assert.equal(windowsProblem('a.'), 'end');
  assert.equal(windowsProblem(`${'ä'.repeat(125)}x.ps1`), 'long', '250 bytes in UTF-8');
  assert.equal(windowsProblem(`${'a'.repeat(246)}.ps1`), null);
  assert.equal(windowsProblem('Übersicht 2026.ps1'), null);
});

test('taken in any letter case, and the free name Files would propose', () => {
  const others = ['Test.ps1', 'test (1).ps1', 'Other.yaml'];
  assert.ok(isTaken('test.ps1', others));
  assert.ok(isTaken('TEST.PS1', others));
  assert.ok(!isTaken('test.psm1', others));
  assert.equal(freeName('test.ps1', others), 'test (2).ps1');
  assert.equal(freeName('new.ps1', others), 'new.ps1');
  assert.equal(freeName('Makefile', ['makefile']), 'Makefile (1)');
});

test('the name of a new file from the stem typed', () => {
  const others = ['deploy.ps1'];
  assert.deepEqual(newName('build', 'ps1', others), { name: 'build.ps1', problem: null });
  assert.deepEqual(newName('Deploy', 'ps1', others), { name: 'Deploy.ps1', problem: 'taken' });
  assert.deepEqual(newName('', 'ps1', others), { name: '.ps1', problem: 'empty' });
  assert.deepEqual(newName('   ', 'ps1', others), { name: '.ps1', problem: 'empty' });
  assert.deepEqual(newName('con', 'ps1', others), { name: 'con.ps1', problem: 'reserved' });
});
