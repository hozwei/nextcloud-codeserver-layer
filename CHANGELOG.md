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

[Unreleased]: https://github.com/hozwei/nextcloud-codeserver-layer/compare/v0.1.0...main
[0.1.0]: https://github.com/hozwei/nextcloud-codeserver-layer/releases/tag/v0.1.0
