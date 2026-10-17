// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// "Open in code-server" for files and folders and the "+ New" entries in Files, for the files in
// the user's code-server folder and, with account access, anywhere else in the user's files
// (lib/Listener/LoadFilesScripts.php provides the settings; launch.ts decides where a path opens).
// Files keeps its actions and "+ New" entries in a registry shared by every copy of
// @nextcloud/files 4.x on the page, so the bundled copy registers into the one Files reads.
//
// Like the Craft Suite Layer: an extension no other app opens on a click opens in code-server on a
// click (the action is the default one, order -20, before the Viewer's); one that Nextcloud Text or
// another app opens has the entry in the file's menu, unless the administrator made code-server the
// default app for that place (lib/Service/Config.php, clickAndMenu()). A folder opens in
// code-server only from its menu.

import {
  addNewFileMenuEntry, DefaultType, FileType, getFileActions, Permission, registerFileAction, registerFileListAction, validateFilename,
  type ActionContext, type ActionContextSingle, type IFileAction, type IFolder, type INode,
} from '@nextcloud/files';
import FileCodeSvg from '@mdi/svg/svg/file-code-outline.svg';
import FileDocumentSvg from '@mdi/svg/svg/file-document-outline.svg';
import FolderOpenSvg from '@mdi/svg/svg/folder-open-outline.svg';
import { confirmDialog, nameDialog, toast } from './dialog.ts';
import { decide, decideFolder, PROPFIND_BODY, readDav, type DavInfo, type Hint } from './hints.ts';
import { fileUrlFor, folderUrlFor, target, type Places, type Target } from './launch.ts';
import { kindOf, type Kind } from './match.ts';
import { freeName, newName, type NameProblem } from './names.ts';
import { t } from './l10n.ts';

interface NewEntry { id: string; extension: string; name: string }
/** How files open at one place: the code-server folder, or account access. */
interface Side {
  /** Extensions a click opens in code-server there, and those only the file's menu opens. */
  click: string[];
  menu: string[];
  defaultApp: boolean;
  syncHintSeconds: number;
}
interface State {
  url: string;
  filenames: string[];
  newEntries: NewEntry[];
  folder: (Side & { path: string; workspace: string }) | null;
  account: (Side & { workspace: string; exclude: string[] }) | null;
}

const PREFIX = 'codeserver_layer-';
// Files runs the first default action by this order (lowest first): before the Viewer's (no
// order), through which Nextcloud Text opens, and after Files' own open-in-files (-1000), which in
// Recent and Search first goes to the file's folder. The same as the Craft Suite Layer's.
const CLICK_ORDER = -20;
const MENU_ORDER = 10;
// A folder's entry: next to Files' own "Open locally" (25), before Download (30).
const FOLDER_ORDER = 24;
// How long the check before opening may take; then the file opens without it.
const CHECK_TIMEOUT = 2000;
// The longest address the app opens: a proxy's default limit for a request line (nginx: 8 KB). The
// payload costs five characters for each byte of a name that is not ASCII.
const MAX_URL = 8000;
// One explanation for each place, as a lock ends differently there.
const INTRO_KEY = { folder: 'codeserver_layer:intro-seen', account: 'codeserver_layer:intro-seen-account' } as const;

// Nextcloud's own primary colour, as Files' "New folder" entry has it.
const coloured = (svg: string) => svg.replace(/viewBox/i, 'style="color: var(--color-primary-element)" viewBox');
const ICON = FileCodeSvg;

function readState(): State | null {
  const input = document.querySelector<HTMLInputElement>('#initial-state-codeserver_layer-files');
  if (!input) return null;
  try {
    const state = JSON.parse(atob(input.value)) as State;
    return state && typeof state.url === 'string' && (state.folder || state.account) ? state : null;
  } catch {
    return null;
  }
}

const placesOf = (state: State): Places => ({
  folder: state.folder && { path: state.folder.path, workspace: state.folder.workspace },
  account: state.account && { workspace: state.account.workspace, exclude: state.account.exclude ?? [] },
});

const sideOf = (state: State, at: Target): Side | null => (at.kind === 'folder' ? state.folder : state.account);

