// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Where a file or folder of the user's opens in code-server, and the address that opens it, in the
// forms VS Code's web workbench reads (src/vs/code/browser/workbench/workbench.ts in the VS Code
// that code-server bundles):
//
//   a file in the code-server folder   <address>?folder=<working copy>/<project>&payload=[["openFile","vscode-remote://<host>/<path>"]]
//   any other file (account access)    <address>?ew=true&payload=[["openFile","vscode-remote://<host>/<path>"]]
//   a folder                           <address>?folder=<path>
//
// - folder: VS Code takes the value as a path once URLSearchParams has decoded it, without parsing
//   it again; so it is encoded once, and like VS Code's own URLs with its slashes left as they are.
// - payload: VS Code reads openFile with URI.parse, which splits at '?' and '#' and decodes %xx.
//   Each path segment is therefore encoded on its own, and then the whole JSON once more, as VS
//   Code builds payload itself.
// - folder or ew always goes along: without folder, workspace or a non-empty ew, code-server
//   redirects to the folder opened last (keeping the payload), and the file would open in that
//   folder's window. ew (empty window) opens a window without a folder, so that nothing in
//   code-server walks the folder of a file anywhere in the account.
// - <host>: code-server sets the remote authority to location.host, the host and port of the page
//   as the browser sees them, which is what new URL(address).host gives.
// No DOM here: the unit tests run it in Node.js, and the code-server tests build their URLs with it.

/** Where the user's files are in code-server. */
export interface Places {
  /**
   * The user's code-server folder: its path in the user's files ('/Projects', or '/' for all of
   * them) and its working copy in code-server ('/workspace'); null without one.
   */
  folder: { path: string; workspace: string } | null;
  /**
   * Account access: where code-server has all of the user's files ('/nextcloud'), and the folders
   * of the account it does not have there (its mount leaves them out); null without account access.
   */
  account: { workspace: string; exclude: string[] } | null;
}

/** Where a path of the user's files opens: below the code-server folder, or through account access. */
export type Target =
  | { kind: 'folder'; relative: string }
  | { kind: 'account'; path: string };

/**
 * The path of a file below the user's code-server folder ('My App/src/a.ps1'), or null when it is
 * not inside it. folder is the folder's path in the user's files ('/Projects', or '/' for all of
 * them), path the file's ('/Projects/My App/src/a.ps1').
 */
export function relativePath(folder: string, path: string): string | null {
  if (folder === '/') return path.startsWith('/') && path.length > 1 ? path.slice(1) : null;
  const prefix = `${folder.replace(/\/+$/, '')}/`;
  return path.startsWith(prefix) && path.length > prefix.length ? path.slice(prefix.length) : null;
}

/** relativePath(), and '' for the folder itself. */
function within(folder: string, path: string): string | null {
  const clean = path.replace(/\/+$/, '') || '/';
  return clean === (folder.replace(/\/+$/, '') || '/') ? '' : relativePath(folder, clean);
}

/**
 * Where path (a file or folder in the user's files, '/Photos/a.ps1') opens in code-server: below
 * the code-server folder from its working copy, which always comes first; anywhere else through
 * account access, if the user has it, but not in a folder its mount leaves out; or nowhere (null).
 * A mount that leaves a folder out may still write into it: a file there would seem missing to
 * code-server, and saving it would replace the one in Nextcloud.
 */
export function target(places: Places, path: string): Target | null {
  if (!path.startsWith('/')) return null;
  const relative = places.folder ? within(places.folder.path, path) : null;
  if (relative !== null) return { kind: 'folder', relative };
  if (!places.account || places.account.exclude.some((folder) => within(folder, path) !== null)) return null;
  return { kind: 'account', path: path.replace(/\/+$/, '') || '/' };
}

/** The project: the top folder of the file below the code-server folder, or null for a file directly in it. */
export function projectOf(relative: string): string | null {
  const slash = relative.indexOf('/');
  return slash > 0 ? relative.slice(0, slash) : null;
}

const trimmed = (path: string): string => path.replace(/\/+$/, '');

/** code-server's address without query and fragment, ending with a slash; and the host for the URI. */
function addressOf(address: string): { base: string; host: string } {
  const url = new URL(address);
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return { base: `${url.origin}${url.pathname}`, host: url.host };
}

const folderParam = (path: string): string => encodeURIComponent(path).replaceAll('%2F', '/');

function payloadParam(host: string, file: string): string {
  const uri = `vscode-remote://${host}${file.split('/').map(encodeURIComponent).join('/')}`;
  return encodeURIComponent(JSON.stringify([['openFile', uri]]));
}

/**
 * The address that opens the file at relative (below the code-server folder) in code-server, in
 * its project folder. address is code-server's as the browser opens it, workspace the working
 * copy's path in code-server's container ('/workspace').
 */
export function launchUrl(address: string, workspace: string, relative: string): string {
  const { base, host } = addressOf(address);
  const root = trimmed(workspace);
  const project = projectOf(relative);
  const folder = project === null ? root : `${root}/${project}`;
  return `${base}?folder=${folderParam(folder)}&payload=${payloadParam(host, `${root}/${relative}`)}`;
}

/**
 * The address that opens the file at path (in the user's files, '/Photos/a.ps1') on its own, in an
 * empty window, from where code-server has all of the user's files (root, '/nextcloud').
 */
export function fileUrl(address: string, root: string, path: string): string {
  const { base, host } = addressOf(address);
  return `${base}?ew=true&payload=${payloadParam(host, `${trimmed(root)}${path}`)}`;
}

/** The address that opens folder (its path in code-server's container) as code-server's folder. */
export function folderUrl(address: string, folder: string): string {
  return `${addressOf(address).base}?folder=${folderParam(trimmed(folder) || '/')}`;
}

/** The address that opens a file at a target. */
export function fileUrlFor(address: string, places: Places, at: Target): string | null {
  if (at.kind === 'folder') return places.folder && at.relative !== '' ? launchUrl(address, places.folder.workspace, at.relative) : null;
  return places.account && at.path !== '/' ? fileUrl(address, places.account.workspace, at.path) : null;
}

/** The address that opens a folder at a target as code-server's folder; not for the root of the account. */
export function folderUrlFor(address: string, places: Places, at: Target): string | null {
  if (at.kind === 'folder') {
    if (!places.folder) return null;
    const root = trimmed(places.folder.workspace);
    return folderUrl(address, at.relative === '' ? root : `${root}/${at.relative}`);
  }
  return places.account && at.path !== '/' ? folderUrl(address, `${trimmed(places.account.workspace)}${at.path}`) : null;
}

/** What VS Code makes of such an address: the folder it opens, the file, and whether the window is empty. For tests. */
export function decodeLaunchUrl(url: string): { folder: string | null; file: string | null; authority: string | null; emptyWindow: boolean } {
  const query = new URL(url).searchParams;
  const folder = query.get('folder');
  let file: string | null = null;
  let authority: string | null = null;
  try {
    const payload = JSON.parse(query.get('payload') ?? '[]') as [string, string][];
    const openFile = new Map(payload).get('openFile');
    if (openFile) {
      // URI.parse: scheme://authority/path?query#fragment, then %xx decoded in the path.
      const match = /^([^:/?#]+?):\/\/([^/?#]*)([^?#]*)/.exec(openFile);
      if (match) {
        authority = match[2];
        file = decodeURIComponent(match[3]);
      }
    }
  } catch {
    // not JSON: VS Code ignores the payload too
  }
  return { folder, file, authority, emptyWindow: query.has('ew') };
}
