<!--
  - SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Hosting code-server next to Nextcloud

The Nextcloud app only builds links; code-server and its working copy are yours to run. This page
sets both up with Docker Compose. [`hosting/compose.example.yaml`](../hosting/compose.example.yaml)
runs code-server, a sync client that keeps the working copy in sync with a Nextcloud folder, and
authentication with the Nextcloud account in front of code-server. It is the setup this project's
author runs, with the personal values taken out, and CI builds and tests it on every change
([what CI tests](#what-ci-tests)).

```text
browser ──HTTPS──▶ reverse proxy ──▶ web (nginx) ────────────────▶ code-server
                                       │ asks about each request      │ reads and writes
                                       ▼                              ▼
                                      gate (oauth2-proxy)          working copy
                                       │ sign-in                      ▲
                                       ▼                              │ nextcloudcmd
                                      Nextcloud (app oidc) ◀────── sync, every 30 s
```

**Steps at a glance:**

1. [Prepare Nextcloud](#1-prepare-nextcloud): the folder, an app password for the sync client, the
   sign-in.
2. [Write `compose.yaml` and `.env`](#2-write-composeyaml-and-env).
3. [Start the containers](#3-start-the-containers).
4. [Put the reverse proxy in front](#4-reverse-proxy).
5. [Connect the Nextcloud app](#5-connect-the-nextcloud-app).
6. [Check that it works](#6-check-that-it-works).

| Container | Image | What it does |
|---|---|---|
| `sync` | built from Debian 13 with `nextcloud-desktop-cmd` | Runs Nextcloud's command-line client every 30 seconds and keeps the folder `NEXTCLOUD_FOLDER` of `NEXTCLOUD_USER` and the working copy in sync, in both directions |
| `code-server` | built from Debian 13 with code-server's release package, checked against its SHA-256 | The editor, as an unprivileged user and without a password of its own; its settings for a synced working copy are written at every start ([details](#the-code-server-container)) |
| `gate` | `quay.io/oauth2-proxy/oauth2-proxy` | Signs people in with Nextcloud through its app *OIDC Identity Provider* (`oidc`), only the members of one group |
| `web` | `nginxinc/nginx-unprivileged` | Asks `gate` about each request, then passes it to code-server with its WebSockets; the only container with a published port |

No container runs as root or has Linux capabilities; `gate` and `web` have read-only file systems.

## Requirements

- A Linux host, amd64 or arm64, with Docker Engine and Docker Compose 2.17 or later (for
  `dockerfile_inline`).
- Nextcloud 34 or 35, where you can install apps and run `occ`.
- A separate host name for code-server, such as `code.example.com`, and a reverse proxy that
  serves it over HTTPS ([step 4](#4-reverse-proxy)). Never Nextcloud's own host name: a page on
  Nextcloud's origin can act with the user's Nextcloud session ([security.md](security.md)).
- The Docker host must reach Nextcloud: `gate` at its public address (the issuer), `sync` at
  `NEXTCLOUD_URL`, which may be an internal address.

`occ` below is Nextcloud's command line, run as the web server's user; with the official Docker
image, `docker exec -u www-data <nextcloud container> php occ …`. Back up Nextcloud before you
install apps, as for any change to it.

### Nextcloud or the reverse proxy in Docker on the same host

- **`gate` cannot reach `https://cloud.example.com`** because the host's router does not route
  requests back in (no hairpin NAT): if Nextcloud's reverse proxy listens on this host, let `gate`
  resolve the name to the host. In `compose.yaml`:

  ```yaml
  services:
    gate:
      extra_hosts:
        - "cloud.example.com:host-gateway"
  ```

- **`sync` over Nextcloud's internal address:** put `sync` on Nextcloud's Docker network and set
  `NEXTCLOUD_URL=http://<Nextcloud's service name>`; that name must be in Nextcloud's
  `trusted_domains`.

  ```yaml
  services:
    sync:
      networks: [default, nextcloud]
  networks:
    nextcloud:
      external: true
      name: <Nextcloud's network, see docker network ls>
  ```

- **A reverse proxy in a container** cannot reach `127.0.0.1:8080` of the host: forward to the
  Docker host's address and `CODE_PORT`, or put `web` on the proxy's network and forward to
  `http://code-server-web-1:8080`.
- **The app in a Nextcloud container** (official image):

  ```sh
  docker cp codeserver_layer-0.1.0.tar.gz <nextcloud container>:/tmp/
  docker exec -u www-data <nextcloud container> tar -xzf /tmp/codeserver_layer-0.1.0.tar.gz -C /var/www/html/custom_apps
  ```

## 1. Prepare Nextcloud

**The folder.** The working copy mirrors one folder of one account, say `/Projects` of `alice`.
Create it in Nextcloud if it does not exist yet; the sync client does not create it. Every change
from code-server reaches Nextcloud as this account, whoever made it, so its versions and activity
show `alice`. To share the folder with a team, see
[One user or several](nextcloud-app.md#one-user-or-several).

**An app password for the sync client,** so that the account's own password stays out of the
container: as `alice`, **Personal settings > Security > Devices & sessions > Create new app
password**. It goes into `.env` as `NEXTCLOUD_APP_PASSWORD`, and you can revoke it there.

**The sign-in with Nextcloud.** `gate` uses Nextcloud's app *OIDC Identity Provider* (`oidc`). These
steps are those of the author's setup, with `oidc` 2.5.2 on Nextcloud 34; read the app's
[releases](https://github.com/H2CK/oidc/releases) before you update it.

1. Install the app:

   ```sh
   occ app:install oidc
   ```

2. Read the issuer; `OIDC_ISSUER_URL` must be exactly this value (`tr` removes the backslashes that
   JSON may put before slashes):

   ```sh
   curl -fsSL https://cloud.example.com/.well-known/openid-configuration | grep -o '"issuer":"[^"]*"' | tr -d '\\'
   ```

   If this returns 404, your web server does not pass `/.well-known/…` on to Nextcloud (the setup
   warnings under **Administration settings > Overview** say so too). Fix that first: `gate` reads
   the same address.
3. Create a group for the people who may use code-server, and add them:

   ```sh
   occ group:add --display-name='code-server' code-server
   occ group:adduser code-server alice
   ```

   This group decides who may sign in to code-server. The group the Nextcloud app is enabled for
   decides who sees its entries in Files; they may be the same group (administrators who save the
   app's settings must be in the app's group, see [nextcloud-app.md](nextcloud-app.md)).
4. Create the client. The command prints its `client_id` and `client_secret`: put them into `.env`
   as `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`. The `oidc` app requires a client ID of 32 to 64
   printable ASCII characters, without spaces or `:`.

   ```sh
   occ oidc:create code-server https://code.example.com/oauth2/callback --type=confidential --flow=code --algorithm=RS256 --token_type=opaque --allowed_scopes=openid --client_id=code-example-com-oauth2-proxy-gate
   ```

5. Limit the client to the group; `occ` cannot do this. **Administration settings > OpenID Connect
   Provider**, tab **Clients**, click the client, **Group Limitations:** `code-server`, **Save**.
   Without it, every Nextcloud account can sign in.
6. On the **Settings** tab, leave **Allow User Settings** set to "User cannot edit any settings"
   (the default); otherwise everybody has to give consent at their first sign-in.

`occ oidc:list` shows every client's secret in plain text: do not paste its output anywhere.

## 2. Write `compose.yaml` and `.env`

On the Docker host, in a new directory:

```sh
v=0.1.0
base=https://raw.githubusercontent.com/hozwei/nextcloud-codeserver-layer/v$v/hosting
curl -fsSL -o compose.yaml "$base/compose.example.yaml"
curl -fsSL -o .env "$base/example.env"
chmod 600 .env
```

Fill in `.env`:

| Value | What it is |
|---|---|
| `CODE_URL` | code-server's address as the browser opens it, without a slash at the end, such as `https://code.example.com` |
| `CODE_PORT` | the port `web` listens on, for the reverse proxy (`8080`) |
| `CODE_UID`, `CODE_GID` | the user and group code-server and the sync client run as; they own both folders below (`1000`) |
| `CODE_WORKSPACE_DIR` | the working copy on the host; in the containers it is `/workspace` |
| `CODE_HOME_DIR` | code-server's home on the host: settings, extensions, unsaved editors |
| `NEXTCLOUD_URL` | Nextcloud's address for the sync client: the public one, or an internal one that Nextcloud accepts (`trusted_domains`), either `http://` or `https://` with a certificate valid for that name |
| `NEXTCLOUD_USER`, `NEXTCLOUD_FOLDER` | the account and the folder the working copy mirrors (`alice`, `/Projects`) |
| `NEXTCLOUD_APP_PASSWORD` | the app password from step 1 |
| `SYNC_INTERVAL` | seconds between two sync runs (`30`) |
| `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | from step 1 |
| `OIDC_COOKIE_SECRET` | 32 random bytes: `openssl rand -base64 32 \| tr -- '+/' '-_'` |
| `TZ` | the time zone of the logs (`Etc/UTC`) |

Then create the two folders and give them to that user and group, as root:

```sh
mkdir -p /srv/code-server/workspace /srv/code-server/home
chown 1000:1000 /srv/code-server/workspace /srv/code-server/home
```

Start with an empty working copy: the sync client then downloads the folder. If both sides already
hold different versions of a file, you end up with conflicted copies.

## 3. Start the containers

```sh
docker compose up -d
docker compose ps
docker compose logs -f sync
```

The first start builds the images of `sync` and `code-server`. `code-server`, `gate` and `web` are
healthy within a minute or two. `sync` logs a line per run (`nextcloudcmd exit 0, conflicted copies
0`) and becomes healthy after its first complete run, which downloads the whole folder and may take
a while.

## 4. Reverse proxy

`web` speaks plain HTTP on `CODE_PORT`. The reverse proxy serves `https://code.example.com` with a
valid certificate and forwards everything to that port.

- **HTTPS.** The sign-in cookie is `Secure` with the `__Host-` prefix: over plain HTTP the sign-in
  never completes.
- **Forward every path unchanged,** `/` and `/oauth2/…`.
- **Pass WebSockets.** code-server's editor runs over a WebSocket; in a proxy manager, turn on its
  WebSocket switch.
- **Keep the `Host` header.** code-server accepts a WebSocket only when its `Origin` matches the
  host it was asked for, port included.
- **Turn off caching** for this host: everything sits behind the sign-in.
- **Do not add `X-Frame-Options` or a `Content-Security-Policy` in the proxy:** `web` already sends
  `frame-ancestors 'self'`, and code-server shows its web views in frames of its own address.

Docker opens `CODE_PORT` on every interface, past a host firewall such as ufw. Everything behind it
still needs the sign-in; if the reverse proxy runs on the host itself, you can publish the port on
`127.0.0.1` only (`"127.0.0.1:${CODE_PORT:-8080}:8080"` in `compose.yaml`).

nginx 1.25.1 or later (older versions: drop `http2 on;` and write `listen 443 ssl http2;`):

```nginx
server {
  listen 443 ssl;
  http2 on;
  server_name code.example.com;
  ssl_certificate     /etc/ssl/code.example.com/fullchain.pem;
  ssl_certificate_key /etc/ssl/code.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection upgrade;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

Caddy passes WebSockets and the `Host` header by itself:

```caddy
code.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

Then open `https://code.example.com`: Nextcloud asks you to sign in (unless you already are), and
code-server opens. Accounts outside the group get Nextcloud's "Access forbidden".

## 5. Connect the Nextcloud app

Install the app as the [README](../README.md#setup) says, enable it for the group of the people who
use code-server, and set:

```sh
occ config:app:set codeserver_layer url --value=https://code.example.com/
occ config:app:set codeserver_layer workspace --value=/workspace
occ codeserver_layer:folder alice /Projects
```

A file `/Projects/My App/run.ps1` then opens in code-server as `/workspace/My App/run.ps1`. If you
are not signed in yet, you sign in first and are then taken to the file.

## 6. Check that it works

1. As `alice`, upload a small file `hello.ps1` to `/Projects/Test` in Nextcloud.
2. Within `SYNC_INTERVAL` seconds, `docker compose logs sync` shows `nextcloudcmd exit 0, conflicted
   copies 0`, and the file is in `CODE_WORKSPACE_DIR/Test/`.
3. In Files, open `/Projects/Test` and click `hello.ps1`. A new tab opens code-server (after the
   sign-in, the first time) with the folder `/workspace/Test` and the file.
4. Change the file in code-server and press Ctrl+S. After the next sync run, Nextcloud shows the
   change.
5. In a private window, open `https://code.example.com` and sign in with an account outside the
   `code-server` group: Nextcloud refuses it.

If a step fails, see [Troubleshooting](#troubleshooting).

## The code-server container

| | |
|---|---|
| Image | `local/code-server:4.141.0-1`, built on the Docker host from `debian:trixie-slim` and code-server's `.deb` package, checked against its SHA-256 |
| Tools | `bash`, `git`, `curl`, `less`, `procps` and `tzdata`, nothing more ([more tools](#more-tools-for-the-terminal)) |
| User | `coder` with `CODE_UID`:`CODE_GID`, home `/home/coder`; no root, no `sudo`, no capabilities, so `apt-get` in the terminal does not work |
| Folders | `CODE_HOME_DIR` as `/home/coder` (settings, extensions, unsaved editors), `CODE_WORKSPACE_DIR` as `/workspace` (the working copy) |
| Limits | 4 GB memory, 2048 processes, and `/tmp` as a 1 GB tmpfs that counts towards the memory; raise `mem_limit`, `pids_limit` or the tmpfs size for large builds |
| Options | `--auth none` (only `web` reaches it, after `gate`), `--disable-proxy` (no port forwarding under `/proxy/<port>/`), `--disable-telemetry`, `--disable-update-check` |
| Network | no published port; reachable only inside the stack |

### code-server's settings

`code-server` writes these settings at every start, as code-server's machine settings
(`Machine/settings.json` in its user data folder). They apply to everyone on this code-server and
override each user's own settings; the settings of a project folder (`.vscode/settings.json`)
override them:

| Setting | Why |
|---|---|
| `"files.autoSave": "off"` | code-server in the browser saves 1 s after each pause by default; every save is an upload and a new version in Nextcloud |
| `"files.eol": "\n"`, `"[bat]": { "files.eol": "\r\n" }` | new files get LF line endings, also from a Windows browser, except batch files, which `cmd.exe` can misread with LF |
| `"git.enabled": false` | Git's status checks rewrite `.git/index` again and again, and the sync client uploads every change; if the working copy holds no Git repositories, you can set it to `true` |
| `"files.exclude"`, `"files.watcherExclude"`, `"search.exclude"` | the sync client's database and large folders stay out of the explorer, the file watcher and search |

To change them, edit the `cat > … settings.json` part of the `code-server` service and run
`docker compose up -d`. Background: [recommended settings](nextcloud-app.md#recommended-code-server-settings).

**Extensions** come from [Open VSX](https://open-vsx.org/): install them in code-server's
**Extensions** view or on the command line. They live in `CODE_HOME_DIR`.

```sh
docker compose exec code-server code-server --install-extension tamasfe.even-better-toml
```

Extensions run with write access to the whole working copy: install only those you need, from
publishers you trust. Which formats need one for highlighting:
[nextcloud-app.md](nextcloud-app.md#syntax-highlighting).

### More tools for the terminal

PowerShell, Python and the like go into the image, as the terminal has no root: add Debian packages
to the `apt-get install` line of the `code-server` build, or download a package and check its
SHA-256 as the build does for code-server. Then raise the image tag (`local/code-server:4.141.0-2`)
and run `docker compose up -d`.

### Workspace trust

Each project opens as a folder of its own, and code-server 4.141 opens a folder it does not trust
yet in Restricted Mode, with a banner and without the extensions that need trust; editing and saving
work. To trust all projects at once, run **Workspaces: Manage Workspace Trust** and add `/workspace`
as a trusted folder; the folders below it are then trusted too. If the whole working copy is yours,
`--disable-workspace-trust` in the `code-server` command turns trust off.

## Operations

- **A new code-server.** In the `code-server` build, set `CODE_SERVER_VERSION` and the SHA-256
  digests of `code-server_<version>_amd64.deb` and `code-server_<version>_arm64.deb` (the release
  page shows each asset's digest), raise the image tag, then run `docker compose up -d`. First look
  at this repository's [issues](https://github.com/hozwei/nextcloud-codeserver-layer/issues): an
  open issue labelled `canary` means the newest code-server fails the app's tests.
- **The other images.** `gate` and `web` use tagged images; raise the tags, then run
  `docker compose up -d`.
- **Conflicted copies.** If a file changed in Nextcloud and in the working copy between two sync
  runs, Nextcloud's version keeps the name and the other one becomes
  `<name> (conflicted copy <date> <time>).<ext>`, in the working copy only. The sync client's log
  counts them, and `sync` turns unhealthy while there are any. Merge them by hand and delete the copy.
- **A failed sync run** is retried after five minutes. After you fixed `.env`, `docker compose up -d`
  restarts `sync` at once.
- **Backups.** Nextcloud holds the files; the working copy is a copy of them. `CODE_HOME_DIR` holds
  code-server's settings, extensions and unsaved editors.
- **Cut everyone off.** Open editor connections survive the end of a sign-in, and taking someone out
  of the group does not close them; `docker compose stop` does.

## Troubleshooting

- **code-server's page stays blank, or its log shows 403 for the WebSocket.** The `Host` header or
  the WebSocket upgrade does not reach code-server: check the reverse proxy ([step 4](#4-reverse-proxy)).
- **The sign-in starts over and over.** The cookie cannot be set: the page is not served over HTTPS,
  or `CODE_URL` is not the address in the browser.
- **Nextcloud says "Access forbidden".** The account is not in the group the client is limited to.
- **`gate` restarts.** It cannot read the issuer's configuration: check `OIDC_ISSUER_URL` against
  step 1 and that the Docker host reaches it (`docker compose logs gate`).
- **The sync client logs `exit 1` in every run.** A wrong app password, an address Nextcloud does not
  accept (`trusted_domains`), a certificate that does not match the address, or a missing folder.
  For the reason, run the client once with its messages:
  `docker compose exec sync nextcloudcmd --non-interactive -n --path /Projects /workspace https://cloud.example.com`.
- **code-server cannot save.** `CODE_WORKSPACE_DIR` does not belong to `CODE_UID`.
- **Files has no entries, or code-server opens an empty editor.** See the app's
  [troubleshooting](nextcloud-app.md#troubleshooting).

## What CI tests

The job `hosting` in `.github/workflows/ci.yml` runs this setup on every change: it builds both
images, starts a test Nextcloud, `sync`, `code-server`, `gate` and `web`, checks that a file comes
down from Nextcloud and another goes up, and opens the app's addresses in the built code-server
through `web`, awkward names and a new file saved with Ctrl+S included. For the tests, code-server
gets user settings without the chat panel, which would take the keyboard focus. Not tested there:
the sign-in with Nextcloud's app `oidc`, for which `gate` is replaced by a stand-in that lets every
request through, and your reverse proxy.
