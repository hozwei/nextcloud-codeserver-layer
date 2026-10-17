<!--
  - SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# nextcloud-codeserver-layer

**code-server Layer** is a Nextcloud app that adds **Open in code-server** to Files: a click on a
script or configuration file opens it in a new tab in your own
[code-server](https://github.com/coder/code-server), the editor that runs on a server and in the
browser.

[![CI](https://github.com/hozwei/nextcloud-codeserver-layer/actions/workflows/ci.yml/badge.svg)](https://github.com/hozwei/nextcloud-codeserver-layer/actions/workflows/ci.yml)
[![Canary](https://github.com/hozwei/nextcloud-codeserver-layer/actions/workflows/canary.yml/badge.svg)](https://github.com/hozwei/nextcloud-codeserver-layer/actions/workflows/canary.yml)
License: [AGPL-3.0-or-later](LICENSE)

This is an independent project. It is not affiliated with Coder, Microsoft or Nextcloud GmbH (see
[Affiliation and trademarks](#affiliation-and-trademarks)).

**Is it for you?** You run Nextcloud 34 or 35 and want to edit your scripts and text files in
code-server, from Files. code-server needs your files where it runs, in one of two ways, or both:

- **A code-server folder with a working copy:** code-server works on a copy of one Nextcloud folder,
  the *working copy*, which a sync client keeps up to date.
- **Account access:** code-server has your whole account, for example through a mount over WebDAV,
  and opens files from anywhere in it.

The app includes neither code-server nor a sync client nor a mount: it adds the entries in Files
and builds the link to the file or folder. It suits one person, or a team that shares one
code-server. It is not an editor inside Nextcloud.

**Where to start**

- **No code-server yet?** [docs/hosting.md](docs/hosting.md) sets up code-server, the sync client
  and authentication with your Nextcloud account in one Docker Compose file, and optionally the
  mount of your whole account. Then [install the app](#setup).
- **Already running code-server** that sees your Nextcloud files? Go to [Setup](#setup).

## What it does

Each user chooses a **code-server folder** in their Nextcloud files, which code-server has as its
**working copy**, and may turn on **account access** for the rest of their files. Files then offers:

- **Open in code-server** for about a hundred text and programming formats: PowerShell, shell,
  Python, JavaScript and TypeScript, HTML and CSS, JSON, YAML, TOML, XML, INI, logs, Markdown, C,
  C#, Java, Go, Rust, SQL, Terraform and more, and files such as `Dockerfile`, `Makefile`,
  `.gitignore` and `.env`. A file in the code-server folder opens in a new tab, in its project
  folder; any other file, with account access, on its own in a window without a folder, so that
  nothing in code-server walks its folder over the network.
- **A click** opens these files in code-server where no other app in Nextcloud opens them (a
  `.ps1`, an `.ini`, a `.log`). If an administrator makes code-server the default app, a click opens
  all of them in code-server, including those Nextcloud Text would otherwise open (`.md`, `.json`,
  `.yaml`); Text remains in the file's menu as **View**. The code-server folder and account access
  each have a default app setting of their own.
- **Open in code-server for folders,** in a folder's menu and as a button next to the path for the
  folder shown: code-server opens the folder, and its terminal starts there, for scripts that work
  on a whole folder of photos or documents.
- **"+ New" entries** (a PowerShell script, a YAML file, ...) that create the file in code-server:
  Nextcloud does not create an empty file first, so a sync client has nothing to conflict with.
- **Warnings before opening** when the file may only be read (Nextcloud would refuse the save),
  changed moments ago (code-server may not have the change yet), or is locked by another account or
  open in Nextcloud Text (Nextcloud refuses a save then, and a mount saves it once the lock ends,
  over the changes made meanwhile); and when a folder takes no new files.
- **The code icon** for code formats Nextcloud does not know, such as `.ps1`, `.ini` or `.log`.

The app hands code-server nothing but the address of the file or folder. code-server reads and
writes its working copy or its mount of the account, and the sync client or the mount brings the
changes to Nextcloud. The app is not a security boundary: whoever can reach code-server can reach
all the files it has ([docs/security.md](docs/security.md)).

## Requirements

- **Nextcloud 34** (PHP 8.2 to 8.5) or **Nextcloud 35** (PHP 8.3 to 8.5), with access to the
  server's apps folder and `occ`.
- **code-server** on a separate host name, such as `https://code.example.com/`, with
  authentication in front of it: code-server's password or a proxy
  ([how](docs/security.md#signing-in-to-code-server)).
- **Your files in code-server,** at least one of:
  - **A working copy** of the code-server folder where code-server sees it, such as `/workspace`,
    kept in sync by a sync client or shared with Nextcloud directly
    ([how](docs/nextcloud-app.md#providing-the-working-copy)). All users get the same working-copy
    path ([one user or several](docs/nextcloud-app.md#one-user-or-several)).
  - **The whole account** where code-server sees it, such as `/nextcloud/files`, for example a
    mount over WebDAV ([how](docs/nextcloud-app.md#providing-the-whole-account)). This is one
    account's files: only that user turns account access on.

No code-server yet: [docs/hosting.md](docs/hosting.md) sets it up in one Docker Compose file
([hosting/](hosting/)), with an optional second file for the mount of the account. CI builds and
runs both with a test Nextcloud; only the sign-in and your reverse proxy are not tested there.

## Setup

The app is not in the Nextcloud App Store. Each
[release](https://github.com/hozwei/nextcloud-codeserver-layer/releases) has it as
`codeserver_layer-<version>.tar.gz`, with its checksum in `SHA256SUMS`. `occ` below is `php occ` in
Nextcloud's folder, run as the web server's user (`www-data` here):

```sh
v=0.2.0
base=https://github.com/hozwei/nextcloud-codeserver-layer/releases/download/v$v
curl -fL --remote-name-all "$base/codeserver_layer-$v.tar.gz" "$base/SHA256SUMS"
sha256sum -c SHA256SUMS
tar -xzf codeserver_layer-$v.tar.gz -C /path/to/nextcloud/custom_apps
chown -R www-data:www-data /path/to/nextcloud/custom_apps/codeserver_layer
occ app:enable -g <group> codeserver_layer   # or without -g for everyone
```

Then:

1. **Administration settings > code-server:** the address of code-server, and where code-server
   sees the working copy, the whole account, or both. Or with `occ`:

   ```sh
   occ config:app:set codeserver_layer url --value=https://code.example.com/
   occ config:app:set codeserver_layer workspace --value=/workspace
   occ config:app:set codeserver_layer account_workspace --value=/nextcloud/files   # account access
   ```

2. **Each user** sets their code-server folder (the folder the working copy mirrors) and turns on
   account access in **Personal settings > code-server**, or an administrator does with
   `occ codeserver_layer:folder <user> /Projects` and `occ codeserver_layer:account <user> on`.
3. **Set up code-server** for files that a sync or a mount carries, for example without autosave
   ([recommended settings](docs/nextcloud-app.md#recommended-code-server-settings)).

A file `/Projects/My App/run.ps1` then opens in code-server as `/workspace/My App/run.ps1`, in the
project folder `/workspace/My App`, and with account access a file `/Photos/rename.ps1` as
`/nextcloud/files/Photos/rename.ps1` in a window without a folder. Details, updating and removing:
[docs/nextcloud-app.md](docs/nextcloud-app.md); if nothing appears in Files, see
[Troubleshooting](docs/nextcloud-app.md#troubleshooting).

## Limitations

- **Only for the files code-server has.** Without account access, files outside the code-server
  folder have no entry; with it, neither do the folders an administrator lists as left out of the
  mount.
- **The app does not move files.** A change saved in code-server reaches Nextcloud with the sync
  client's next run, or a few seconds after the save through a mount; a change in Nextcloud reaches
  code-server the same way. The warning before opening covers the first seconds.
- **A save Nextcloud refuses looks saved in code-server.** For a locked file, a file shared without
  edit rights or a name Nextcloud does not allow, the sync client or the mount fails behind
  code-server's back; the warnings before opening say so where the app can see it coming.
- **A new tab each time.** Every file you open loads code-server in a new tab.
- **Only in Files in the browser.** Public share pages and Nextcloud's desktop and mobile clients
  have no entries.
- **Syntax highlighting is up to code-server.** It highlights most formats by itself; some need an
  extension from Open VSX ([docs/nextcloud-app.md](docs/nextcloud-app.md#syntax-highlighting)).
- **It adds file types to Nextcloud's `config/`.** Enabling the app adds types for 68 extensions to
  `config/mimetypemapping.json` and aliases to `config/mimetypealiases.json`, for all users, also
  those the app is not enabled for, and gives existing files the new type in one pass over the file
  cache. Disabling removes the app's entries again. On a large instance, enable, update and disable
  it with `occ` ([file types](docs/nextcloud-app.md#file-types)).

## Status and testing

Early: 0.2.0 adds account access to the first release, 0.1.0. The author runs it with the hosting
example's setup.

- **Tested on every change:** the app end to end in Nextcloud 34.0.5 and 35.0.2, its links in
  code-server 4.141.0 (also how a window without a folder takes the workspace trust of its file),
  and the Docker Compose example with a test Nextcloud, including the mount of the account. Not
  tested: the sign-in with Nextcloud's `oidc` app and your reverse proxy
  ([details](docs/hosting.md#what-ci-tests)).
- **The canary** runs the end-to-end tests in Nextcloud and code-server (not the hosting example)
  every day against the newest releases of code-server and Nextcloud. A red **Canary** badge does not mean that this release is broken, but that a new
  upstream release fails the tests. Before you update code-server or Nextcloud, look for an open
  issue labelled
  [`canary`](https://github.com/hozwei/nextcloud-codeserver-layer/issues?q=is%3Aissue%20is%3Aopen%20label%3Acanary).

## Documentation

| Page | What it covers |
|---|---|
| [docs/hosting.md](docs/hosting.md) | Hosting code-server next to Nextcloud with Docker Compose: the sync, the mount of the whole account, the sign-in with Nextcloud, the reverse proxy, code-server's settings, operations, troubleshooting |
| [docs/nextcloud-app.md](docs/nextcloud-app.md) | Providing the working copy and the whole account, installing, updating and removing, configuring, the Files entries for files and folders, "+ New", the warnings, the file types, syntax highlighting, recommended code-server settings, troubleshooting, limitations |
| [docs/security.md](docs/security.md) | Trust model, signing in to code-server, the sync client's and the mount's login, what the app does and does not protect |
| [docs/architecture.md](docs/architecture.md) | How it works, where a path opens, the addresses code-server gets, design decisions, what the app relies on upstream |
| [docs/development.md](docs/development.md) | Setup, commands, tests in Nextcloud and code-server, CI and the canary, releasing |
| [CHANGELOG.md](CHANGELOG.md), [codeserver_layer/CHANGELOG.md](codeserver_layer/CHANGELOG.md) | Changes to the repository and to the Nextcloud app |

## Security

Report vulnerabilities privately, see [SECURITY.md](SECURITY.md).

## License

[GNU Affero General Public License v3.0 or later](LICENSE) (`AGPL-3.0-or-later`). The files state
this in an SPDX header; those that cannot hold one are listed in [`REUSE.toml`](REUSE.toml). The app
bundles icons of [Material Design Icons](https://github.com/Templarian/MaterialDesign-SVG)
(`@mdi/svg`, Apache-2.0).

## Affiliation and trademarks

This project is not affiliated with, endorsed by or sponsored by Coder Technologies, Microsoft or
Nextcloud GmbH. code-server, Visual Studio Code, PowerShell, Python and Nextcloud are names or
trademarks of their respective owners and are used here only to say what this project works with.
code-server is built on Visual Studio Code's open-source code; this app works with code-server and
does not include it.
