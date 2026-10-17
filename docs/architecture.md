<!--
  - SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Architecture

## Goal and constraints

Open the text and code files and the folders a user keeps in Nextcloud in code-server, which has
them from a working copy that a sync keeps in step with Nextcloud, or from a mount of the whole
account.

- Nothing goes through the browser but an address: code-server reads and writes its files, the sync
  or the mount carries the changes. The app never reads or writes a file's content.
- code-server, the sync and the mount stay unmodified, and are not part of the app.
- The sync and the mount take their time, and Nextcloud refuses a save to a locked or read-only
  file. The app warns where it can see it coming, and never creates a file in Nextcloud that
  code-server is about to write.

## Components

| Component | Files | Runs in | What it does |
|---|---|---|---|
| Files entries | `lib/Listener/LoadFilesScripts.php`, `src/files.ts`, `src/match.ts`, `src/launch.ts` | Files, for a logged-in user the app is enabled for | "Open in code-server" for files and folders, the click, where a path opens, the address |
| "+ New" | `src/files.ts`, `src/names.ts`, `src/dialog.ts` | Files | the entries, the name dialog, the address of the new file |
| Warnings | `src/hints.ts`, `src/dialog.ts` | Files | a `PROPFIND` before opening, the dialog |
| File types | `lib/Service/FileTypes.php`, `lib/Migration/`, `lib/Listener/AddMimeTypeAliases.php`, `src/aliases.ts` | repair steps; every page | MIME types and aliases in Nextcloud's `config/` |
| Settings | `lib/Service/Config.php`, `lib/Service/UserFolder.php`, `lib/Service/AccountAccess.php`, `lib/Settings/`, `lib/Controller/`, `lib/Command/`, `templates/`, `src/admin.ts`, `src/personal.ts` | settings pages, `occ` | the address, the working copy, the place of the account, the formats, each user's folder and account access |

## Where a path opens

`target()` in `src/launch.ts` decides, for a path in the user's files (a file, a folder, or a new
file's folder):

1. **Below the user's code-server folder, or the folder itself:** from the working copy, with the
   code-server folder's settings (`default_app`, `sync_hint_seconds`). This always comes first.
2. **Otherwise, with account access** (`account_workspace` set and the user's `account` on), and
   unless the path is in a folder of `account_exclude`: from the place of the whole account, with
   account access's settings (`account_default_app`, `account_sync_hint_seconds`).
3. **Otherwise nowhere:** no entry.

## The addresses

```text
a file in the code-server folder   <address>?folder=<working copy>/<project>&payload=[["openFile","vscode-remote://<host>/<working copy>/<path>"]]
any other file (account access)    <address>?ew=true&payload=[["openFile","vscode-remote://<host>/<account>/<path>"]]
a folder                           <address>?folder=<working copy or account>/<path>
```

These are the forms VS Code's web workbench reads (`src/vs/code/browser/workbench/workbench.ts` in
the VS Code code-server bundles); VS Code opens a file in a new window of its own the same way, with
`ew=true` and `openFile`:

- **`folder`**: when the workbench has a remote authority and the value starts with `/`, it takes
  the value as a path (`URI.from({ path })`) once `URLSearchParams` has decoded it. The app encodes
  it once with `encodeURIComponent` and leaves its slashes, as VS Code's own URLs do.
- **`ew`** (empty window): a window without a folder. The workbench reads the query in order and the
  last of `folder`, `workspace` and `ew` wins, so the app never sends two of them.
- **`payload`**: JSON, read into a map; `openFile` goes through `URI.parse`, which splits at `?`
  and `#` and decodes `%xx`. The app encodes each path segment on its own, then the whole JSON once
  more with `encodeURIComponent`, as VS Code builds `payload` itself. So `#`, `%`, `?`, `+` and `&`
  in names reach code-server unchanged. One file per address.
- **`<host>`**: code-server sets the remote authority to `location.host` (its `base-path.diff`
  patch), the host and port of the page as the browser sees them. The app takes
  `new URL(address).host`.
- **`folder` or `ew` always goes along**: without `folder`, `workspace` or a non-empty `ew`,
  code-server redirects to the folder opened last (keeping the payload), and the file would open in
  that folder's window.
- **`<project>`** is the top folder below the user's folder. A file directly in the user's folder
  opens with the working copy itself as the folder.

Example: folder `/Projects`, working copy `/workspace`, address `https://code.example.com/`, file
`/Projects/My App/src/a #1 %.ps1`:

