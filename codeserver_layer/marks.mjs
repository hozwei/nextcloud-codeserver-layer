// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Microsoft's trademark guidelines do not allow "Visual Studio Code" or "VS Code" in the name or
// the user interface of a product of others. This check fails if one of them appears in a text the
// app shows (t('codeserver_layer', ...) in src/, $l->t(...) in lib/ and templates/, l10n/*.json)
// or in the name, summary or description in appinfo/info.xml. Comments and documentation may name
// VS Code to say what code-server is built on.
//
//   node marks.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MARK = /\b(visual\s*studio|vs\s*code|vscode(?!-remote))\b/i;

function files(dir, ext) {
  const full = path.join(here, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full, { recursive: true }).filter((f) => f.endsWith(ext)).map((f) => path.join(full, f));
}

const texts = [];
for (const file of files('src', '.ts')) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'codeserver_layer'\s*,\s*(['"])((?:\\.|(?!\1).)*)\1/g)) texts.push([path.relative(here, file), m[2]]);
}
for (const file of [...files('lib', '.php'), ...files('templates', '.php')]) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/->t\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) texts.push([path.relative(here, file), m[2]]);
}
for (const file of files('l10n', '.json')) {
  const { translations } = JSON.parse(readFileSync(file, 'utf8'));
  for (const value of Object.values(translations ?? {})) texts.push([path.relative(here, file), String(value)]);
}
const info = readFileSync(path.join(here, 'appinfo', 'info.xml'), 'utf8');
for (const tag of ['name', 'summary', 'description']) {
  for (const m of info.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))) texts.push([`appinfo/info.xml <${tag}>`, m[1]]);
}

const found = texts.filter(([, text]) => MARK.test(text));
for (const [where, text] of found) console.error(`${where}: ${JSON.stringify(text)}`);
if (found.length > 0) {
  console.error('Texts of the app must not name Visual Studio Code or VS Code (trademark); say code-server.');
  process.exit(1);
}
console.log(`${texts.length} texts checked, none names Visual Studio Code or VS Code`);
