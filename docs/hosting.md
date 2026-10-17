<!--
  - SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Hosting code-server next to Nextcloud

The Nextcloud app only builds links; code-server and the files it works on are yours to run. This
page sets both up with Docker Compose. [`hosting/compose.example.yaml`](../hosting/compose.example.yaml)
runs code-server, a sync client that keeps the working copy in sync with a Nextcloud folder, and
authentication with the Nextcloud account in front of code-server. A second, optional file,
[`hosting/compose.account.yaml`](../hosting/compose.account.yaml), adds a mount of the whole
Nextcloud account for the app's account access ([All files of the account](#all-files-of-the-account)).
It is the setup this project's author runs, with the personal values taken out, and CI builds and
tests it on every change ([what CI tests](#what-ci-tests)).

```text
browser ──HTTPS──▶ reverse proxy ──▶ web (nginx) ────────────────▶ code-server
                                       │ asks about each request      │ reads and writes
                                       ▼                              ▼
                                      gate (oauth2-proxy)          working copy    the account (optional)
                                       │ sign-in                      ▲                ▲
                                       ▼                              │ nextcloudcmd   │ rclone over WebDAV
                                      Nextcloud (app oidc) ◀────── sync, every 30 s   dav
```

**Steps at a glance:**

1. [Prepare Nextcloud](#1-prepare-nextcloud): the folder, an app password for the sync client, the
   sign-in.
2. [Write `compose.yaml` and `.env`](#2-write-composeyaml-and-env).
3. [Start the containers](#3-start-the-containers).
4. [Put the reverse proxy in front](#4-reverse-proxy).
5. [Connect the Nextcloud app](#5-connect-the-nextcloud-app).
6. [Check that it works](#6-check-that-it-works).
7. Optionally, [all files of the account](#all-files-of-the-account).

| Container | Image | What it does |
|---|---|---|
| `sync` | built from Debian 13 with `nextcloud-desktop-cmd` | Runs Nextcloud's command-line client every 30 seconds and keeps the folder `NEXTCLOUD_FOLDER` of `NEXTCLOUD_USER` and the working copy in sync, in both directions |
| `code-server` | built from Debian 13 with code-server's release package, checked against its SHA-256 | The editor, as an unprivileged user and without a password of its own; its settings for synced and mounted files are written at every start ([details](#the-code-server-container)) |
| `gate` | `quay.io/oauth2-proxy/oauth2-proxy` | Signs people in with Nextcloud through its app *OIDC Identity Provider* (`oidc`), only the members of one group |
| `web` | `nginxinc/nginx-unprivileged` | Asks `gate` about each request, then passes it to code-server with its WebSockets; the only container with a published port |
| `dav` (optional) | `rclone/rclone` | Mounts the whole account of `NEXTCLOUD_USER` over WebDAV with FUSE, for code-server at `/nextcloud/files` ([details](#all-files-of-the-account)) |

No container runs as root or has Linux capabilities, except the optional `dav`, which FUSE needs to
run as root with `SYS_ADMIN`; `gate` and `web` have read-only file systems.

## Requirements

- A Linux host, amd64 or arm64, with Docker Engine and Docker Compose 2.17 or later (for
  `dockerfile_inline`).
- Nextcloud 34 or 35, where you can install apps and run `occ`.
- A separate host name for code-server, such as `code.example.com`, and a reverse proxy that
  serves it over HTTPS ([step 4](#4-reverse-proxy)). Never Nextcloud's own host name: a page on
  Nextcloud's origin can act with the user's Nextcloud session ([security.md](security.md)).
- The Docker host must reach Nextcloud: `gate` at its public address (the issuer), `sync` and `dav`
  at `NEXTCLOUD_URL`, which may be an internal address.
- For the mount of the account only: `/dev/fuse` on the host, and its folder on a shared mount
  ([All files of the account](#all-files-of-the-account)).

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

- **`sync` (and `dav`) over Nextcloud's internal address:** put them on Nextcloud's Docker network
  and set `NEXTCLOUD_URL=http://<Nextcloud's service name>`; that name must be in Nextcloud's
  `trusted_domains`. In `compose.yaml`:

  ```yaml
  services:
    sync:
      networks: [default, nextcloud]
  networks:
    nextcloud:
      external: true
      name: <Nextcloud's network, see docker network ls>
  ```

  With the [mount of the account](#all-files-of-the-account), `dav` as well, in
  `compose.account.yaml` (in `compose.yaml` a `dav` without its image would break the file on its
  own): `services: dav: networks: [default, nextcloud]`.

- **A reverse proxy in a container** cannot reach `127.0.0.1:8080` of the host: forward to the
  Docker host's address and `CODE_PORT`, or put `web` on the proxy's network and forward to
  `http://code-server-web-1:8080`.
- **The app in a Nextcloud container** (official image):

  ```sh
  docker cp codeserver_layer-0.2.0.tar.gz <nextcloud container>:/tmp/
  docker exec -u www-data <nextcloud container> tar -xzf /tmp/codeserver_layer-0.2.0.tar.gz -C /var/www/html/custom_apps
  ```

## 1. Prepare Nextcloud

**The folder.** The working copy mirrors one folder of one account, say `/Projects` of `alice`.
Create it in Nextcloud if it does not exist yet; the sync client does not create it. Every change
from code-server reaches Nextcloud as this account, whoever made it, so its versions and activity
show `alice`. To share the folder with a team, see
[One user or several](nextcloud-app.md#one-user-or-several).

**An app password for the sync client,** so that the account's own password stays out of the
container: as `alice`, **Personal settings > Security > Devices & sessions > Create new app
password**. It goes into `.env` as `NEXTCLOUD_APP_PASSWORD`, and you can revoke it there. Give the
optional mount one of its own (`NEXTCLOUD_DAV_APP_PASSWORD`), so that you can revoke either without
stopping the other; without it, the mount uses the sync's.

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
v=0.2.0
base=https://raw.githubusercontent.com/hozwei/nextcloud-codeserver-layer/v$v/hosting
curl -fsSL -o compose.yaml "$base/compose.example.yaml"
curl -fsSL -o compose.account.yaml "$base/compose.account.yaml"   # only for the mount of the account
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
| `CODE_DAV_DIR`, `CODE_DAV_CACHE_DIR`, `NEXTCLOUD_DAV_APP_PASSWORD`, `COMPOSE_FILE` | only for the mount of the account: the folder in which it is mounted, rclone's write cache, the mount's app password, and both Compose files ([below](#all-files-of-the-account)) |
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

## All files of the account

With [`compose.account.yaml`](../hosting/compose.account.yaml), code-server also has the whole
account of `NEXTCLOUD_USER`, at `/nextcloud/files`: the app's account access opens files from
anywhere in it, and folders for scripts that work on them. No copy: the container `dav` mounts the
account over WebDAV with rclone, and code-server reads and writes Nextcloud's files directly, with
their versions, trash bin and locks.

```text
Nextcloud ◀── WebDAV, app password ──▶ dav (rclone mount, FUSE) ──▶ CODE_DAV_DIR/files
                                                                       │ the same folder
                                                                       ▼
                                                  code-server: /nextcloud/files
```

**How it is built.**

- `dav` is the only container with a Linux capability (`SYS_ADMIN`), `/dev/fuse` and no AppArmor
  profile, which FUSE needs; code-server, with its terminal and extensions, stays without them.
- Both bind `CODE_DAV_DIR`, `dav` with `propagation: rshared` and code-server with `rslave`, and
  rclone mounts the account one level below it, in `CODE_DAV_DIR/files`. Bound directly, the mount
  point would keep a dead mount in code-server after `dav` restarts; this way the new mount arrives
  by itself. After an unclean end (a crash, a kill, an unmount refused because code-server held
  the mount busy), the restarted `dav` first clears the dead mount.
- Only code-server's user (`CODE_UID`) and root reach the account, also on the host at
  `CODE_DAV_DIR/files`: with `--default-permissions` the kernel checks the modes, which
  `--umask 077` sets.
- `dav` checks the login before it mounts: with a wrong app password or address it stops, and
  tries again a minute later. rclone itself would mount anyway and fail at the first listing.
- The folder the working copy mirrors (`NEXTCLOUD_FOLDER`) is left out of the mount, so that its
  files open from the working copy only. rclone's `--exclude` only hides it, though: whatever
  writes there through the mount still reaches Nextcloud. The app's `account_exclude` keeps account
  access out of it.
- rclone uploads a saved file 5 s after it was closed, keeps what it has yet to upload in
  `CODE_DAV_CACHE_DIR`, also across restarts, and sees changes made elsewhere when it lists a
  folder again, after up to 1 minute (`--dir-cache-time 1m`).

**Set it up:**

1. Create both folders, as root. They stay root's, unlike the working copy and code-server's home:
   `dav` runs as root without `CAP_DAC_OVERRIDE`, so it may write only where root owns the folder.
   It creates `files` in the first one.

   ```sh
   mkdir -p /srv/code-server/dav /srv/code-server/dav-cache
   chmod 700 /srv/code-server/dav-cache
   ```

2. Check that the host can do it: `/dev/fuse` exists (`ls -l /dev/fuse`), and `CODE_DAV_DIR` is on
   a shared mount for Docker:

   ```sh
   findmnt -o TARGET,PROPAGATION -T /srv/code-server/dav
   ```

   It must say `shared`. With systemd, `/` usually is. If not, make the folder a shared mount of its
   own, as root:

   ```sh
   mount --bind /srv/code-server/dav /srv/code-server/dav && mount --make-rshared /srv/code-server/dav
   ```

   Keep it so after a reboot, before Docker starts, or Docker refuses to start `dav` and
   code-server: with the line `/srv/code-server/dav /srv/code-server/dav none bind,rshared 0 0` in
   `/etc/fstab`, or a systemd unit with `Before=docker.service`.

3. In `.env`, set `CODE_DAV_DIR`, `CODE_DAV_CACHE_DIR`, the mount's app password
   `NEXTCLOUD_DAV_APP_PASSWORD` ([step 1](#1-prepare-nextcloud)), and
   `COMPOSE_FILE=compose.yaml:compose.account.yaml`. Every `docker compose` command on this page
   then uses both files; without it, `docker compose up -d` recreates code-server without the mount
   and leaves `dav` behind. Start it, and look:

   ```sh
   docker compose up -d
   docker compose exec code-server ls /nextcloud/files
   ```

   The list shows the account's top folders, without `NEXTCLOUD_FOLDER`.

4. Connect the app's account access, and let `alice` turn it on (**Personal settings > code-server >
   All my files**, or `occ`):

   ```sh
   occ config:app:set codeserver_layer account_workspace --value=/nextcloud/files
   occ config:app:set codeserver_layer account_exclude --value=/Projects
   occ codeserver_layer:account alice on
   ```

5. Check: as `alice`, click a `.ps1` outside `/Projects` in Files. code-server opens it on its own,
   in a window without a folder; change it, press Ctrl+S, and a few seconds later Nextcloud shows
   the change and the previous version under **Versions**.

**Workspace trust.** code-server opens a file below a folder it does not trust in Restricted Mode,
and keeps the trusted folders in each browser ([workspace trust](#workspace-trust)). Trust
`/nextcloud` once in each browser, or start code-server with `--disable-workspace-trust`, only if
nobody else can write into the account: `/nextcloud` also holds its shares and team folders, and a
trusted folder's `.vscode/settings.json` and `tasks.json` can run commands (what its terminal
starts, for one), which Files does not show. Otherwise trust only folders that you alone write to,
such as `/nextcloud/files/Scripts`.

**What a mount over WebDAV cannot do:**

- **A save that Nextcloud refuses looks saved in code-server:** a file open in Text or Office
  (locked), a share without edit rights, a name Nextcloud does not allow. rclone keeps it in
  `CODE_DAV_CACHE_DIR`, even beyond `--vfs-cache-max-size`, and retries it, at most every 5
  minutes, for as long as it runs; once a lock ends, the retried save replaces what the lock's
  holder saved. `docker compose logs dav | grep 'failed to upload'` shows them. The app warns before
  opening a locked or read-only file, and a folder that takes no new files.
- **After a refused upload rclone deletes the file on the server,** if it may, for files up to
  10 MiB (which it uploads in one piece). Not inside a read-only share; but a file shared with you
  on its own leaves the share, and the next upload makes your version a file of your own in its
  place. When a lock ends while rclone retries, when the account is out of space (507), or in a
  share that allows deleting but not editing, the file goes to the trash bin, and the next upload
  creates it anew, with a new file id (its shares, comments and tags stay with the trashed one).
- **Changes made elsewhere arrive after up to a minute**, when rclone lists the folder again: until
  then code-server may show the earlier content, and a file renamed or created moments ago as
  missing. The app warns before opening a file that changed within `account_sync_hint_seconds` (65
  by default, just over `--dir-cache-time`). A file renamed or moved keeps its times and gets no
  warning: give the mount a minute before you open it.
- **Files in the mount are never executable,** and `chmod` there reports success but changes
  nothing: run scripts through their interpreter (`bash rename.sh`, `pwsh ./rename.ps1`,
  `python3 rename.py`).
- **The last writer wins:** there is no conflict check between code-server and other devices.
- **Large folders:** opening one in code-server lists only what you expand, but code-server's file
  search (Ctrl+P) and some extensions walk the whole folder over WebDAV.

**Operations.**

- **A save stuck in the cache:** to drop it and keep the file in Nextcloud, stop `dav`
  (`docker compose stop dav`), delete `CODE_DAV_CACHE_DIR/vfs/nc/<path>` and
  `CODE_DAV_CACHE_DIR/vfsMeta/nc/<path>` as root (the path in the account), and start `dav` again.
  Deleting the file through the mount drops the save too, but deletes the file in Nextcloud as
  well, wherever Nextcloud allows it (once a lock has ended, for one).
- **Before you stop or remove `dav`,** check that nothing is left to upload: the last line of
  `docker compose logs --tail 3 dav` says `to upload 0, uploading 0`.
- **"Transport endpoint is not connected"** in code-server: restart `dav`
  (`docker compose restart dav`); it clears the dead mount, and code-server gets the new one by
  itself.
- **Cut code-server off from the account:** stop `dav`, and revoke the mount's app password in
  Nextcloud. Without a password of its own the mount uses the sync's, and revoking that stops the
  sync too, until `.env` has a new one. Never `rm -rf` the folder of the mount while the account is
  mounted there: that deletes the files in Nextcloud.

## The code-server container

| | |
|---|---|
| Image | `local/code-server:4.141.0-1`, built on the Docker host from `debian:trixie-slim` and code-server's `.deb` package, checked against its SHA-256 |
| Tools | `bash`, `git`, `curl`, `less`, `procps` and `tzdata`, nothing more ([more tools](#more-tools-for-the-terminal)) |
| User | `coder` with `CODE_UID`:`CODE_GID`, home `/home/coder`; no root, no `sudo`, no capabilities, so `apt-get` in the terminal does not work |
| Folders | `CODE_HOME_DIR` as `/home/coder` (settings, extensions, unsaved editors), `CODE_WORKSPACE_DIR` as `/workspace` (the working copy); with the mount, `CODE_DAV_DIR` as `/nextcloud` |
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
| `"files.exclude"`, `"files.watcherExclude"`, `"search.exclude"` | the sync client's database and large folders stay out of the explorer, the file watcher and search; the mount at `/nextcloud` is not watched, as a path of its own without a glob, so that the watcher does not walk it over the network |
| `"workbench.localHistory.exclude"` | no copy of each save from the mount in code-server's home |

To change them, edit the `cat > … settings.json` part of the `code-server` service and run
`docker compose up -d`. Background: [recommended settings](nextcloud-app.md#recommended-code-server-settings).

**Extensions** come from [Open VSX](https://open-vsx.org/): install them in code-server's
**Extensions** view or on the command line. They live in `CODE_HOME_DIR`.

```sh
docker compose exec code-server code-server --install-extension tamasfe.even-better-toml
```

Extensions run with write access to all of code-server's files, the mount of the account included:
install only those you need, from publishers you trust. Which formats need one for highlighting:
[nextcloud-app.md](nextcloud-app.md#syntax-highlighting).

### More tools for the terminal

Tools go into the image, as the terminal has no root. Python and most others are Debian packages:
add them to the `apt-get install` line of the `code-server` build. PowerShell is not: download its
release from [github.com/PowerShell/PowerShell](https://github.com/PowerShell/PowerShell/releases)
and check its SHA-256, as the build does for code-server; on amd64 the `.deb` package
(`apt-get install` it), on arm64 the `linux-arm64.tar.gz` archive, unpacked into
`/opt/microsoft/powershell/7` with a link `/usr/local/bin/pwsh`. Then raise the image tag
(`local/code-server:4.141.0-2`) and run `docker compose up -d`.

### Workspace trust

code-server 4.141 opens a folder it does not trust in Restricted Mode, with a banner and without the
extensions that need trust; editing and saving work, and opening asks no question by default. A
terminal does ask, "Do you trust the authors of the files in this folder?": Cancel still opens it,
Trust Folder & Continue trusts the folder in this browser from then on. A window without a folder,
as account access opens one, takes the trust of its file. code-server keeps the trusted folders in
the browser, so each browser and device trusts on its own.

Trust only folders whose files nobody else can write: a trusted folder's `.vscode/settings.json`
and `tasks.json` take effect and can run commands, what its terminal starts for one. With the mount,
the account's shares and team folders count, and Files does not show their `.vscode` folders.

- **In each browser,** run **Workspaces: Manage Workspace Trust** and add `/workspace` (and, for
  the mount, `/nextcloud` if nobody else writes into the account, or its own folders) as trusted
  folders; the folders below them are then trusted too.
- **For all browsers,** if everything code-server has is yours and nobody else can write into it:
  add `--disable-workspace-trust` to the `code-server` command, which turns trust off; or
  `--enable-remote-storage` (code-server 4.141 or later), which keeps code-server's browser state,
  the trusted folders included, on the server.

## Operations

- **A new code-server.** In the `code-server` build, set `CODE_SERVER_VERSION` and the SHA-256
  digests of `code-server_<version>_amd64.deb` and `code-server_<version>_arm64.deb` (the release
  page shows each asset's digest), raise the image tag, then run `docker compose up -d`. First look
  at this repository's [issues](https://github.com/hozwei/nextcloud-codeserver-layer/issues): an
  open issue labelled `canary` means the newest code-server fails the app's tests.
- **The other images.** `gate`, `web` and `dav` use tagged images; raise the tags, then run
  `docker compose up -d`.
- **Conflicted copies.** If a file changed in Nextcloud and in the working copy between two sync
  runs, Nextcloud's version keeps the name and the other one becomes
  `<name> (conflicted copy <date> <time>).<ext>`, in the working copy only. The sync client's log
  counts them, and `sync` turns unhealthy while there are any. Merge them by hand and delete the copy.
- **A failed sync run** is retried after five minutes. After you fixed `.env`, `docker compose up -d`
  restarts `sync` at once.
- **Tabs.** Each code-server tab has an extension host of its own on the server. Closing a tab ends
  it within seconds; a tab that goes without a word (a closed browser, a laptop asleep) keeps it for
  up to 3 hours (`--reconnection-grace-time <seconds>` in the `code-server` command shortens that).
- **Backups.** Nextcloud holds the files; the working copy is a copy of them. `CODE_HOME_DIR` holds
  code-server's settings, extensions and unsaved editors, and `CODE_DAV_CACHE_DIR` saves the mount
  has yet to upload. Leave `CODE_DAV_DIR` out of backups, indexers and recursive commands on the
  host (`--one-file-system`, or an exclude): `CODE_DAV_DIR/files` is the whole account, live, and
  a restore into it while `dav` runs writes to Nextcloud.
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
- **`docker compose up` fails with "… is not a shared mount".** `CODE_DAV_DIR` is not on a shared
  mount: see [step 2 of the mount](#all-files-of-the-account).
- **`dav` restarts every minute, and logs "Nextcloud refused the login or cannot be reached".** A
  wrong app password (Nextcloud slows down logins from this host after a few, so fix it soon), or
  an address `dav` cannot reach (`NEXTCLOUD_URL`, its Docker network).
- **`dav` restarts and logs "can't create directory '/mnt/dav/files': Permission denied" or
  "Failed to create vfs cache".** `CODE_DAV_DIR` or `CODE_DAV_CACHE_DIR` does not belong to root
  ([step 1 of the mount](#all-files-of-the-account)).
- **`docker compose up` fails on `/dev/fuse`, or `dav` restarts with a refused mount.** The host
  lacks FUSE.
- **`ls /nextcloud/files` in code-server says "Input/output error".** `dav` lost Nextcloud after it
  had mounted (an app password revoked meanwhile, Nextcloud down): `docker compose logs dav`.
- **Files has no entries, or code-server opens an empty editor.** See the app's
  [troubleshooting](nextcloud-app.md#troubleshooting).

## What CI tests

The job `hosting` in `.github/workflows/ci.yml` runs this setup on every change, with
`compose.account.yaml`: it builds both images, starts a test Nextcloud, `sync`, `dav`,
`code-server`, `gate` and `web`, checks that a file comes down from Nextcloud and another goes up,
both through the sync and through the mount (which leaves the synced folder out and has an app
password of its own), that code-server gets the mount back after `dav` was killed, and opens the
app's addresses in the built code-server through `web`: awkward names, a new file saved with
Ctrl+S, and the files and folders of account access in the mount, whose saves then reach Nextcloud.
For the tests, code-server gets user settings without the chat panel, which would take the keyboard
focus. Not tested there: the sign-in with Nextcloud's app `oidc`, for which `gate` is replaced by a
stand-in that lets every request through, and your reverse proxy.
