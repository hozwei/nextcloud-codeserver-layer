// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Downloads the Nextcloud app of the Craft Suite Layer (craftsuite_layer), which writes the same
// MIME type files as this app, for the tests next to it (specs/nextcloud-filetypes.spec.ts): the
// release in tests/e2e/versions.json, checked against its pinned SHA-256, or with --latest the
// newest release (the canary), checked against the SHA256SUMS published with it. Plain download
// URLs, no API.
//
//   node tests/e2e/tools/fetch-craftsuite-layer.mjs [--latest] <folder>
//
// Prints the archive's path and writes the version to <folder>/selected.json.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const versions = JSON.parse(readFileSync(path.join(here, '../versions.json'), 'utf8'));
const repo = 'https://github.com/hozwei/nextcloud-craftsuite-layer';

const args = process.argv.slice(2);
const latest = args.includes('--latest');
const out = args.find((arg) => !arg.startsWith('--'));
if (!out) throw new Error('usage: fetch-craftsuite-layer.mjs [--latest] <folder>');

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

let version = versions.craftsuiteLayer.version;
if (latest) {
  const res = await fetch(`${repo}/releases/latest`, { redirect: 'manual' });
  const tag = /\/releases\/tag\/(v\d+\.\d+\.\d+)$/.exec(res.headers.get('location') ?? '')?.[1];
  if (!tag) throw new Error(`no release tag in the redirect of releases/latest (HTTP ${res.status})`);
  version = tag.slice(1);
}
const name = `craftsuite_layer-${version}.tar.gz`;
const base = `${repo}/releases/download/v${version}`;
let expected = versions.craftsuiteLayer.sha256;
if (latest) {
  const sums = (await download(`${base}/SHA256SUMS`)).toString('utf8');
  expected = new RegExp(`^([0-9a-f]{64}) [ *]${name.replaceAll('.', '\\.')}$`, 'm').exec(sums)?.[1];
  if (!expected) throw new Error(`the SHA256SUMS of v${version} list no ${name}`);
}
const archive = await download(`${base}/${name}`);
const got = createHash('sha256').update(archive).digest('hex');
if (got !== expected) throw new Error(`${name}: SHA-256 ${got}, expected ${expected}`);

mkdirSync(out, { recursive: true });
const file = path.join(out, name);
writeFileSync(file, archive);
writeFileSync(path.join(out, 'selected.json'), JSON.stringify({ version }, null, 2) + '\n');
console.log(file);