```text
https://code.example.com/?folder=/workspace/My%20App&payload=%5B%5B%22openFile%22%2C%22vscode-remote%3A%2F%2Fcode.example.com%2Fworkspace%2FMy%2520App%2Fsrc%2Fa%2520%25231%2520%2525.ps1%22%5D%5D
```

And through account access, the account at `/nextcloud/files`, file `/Photos/2024/rename #1 %.ps1`:

```text
https://code.example.com/?ew=true&payload=%5B%5B%22openFile%22%2C%22vscode-remote%3A%2F%2Fcode.example.com%2Fnextcloud%2Ffiles%2FPhotos%2F2024%2Frename%2520%25231%2520%2525.ps1%22%5D%5D
```

A path that does not exist yet opens as an unnamed editor under that name (VS Code's
`pathsToEditors`, `forceUntitled`), also in a window without a folder, and a save writes it without
asking for a place, creating missing folders; should the file appear meanwhile, VS Code asks before
replacing it. "+ New" relies on this.

## Opening a file

1. Files loads; the listener checks the group and the address, the user's folder (its file id,
   resolved to its current path) and account access, and hands the settings to `js/files.mjs`, an
   init script. For each place it splits the formats: a click for those no other app opens, the
   menu for the others, unless code-server is the default app there. "Another app" means a type
   Nextcloud Text opens (a copy of Text's list, `Config::TEXT_TYPES`), an image, video, audio or PDF
   type, or an office type.
2. `files.ts` registers file actions with `@nextcloud/files`: a default action at order −20, before
   the Viewer's (through which Text opens), for the click formats of the file's place, and a menu
   entry (order 10) for the others. As a default app it adds a third entry (order −19) that puts an
   app back in the menu whose hidden default action (such as ONLYOFFICE's) code-server took the
   click from. For folders, a menu entry (order 24) and a file list action, the button next to the
   path for the folder shown. Files keeps its actions in a registry per major of
   `@nextcloud/files` (`window._nc_files_scope.v4_0`), which the bundled copy shares with Files.
3. On a click or the menu entry, the action does nothing while the Viewer shows a file (the Viewer
   writes `openfile=true` into Files' address, and Files then runs the default action, which may be
   this app's), and takes `openfile` out of the address.
4. It notes whether the user's click or key press started it, asks Nextcloud about the file
   (`PROPFIND`: permissions, modification and upload time, lock and its owner), and opens a new
   tab with `window.open(url, '_blank')`, its opener cleared. With a warning, without a click of
   the user, or when the browser blocks the tab, it asks first; the dialog's button is a click.

## Design decisions

| Decision | Why |
|---|---|
| A new tab, not a frame | code-server needs its keyboard shortcuts, the clipboard and its own origin; a frame would also need code-server to allow Nextcloud as its parent. |
| Only an address goes to code-server | code-server has the file in its working copy or its mount; nothing of Nextcloud's session or files leaves Nextcloud. |
| Account access opens a file in a window without a folder | A folder as the workspace would have code-server's file search, watchers and extensions walk it over the network. The folder entries open a folder only when asked, and never the whole account. |
| The code-server folder comes first | Its files have a working copy of their own; through a mount they would open a second way. |
| `account_exclude` | A mount that hides a folder (rclone's `--exclude`) may still write into it: a file there seems missing to code-server, which opens it as an unnamed editor, and Ctrl+S would replace the file in Nextcloud. |
| Account access per user, off by default | The place of the account holds one account's files; for anyone else a click would open someone else's file. An administrator's account in the app's group (to save the settings) usually has no mount. |
| Read only from `W` in `oc:permissions`, not Files' permissions | Files' `Permission.UPDATE` is renaming and moving, which a received share's mount point allows even when it is read only; the share views build their nodes from share permissions without `WRITE`. `W` is what Nextcloud's own save checks, the same in every view. |
| A default app setting and a warning window for each place | Account access reaches notes and team folders that Text should keep; a mount keeps a folder's listing for its own time. |
| `window.open` without `noopener`, then `opener = null` | With `noopener` `window.open` returns `null` in any case, and a blocked tab could not be told from an opened one. |
| The folder kept as a file id per user | It follows renames and moves; an administrator cannot pick another user's folder in the browser, so users choose their own, and `occ` sets it for them. |
| "+ New" through `addNewFileMenuEntry`, not Nextcloud's template API | The template API creates the file in Nextcloud at once; the sync would bring the empty file to the working copy while code-server may already be writing it, and make a conflict copy. |
| A name dialog of its own, with `<dialog>` | `addNewFileMenuEntry` asks for no name, Files' own dialog is internal, and `@nextcloud/vue` would bundle Vue into a script every Files page loads. |
| Names checked for Windows and in any letter case | The folder syncs to desktop clients; `getUniqueName` of `@nextcloud/files` compares names exactly. |
| A `PROPFIND` before opening, not the list's data | Files' list may be minutes old, and `nc:upload_time` is not among the properties Files 34 asks for. The server's `Date` header gives the time. |
| Entries only for nodes whose root is `/files/<user>` | The Tags view shows tags as folders, and the team folders view its folders, with paths that are no paths in the account. |
| No address over 8000 characters | A proxy's default limit for a request line (nginx: 8 KB); the payload costs five characters for each byte of a name that is not ASCII. |
| MIME types only where nothing else defines one, aliases straight to `text/code` | Others' entries stay theirs. The icon provider behind `/core/mimeicon` resolves aliases in one pass in the list's order, and entries from `config/` come last. |
| No icon provider of its own | Nextcloud has one provider; the Craft Suite Layer replaces it already, and two apps doing so would push each other out. |
| The Craft Suite Layer's lock taken too | Both apps read and rewrite the same two files in `config/`. |

## What it relies on upstream

| Relies on | Used for | If it changes |
|---|---|---|
| VS Code: `?folder=<path>`, `?ew=true` and `payload=[["openFile","<URI>"]]` | opening | The folder or the file does not open. The tests in code-server fail, and the daily canary against the newest release. |
| code-server: remote authority = `location.host` | `<host>` | The file does not open, or opens twice; tests as above. |
| code-server: the redirect to the last folder only without `folder`, `workspace` or `ew` | `folder` or `ew` always goes along | nothing while one of them goes along |
| VS Code: a missing file opens as an unnamed editor with its path; Save writes it without a dialog | "+ New" | The new file does not open, or asks where to save; tests as above. |
| VS Code: a window without a folder takes the workspace trust of its file | account access without Restricted Mode below a trusted folder | Files open in Restricted Mode; the trust test in code-server fails. |
| The registry of `@nextcloud/files` 4.x | the Files entries, "+ New", the button next to the path | The entries are missing. The canary's `nextcloud-next` job warns when Nextcloud's development branch asks for another major. |
| Files: the first default action by order; the Viewer's has none and writes `openfile=true`; default actions are in the menu too | the click, the Viewer guard, Text as View | Text opens instead, or View also opens code-server; the end-to-end tests fail, and the daily canary against the newest patch release of each supported Nextcloud major. |
| Files: file list actions next to the path, called with the folder shown | the button for the folder shown | The button is missing; the end-to-end tests fail. |
| Nextcloud Text's list of types (`src/helpers/mime.js`), copied to `Config::TEXT_TYPES` | what goes to the menu without the default app | A format is on the wrong side; the canary compares the copy with Text's development branch. |
| WebDAV `oc:permissions` with `W` for a file whose content may be changed, `D` for one that may be deleted, `C` for a folder that takes new files | the read-only warnings | No read-only warning, or one too many; the end-to-end tests fail. |
| files_lock's WebDAV properties (`nc:lock`, `nc:lock-owner-type`, `nc:lock-owner`, `nc:lock-owner-editor`); Text locks as the app `text`; a user's lock binds only other accounts | the lock warning | No lock warning, or one for the user's own lock; opening still works. |
| `nc:upload_time` | the warning about a recent change | Only the modification time counts. |
| `OC.dialogs.filepicker` (deprecated since Nextcloud 27.1) | choosing the folder | Only the path field is left. |
| `config/mimetypemapping.json`, `mimetypealiases.json`; the icon provider resolving aliases in one pass | the code icon | Files shows the plain file icon again; the end-to-end tests fail. |
| The Craft Suite Layer's lock name `craftsuite_layer/mimetype-config`, and its entries in the same files | writing next to it | Only the rare case of both apps writing at the same moment is unprotected; the canary runs the tests next to its newest release. |

## Versions

| What | Where | Current |
|---|---|---|
| Nextcloud app | `<version>` in `codeserver_layer/appinfo/info.xml` | 0.2.0, Nextcloud 34 and 35 |
| Release | the tag `v<version>` | v0.2.0 |
| Tested code-server | `tests/e2e/versions.json` | 4.141.0 |
| Tested Nextcloud releases | `tests/e2e/versions.json` (`nextcloud.tested`) | 34.0.5, 35.0.2 |
| Tested Craft Suite Layer, next to the app | `tests/e2e/versions.json` | 0.5.1 |
| rclone in the hosting example's mount | `hosting/compose.account.yaml` | 1.75.2 |
