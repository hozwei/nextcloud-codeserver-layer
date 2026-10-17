<!--
  - SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# The Nextcloud app

`codeserver_layer/` is a Nextcloud app for Nextcloud 34 and 35. It adds "Open in code-server" and
"+ New" entries to Files for the files in each user's code-server folder, warns before opening when
the sync may get in the way, gives code formats Nextcloud's code icon, and has a settings page for
administrators and one for users. Its texts are in English and German (`de` informal, `de_DE`
formal).

| Nextcloud | PHP | End-to-end tests in CI with |
|---|---|---|
| 34 | 8.2 to 8.5 | `nextcloud:34.0.4-apache` |
| 35 | 8.3 to 8.5 (Nextcloud 35 needs 8.3 or newer) | `nextcloud:35.0.1-apache` |

The end-to-end tests run on the images' PHP 8.5; PHP 8.2 to 8.4 are checked with `php -l`.

## How it is meant to be used

```text
 Nextcloud (Files in the browser)                  code-server (its own host name)
+------------------------------------+  new tab   +------------------------------------+
| "Open in code-server", a click     | ---------> | ?folder=/workspace/<project>       |
| "+ New": a name, then code-server  |  only the  | &payload=[["openFile",             |
| warnings: sync, locks              |  address   |   "vscode-remote://<host>/..."]]   |
+------------------------------------+            +-----------------+------------------+
        ^ WebDAV (a PROPFIND for the warnings)                      | reads, writes
        |                                                           v
  Nextcloud's files  <----- a sync client, or one shared directory -----> working copy
```

Three terms:

- **code-server folder:** the folder in a user's Nextcloud files whose files open in code-server,
  say `/Projects`. Each user chooses one.
- **working copy:** the same files as code-server sees them, at the path set as `workspace`, say
  `/workspace` on code-server's machine or in its container.
