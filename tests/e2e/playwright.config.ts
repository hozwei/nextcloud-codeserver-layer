// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Two projects, each only when its environment is there (docs/development.md):
//  - nextcloud-chromium: the app in a real Nextcloud (specs/nextcloud-*.spec.ts). Needs
//    NEXTCLOUD_URL, NEXTCLOUD_CONTAINER (the Docker container, for occ) and the accounts the specs
//    name. code-server's address points to tests/e2e/server/capture.mjs, which only answers: the
//    tests read the address a new tab got.
//  - codeserver-chromium: the addresses the app builds, opened in a real code-server
//    (specs/codeserver.spec.ts). Needs CODESERVER_URL, CODESERVER_WORKSPACE (the working copy's
//    path in code-server) and CODESERVER_HOST_DIR (the same folder as this machine sees it).

import { defineConfig, devices } from '@playwright/test';

const capturePort = Number(process.env.CAPTURE_PORT || 8791);
const browser = { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 }, locale: 'en-US' };

export default defineConfig({
  testDir: './specs',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  // One test at a time: a test Nextcloud on SQLite answers parallel writes with 'database is
  // locked', and the specs change the app's settings.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.NEXTCLOUD_URL ? {
    command: `node server/capture.mjs ${capturePort}`,
    url: `http://127.0.0.1:${capturePort}/healthz`,
    reuseExistingServer: !process.env.CI,
  } : undefined,
  // Playwright matches a RegExp against the absolute path, and a checkout is often a folder named
  // nextcloud-codeserver-layer: anchor the patterns to the file name.
  projects: [
    ...(process.env.NEXTCLOUD_URL ? [{ name: 'nextcloud-chromium', testMatch: /(^|[\\/])nextcloud-[^\\/]*\.spec\.ts$/, use: browser }] : []),
    ...(process.env.CODESERVER_URL ? [{ name: 'codeserver-chromium', testMatch: /(^|[\\/])codeserver\.spec\.ts$/, use: browser }] : []),
    // Screenshots for the documentation, in the test Nextcloud, into SCREENSHOTS_DIR.
    ...(process.env.NEXTCLOUD_URL && process.env.SCREENSHOTS_DIR ? [{ name: 'screenshots-chromium', testMatch: /(^|[\\/])screenshots\.spec\.ts$/, use: browser }] : []),
  ],
});
