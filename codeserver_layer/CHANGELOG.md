<!--
  - SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Changelog

All notable changes to the Nextcloud app `codeserver_layer` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each GitHub release takes its text from the section whose heading matches the version in
`appinfo/info.xml`, as the App Store would. `make lint` fails if that section is missing.

## [Unreleased]

## [0.1.0] - 2026-10-17

### Added

- "Open in code-server" in Files for the files in each user's code-server folder: about a hundred
  text and programming formats by extension (PowerShell, shell, Python, web, JSON, YAML, TOML,
  XML, INI, logs, Markdown, C and C#, Java, Go, Rust, SQL, Terraform and more) and file names such
  as `Dockerfile`, `Makefile`, `.gitignore` and `.env`. Both lists can be changed.
- A click opens these files in code-server where no other app in Nextcloud opens them; made the
  default app, code-server takes the click for all of them, and Nextcloud Text stays in the menu.
- The file opens in a new tab, in its project folder, with the address code-server reads
  (`?folder=…&payload=[["openFile",…]]`).
- "+ New" entries (PowerShell script and module, YAML, JSON, shell and Python script, and more to
  choose from) that create the file in code-server, checked against names Windows clients cannot
  hold and against the names in the folder in any letter case.
- Opening warns when the file changed in Nextcloud moments ago, or is locked or open in Nextcloud
  Text, and once per browser explains why not to edit a file in Text and code-server at once.
- Nextcloud's code icon for 68 code and text formats Nextcloud 34 and 35 have no type for, and for
  `.cmd` and `.bat`, through MIME types and aliases in Nextcloud's `config/`, added on enable and
  removed on disable.
- Administration settings (address, working copy, formats, default app, "+ New" entries, the sync
  warning), personal settings for the folder, and `occ codeserver_layer:folder`.
- English and German (informal and formal).
