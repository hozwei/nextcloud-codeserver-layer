// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Whether to warn before a file opens in code-server (codeserver_layer/src/hints.ts).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, type DavInfo } from '../../codeserver_layer/src/hints.ts';

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const base: DavInfo = { modified: null, uploaded: null, locked: false, lockType: null, lockEditor: null, lockOwner: null, now: NOW };

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
  assert.deepEqual(decide({ ...base, locked: true, lockType: 1, lockEditor: 'richdocuments', lockOwner: 'Office' }, 60, NOW), [{ kind: 'lock', owner: 'Office' }]);
  assert.deepEqual(decide({ ...base, locked: true, lockType: 0, lockOwner: 'Alice' }, 60, NOW), [{ kind: 'lock', owner: 'Alice' }]);
  assert.deepEqual(decide({ ...base, locked: true, lockType: 1, lockEditor: 'text', uploaded: NOW - 1_000 }, 60, NOW), [{ kind: 'text' }, { kind: 'sync', seconds: 1 }]);
});
