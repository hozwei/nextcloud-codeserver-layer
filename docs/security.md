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
| code-server and its sign-in | everything in its working copy, its terminal and its extensions | |
| The sync client | carrying files between Nextcloud and the working copy | |
| File names | | anything: they are encoded, never interpreted |
| Other web sites | | opening files for the user |

**The app is not a security boundary.** Whoever reaches code-server reaches its whole working copy,
its terminal and whatever its container can reach, whatever folder the app maps. Protect code-server
with a sign-in of its own, on a host name of its own, and give its container only what it needs.
The app's mapping of folders only decides which addresses it builds.

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

## The sync client's login

Run the sync client in a container of its own that shares only the working copy with code-server.
In code-server's container, its login (`~/.netrc` with an app password) could be read from
code-server's terminal or by an extension, and it opens the user's whole Nextcloud account, not just
the code-server folder.

## What the app does

- **It hands over only an address.** code-server gets the file's path in its working copy, nothing
  else: no file content, no Nextcloud session, no token. The tab is opened without a handle on the
  Nextcloud page (its `opener` is cleared at once).
- **The address comes from the administrator.** Only administrators set code-server's address
  (`https`, `http` only on loopback, without user name, password, query or fragment), with a recent
  password confirmation, or with `occ`. Users choose only their folder, and only among their own
  files; the server resolves it and keeps its file id.
- **Names are encoded, not interpreted.** Each path segment is encoded for the URI and the payload
  again as a whole, so a name cannot add query parameters, a fragment or another payload entry, and
  every text the app shows is set with `textContent`.
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
- It does not sync files, and cannot see what the sync client has done; its warnings are based on
  what Nextcloud reports.
- The file's path is in the address of the tab, so it is in the browser's history and in the logs
  of code-server and a proxy in front of it.
