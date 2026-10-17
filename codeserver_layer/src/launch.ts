// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The address that opens a file in code-server, in the form VS Code's web workbench reads
// (src/vs/code/browser/workbench/workbench.ts in the VS Code that code-server bundles):
//
//   <address>?folder=<working copy>/<project>&payload=[["openFile","vscode-remote://<host>/<path>"]]
//
// - folder: VS Code takes the value as a path once URLSearchParams has decoded it, without parsing
//   it again; so it is encoded once, and like VS Code's own URLs with its slashes left as they are.
// - payload: VS Code reads openFile with URI.parse, which splits at '?' and '#' and decodes %xx.
//   Each path segment is therefore encoded on its own, and then the whole JSON once more, as VS
//   Code builds payload itself.
// - <host>: code-server sets the remote authority to location.host, the host and port of the page
//   as the browser sees them, which is what new URL(address).host gives.
// - folder always goes along: without it, code-server redirects to the folder opened last and drops
//   the payload.
// No DOM here: the unit tests run it in Node.js, and the code-server tests build their URLs with it.

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

/** The project: the top folder of the file below the code-server folder, or null for a file directly in it. */
export function projectOf(relative: string): string | null {
  const slash = relative.indexOf('/');
  return slash > 0 ? relative.slice(0, slash) : null;
}

/**
 * The address that opens the file at relative (below the code-server folder) in code-server.
 * address is code-server's as the browser opens it, workspace the working copy's path in
 * code-server's container ('/workspace').
 */
export function launchUrl(address: string, workspace: string, relative: string): string {
  const base = new URL(address);
  base.search = '';
  base.hash = '';
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const root = workspace.replace(/\/+$/, '');
  const project = projectOf(relative);
  const folder = project === null ? root : `${root}/${project}`;
  const file = `${root}/${relative}`;
  const uri = `vscode-remote://${base.host}${file.split('/').map(encodeURIComponent).join('/')}`;
  const folderParam = encodeURIComponent(folder).replaceAll('%2F', '/');
  const payload = encodeURIComponent(JSON.stringify([['openFile', uri]]));
  return `${base.origin}${base.pathname}?folder=${folderParam}&payload=${payload}`;
}

/** What VS Code makes of such an address: the folder it opens and the path of the file. For tests. */
export function decodeLaunchUrl(url: string): { folder: string | null; file: string | null; authority: string | null } {
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
  return { folder, file, authority };
}
