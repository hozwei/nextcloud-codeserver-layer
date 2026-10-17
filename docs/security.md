<!--
  - SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Security

What the app protects, and what it does not. To report a vulnerability, see
[SECURITY.md](../SECURITY.md).

## Trust model

| Party | Trusted for | Not trusted for |
|---|---|---|
| Nextcloud | the user's session and files, the app's settings | |
| code-server and its sign-in | everything it has: its working copy, a mount of an account, its terminal and its extensions | |
| The sync client, the mount | carrying files between Nextcloud and code-server | |
| File names | | anything: they are encoded, never interpreted |
| Other web sites | | opening files for the user |

**The app is not a security boundary.** Whoever reaches code-server reaches all the files it has,
its terminal and whatever its container can reach, whatever folder the app maps. With a mount of an
account, that is the whole account: its shares and team folders too, for reading and writing.
Protect code-server with a sign-in of its own, on a host name of its own, and give its container
only what it needs. The app's mapping of folders only decides which addresses it builds.

## Signing in to code-server

Use one of the two below. [hosting.md](hosting.md) sets up the second, with Nextcloud as the
identity provider, as part of a complete setup.

- **code-server's password:** `auth: password` with `hashed-password: "<argon2 hash>"` in its
  `config.yaml`, or the `HASHED_PASSWORD` environment variable. It is one password for everyone who
  uses this code-server.
- **A proxy that signs users in,** such as oauth2-proxy with Nextcloud or another identity provider:
  run code-server with `--auth none` and make it reachable only through the proxy, for example with
  `--bind-addr 127.0.0.1:8080` or on an internal container network.

Serve code-server over `https` (the app accepts `http` only on `localhost`), on a separate host
name such as `code.example.com`, never on Nextcloud's: a page on Nextcloud's origin can act with the
user's Nextcloud session, and code-server runs the web views of its extensions on its own origin. A
proxy must pass WebSocket upgrades and keep the `Host` header, or code-server refuses the
connection; examples for nginx and Caddy are in [hosting.md, step 4](hosting.md#4-reverse-proxy).

## The sync client's and the mount's login

Run the sync client, and a mount of the account, each in a container of its own that shares only
the files with code-server. In code-server's container their login (an app password in `~/.netrc`
or in rclone's configuration) could be read from code-server's terminal or by an extension, and it
opens the user's whole Nextcloud account. A mount with FUSE also needs the capability `SYS_ADMIN`
and `/dev/fuse`, which code-server's container, with its terminal and extensions, should not get:
it sees the mount through the bind propagation of a folder. Use an app password for each, which
you can revoke on its own (**Personal settings > Security > Devices & sessions**); the hosting
example takes the mount's from `NEXTCLOUD_DAV_APP_PASSWORD`, or the sync's without it.

The mount is the whole account on the Docker host as well, at `CODE_DAV_DIR/files`. The hosting
example lets only code-server's user and root in (`--default-permissions`, `--umask 077`): without
`--default-permissions`, `--allow-other` admits every user of the host, whatever the modes say.

## Account access

- **Per user, off by default.** `account_workspace` is one place for everyone, and holds one
  account's files. A user turns account access on in the personal settings, for themselves only;
  for anyone but the owner of that account, a click would open the path in someone else's files.
  The checkbox says so.
- **Folders the mount leaves out** (`account_exclude`) get no entries: a mount that hides a folder
  may still write into it, and a file that seems missing to code-server would be saved over the one
  in Nextcloud.
- **Workspace trust and the account.** A trusted folder's `.vscode/settings.json` and `tasks.json`
  can run commands, among them what its terminal starts. Trusting the mount, or turning trust off,
  also trusts every share and team folder of the account, into which others may write, and Files
  does not show their `.vscode` folders. Trust only folders that the user alone writes to
  ([workspace trust](hosting.md#workspace-trust)).
- **What code-server keeps.** code-server remembers the address it opened last (with the file's
  path) in its user data folder, and copies each saved file into its local history unless the
  mount is excluded (`workbench.localHistory.exclude`).

## What the app does

- **It hands over only an address.** code-server gets the file's or folder's path in its working
  copy or its mount, nothing else: no file content, no Nextcloud session, no token. The tab is
  opened without a handle on the Nextcloud page (its `opener` is cleared at once).
- **The address comes from the administrator.** Only administrators set code-server's address
  (`https`, `http` only on loopback, without user name, password, query or fragment) and the paths
  in its container, with a recent password confirmation, or with `occ`. Users choose only their
  folder, among their own files, and whether to use account access; the server resolves the folder
  and keeps its file id.
- **Names are encoded, not interpreted.** Each path segment is encoded for the URI and the payload
  again as a whole, so a name cannot add query parameters, a fragment or another payload entry, and
  every text the app shows is set with `textContent`. Addresses longer than 8000 characters are not
  opened.
- **Only the user's own files.** Entries appear only for nodes below the user's files
  (`/files/<user>`), not for the trash bin, tags or the team folders view, whose paths are no paths
  in the account.
- **New names are checked** against Windows' rules, Nextcloud's own rules and the names in the
  folder, before code-server gets the path. Nextcloud creates no file for them.
- **Only for the groups the app is enabled for.** Nextcloud runs an app's listeners for every user;
  the Files entries check the group themselves. The settings routes are refused by Nextcloud for
  accounts outside the groups.
- **A link another site opens asks first.** Files opens a file by itself for a `/f/<id>` link; the
  app opens a tab at once only within a click or key press of the user (`navigator.userActivation`)
  and asks otherwise. A browser without `navigator.userActivation` (Firefox before 120) counts every
  open as the user's, so there the app asks only when the browser blocks the tab. Opening
  code-server is not dangerous in itself, but nothing should open windows unasked.
- **MIME types, carefully.** The app adds only entries nothing else defines, removes only its own
  unchanged ones, and never a type a browser would render as a page: XML-like types are sent as
  `text/plain` for downloads. It changes nothing in `core/`.

## What the app does not do

- It does not sign users in to code-server, and does not check that code-server shows the right
  user's files: that is code-server's and its sign-in's job.
- It does not sync or mount files, and cannot see what the sync client or the mount has done; its
  warnings are based on what Nextcloud reports.
- The file's path is in the address of the tab, so it is in the browser's history and in the logs
  of code-server and a proxy in front of it.
