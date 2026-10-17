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

## [0.2.0] - 2026-10-17

### Added

- Account access: for a code-server that has a user's whole account (such as a mount over WebDAV),
  files anywhere in the user's files open in code-server, on their own in a window without a
  folder (`?ew=true&payload=…`), so that nothing in code-server walks their folder over the
  network. Each user turns it on in the personal settings (or `occ codeserver_layer:account`); the
  code-server folder still comes first and opens from its working copy. It also works without a
  code-server folder or working copy.
- New administration settings for account access: where code-server has the account
  (`account_workspace`), the folders its mount leaves out (`account_exclude`), a default app setting
  (`account_default_app`) and a warning window (`account_sync_hint_seconds`, 65 s) of its own.
- "Open in code-server" for folders, in a folder's menu and as a button next to the path for the
  folder shown: code-server opens the folder, with its terminal there. Not for the root of the
  account; a click on a folder still opens it in Files.
- "+ New" in every folder where a file opens in code-server, also through account access.
- A warning before opening a file the user may only read (a share without edit rights), from `W`
  in its WebDAV permissions; through account access, for a file the user may delete nevertheless
  (shared on its own), not to save it, as the mount would delete it. A warning before opening a
  folder that takes no new files, or that changed moments ago.
- The administration page in three parts (general, the code-server folder, account access).

### Changed

- The warnings no longer speak of a sync, and say what a refused save leads to at each place: in
  the code-server folder Nextcloud refuses it while a file is locked; through account access it
  goes through once the lock ends and replaces the changes made meanwhile. The first open
  explains this once for each place.
- A lock the user set no longer warns through account access, as files_lock lets its owner write;
  in the code-server folder the app says that it binds a sync that signs in as another account.
- Entries only for nodes below the user's own files: not for the Tags view's tags or the team
  folders view, which Files also shows as folders.
- Addresses longer than 8000 characters are not opened; Files says why.
- The administration page refuses an empty or invalid warning window instead of saving 0, and a
  folder to leave out with a backslash; the personal page says when the working copy is missing,
  and that account access is only for the owner of the account code-server has.

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
