// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Whether to warn before a file or folder opens in code-server (codeserver_layer/src/hints.ts).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creatableBy, decide, decideFolder, writableBy, type DavInfo } from '../../codeserver_layer/src/hints.ts';

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const base: DavInfo = {
  modified: null, uploaded: null, locked: false, lockType: null, lockEditor: null, lockOwner: null, lockUser: null, writable: true, deletable: false, creatable: true, now: NOW,
};

test('no warning for a file changed long ago and not locked', () => {
  assert.deepEqual(decide({ ...base, modified: NOW - 3600_000, uploaded: NOW - 3600_000 }, 60, NOW), []);
});

test('a change within the window, by upload or by modification time', () => {
  assert.deepEqual(decide({ ...base, uploaded: NOW - 10_000, modified: NOW - 86_400_000 }, 60, NOW), [{ kind: 'sync', seconds: 10 }]);
  assert.deepEqual(decide({ ...base, modified: NOW - 30_000 }, 60, NOW), [{ kind: 'sync', seconds: 30 }]);
  assert.deepEqual(decide({ ...base, modified: NOW - 61_000 }, 60, NOW), []);
});

test('the server\'s clock counts, not the browser\'s; a client clock ahead counts as now', () => {
  assert.deepEqual(decide({ ...base, uploaded: NOW - 5_000 }, 60, NOW + 3600_000), [{ kind: 'sync', seconds: 5 }]);
  assert.deepEqual(decide({ ...base, now: null, uploaded: NOW - 5_000 }, 60, NOW), [{ kind: 'sync', seconds: 5 }], 'without a Date header, the browser\'s');
  assert.deepEqual(decide({ ...base, modified: NOW + 20_000 }, 60, NOW), [{ kind: 'sync', seconds: 0 }]);
  assert.deepEqual(decide({ ...base, modified: NOW + 3600_000, uploaded: NOW - 3600_000 }, 60, NOW), [], 'a laptop clock an hour ahead');
});

test('the window 0 turns the warning off', () => {
  assert.deepEqual(decide({ ...base, uploaded: NOW }, 0, NOW), []);
});

test('locks: Nextcloud Text, another app or a user', () => {
  assert.deepEqual(decide({ ...base, locked: true, lockType: 1, lockEditor: 'text' }, 60, NOW), [{ kind: 'text' }]);
  assert.deepEqual(decide({ ...base, locked: true, lockType: 1, lockEditor: 'richdocuments', lockOwner: 'Office' }, 60, NOW), [{ kind: 'lock', owner: 'Office', own: false }]);
  assert.deepEqual(decide({ ...base, locked: true, lockType: 0, lockOwner: 'Alice' }, 60, NOW), [{ kind: 'lock', owner: 'Alice', own: false }]);
  assert.deepEqual(decide({ ...base, locked: true, lockType: 1, lockEditor: 'text', uploaded: NOW - 1_000 }, 60, NOW), [{ kind: 'text' }, { kind: 'sync', seconds: 1 }]);
});

test('locks: the user\'s own as a user, which binds only other accounts (files_lock)', () => {
  const alices = { ...base, locked: true, lockType: 0, lockUser: 'alice', lockOwner: 'Alice' };
  assert.deepEqual(decide(alices, 60, NOW, 'alice'), [{ kind: 'lock', owner: 'Alice', own: true }]);
  assert.deepEqual(decide(alices, 60, NOW, 'bob'), [{ kind: 'lock', owner: 'Alice', own: false }]);
  assert.deepEqual(decide(alices, 60, NOW), [{ kind: 'lock', owner: 'Alice', own: false }], 'the user unknown: another\'s');
  assert.deepEqual(decide({ ...alices, lockType: 2 }, 60, NOW, 'alice'), [{ kind: 'lock', owner: 'Alice', own: false }], 'a token\'s lock binds its owner too');
  assert.deepEqual(decide({ ...base, locked: true, lockType: 1, lockEditor: 'text' }, 60, NOW, 'alice'), [{ kind: 'text' }], 'Text\'s lock binds everyone');
});

test('read only: W in the WebDAV permissions, not NV (renaming a share\'s mount point)', () => {
  assert.equal(writableBy('RGDNVW'), true);
  assert.equal(writableBy('SRGDNVW'), true, 'shared with edit rights');
  assert.equal(writableBy('SGDNV'), false, 'a file shared read-only, in its folder\'s listing: the mount point can be renamed and moved');
  assert.equal(writableBy('SGDN'), false, 'the same file on its own (Depth 0)');
  assert.equal(writableBy('SRGDN'), false, 'the same, shared on');
  assert.equal(writableBy('SG'), false, 'in a folder shared read-only');
  assert.equal(writableBy('RMG'), false, 'in a team folder with read-only rights');
  assert.deepEqual(decide({ ...base, writable: false }, 60, NOW), [{ kind: 'readonly', deletable: false }]);
  assert.deepEqual(decide({ ...base, writable: false, deletable: true }, 60, NOW), [{ kind: 'readonly', deletable: true }], 'shared on its own: deleting leaves the share');
  assert.deepEqual(decide({ ...base, writable: null }, 60, NOW), [], 'no permissions in the answer: no warning');
  assert.deepEqual(decide({ ...base, writable: false, locked: true, lockType: 0, lockOwner: 'Alice', uploaded: NOW - 2_000 }, 60, NOW),
    [{ kind: 'readonly', deletable: false }, { kind: 'lock', owner: 'Alice', own: false }, { kind: 'sync', seconds: 2 }]);
});

test('folders: no new files without C in the WebDAV permissions; W and locks do not count', () => {
  assert.equal(creatableBy('RGDNVCK'), true);
  assert.equal(creatableBy('SRGDNVCK'), true, 'shared with edit rights');
  assert.equal(creatableBy('SRGDNV'), false, 'a folder shared read-only (its mount point can be renamed)');
  assert.equal(creatableBy('SG'), false, 'a folder in it');
  assert.deepEqual(decideFolder({ ...base, creatable: false }, 60, NOW), [{ kind: 'nocreate' }]);
  assert.deepEqual(decideFolder({ ...base, creatable: null }, 60, NOW), [], 'no permissions in the answer: no warning');
  assert.deepEqual(decideFolder({ ...base, creatable: false, modified: NOW - 3_000 }, 60, NOW), [{ kind: 'nocreate' }, { kind: 'sync', seconds: 3 }]);
  assert.deepEqual(decideFolder({ ...base, writable: false, locked: true, lockType: 0, lockOwner: 'Alice' }, 60, NOW), [], 'a folder has no W');
});
