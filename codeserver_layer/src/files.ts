// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// "Open in code-server" and the "+ New" entries in Files, for the files in the user's code-server
// folder (lib/Listener/LoadFilesScripts.php provides the settings). Files keeps its actions and
// "+ New" entries in a registry shared by every copy of @nextcloud/files 4.x on the page, so the
// bundled copy registers into the one Files reads.
//
// Like the Craft Suite Layer: an extension no other app opens on a click opens in code-server on a
// click (the action is the default one, order -20, before the Viewer's); one that Nextcloud Text or
// another app opens has the entry in the file's menu, unless the administrator made code-server the
// default app (lib/Service/Config.php, clickAndMenu()).

import {
  addNewFileMenuEntry, DefaultType, FileType, getFileActions, Permission, registerFileAction, validateFilename,
  type ActionContext, type ActionContextSingle, type IFileAction, type IFolder, type INode,
} from '@nextcloud/files';
import FileCodeSvg from '@mdi/svg/svg/file-code-outline.svg';
import FileDocumentSvg from '@mdi/svg/svg/file-document-outline.svg';
import { confirmDialog, nameDialog, toast } from './dialog.ts';
import { decide, PROPFIND_BODY, readDav, type Hint } from './hints.ts';
import { launchUrl, relativePath } from './launch.ts';
import { kindOf, type Formats, type Kind } from './match.ts';
import { freeName, newName, type NameProblem } from './names.ts';
import { t } from './l10n.ts';

interface NewEntry { id: string; extension: string; name: string }
interface State extends Formats {
  url: string;
  workspace: string;
  folder: string;
  defaultApp: boolean;
  newEntries: NewEntry[];
  syncHintSeconds: number;
}

const PREFIX = 'codeserver_layer-';
// Files runs the first default action by this order (lowest first): before the Viewer's (no
// order), through which Nextcloud Text opens, and after Files' own open-in-files (-1000), which in
// Recent and Search first goes to the file's folder. The same as the Craft Suite Layer's.
const CLICK_ORDER = -20;
const MENU_ORDER = 10;
// How long the check before opening may take; then the file opens without it.
const CHECK_TIMEOUT = 2000;
const INTRO_KEY = 'codeserver_layer:intro-seen';

// Nextcloud's own primary colour, as Files' "New folder" entry has it.
const coloured = (svg: string) => svg.replace(/viewBox/i, 'style="color: var(--color-primary-element)" viewBox');
const ICON = FileCodeSvg;

function readState(): State | null {
  const input = document.querySelector<HTMLInputElement>('#initial-state-codeserver_layer-files');
  if (!input) return null;
  try {
    const state = JSON.parse(atob(input.value)) as State;
    return state && typeof state.url === 'string' && typeof state.folder === 'string' ? state : null;
  } catch {
    return null;
  }
}

// The file's place below the code-server folder, or null outside it.
const below = (state: State, node: INode): string | null => relativePath(state.folder, node.path);

