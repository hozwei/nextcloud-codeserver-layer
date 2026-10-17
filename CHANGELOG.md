<!--
  - SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Changelog

All notable changes to this repository are documented in this file. The Nextcloud app keeps its
own changelog in [`codeserver_layer/CHANGELOG.md`](codeserver_layer/CHANGELOG.md); its section for
a version is the text of that release on GitHub.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- CI tests Nextcloud 34.0.5 and 35.0.2 and the Craft Suite Layer 0.5.1 (`tests/e2e/versions.json`),
  as the canary found them passing.
- The end-to-end tests wait 7 s instead of 3.5 s for a setting changed with `occ`: a request that
  loads lazy app config values can store Nextcloud's cached values again, the old ones with them,
  for another 3 s (seen with Nextcloud 35.0.2).

## [0.2.0] - 2026-10-17

### Added

- The Nextcloud app's account access, folder entries and read-only warning (see its changelog).
- `hosting/compose.account.yaml`: the whole Nextcloud account in code-server at `/nextcloud/files`,
  mounted over WebDAV by rclone in a container of its own (FUSE, bind propagation), next to the
  working copy; `docs/hosting.md`, "All files of the account". The machine settings of the hosting
  example keep code-server's watcher and local history out of the mount.
- Tests: unit tests of where a path opens and of the addresses for a window without a folder and a
  folder; end-to-end tests of account access in Nextcloud 34.0.4 and 35.0.1, and in code-server
  4.141.0 (a file in a window without a folder, a new file there, a folder, and how such a window
  takes the workspace trust of its file, in a second code-server with trust on). The CI job
  `hosting` runs the mount against a test Nextcloud in both directions and opens account access's
  addresses in it, gets the mount back after `dav` was killed, and gives the mount an app password
  of its own. The canary runs the trust test against the newest code-server.
- `NEXTCLOUD_OCC` for the end-to-end tests in a Nextcloud without Docker.
- `hosting/compose.account.yaml`: before mounting, `dav` clears a dead mount and checks the login;
  only code-server's user and root reach the mount (`--default-permissions`, `--umask 077`);
  `NEXTCLOUD_DAV_APP_PASSWORD` for an app password of the mount's own; `NEXTCLOUD_FOLDER` is taken
  literally in rclone's filter.

### Changed

- `docs/`: account access, providing the whole account, folders, the read-only warning, workspace
  trust (code-server keeps the trusted folders in the browser, and a trusted folder's settings can
  run commands, also in shares), what a tab costs on the server.
- Corrected: code-server's redirect to the folder opened last keeps the payload; `folder` (and now
  `ew`) goes along so that the file does not open in that folder's window.
- `tests/e2e/tools/start-codeserver.sh`: without the machine setting for workspace trust, which
  code-server reads only from the user settings; `CODESERVER_TRUST=1` for a second instance with
  trust on.

## [0.1.0] - 2026-10-17

### Added

- The Nextcloud app `codeserver_layer` (see its changelog).
- Tests: unit tests of the address, the file name rules and the warnings; end-to-end tests in
  Nextcloud 34.0.4 and 35.0.1 (also next to the Craft Suite Layer, which writes the same MIME type
  files) and in code-server 4.141.0, which opens the app's addresses and saves new files under the
  path the app hands over.
- A hosting example (`hosting/`, `docs/hosting.md`): code-server, a sync client and a sign-in with
  the Nextcloud account in one Docker Compose file, built and run in CI with a test Nextcloud.
- CI, and a daily canary against the newest releases of code-server, of each supported Nextcloud
  major and of the Craft Suite Layer, and against Nextcloud's development branch: on a failure it
  says which new release to hold back and opens an issue. The release workflow.

[Unreleased]: https://github.com/hozwei/nextcloud-codeserver-layer/compare/v0.2.0...main
[0.2.0]: https://github.com/hozwei/nextcloud-codeserver-layer/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/hozwei/nextcloud-codeserver-layer/releases/tag/v0.1.0
