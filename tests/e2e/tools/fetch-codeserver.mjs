// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Downloads code-server's standalone archive for the tests into .codeserver/ and checks its
// SHA-256: the tested version from tests/e2e/versions.json, or with --latest the newest release
// (the canary). code-server publishes no checksum files; GitHub shows each asset's digest, which
// versions.json pins and which --latest reads from the API (with GITHUB_TOKEN, so that the
// unauthenticated limit of 60 requests an hour does not apply). Release files come from plain
// download URLs.
//
//   node tests/e2e/tools/fetch-codeserver.mjs [--latest] [--platform linux-amd64|linux-arm64|macos-amd64|macos-arm64]
//
// Prints the folder of the unpacked release (with bin/code-server) and writes it, with the version,
// to .codeserver/selected.json. There is no Windows release: on Windows the default is linux-amd64,
// for code-server in a container.

import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream, renameSync, rmSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const out = path.join(root, '.codeserver');
const versions = JSON.parse(readFileSync(path.join(here, '../versions.json'), 'utf8'));

const args = process.argv.slice(2);
const latest = args.includes('--latest');
const at = args.indexOf('--platform');
const platform = at >= 0 ? args[at + 1] : process.platform === 'darwin'
  ? (process.arch === 'arm64' ? 'macos-arm64' : 'macos-amd64')
  : (process.arch === 'arm64' ? 'linux-arm64' : 'linux-amd64');
if (!/^(linux|macos)-(amd64|arm64)$/.test(platform)) throw new Error(`unknown platform ${platform}`);

async function newest() {
  const res = await fetch('https://github.com/coder/code-server/releases/latest', { redirect: 'manual' });
  const tag = /\/releases\/tag\/(v\d+\.\d+\.\d+)$/.exec(res.headers.get('location') ?? '')?.[1];
  if (!tag) throw new Error(`no release tag in the redirect of releases/latest (HTTP ${res.status})`);
  return tag.slice(1);
}

async function digest(version, name) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('--latest needs GITHUB_TOKEN to read the asset digest from the API');
  const res = await fetch(`https://api.github.com/repos/coder/code-server/releases/tags/v${version}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`release v${version}: HTTP ${res.status}`);
  const asset = (await res.json()).assets?.find((a) => a.name === name);
  const sha = /^sha256:([0-9a-f]{64})$/.exec(asset?.digest ?? '')?.[1];
  if (!sha) throw new Error(`no SHA-256 digest for ${name}`);
  return sha;
}

async function sha256(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

const version = latest ? await newest() : versions.codeServer.version;
const base = `code-server-${version}-${platform}`;
const expected = latest ? await digest(version, `${base}.tar.gz`) : versions.codeServer.sha256[platform];
if (!expected) throw new Error(`no pinned SHA-256 for ${platform}`);
mkdirSync(out, { recursive: true });
const archive = path.join(out, `${base}.tar.gz`);
const dir = path.join(out, base);

if (!existsSync(path.join(dir, 'bin'))) {
  if (!existsSync(archive) || await sha256(archive) !== expected) {
    const res = await fetch(`https://github.com/coder/code-server/releases/download/v${version}/${base}.tar.gz`);
    if (!res.ok || !res.body) throw new Error(`download ${base}.tar.gz: HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(`${archive}.part`));
    renameSync(`${archive}.part`, archive);
  }
  const got = await sha256(archive);
  if (got !== expected) {
    rmSync(archive, { force: true });
    throw new Error(`${base}.tar.gz: SHA-256 ${got}, expected ${expected}`);
  }
  // The archive holds one folder, <base>/; tar on Windows gets the folder as an argument too.
  execFileSync('tar', ['-xzf', path.basename(archive)], { cwd: out, stdio: 'inherit' });
}
writeFileSync(path.join(out, 'selected.json'), JSON.stringify({ version, platform, dir: base }, null, 2) + '\n');
console.log(dir);
