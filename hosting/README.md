<!--
  - SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Hosting code-server next to Nextcloud

A complete setup for the Nextcloud app of this repository: code-server, a sync client that keeps
its working copy in step with a Nextcloud folder, and a sign-in with the Nextcloud account in front
of code-server, in one Docker Compose file; and optionally a mount of the whole account, for the
app's account access. The guide is [docs/hosting.md](../docs/hosting.md).

| File | What it is |
|---|---|
| [`compose.example.yaml`](compose.example.yaml) | The four containers `sync`, `code-server`, `gate` and `web`; save it as `compose.yaml` |
| [`compose.account.yaml`](compose.account.yaml) | Optional: the container `dav`, which mounts the whole account over WebDAV for code-server at `/nextcloud/files`; with it, put `COMPOSE_FILE=compose.yaml:compose.account.yaml` into `.env`, so that every `docker compose` command uses both files |
| [`example.env`](example.env) | The values they need; save it as `.env` next to them, fill it in, `chmod 600` |

```sh
docker compose up -d --build
```

CI builds and runs this setup with the mount on every change, with a test Nextcloud and a stand-in
for the sign-in ([what CI tests](../docs/hosting.md#what-ci-tests)).
