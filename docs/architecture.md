<!--
  - SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Architecture

## Goal and constraints

Open the text and code files a user keeps in Nextcloud in code-server, which works on a copy of
them that a sync keeps in step with Nextcloud.

- Nothing goes through the browser but an address: code-server reads and writes its working copy,
  the sync carries the changes. The app never reads or writes a file's content.
- code-server and the sync stay unmodified, and are not part of the app.
- The sync takes its time, and a file locked in Nextcloud cannot be synced. The app warns where it
  can see it coming, and never creates a file in Nextcloud that code-server is about to write.

## Components

| Component | Files | Runs in | What it does |
|---|---|---|---|
| Files entries | `lib/Listener/LoadFilesScripts.php`, `src/files.ts`, `src/match.ts`, `src/launch.ts` | Files, for a logged-in user the app is enabled for | "Open in code-server", the click, the address |
| "+ New" | `src/files.ts`, `src/names.ts`, `src/dialog.ts` | Files | the entries, the name dialog, the address of the new file |
| Warnings | `src/hints.ts`, `src/dialog.ts` | Files | a `PROPFIND` before opening, the dialog |
| File types | `lib/Service/FileTypes.php`, `lib/Migration/`, `lib/Listener/AddMimeTypeAliases.php`, `src/aliases.ts` | repair steps; every page | MIME types and aliases in Nextcloud's `config/` |
| Settings | `lib/Service/Config.php`, `lib/Service/UserFolder.php`, `lib/Settings/`, `lib/Controller/`, `lib/Command/Folder.php`, `templates/`, `src/admin.ts`, `src/personal.ts` | settings pages, `occ` | the address, the working copy, the formats, each user's folder |

## The address

```text
<address>?folder=<working copy>/<project>&payload=[["openFile","vscode-remote://<host>/<working copy>/<path>"]]
```

This is the form VS Code's web workbench reads (`src/vs/code/browser/workbench/workbench.ts` in
the VS Code code-server bundles):

- **`folder`**: when the workbench has a remote authority and the value starts with `/`, it takes
  the value as a path (`URI.from({ path })`) once `URLSearchParams` has decoded it. The app encodes
  it once with `encodeURIComponent` and leaves its slashes, as VS Code's own URLs do.
- **`payload`**: JSON, read into a map; `openFile` goes through `URI.parse`, which splits at `?`
  and `#` and decodes `%xx`. The app encodes each path segment on its own, then the whole JSON once
  more with `encodeURIComponent`, as VS Code builds `payload` itself. So `#`, `%`, `?`, `+` and `&`
  in names reach code-server unchanged.
- **`<host>`**: code-server sets the remote authority to `location.host` (its `base-path.diff`
  patch), the host and port of the page as the browser sees them. The app takes
  `new URL(address).host`.
- **`folder` always goes along**: without `folder` or `workspace`, code-server redirects to the
  folder opened last and drops the payload.
- **`<project>`** is the top folder below the user's folder. A file directly in the user's folder
  opens with the working copy itself as the folder.

Example: folder `/Projects`, working copy `/workspace`, address `https://code.example.com/`, file
`/Projects/My App/src/a #1 %.ps1`:

```text
https://code.example.com/?folder=/workspace/My%20App&payload=%5B%5B%22openFile%22%2C%22vscode-remote%3A%2F%2Fcode.example.com%2Fworkspace%2FMy%2520App%2Fsrc%2Fa%2520%25231%2520%2525.ps1%22%5D%5D
```

A path that does not exist yet opens as an unnamed editor under that name (VS Code's
`pathsToEditors`, `forceUntitled`), and a save writes it without asking for a place, creating
missing folders; should the file appear meanwhile, VS Code asks before replacing it. "+ New" relies
on this.

## Opening a file