// How the file opens in code-server where it is, or null when it does not.
function kindHere(state: State, places: Places, node: INode): Kind | null {
  const at = target(places, node.path);
  const side = at && sideOf(state, at);
  if (!at || !side || fileUrlFor(state.url, places, at) === null) return null;
  return kindOf({ click: side.click, menu: side.menu, filenames: state.filenames }, node.basename);
}

// Whether a node is one of the user's files, whose path is its path in the account: not in the trash
// bin, nor a tag of the Tags view or a team folder of its view, which Files also shows as folders.
// As Files' own actions tell them (root /files/<user>).
const ownFile = (node: INode | IFolder): boolean => node.root?.startsWith('/files/') === true;

// The one node of the context, of this type, readable, one of the user's files.
function single(context: ActionContext, type: (typeof FileType)[keyof typeof FileType]): INode | null {
  const node = context.nodes[0];
  return context.view.id !== 'trashbin' && context.nodes.length === 1 && node.type === type
    && node.isDavResource && ownFile(node) && (node.permissions & Permission.READ) !== 0 ? node : null;
}

// Whether Nextcloud's Viewer shows a file. The Viewer writes ?openfile=true into Files' address
// when it opens a file, and Files then runs the default action, which for these files may be this
// app's: View (Nextcloud Text) must not open code-server as well.
function viewerOpen(): boolean {
  return Boolean((window as unknown as { OCA?: { Viewer?: { file?: string } } }).OCA?.Viewer?.file);
}

interface FilesRouter {
  params: Record<string, string>;
  query: Record<string, unknown>;
  goToRoute(name: string | null, params: Record<string, string>, query: Record<string, unknown>, replace: boolean): void;
}

// Files leaves ?openfile=true in its address once it opened a file by itself (a link to the file),
// so Back would run the action again. Take it out of the current history entry first.
function forgetOpenfile(): void {
  try {
    const router = (window as unknown as { OCP?: { Files?: { Router?: FilesRouter } } }).OCP?.Files?.Router;
    if (!router?.query || !('openfile' in router.query)) return;
    const query = { ...router.query };
    delete query.openfile;
    router.goToRoute(null, router.params, query, true);
  } catch {
    // Back opens the file once more
  }
}

// Whether the page may open a window now: within a click or key press of the user. Without one
// (Files opening a /f/<id> link by itself) a dialog asks first, whose button is a click.
function mayOpen(): boolean {
  return navigator.userActivation ? navigator.userActivation.isActive : true;
}

// A new tab for code-server, without a handle on this page. Not 'noopener': with it window.open
// returns null in any case, and a blocked tab could not be told from an opened one.
function openTab(url: string): boolean {
  const tab = window.open(url, '_blank');
  if (!tab) return false;
  try {
    tab.opener = null;
  } catch {
    // another origin already: no handle either way
  }
  return true;
}

const BLOCKED = (): string => t('codeserver_layer', 'The browser blocked the new tab for code-server. Allow pop-ups for this site and try again.');
const TOO_LONG = (): string => t('codeserver_layer', 'The path is too long for an address of code-server.');

async function askThenOpen(name: string, url: string, lines: string[]): Promise<void> {
  let opened = true;
  await confirmDialog(t('codeserver_layer', 'Open {file} in code-server?', { file: name }), lines,
    t('codeserver_layer', 'Open in code-server'), t('codeserver_layer', 'Cancel'), () => {
      opened = openTab(url);
    });
  if (!opened) toast(BLOCKED());
}

