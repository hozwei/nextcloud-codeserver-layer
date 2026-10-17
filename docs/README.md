<!--
  - SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Documentation

| Page | What it covers |
|---|---|
| [hosting.md](hosting.md) | Hosting code-server next to Nextcloud with Docker Compose: the sync, the mount of the whole account, the sign-in with Nextcloud, the reverse proxy, code-server's settings and workspace trust, operations, troubleshooting, what CI tests |
| [nextcloud-app.md](nextcloud-app.md) | Providing the working copy and the whole account, one user or several, installing, updating and removing, configuring, the Files entries for files and folders, "+ New", the warnings, the file types, syntax highlighting, recommended code-server settings, troubleshooting, limitations |
| [architecture.md](architecture.md) | Components, where a path opens, the addresses code-server gets, opening a file, design decisions, what the app relies on upstream |
| [security.md](security.md) | Trust model, signing in to code-server, the sync client's and the mount's login, account access, what the app does and does not protect |
| [development.md](development.md) | Commands, tests in Nextcloud and in code-server, CI and the canary, releasing, conventions |
