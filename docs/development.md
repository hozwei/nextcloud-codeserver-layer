<!--
  - SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Development

## Requirements

- Node.js 24 or newer.
- Playwright's Chromium (`npx playwright install chromium`; on Linux `--with-deps`, which needs
  root).
- For the tests in Nextcloud: Docker, or any Nextcloud 34 or 35 the browser can reach that runs in
  a Docker container laid out like the official image (Nextcloud in `/var/www/html`, the
  container's working directory, `occ` run as `www-data`; see below), or one without Docker
  whose `occ` a shell command runs (`NEXTCLOUD_OCC`).
- For the tests in code-server: Linux or macOS (code-server publishes no Windows release), or
  Docker.
- Optional: `make`, PHP and `xmllint` for the app's checks.

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Installs the tools; CI uses `npm ci --ignore-scripts` |
| `npm run build` | Bundles `codeserver_layer/src/{files,admin,personal,aliases}.ts` with esbuild into `codeserver_layer/js/*.mjs`, each with a `.license` file listing the bundled packages; `npm run build:dev` keeps it readable |
| `npm run lint` | ESLint with typescript-eslint and type information (`no-floating-promises`, `no-misused-promises`), and eslint-plugin-playwright for the end-to-end tests |
| `npm run typecheck` | TypeScript check of the app's front end and the tests |
| `npm run l10n:check` | Every text has its translations in `codeserver_layer/l10n/` (`de` informal, `de_DE` formal), none unused, placeholders match, `l10n/*.js` matches `l10n/*.json`; `npm run l10n:write` writes the `.js` files |
| `npm run marks:check` | No "Visual Studio Code" or "VS Code" in the app's name and texts (Microsoft's trademark guidelines) |
| `npm run test:unit` | `node --test` on `tests/unit/`: where a path opens and its address, the formats, the name rules, the warnings |
| `npm run test:e2e` | The Playwright projects whose environment is set (below) |
| `npm test` | `lint`, `typecheck`, `l10n:check`, `marks:check` and `test:unit`: everything that needs neither Nextcloud nor code-server |
| `make -C codeserver_layer lint` | `php -l` on every PHP file, a `CHANGELOG.md` section for the version in `appinfo/info.xml`, `info.xml` and the icons well-formed (`INFO_XSD=<path>`: also against the App Store schema) |
| `make -C codeserver_layer appstore` | The App Store archive `build/artifacts/codeserver_layer.tar.gz`, from an allowlist of runtime files, staged in `build/stage/codeserver_layer/` |

## Tests in Nextcloud

The project `nextcloud-chromium` runs `tests/e2e/specs/nextcloud-*.spec.ts` in a real Nextcloud,
one test at a time (a test Nextcloud on SQLite answers parallel writes with `database is locked`).
code-server's address points to `tests/e2e/server/capture.mjs` on `127.0.0.1:8791`, which only
answers; the tests read the address a new tab got and decode it as VS Code does.

| Spec | What it checks |
|---|---|
| `nextcloud-open.spec.ts` | a click and the menu without and with the default app, the address for awkward names, a file directly in the folder, files outside the folder, View still opening Text, a `/f/<id>` link, a blocked tab, an account outside the group |
| `nextcloud-account.spec.ts` | account access: a file outside the code-server folder in a window without a folder, inside still from the working copy, nothing without account access; a default app for each place; folders from their menu and from the button next to the path, not the account's root; the folders left out; "+ New" everywhere; a file shared read-only, also on its own; the warning window of account access; account access without a code-server folder |
| `nextcloud-new.spec.ts` | the "+ New" entries in and outside the folder, the name dialog's checks, the new path, no file in Nextcloud, the administrator's choice of entries |
| `nextcloud-hints.spec.ts` | the warning about a recent change and its window, a user's lock and Nextcloud Text's (files_lock), the explanation once per browser, a slow check |
| `nextcloud-settings.spec.ts` | the administration page saving and refusing, also account access's place, folders left out and window, an administrator outside the group, the personal page with a renamed folder and account access, `occ codeserver_layer:folder` and `:account`, German informal and formal |
| `nextcloud-filetypes.spec.ts` | every type and alias, files retyped on enable and disable, the Craft Suite Layer's entries kept in both orders, an administrator's entry kept |

A test Nextcloud with Docker, with the App Store package as users install it:

```sh
make -C codeserver_layer appstore
docker run -d --name nextcloud -p 8080:80 \
  -e SQLITE_DATABASE=nextcloud \
  -e NEXTCLOUD_ADMIN_USER=admin -e NEXTCLOUD_ADMIN_PASSWORD=test-password \
  -e NEXTCLOUD_TRUSTED_DOMAINS=localhost \
  -v "$PWD/codeserver_layer/build/stage/codeserver_layer:/var/www/html/custom_apps/codeserver_layer" \
  nextcloud:35.0.1-apache
sh tests/e2e/tools/setup-nextcloud.sh nextcloud http://localhost:8080 [craftsuite_layer-<version>.tar.gz]
NEXTCLOUD_URL=http://localhost:8080 NEXTCLOUD_CONTAINER=nextcloud NEXTCLOUD_PASSWORD=test-password \
  npm run test:e2e -- --project=nextcloud-chromium
```