1. Files loads; the listener checks the group, the address and working copy, and the user's folder
   (its file id, resolved to its current path), and hands the settings to `js/files.mjs`, an init
   script. It splits the formats: a click for those no other app opens, the menu for the others,
   unless code-server is the default app. "Another app" means a type Nextcloud Text opens (a copy
   of Text's list, `Config::TEXT_TYPES`), an image, video, audio or PDF type, or an office type.
2. `files.ts` registers two file actions with `@nextcloud/files`: a default action at order −20,
   before the Viewer's (through which Text opens), for the click formats, and a menu entry (order
   10) for the others. As the default app it adds a third entry (order −19) that puts an app back in
   the menu whose hidden default action (such as ONLYOFFICE's) code-server took the click from.
   Files keeps its actions in a registry per major of `@nextcloud/files`
   (`window._nc_files_scope.v4_0`), which the bundled copy shares with Files.
3. On a click or the menu entry, the action does nothing while the Viewer shows a file (the Viewer
   writes `openfile=true` into Files' address, and Files then runs the default action, which may be
   this app's), and takes `openfile` out of the address.
4. It notes whether the user's click or key press started it, asks Nextcloud about the file
   (`PROPFIND`: modification and upload time, lock), and opens a new tab with
   `window.open(url, '_blank')`, its opener cleared. With a warning, without a click of the user,
   or when the browser blocks the tab, it asks first; the dialog's button is a click.

## Design decisions

| Decision | Why |
|---|---|
| A new tab, not a frame | code-server needs its keyboard shortcuts, the clipboard and its own origin; a frame would also need code-server to allow Nextcloud as its parent. |
| Only an address goes to code-server | code-server has the file in its working copy; nothing of Nextcloud's session or files leaves Nextcloud. |
| `window.open` without `noopener`, then `opener = null` | With `noopener` `window.open` returns `null` in any case, and a blocked tab could not be told from an opened one. |
| The folder kept as a file id per user | It follows renames and moves; an administrator cannot pick another user's folder in the browser, so users choose their own, and `occ` sets it for them. |
| "+ New" through `addNewFileMenuEntry`, not Nextcloud's template API | The template API creates the file in Nextcloud at once; the sync would bring the empty file to the working copy while code-server may already be writing it, and make a conflict copy. |
| A name dialog of its own, with `<dialog>` | `addNewFileMenuEntry` asks for no name, Files' own dialog is internal, and `@nextcloud/vue` would bundle Vue into a script every Files page loads. |
| Names checked for Windows and in any letter case | The folder syncs to desktop clients; `getUniqueName` of `@nextcloud/files` compares names exactly. |
| A `PROPFIND` before opening, not the list's data | Files' list may be minutes old, and `nc:upload_time` is not among the properties Files 34 asks for. The server's `Date` header gives the time. |
| MIME types only where nothing else defines one, aliases straight to `text/code` | Others' entries stay theirs. The icon provider behind `/core/mimeicon` resolves aliases in one pass in the list's order, and entries from `config/` come last. |
| No icon provider of its own | Nextcloud has one provider; the Craft Suite Layer replaces it already, and two apps doing so would push each other out. |
| The Craft Suite Layer's lock taken too | Both apps read and rewrite the same two files in `config/`. |

## What it relies on upstream

| Relies on | Used for | If it changes |
|---|---|---|
| VS Code: `?folder=<path>` and `payload=[["openFile","<URI>"]]` | opening | The folder or the file does not open. The tests in code-server fail, and the daily canary against the newest release. |
| code-server: remote authority = `location.host` | `<host>` | The file does not open, or opens twice; tests as above. |
| code-server: the redirect to the last folder only without `folder` | `folder` always goes along | nothing while `folder` goes along |
| VS Code: a missing file opens as an unnamed editor with its path; Save writes it without a dialog | "+ New" | The new file does not open, or asks where to save; tests as above. |
| The registry of `@nextcloud/files` 4.x | the Files entries, "+ New" | The entries are missing. The canary's `nextcloud-next` job warns when Nextcloud's development branch asks for another major. |
| Files: the first default action by order; the Viewer's has none and writes `openfile=true`; default actions are in the menu too | the click, the Viewer guard, Text as View | Text opens instead, or View also opens code-server; the end-to-end tests fail, and the daily canary against the newest patch release of each supported Nextcloud major. |
| Nextcloud Text's list of types (`src/helpers/mime.js`), copied to `Config::TEXT_TYPES` | what goes to the menu without the default app | A format is on the wrong side; the canary compares the copy with Text's development branch. |
| files_lock's WebDAV properties (`nc:lock`, `nc:lock-owner-type`, `nc:lock-owner-editor`); Text locks as the app `text` | the lock warning | No lock warning; opening still works. |
| `nc:upload_time` | the sync warning | Only the modification time counts. |
| `OC.dialogs.filepicker` (deprecated since Nextcloud 27.1) | choosing the folder | Only the path field is left. |
| `config/mimetypemapping.json`, `mimetypealiases.json`; the icon provider resolving aliases in one pass | the code icon | Files shows the plain file icon again; the end-to-end tests fail. |
| The Craft Suite Layer's lock name `craftsuite_layer/mimetype-config`, and its entries in the same files | writing next to it | Only the rare case of both apps writing at the same moment is unprotected; the canary runs the tests next to its newest release. |

## Versions

| What | Where | Current |
|---|---|---|
| Nextcloud app | `<version>` in `codeserver_layer/appinfo/info.xml` | 0.1.0, Nextcloud 34 and 35 |
| Release | the tag `v<version>` | v0.1.0 |
| Tested code-server | `tests/e2e/versions.json` | 4.141.0 |
| Tested Nextcloud releases | `tests/e2e/versions.json` (`nextcloud.tested`) | 34.0.4, 35.0.1 |
| Tested Craft Suite Layer, next to the app | `tests/e2e/versions.json` | 0.4.2 |