// A refused save ends differently at each place. In the working copy, it stays there, and the
// sync uploads it once the lock ends; if the file changed meanwhile, it becomes a conflicted copy
// there instead. The mount retries the upload and then replaces the file, leaving the changes made
// meanwhile only in its versions. After a refused upload it also deletes the file, which goes
// through where the user may delete it but not change it: a file shared on its own then leaves the
// share, and the next upload makes it the user's own. A lock of the user's own as a user binds only
// other accounts: the mount is the user's, the working copy's sync may be another's (one working
// copy for a team).
function hintText(hint: Hint, place: Target['kind']): string | null {
  const account = place === 'account';
  switch (hint.kind) {
    case 'readonly':
      return account && hint.deletable
        ? t('codeserver_layer', 'You can only read this file. Do not save it in code-server: the mount would then delete it in Nextcloud (it goes to the trash bin, or you leave its share) and save your version as a new file where it may.')
        : t('codeserver_layer', 'You can only read this file: Nextcloud refuses the changes you save in code-server.');
    case 'nocreate':
      return t('codeserver_layer', 'You cannot add files to this folder: Nextcloud refuses the new files you save there in code-server, and the changes to files you can only read.');
    case 'text':
      return account
        ? t('codeserver_layer', 'The file is open in Nextcloud Text, which locks it. Close it there before you save it in code-server: a save made while it is locked reaches Nextcloud once the lock ends, and then replaces the changes made in Text.')
        : t('codeserver_layer', 'The file is open in Nextcloud Text, which locks it. Close it there before you save it in code-server: while it is locked, Nextcloud refuses what you save.');
    case 'lock':
      if (hint.own) {
        return account ? null : t('codeserver_layer', 'You locked this file yourself: what you save in code-server reaches Nextcloud only if code-server\'s sync signs in as you.');
      }
      if (account) {
        return hint.owner
          ? t('codeserver_layer', 'The file is locked by {owner}. A save in code-server reaches Nextcloud once the lock ends, and then replaces the changes made meanwhile.', { owner: hint.owner })
          : t('codeserver_layer', 'The file is locked. A save in code-server reaches Nextcloud once the lock ends, and then replaces the changes made meanwhile.');
      }
      return hint.owner
        ? t('codeserver_layer', 'The file is locked by {owner}. While it is locked, Nextcloud refuses what you save in code-server.', { owner: hint.owner })
        : t('codeserver_layer', 'The file is locked. While it is locked, Nextcloud refuses what you save in code-server.');
    case 'sync':
      return t('codeserver_layer', 'The file changed {seconds} s ago. If that was in Nextcloud or on another device, code-server may not have the change yet.', { seconds: hint.seconds });
  }
}

const INTRO = (place: Target['kind']): string => (place === 'account'
  ? t('codeserver_layer', 'Do not edit a file in Nextcloud Text and in code-server at the same time. Text locks a file while it is open there; a save in code-server meanwhile reaches Nextcloud once the lock ends, and then replaces the changes made in Text.')
  : t('codeserver_layer', 'Do not edit a file in Nextcloud Text and in code-server at the same time. Text locks a file while it is open there, and Nextcloud refuses what you save in code-server meanwhile.'));

function introSeen(place: Target['kind']): boolean {
  try {
    return window.localStorage.getItem(INTRO_KEY[place]) === '1';
  } catch {
    return true; // no storage: do not ask every time
  }
}

function noteIntroSeen(place: Target['kind']): void {
  try {
    window.localStorage.setItem(INTRO_KEY[place], '1');
  } catch {
    // shown again next time
  }
}