- **sync client:** the program that keeps the two the same. None is needed when they are one
  directory ([Providing the working copy](#providing-the-working-copy)).

A file `/Projects/My App/src/run.ps1` then opens in code-server as `/workspace/My App/src/run.ps1`,
in the project folder `/workspace/My App`, the top folder below the code-server folder. A file
directly in the code-server folder opens with the whole working copy as the folder.

## Providing the working copy

code-server must see the contents of the code-server folder directly at `workspace`: with the
folder `/Projects` and `workspace` set to `/workspace`, the file `/Projects/My App/run.ps1` must be
`/workspace/My App/run.ps1`. The app moves no files; two setups work. The first one, complete with
code-server and a sign-in with Nextcloud in one Docker Compose file, is in [hosting.md](hosting.md).

**A sync client next to code-server.** Run Nextcloud's command-line client `nextcloudcmd` (in Debian
and Ubuntu the package `nextcloud-desktop-cmd`) in a container of its own that mounts the working
copy, as the same user id as code-server, or code-server cannot change the files it downloads.
`nextcloudcmd` syncs once and exits, so run it in a loop:

```sh
# ~/.netrc of the sync client: machine cloud.example.com login alice password <app password>
while true; do
  nextcloudcmd --non-interactive --silent -n --path /Projects /workspace https://cloud.example.com
  sleep 30
done
```

- `--path` is the code-server folder; the local folder is the working copy.
- Use an app password (**Personal settings > Security > Devices & sessions**), and keep it where
  code-server cannot read it ([docs/security.md](security.md#the-sync-clients-login)).
- `sync_hint_seconds` should cover one round, the pause plus the time a sync takes; the default 60
  suits this loop.
- If a file changed on both sides between two rounds, Nextcloud's version keeps the name, and the
  local one becomes `<name> (conflicted copy <date> <time>).<ext>`, in the working copy only.
- Leave the client's database, `.sync_*.db*` in the working copy, alone.

**One directory for both, without a sync.** Mount one directory into code-server's container at
`workspace` and into Nextcloud's, and make it the user's external storage of type Local (an
administrator's mount, applicable to that user):

```sh
occ app:enable files_external
occ files_external:create --applicable-user=alice /Projects local null::null -c datadir=/srv/code/alice
occ files_external:option <mount id> filesystem_check_changes 1
```

- `filesystem_check_changes 1` ("once every direct access") makes Nextcloud notice code-server's
  changes when a folder is opened. The web interface sets it for new storages, `occ` does not.
- Nextcloud's web server user and code-server's user must both read and write every file: the same
  user id, or a shared group with group-writable files.
- With server-side encryption, turn it off for this storage
  (`occ files_external:option <mount id> encrypt false`), or code-server sees encrypted data.
- code-server writes past Nextcloud: its saves create no versions, its deletions skip the trash
  bin, and Text's lock does not stop it.
- Set `sync_hint_seconds` to `0`: there is no sync to wait for.

## One user or several

The app has one code-server address and one working-copy path for everyone; only the code-server
folder is per user. code-server has one sign-in and one set of files. So:

- **One person**, the usual case: one code-server with a working copy of that person's code-server
  folder.
- **A team on one folder:** share one Nextcloud folder with the team (a share or a team folder), let
  everyone choose it as their code-server folder, and give one code-server a working copy of it.
  Everyone uses the same code-server sign-in and sees all its files.
- **A code-server per user** behind one address needs a proxy that signs users in and sends each to
  their own code-server, each with that user's files at the same `workspace` path. The app does
  nothing for this.

Do not let users with different code-server folders share one code-server: their links would open
paths in a working copy of someone else's folder.

## Installing

The app is not in the Nextcloud App Store. Each
[release](https://github.com/hozwei/nextcloud-codeserver-layer/releases) has it as
`codeserver_layer-<version>.tar.gz`, with its checksum in `SHA256SUMS`. Both are plain downloads
from `https://github.com/hozwei/nextcloud-codeserver-layer/releases/download/v<version>/<asset>`:

```sh
v=0.1.0
base=https://github.com/hozwei/nextcloud-codeserver-layer/releases/download/v$v
curl -fL --remote-name-all "$base/codeserver_layer-$v.tar.gz" "$base/SHA256SUMS"
sha256sum -c SHA256SUMS      # codeserver_layer-0.1.0.tar.gz: OK
```

The archive holds one folder, `codeserver_layer/`. Unpack it into one of the server's apps folders
(those listed in `apps_paths` in `config/config.php`, such as `custom_apps/` in the official Docker
image), give it to the web server's user (`www-data` here), and enable the app. `occ` is `php occ`
in the Nextcloud folder, run as the web server's user:

```sh
tar -xzf codeserver_layer-$v.tar.gz -C /path/to/nextcloud/custom_apps
chown -R www-data:www-data /path/to/nextcloud/custom_apps/codeserver_layer
occ app:enable -g <group> codeserver_layer
```

**Only for some groups.** `occ app:enable -g <group> [-g <group>] codeserver_layer`, or the group
setting in Nextcloud's app management. Users outside these groups get no entries in Files and no
personal settings page. Every administrator sees the administration page, but only administrators
in one of these groups can save it; the page tells the others. They can still use
`occ config:app:set`.

**Upgrading to Nextcloud 35.** Install a release that declares Nextcloud 35 (0.1.0 does) before you
upgrade the server: the server's updater disables every app whose range ends below the new version,
and disabling removes the app's file types until it is enabled again.

### Updating, rolling back and removing

Enabling, updating and disabling each give the matching files their type in one pass over
Nextcloud's file cache ([File types](#file-types)); on a large instance, run them with `occ` rather
than in the browser.

**Update:** put the new release in place of the old folder and run `occ upgrade`. The settings and
each user's code-server folder stay.

```sh
rm -rf /path/to/nextcloud/custom_apps/codeserver_layer
tar -xzf codeserver_layer-$v.tar.gz -C /path/to/nextcloud/custom_apps
chown -R www-data:www-data /path/to/nextcloud/custom_apps/codeserver_layer
occ upgrade
```

**Roll back** to an earlier release: `occ app:disable codeserver_layer`, put the earlier release in
place as above, then `occ app:enable -g <group> codeserver_layer`. Disabling forgets the groups, so
name them again.

**Remove:** `occ app:remove codeserver_layer`. It disables the app first, which takes its entries out
of `config/mimetypemapping.json` and `config/mimetypealiases.json` and gives the files their earlier
types, and then deletes the folder. Deleting the folder by hand, or `--keep-data`, leaves the file
types in `config/`. The settings stay in the database: `occ config:app:delete codeserver_layer <key>`
removes them, and `occ user:setting <user> codeserver_layer folder --delete` a user's folder.

## Configuring

**Administration settings > code-server**, or `occ config:app:set codeserver_layer <key> --value=…`.
Saving the page needs a recent password confirmation; it checks every field and saves nothing if
one cannot be used. `occ` does not apply these checks: Nextcloud only refuses keys the app does not
declare, and values that are not a boolean (`default_app`) or an integer (`sync_hint_seconds`). The
app then ignores what it cannot use: with an unusable `url` or `workspace` Files has no entries,
invalid list items and unknown "+ New" entries are skipped, and `sync_hint_seconds` is kept between
0 and 3600. The administration page shows what is wrong with stored values.

| Key | Default | What it is |
|---|---|---|
| `url` | empty | code-server's address as the browser opens it, such as `https://code.example.com/`. `https` (plain `http` only on `localhost`, `127.x.x.x` or `[::1]`), without user name, password, `?query` or `#fragment`; a path such as `https://example.com/code/` is fine |
| `workspace` | empty | The working copy's absolute path in code-server's container, such as `/workspace` |
| `extensions` | about a hundred, see below | File extensions that open in code-server, separated by commas |
| `filenames` | twenty, see below | File names that open in code-server; `*` stands for any characters (`.env.*`) |
| `default_app` | `false` | `true`: a click opens all these files in code-server, also those another app opens otherwise |
| `new_entries` | `ps1,psm1,yaml,json,sh,py` | The "+ New" entries, from: `ps1`, `psm1`, `yaml`, `json`, `sh`, `py`, `md`, `txt`, `toml`, `ini`, `xml`, `html`, `css`, `js`, `ts`, `sql`, `bat`, `cmd` |
| `sync_hint_seconds` | `60` | Seconds after a change in Nextcloud during which opening warns first; `0` turns it off |

Without a usable `url` and `workspace` the app offers nothing, and the users' personal settings page
says so. Under the lists, the administration page says what a click opens with the current settings.

**Each user's code-server folder.** Users choose it in **Personal settings > code-server**, by typing
its path or picking it. The app keeps the folder's file id, so renaming or moving the folder changes
nothing. There is no default: until a user has a folder, Files offers them nothing. An administrator
cannot pick another user's folder in the browser, but can show, set or clear it with `occ`:

```sh
occ codeserver_layer:folder <user>              # shows it
occ codeserver_layer:folder <user> /Projects    # sets it
occ codeserver_layer:folder <user> --clear      # no folder: no entries
```

## Files

**What opens.** Files are matched by name first, then by extension, ignoring case. The extension is
what Nextcloud types a file by: the part after the last dot, where a dot at the start does not count.
The lists the app comes with:

| Group | Extensions |
|---|---|
| PowerShell, Windows | `ps1` `psm1` `psd1` `ps1xml` `pssc` `psrc` `bat` `cmd` `vbs` `vb` `reg` |
| Shell | `sh` `bash` `zsh` `ksh` `fish` |
| Python | `py` `pyw` `pyi` |
| Web | `js` `mjs` `cjs` `jsx` `ts` `cts` `tsx` `vue` `svelte` `html` `htm` `xhtml` `css` `scss` `sass` `less` |
| Data, configuration | `json` `jsonc` `jsonl` `ndjson` `yaml` `yml` `toml` `xml` `xsd` `xsl` `xslt` `ini` `cfg` `conf` `cnf` `properties` `env` |
| Text, documentation | `md` `markdown` `txt` `rst` `adoc` `tex` `bib` `log` `diff` `patch` |
| Languages | `c` `h` `cc` `cpp` `cxx` `hh` `hpp` `hxx` `cs` `java` `kt` `kts` `gradle` `groovy` `scala` `go` `rs` `rb` `pl` `php` `lua` `swift` `dart` `r` `sql` |
| Build, infrastructure | `dockerfile` `mk` `cmake` `tf` `tfvars` `hcl` `nix` `j2` `jinja` `graphql` `gql` `proto` |

File names: `.gitignore` `.gitattributes` `.gitmodules` `.editorconfig` `.npmrc` `.env` `.env.*`
`.bashrc` `.profile` `.zshrc` `.dockerignore` `Dockerfile` `Dockerfile.*` `Containerfile`
`Makefile` `GNUmakefile` `Jenkinsfile` `Vagrantfile` `Gemfile` `Rakefile`.

Left out on purpose: `csv`, `tsv` and `svg`, which spreadsheets, Text and the Viewer open (as the
default app, code-server would take their click), and `bicep` and `json5`, which code-server cannot
highlight without an extension that Open VSX lacks. An administrator can add any of them.

**A click or the menu.** Every listed file has "Open in code-server" in its menu. A click opens it
in code-server where no other app in Nextcloud opens its type: of the list above, the formats that
Nextcloud Text does not open (`ps1`, `ini`, `log`, `toml`, `ts`, `go`, ...) and all file names. The
others (`md`, `txt`, `json`, `yaml`, `py`, `sh`, `html`, `xml`, ...) open in Nextcloud Text on a
click. If an administrator makes code-server the default app (`default_app`), a click opens all of
them in code-server; Text remains in the menu as **View**, and an office app that loses its click
(if an administrator adds such formats) gets an entry of its own in the menu.

**Where.** For the users the app is enabled for, in Files in the browser: in the user's code-server
folder and below. Not on public share pages, not in the trash, not for folders or several files at
once.

**The tab.** Each file opens code-server in a new tab that has no access back to the Nextcloud page.
When someone follows a direct link to a file (`/f/<id>`), Files opens the file without a click, and
the browser would block the new tab; so the app asks first ("Open run.ps1 in code-server?"), and the
dialog's button opens the tab. The same question comes when the browser blocks the tab anyway.

## New files

The "+ New" menu has the chosen entries in the user's code-server folder and below, where the user
may create files. An entry asks for a name, with the extension fixed beside it, and checks it:

- not empty, at most 250 bytes;
- valid on Windows clients, whatever the server allows: none of `< > : " / \ | ? *` or control
  characters, no reserved device name (`CON`, `PRN`, `AUX`, `NUL`, `COM0`–`COM9`, `LPT0`–`LPT9`);
- allowed by Nextcloud's own rules for names;
- not the name of a file in the folder, in any letter case (Windows and macOS clients cannot hold
  `Test.ps1` and `test.ps1` side by side).

Then code-server opens the new path. Nextcloud creates no file: code-server shows an unnamed editor
under that name and writes the file on the first save (Ctrl+S), also in a folder that does not
exist yet in the working copy; the sync brings it to Nextcloud. Should a file of that name reach
the working copy before the save, code-server asks before replacing it. If the working copy already
has the file but Nextcloud does not yet, code-server opens the existing file. A new file gets the
line endings set in code-server ([recommended settings](#recommended-code-server-settings)).

## Warnings before opening

Before it opens a file, the app asks Nextcloud about it (one WebDAV `PROPFIND`):

- **Changed moments ago.** If the file was uploaded or changed within `sync_hint_seconds`, code-server
  may not have the change yet: "The file changed 12 s ago. If that was in Nextcloud or on another
  device, code-server shows the change only after the next sync." The app measures against the
  server's clock (the `Date` header of its answer), not the browser's; the upload time is the
  server's, the modification time can be that of the client that uploaded the file.
- **Locked.** Nextcloud Text locks a file while it is open there (with Nextcloud's files_lock app),
  and so may a user. A sync cannot upload the file while it is locked, so the app warns, naming Text
  or the lock's owner.

Either way the app asks, and opens the file only on "Open in code-server". If Nextcloud does not
answer within 2 seconds, the file opens without the check, and Files says so. The first time a
browser opens a file in code-server, a dialog explains: do not edit a file in Nextcloud Text and in
code-server at the same time.

## File types

Nextcloud picks a file's icon by its type, which it takes from the extension. For 68 of the
extensions above Nextcloud 34 and 35 have no type, and show the plain file icon. The app adds types
for them to Nextcloud's `config/mimetypemapping.json`, and aliases to Nextcloud's code icon to
`config/mimetypealiases.json`, also for `.cmd` and `.bat`:

| Type | Extensions |
|---|---|
| `application/x-powershell` | `ps1` `psm1` `psd1` `pssc` `psrc` |
| Nextcloud's own types of related extensions | `ps1xml` `xsd` (`application/xml`), `zsh` `ksh` (`text/x-shellscript`), `pyw` `pyi` (`text/x-python`), `mjs` `cjs` `jsx` (`application/javascript`), `jsonc` (`application/json`), `cxx` (`text/x-c++src`), `hxx` (`text/x-h`) |
| `application/typescript` | `ts` `cts` `tsx` |
| `text/x-ini` | `ini` `cfg` |
| `text/x-log` | `log` |
| 38 more types (pairs such as `kt` `kts` share one) | `vbs` `vb` `reg` `fish` `vue` `svelte` `xhtml` `scss` `sass` `less` `jsonl` `ndjson` `xsl` `xslt` `properties` `env` `bib` `diff` `patch` `cs` `kt` `kts` `gradle` `groovy` `scala` `go` `rs` `rb` `lua` `swift` `dart` `r` `sql` `dockerfile` `mk` `cmake` `tf` `tfvars` `hcl` `nix` `j2` `jinja` `graphql` `gql` `proto` |

The names follow freedesktop.org's shared-mime-info where it has one. The full list is
`FileTypes::MAPPINGS` in `codeserver_layer/lib/Service/FileTypes.php`.

- **For everyone.** The types apply to all users, also those the app is not enabled for: Files shows
  these files with the code icon, existing files get the new type in one pass over the file cache,
  and Text opens `.jsonc` and the related extensions above as it opens their siblings. `.ts` is also
  the extension of MPEG transport stream videos, which Nextcloud does not know as videos either;
  they get the code icon too.
- **Only keys nothing else defines.** The app adds an entry only where neither Nextcloud nor
  another app nor the administrator has one, notes what it added (`file_types`), and removes on
  disable only what is still unchanged. It writes the files under its own lock and under the one
  the Craft Suite Layer (`craftsuite_layer`) uses for the same files, so the two apps never rewrite
  them at the same time.
- **When.** Nextcloud runs the app's repair steps on every enable and app update (adding) and on
  every disable (removing, and giving the files their earlier type back).
- **No changes to Nextcloud's own files.** The app changes nothing in `core/` and does not run
  `occ maintenance:mimetype:update-js`; pages that pick icons in the browser get the aliases from a
  small script of the app. It does not replace Nextcloud's icon provider.
- **A read-only `config/`.** The types are not added, Files shows the plain file icon as before, and
  the app logs a warning.

`.txt`, `.conf`, `.cnf`, `.md`, `.markdown`, `.rst`, `.tex` and `.adoc` keep Nextcloud's text icon: a
code icon for them would mean changing the icon of every text file.

## Syntax highlighting

Highlighting is code-server's. Visual Studio Code, which code-server builds on, highlights most of
the formats above by itself. Some need an extension (code-server installs extensions from
[Open VSX](https://open-vsx.org/)) or an entry in its `files.associations` setting. As of
code-server 4.141.0:

| How | Formats |
|---|---|
| By itself | all formats and file names above except those below; `.txt` is plain text |
| With an extension from Open VSX | `toml` (`tamasfe.even-better-toml`), `vue` (`Vue.volar`), `svelte` (`svelte.svelte-vscode`), `sass` (`Syler.sass-indented`), `kt` `kts` (`fwcd.kotlin`), `scala` (`scala-lang.scala`), `graphql` `gql` (`GraphQL.vscode-graphql-syntax`), `proto` (`zxh404.vscode-proto3`), `tf` `tfvars` (`hashicorp.terraform`), `hcl` (`hashicorp.hcl`), `cmake` (`twxs.cmake`), `j2` `jinja` (`samuelcolvin.jinjahtml`), `nix` (`jnoortheen.nix-ide`), `adoc` (`asciidoctor.asciidoctor-vscode`) |
| With `files.associations` | `"*.ps1xml": "xml"`, `"*.cnf": "ini"`, `"*.reg": "ini"`, `".dockerignore": "ignore"` |

Extensions run in code-server's container with access to its whole working copy: install only
those you need, from publishers you trust.

## Recommended code-server settings

code-server's defaults suit a folder that only code-server writes to. For a synced working copy, put
these in code-server's settings (**Preferences: Open User Settings (JSON)**, or for everyone on that
code-server its machine settings, `Machine/settings.json` in its user data folder, by default
`~/.local/share/code-server`):

```jsonc
{
  // In the browser, code-server saves 1 s after each pause by default: every save is an upload,
  // a new version in Nextcloud and a chance for a conflict.
  "files.autoSave": "off",
  // With the default "auto", a new file gets the line endings of the system the browser runs on:
  // CRLF from a Windows browser, which breaks a shell script on Linux.
  "files.eol": "\n",
  // cmd.exe can miss labels (GOTO, CALL) in batch files with LF line endings.
  "[bat]": { "files.eol": "\r\n" },
  // Git's status checks rewrite .git/index again and again, and the sync client uploads every
  // change; leave Git on if the working copy holds no Git repositories.
  "git.enabled": false,
  // The sync client's database and large folders stay out of the explorer, watcher and search.
  "files.exclude": { "**/.sync_*.db*": true },
  "files.watcherExclude": { "**/.git/**": true, "**/node_modules/**": true, "**/.venv/**": true, "**/.sync_*.db*": true },
  "search.exclude": { "**/node_modules": true, "**/.venv": true }
}
```

The [hosting example](hosting.md#code-servers-settings) writes exactly these as machine settings.

Windows PowerShell 5.1 reads a script without a byte order mark in the system's code page, so its
non-ASCII characters break there; PowerShell 7 reads both. If scripts from the working copy run in
Windows PowerShell, add `"[powershell]": { "files.encoding": "utf8bom" }`, and code-server writes
new PowerShell files with a byte order mark.

**Workspace trust.** Each project opens as a folder of its own, and code-server 4.141 opens a folder
it does not trust yet in Restricted Mode, with a banner and without the extensions that need trust;
editing and saving work. To trust all projects at once, run **Workspaces: Manage Workspace Trust**
and add the working copy (`/workspace`) as a trusted folder, or, if everything in it is yours, start
code-server with `--disable-workspace-trust`.

## Troubleshooting

**No "Open in code-server" in Files.**

- Reload Files: it reads the settings when the page loads.
- Is the app enabled for the user? `occ config:app:get codeserver_layer enabled` prints `yes` or
  the groups.
- Are `url` and `workspace` usable? **Administration settings > code-server** shows what is wrong
  with them, also with values set by `occ` (such as `http://` on a host other than `localhost`).
- Does the user have a code-server folder, and does it still exist? The user's **Personal settings >
  code-server** shows it, and `occ codeserver_layer:folder <user>`.
- Is the file inside that folder, the only one selected, not in the trash and not on a public share
  page? Is its extension or name in the lists?

**code-server shows an empty editor instead of the file.** The file is not in the working copy yet:
code-server opens a path that does not exist as an unnamed editor under that name. Wait for the sync
instead of saving, and check that the working copy holds the contents of the code-server folder
directly at `workspace`.

**The wrong folder opens, or the file opens twice.**

- The working copy must hold the folder's contents directly at `workspace` (`/Projects/My App` is
  `/workspace/My App`), not the whole account or the folder itself one level down.
- `url` must be the address the browser ends up on, with the same host name and port: code-server
  takes the host of the file's address from the page's address.

**"The browser blocked the new tab for code-server."** The browser blocked the tab even after the
question; allow pop-ups for the Nextcloud site.

**A save in code-server does not reach Nextcloud.** That is the sync client's part: check that it
runs (a loop, not a single run), and that the file is not open in Nextcloud Text, whose lock keeps
the sync client from uploading it.

## Limitations

- **Only the files in the user's code-server folder,** and only in Files in the browser.
- **The app does not sync files.** Saves in code-server reach Nextcloud with the sync client's next
  run; the warning before opening covers changes in Nextcloud only for its window.
- **No editing in two places.** A file open in Nextcloud Text is locked; save it in code-server only
  after closing it in Text.
- **A new tab each time,** and code-server's address shows the file's path (in the browser's history
  and the logs of a proxy in front of code-server).
- **One code-server for everyone.** All users get the same code-server address and working-copy path
  ([One user or several](#one-user-or-several)).
- **No icons of their own.** The code formats get Nextcloud's code icon, not one per language.

## How it works

- `lib/Listener/LoadFilesScripts.php`: checks the group, the settings and the user's folder, splits
  the formats into click and menu (`lib/Service/Config.php`), and hands Files the settings and
  `js/files.mjs`.
- `src/files.ts` with `match.ts`, `launch.ts`, `names.ts`, `hints.ts` and `dialog.ts`: the Files
  entries, the address, the name check, the warnings and the dialogs.
- `lib/Service/FileTypes.php`, run by the repair steps in `lib/Migration/`, with
  `lib/Listener/AddMimeTypeAliases.php` and `src/aliases.ts`: the file types.
- `lib/Settings/`, `lib/Controller/`, `templates/`, `src/admin.ts`, `src/personal.ts`: the settings
  pages; `lib/Command/Folder.php`: `occ codeserver_layer:folder`; `lib/ConfigLexicon.php`: the keys.

Details and design decisions: [architecture.md](architecture.md).