function opensHere(state: State, kind: Kind, context: ActionContext): boolean {
  const node = context.nodes[0];
  return context.view.id !== 'trashbin'
    && context.nodes.length === 1
    && node.type === FileType.File
    && node.isDavResource
    && (node.permissions & Permission.READ) !== 0
    && below(state, node) !== null
    && kindOf(state, node.basename) === kind;
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

async function askThenOpen(name: string, url: string, lines: string[]): Promise<void> {
  let opened = true;
  await confirmDialog(t('codeserver_layer', 'Open {file} in code-server?', { file: name }), lines,
    t('codeserver_layer', 'Open in code-server'), t('codeserver_layer', 'Cancel'), () => {
      opened = openTab(url);
    });
  if (!opened) toast(t('codeserver_layer', 'The browser blocked the new tab for code-server. Allow pop-ups for this site and try again.'));
}

function hintText(hint: Hint): string {
  switch (hint.kind) {
    case 'text':
      return t('codeserver_layer', 'The file is open in Nextcloud Text, which locks it. Close it there before you save it in code-server: while it is locked, the sync cannot upload it.');
    case 'lock':
      return hint.owner
        ? t('codeserver_layer', 'The file is locked by {owner}. While it is locked, the sync cannot upload what you save in code-server.', { owner: hint.owner })
        : t('codeserver_layer', 'The file is locked. While it is locked, the sync cannot upload what you save in code-server.');
    case 'sync':
      return t('codeserver_layer', 'The file changed {seconds} s ago. If that was in Nextcloud or on another device, code-server shows the change only after the next sync.', { seconds: hint.seconds });
  }
}

const INTRO = (): string => t('codeserver_layer', 'Do not edit a file in Nextcloud Text and in code-server at the same time. Text locks a file while it is open there; if you save it in code-server meanwhile, the sync cannot upload it.');

function introSeen(): boolean {
  try {
    return window.localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return true; // no storage: do not ask every time
  }
}

function noteIntroSeen(): void {
  try {
    window.localStorage.setItem(INTRO_KEY, '1');
  } catch {
    // shown again next time
  }
}

// What the server says about the file now: the list in Files may be minutes old. Null when the
// answer does not come in time.
async function check(node: INode): Promise<Hint[] | null> {
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
    return decide(readDav(await res.text(), res.headers.get('Date')), state?.syncHintSeconds ?? 0, Date.now());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function open(node: INode): Promise<void> {
  const relative = state && below(state, node);
  if (!state || !relative) return;
  // Whether a click or key press of the user started this, taken before anything is awaited:
  // Files also runs the action by itself, for a /f/<id> link.
  const activated = mayOpen();
  const url = launchUrl(state.url, state.workspace, relative);
  const hints = await check(node);
  const lines = (hints ?? []).map(hintText);
  if (!introSeen()) {
    lines.push(INTRO());
    noteIntroSeen();
  }
  if (lines.length > 0 || !activated || !mayOpen()) {
    await askThenOpen(node.basename, url, lines);
    return;
  }
  if (!openTab(url)) {
    await askThenOpen(node.basename, url, []);
    return;
  }
  if (hints === null) toast(t('codeserver_layer', 'Could not check whether the file is locked or changed moments ago.'));
}

function register(state: State, kind: Kind): void {
  registerFileAction({
    id: `${PREFIX}open${kind === 'click' ? '-default' : ''}`,
    displayName: () => t('codeserver_layer', 'Open in code-server'),
    iconSvgInline: () => ICON,
    enabled: (context) => opensHere(state, kind, context),
    exec: async ({ nodes }) => {
      if (viewerOpen()) return null; // the user chose the Viewer's View
      forgetOpenfile();
      await open(nodes[0]);
      return null;
    },
    order: kind === 'click' ? CLICK_ORDER : MENU_ORDER,
    ...(kind === 'click' ? { default: DefaultType.DEFAULT } : {}),
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

function insideFolder(state: State, folder: IFolder): boolean {
  const path = folder.path.replace(/\/+$/, '') || '/';
  return state.folder === '/' || path === state.folder || path.startsWith(`${state.folder}/`);
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

function addNewEntry(state: State, entry: NewEntry, index: number): void {
  addNewFileMenuEntry({
    id: `${PREFIX}new-${entry.id}`,
    displayName: entry.name,
    iconSvgInline: coloured(entry.extension === 'md' || entry.extension === 'txt' ? FileDocumentSvg : FileCodeSvg),
    order: 50 + index,
    enabled: (context) => (context.permissions & Permission.CREATE) !== 0 && insideFolder(state, context),
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
          const folderPath = context.path.replace(/\/+$/, '');
          const relative = relativePath(state.folder, `${folderPath}/${name}`);
          if (!relative) return;
          if (openTab(launchUrl(state.url, state.workspace, relative))) {
            toast(t('codeserver_layer', '{file} is created when you save it in code-server, and shows here after the next sync.', { file: name }));
          } else {
            toast(t('codeserver_layer', 'The browser blocked the new tab for code-server. Allow pop-ups for this site and try again.'));
          }
        },
      });
    },
  });
}

const state = readState();
if (state) {
  register(state, 'click');
  register(state, 'menu');
  state.newEntries.forEach((entry, index) => addNewEntry(state, entry, index));
  // The app a click opened before code-server took it over, under its own name and icon.
  if (state.defaultApp) {
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