// What the server says about the file or folder now: the list in Files may be minutes old. Null
// when the answer does not come in time.
async function check(node: INode): Promise<DavInfo | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT);
  try {
    const res = await fetch(node.encodedSource, {
      method: 'PROPFIND',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8', requesttoken: document.head.dataset.requesttoken ?? '' },
      body: PROPFIND_BODY,
    });
    if (res.status !== 207) return null;
    return readDav(await res.text(), res.headers.get('Date'));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function open(state: State, places: Places, node: INode): Promise<void> {
  const at = target(places, node.path);
  const side = at && sideOf(state, at);
  const url = at && fileUrlFor(state.url, places, at);
  if (!at || !side || !url) return;
  if (url.length > MAX_URL) {
    toast(TOO_LONG());
    return;
  }
  // Whether a click or key press of the user started this, taken before anything is awaited:
  // Files also runs the action by itself, for a /f/<id> link.
  const activated = mayOpen();
  // Not Files' own permissions for "read only": they depend on the view (Files counts renaming a
  // share's mount point as an update, and the share views have no WRITE), the PROPFIND's do not.
  const info = await check(node);
  const checked = info && decide(info, side.syncHintSeconds, Date.now(), document.head.dataset.user ?? null);
  const lines = (checked ?? []).map((hint) => hintText(hint, at.kind)).filter((line): line is string => line !== null);
  if (!introSeen(at.kind)) {
    lines.push(INTRO(at.kind));
    noteIntroSeen(at.kind);
  }
  if (lines.length > 0 || !activated || !mayOpen()) {
    await askThenOpen(node.basename, url, lines);
    return;
  }
  if (!openTab(url)) {
    await askThenOpen(node.basename, url, []);
    return;
  }
  if (checked === null) toast(t('codeserver_layer', 'Could not check whether the file is read only, locked or changed moments ago.'));
}

function register(state: State, places: Places, kind: Kind): void {
  registerFileAction({
    id: `${PREFIX}open${kind === 'click' ? '-default' : ''}`,
    displayName: () => t('codeserver_layer', 'Open in code-server'),
    iconSvgInline: () => ICON,
    enabled: (context) => {
      const node = single(context, FileType.File);
      return node !== null && kindHere(state, places, node) === kind;
    },
    exec: async ({ nodes }) => {
      if (viewerOpen()) return null; // the user chose the Viewer's View
      forgetOpenfile();
      await open(state, places, nodes[0]);
      return null;
    },
    order: kind === 'click' ? CLICK_ORDER : MENU_ORDER,
    ...(kind === 'click' ? { default: DefaultType.DEFAULT } : {}),
  });
}

// A folder as code-server's folder, from the menu of its row, or for the folder shown with the
// button next to the path: the explorer, the terminal and the search of that window work in it.
// Never the whole account, whose listing would go over the network. code-server does not check
// that the folder is there, and remembers it as the folder opened last: a folder that changed
// moments ago (new, or new files in it) warns first, as code-server may not see the change yet, and
// so does one that takes no new files (a share without edit rights), where scripts would write in
// vain.
function registerFolder(state: State, places: Places): void {
  const urlOf = (node: INode | null): string | null => {
    const at = node && target(places, node.path);
    return at ? folderUrlFor(state.url, places, at) : null;
  };
  const openFolder = async (node: INode): Promise<null> => {
    const at = target(places, node.path);
    const side = at && sideOf(state, at);
    const url = urlOf(node);
    if (!at || !side || !url) return null;
    if (url.length > MAX_URL) {
      toast(TOO_LONG());
      return null;
    }
    const info = await check(node);
    const lines = (info ? decideFolder(info, side.syncHintSeconds, Date.now()) : []).map((hint) => (hint.kind === 'sync'
      ? t('codeserver_layer', 'The folder changed {seconds} s ago. If that was in Nextcloud or on another device, code-server may not show the change yet.', { seconds: hint.seconds })
      : hintText(hint, at.kind))).filter((line): line is string => line !== null);
    if (lines.length > 0 || !mayOpen() || !openTab(url)) await askThenOpen(node.basename, url, lines);
    return null;
  };
  registerFileAction({
    id: `${PREFIX}open-folder`,
    displayName: () => t('codeserver_layer', 'Open in code-server'),
    iconSvgInline: () => FolderOpenSvg,
    enabled: (context) => urlOf(single(context, FileType.Folder)) !== null,
    exec: ({ nodes }) => openFolder(nodes[0]),
    order: FOLDER_ORDER,
  });
  // The folder shown, as a button next to the path. Files 34 and 35 hand displayName and
  // iconSvgInline the view, not the context they declare, and call enabled() also for the root and
  // for a placeholder folder (id 0, no permissions) before the first listing; the virtual views'
  // folders (Recent, Search, the share views) are no folders of the user's.
  registerFileListAction({
    id: `${PREFIX}open-shown-folder`,
    displayName: () => t('codeserver_layer', 'Open in code-server'),
    iconSvgInline: () => FolderOpenSvg,
    order: 10,
    enabled: ({ folder, view }) => view?.id !== 'trashbin' && folder !== undefined && (folder.fileid ?? 0) > 0
      && ownFile(folder) && (folder.permissions & Permission.READ) !== 0 && urlOf(folder) !== null,
    exec: ({ folder }) => openFolder(folder),
  });
}

function enabledFor(action: IFileAction, context: ActionContext): boolean {
  try {
    return action.enabled === undefined || action.enabled(context);
  } catch {
    return false;
  }
}

// What a click opened before code-server took it over as the default app, when that action is a
// hidden one (DefaultType.HIDDEN, as ONLYOFFICE's and Euro-Office's): Files never shows it in the
// menu once another default runs instead. The Viewer's View, through which Nextcloud Text opens, is
// shown anyway. As in the Craft Suite Layer.
function displaced(context: ActionContext): IFileAction | null {
  const defaults = getFileActions()
    .filter((action) => action.default !== undefined && enabledFor(action, context))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!defaults[0]?.id.startsWith(PREFIX)) return null;
  const next = defaults.find((action) => !action.id.startsWith(PREFIX));
  return next?.default === DefaultType.HIDDEN ? next : null;
}