Without Docker, set up such a Nextcloud yourself, with everything `setup-nextcloud.sh` does (below),
and give the tests `NEXTCLOUD_OCC`, a shell command that runs its `occ` as the owner of
`config/config.php`, such as `NEXTCLOUD_OCC="sudo -u www-data php /srv/nextcloud/occ"`, instead of
`NEXTCLOUD_CONTAINER`; `nextcloud-filetypes.spec.ts` still needs the container's paths.

`setup-nextcloud.sh` waits for the installation, disables `firstrunwizard`, adds the group `code`
with `admin` in it (the administration page saves only for an administrator the app is enabled
for), and the accounts `e2e-user` (in the group), `e2e-admin2` (an administrator outside it) and
`e2e-other` (outside it), with the passwords `e2e-<account><E2E_PASSWORD_SUFFIX>` (such as
`e2e-e2e-user-password-7f3a`). It enables the app for the group and sets `url` to
`http://127.0.0.1:<CAPTURE_PORT>/` (default 8791), where the tests catch the addresses, and
`workspace` to `/workspace`. Given a release archive of the Craft Suite Layer,
it unpacks it for the test next to it; without one, that test is skipped.
`node tests/e2e/tools/fetch-craftsuite-layer.mjs <folder>` downloads the release that
`tests/e2e/versions.json` names and checks its SHA-256; with `--latest`, the newest release,
checked against its `SHA256SUMS`. The tests change settings and restore them; Nextcloud keeps
the app config in a local cache for 3 seconds, and a request that loads lazy values meanwhile can
store the old values again for another 3, which `configSettled()` (7 seconds) waits out where a
page is already open.

## Tests in code-server

The project `codeserver-chromium` runs `tests/e2e/specs/codeserver.spec.ts`: only the hand-over to a
real code-server, the app's addresses (a file in its project folder, a file on its own in a window
without a folder, a folder, awkward names), a new file's path saved with Ctrl+S, and how a window
without a folder takes the workspace trust of its file. code-server itself (highlighting,
extensions) is not the app's to test. It needs `CODESERVER_URL`, `CODESERVER_WORKSPACE` (the
working copy's path in code-server) and `CODESERVER_HOST_DIR` (the same folder as the test machine
sees it, if it differs); for account access `CODESERVER_ACCOUNT` and `CODESERVER_ACCOUNT_HOST_DIR`
(by default the working copy), and for the trust test `CODESERVER_TRUST_URL`, a second code-server
with workspace trust on that sees the same working copy (without it, that test is skipped):

```sh
dir=$(node tests/e2e/tools/fetch-codeserver.mjs | tail -1)   # the tested version, SHA-256 checked
mkdir -p /tmp/workspace
sh tests/e2e/tools/start-codeserver.sh "$dir" /tmp/code-server 8090
CODESERVER_TRUST=1 sh tests/e2e/tools/start-codeserver.sh "$dir" /tmp/code-server-trust 8091
CODESERVER_URL=http://127.0.0.1:8090/ CODESERVER_TRUST_URL=http://127.0.0.1:8091/ CODESERVER_WORKSPACE=/tmp/workspace \
  npm run test:e2e -- --project=codeserver-chromium
pkill -f "$dir/lib/node"   # stops code-server and its helper processes
```

`start-codeserver.sh` runs code-server on `127.0.0.1` without a sign-in, with its settings,
extensions, state and logs in a folder of their own, autosave and git off, and for the tests
workspace trust off (`--disable-workspace-trust`) and no chat panel (it takes the keyboard focus).
With `CODESERVER_TRUST=1`, trust is on and a folder window asks for it at its start
(`security.workspace.trust.startupPrompt` in its user settings: code-server reads the trust settings
only from there, not from the machine settings). Its process id is in
`code-server.pid` there, but stopping only that process can leave code-server's extension host
running. On Windows, run it in a Linux container with the working copy and `.codeserver/` mounted.

`fetch-codeserver.mjs --latest` takes the newest release instead (the canary); it needs
`GITHUB_TOKEN` to read the release's SHA-256 digest from the API.

## Continuous integration

