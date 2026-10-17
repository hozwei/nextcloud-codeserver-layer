// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Stands in for code-server in the Nextcloud tests: answers every request with a small page, so
// that a tab the app opens loads, and the test reads the address it got.
//
//   node server/capture.mjs [port]     (default 8791, on 127.0.0.1 only)

import { createServer } from 'node:http';

const port = Number(process.argv[2] || 8791);
createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('<!doctype html><title>code-server stand-in</title><p>code-server stand-in</p>');
}).listen(port, '127.0.0.1', () => console.log(`capture server on http://127.0.0.1:${port}/`));
