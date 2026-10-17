<!--
  - SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Hosting code-server next to Nextcloud

A complete setup for the Nextcloud app of this repository: code-server, a sync client that keeps
its working copy in step with a Nextcloud folder, and a sign-in with the Nextcloud account in front
of code-server, in one Docker Compose file. The guide is [docs/hosting.md](../docs/hosting.md).

| File | What it is |
|---|---|
| [`compose.example.yaml`](compose.example.yaml) | The four containers `sync`, `code-server`, `gate` and `web`; save it as `compose.yaml` |
| [`example.env`](example.env) | The values it needs; save it as `.env` next to it, fill it in, `chmod 600` |

```sh
docker compose up -d --build
```

CI builds and runs this setup on every change, with a test Nextcloud and a stand-in for the sign-in
([what CI tests](../docs/hosting.md#what-ci-tests)).