| Workflow, job | When | What |
|---|---|---|
| CI (`ci.yml`), `checks` | pushes to `main`, pull requests, by hand | lint, types, translations, trademarks, unit tests, REUSE |
| CI, `nextcloud-app` | the same | `php -l` on PHP 8.2 to 8.5; on 8.2 also `info.xml` against the App Store schema (`SCHEMA_COMMIT`) and the App Store package |
| CI, `nextcloud-e2e` | the same | `nextcloud-chromium` in the official image of each Nextcloud release in `nextcloud.tested` of `versions.json` (34.0.4 and 35.0.1), with the Craft Suite Layer's release from `versions.json`; in the newest, also screenshots for the documentation (`screenshots-chromium`, artifact `docs-screenshots`, cannot fail the job) |
| CI, `codeserver-e2e` | the same | `codeserver-chromium` against the code-server version in `versions.json`, a second instance with workspace trust on for the trust test |
| CI, `hosting` | the same | the hosting example ([hosting.md](hosting.md)) with `compose.account.yaml` and a test Nextcloud: both images built, the sync and the mount of the account in both directions, `codeserver-chromium` in the built code-server through `web`, account access into the mount; the sign-in replaced by a stand-in (`tests/e2e/hosting/compose.ci.yaml`) |
| Canary (`canary.yml`), `codeserver-latest` | daily, by hand | `codeserver-chromium` against the newest code-server release, with the trust test |
| Canary, `nextcloud-latest` | the same | `nextcloud-chromium` in the newest patch release of each Nextcloud major in `info.xml`'s range (`nextcloud:<major>-apache`), with the newest Craft Suite Layer release next to the app |
| Canary, `nextcloud-next` | the same | Nextcloud's development branch: the `@nextcloud/files` major, `max-version`, Text's types against `Config::TEXT_TYPES` (an issue labelled `canary-nextcloud` for another major; this job cannot fail the run) |
| Release (`release.yml`) | a pushed tag `v*` | checks the versions, builds and publishes the release |

**The canary** tells whether an update elsewhere breaks the app before a server takes it. Its two
test jobs count a test that passes only on its retry as failed, and write a summary
(`tests/e2e/tools/canary-report.mjs`) that compares what they ran with `versions.json`: on failure,
which new releases to hold back, and one issue labelled `canary` (closed by the next passing run);
on success with a newer release, what to raise in `versions.json`.

**The tested versions** live in `tests/e2e/versions.json`, and CI tests them on every change:
code-server's version with the SHA-256 digests of its four archives (shown on the release page),
`nextcloud.tested` with one patch release per major of `info.xml`'s range, and the Craft Suite
Layer's release with its SHA-256 (from its `SHA256SUMS`). Raise them when the canary passes with a
newer release, and add a Nextcloud release when `info.xml`'s range grows.

Dependabot (`.github/dependabot.yml`) proposes updates weekly, each release at least seven days old.
`versions.json`, `SCHEMA_COMMIT` and majors of `@nextcloud/files` (with `info.xml`'s range) move by
hand.

## Releasing

1. Raise `<version>` in `codeserver_layer/appinfo/info.xml`.
2. In both changelogs, turn `## [Unreleased]` into `## [<version>] - <YYYY-MM-DD>` and add a new,
   empty `## [Unreleased]` above it; update the links at the end of `CHANGELOG.md`.
3. Update the version in the install commands: `v=` in `README.md`, `docs/nextcloud-app.md` (with
   its sample output and the release that declares Nextcloud 35) and `docs/hosting.md` (also the
   `docker cp` example).
4. Check whether `SCHEMA_COMMIT` in `ci.yml` needs moving.
5. Merge into `main` and wait until CI has passed there.
6. Push the tag `v<version>` on that commit.

`release.yml` checks that the tag is `v` plus the version in `info.xml` and that both changelogs
have the dated section, builds the archive with `make appstore` (reproducible, with the commit's
time), and publishes `codeserver_layer-<version>.tar.gz` and `SHA256SUMS`. The archive is not
code-signed (the App Store would need the app's certificate).

## Conventions

- English only, and everything here is public: no real domains, addresses, account or server
  names. Use `example.com` and neutral names (`/workspace`, `/Projects`, `My App`).
- Every source file starts with an SPDX header where comments are possible; the others are listed
  in `REUSE.toml`.
- Comments are short and explain why. Formatting follows `.editorconfig`: two spaces, LF; tabs in
  PHP.
- Texts go through `t('codeserver_layer', '…')` (`src/l10n.ts`) or `$l->t('…')` with a literal
  text; a new text needs its German translations in `l10n/de.json` (informal) and `l10n/de_DE.json`
  (formal), then `npm run l10n:write`. No "VS Code" in them: say code-server.
- The default formats live only in `lib/Service/Config.php`, the file types only in
  `lib/Service/FileTypes.php`. `nextcloud-filetypes.spec.ts` reads the file types from there and
  the canary reads `TEXT_TYPES` from `Config.php`; the other tests name the formats they use.