function problemText(problem: NameProblem): string {
  switch (problem) {
    case 'empty':
      return t('codeserver_layer', 'Enter a name.');
    case 'character':
      return t('codeserver_layer', 'Names cannot contain < > : " / \\ | ? * or control characters.');
    case 'reserved':
      return t('codeserver_layer', 'Windows reserves this name.');
    case 'end':
      return t('codeserver_layer', 'Names cannot end with a dot or a space.');
    case 'long':
      return t('codeserver_layer', 'This name is too long.');
    case 'taken':
      return t('codeserver_layer', 'A file with this name is in the folder already, in this or another letter case.');
  }
}

// The server's own rules for names (forbidden characters, names and extensions).
function serverProblem(name: string): string | null {
  try {
    validateFilename(name);
    return null;
  } catch (error) {
    return error instanceof Error && error.message ? error.message : t('codeserver_layer', 'Nextcloud does not allow this name.');
  }
}

// The address of a new file in folder (a path in the user's files), or null where none opens.
function newFileUrl(state: State, places: Places, folder: string, name: string): string | null {
  const at = target(places, `${folder.replace(/\/+$/, '')}/${name}`);
  return at && fileUrlFor(state.url, places, at);
}

function addNewEntry(state: State, places: Places, entry: NewEntry, index: number): void {
  addNewFileMenuEntry({
    id: `${PREFIX}new-${entry.id}`,
    displayName: entry.name,
    iconSvgInline: coloured(entry.extension === 'md' || entry.extension === 'txt' ? FileDocumentSvg : FileCodeSvg),
    order: 50 + index,
    enabled: (context: IFolder) => (context.permissions & Permission.CREATE) !== 0 && ownFile(context)
      && newFileUrl(state, places, context.path, `x.${entry.extension}`) !== null,
    handler: (context, content) => {
      const others = content.map((node) => node.basename);
      const proposal = freeName(`${entry.name}.${entry.extension}`, others);
      const stem = proposal.slice(0, -(entry.extension.length + 1));
      void nameDialog({
        title: entry.name,
        label: t('codeserver_layer', 'File name'),
        value: stem,
        extension: entry.extension,
        confirm: t('codeserver_layer', 'Create in code-server'),
        cancel: t('codeserver_layer', 'Cancel'),
        validate: (typed) => {
          const { name, problem } = newName(typed, entry.extension, others);
          return problem !== null ? problemText(problem) : serverProblem(name);
        },
        accept: (typed) => {
          const { name } = newName(typed, entry.extension, others);
          const url = newFileUrl(state, places, context.path, name);
          if (!url) return;
          if (url.length > MAX_URL) {
            toast(TOO_LONG());
            return;
          }
          toast(openTab(url)
            ? t('codeserver_layer', '{file} is created when you save it in code-server. It shows here once it has reached Nextcloud.', { file: name })
            : BLOCKED());
        },
      });
    },
  });
}

const state = readState();
if (state) {
  const places = placesOf(state);
  register(state, places, 'click');
  register(state, places, 'menu');
  registerFolder(state, places);
  state.newEntries.forEach((entry, index) => addNewEntry(state, places, entry, index));
  // The app a click opened before code-server took it over, under its own name and icon.
  if (state.folder?.defaultApp || state.account?.defaultApp) {
    registerFileAction({
      id: `${PREFIX}displaced`,
      displayName: (context) => displaced(context)?.displayName(context) ?? '',
      iconSvgInline: (context) => displaced(context)?.iconSvgInline(context) ?? '',
      enabled: (context) => context.nodes.length === 1 && displaced(context) !== null,
      // As the office apps' own menu entries call it: not as the default action, which would write
      // ?openfile=true into Files' address and so run this app's.
      exec: async (context) => {
        const action = displaced(context);
        return action ? action.exec({ ...context, isDefault: false } as ActionContextSingle) : null;
      },
      order: CLICK_ORDER + 1,
    });
  }
}
