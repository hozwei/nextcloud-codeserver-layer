// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Whether to warn before a file or folder opens in code-server, which has it from a working copy
// that a sync keeps in step with Nextcloud, or from a mount of the account that writes back to it:
// - "read only": Nextcloud does not let the user change the file (a share without edit rights);
//   it refuses the upload of what code-server saves. WebDAV's oc:permissions has W for a file only
//   then: Files' own permissions also count renaming the mount point of a share as an update. D
//   tells whether the user may delete it nevertheless, as a file shared on its own, which deleting
//   takes out of the share. A folder without C (and K) takes no new files.
// - "changed moments ago": code-server may not have the change yet (the next sync, or the mount's
//   cache of a folder's listing). Every WebDAV upload sets nc:upload_time to the server's time;
//   getlastmodified takes the client's time (X-OC-MTime), and Nextcloud Text saves without an
//   upload. Either counts.
// - "open in Nextcloud Text" or "locked": Text locks a file while it is open there (as the app
//   'text', with files_lock), and Nextcloud refuses an upload while the file is locked, except from
//   the account that locked it as a user (files_lock lets it write, from any client).
// The times are compared with the Date header of the server's answer, not the browser's clock.
// decide() has no DOM: the unit tests run it in Node.js.

export interface DavInfo {
  /** getlastmodified, in ms */
  modified: number | null;
  /** nc:upload_time, in ms */
  uploaded: number | null;
  locked: boolean;
  /** nc:lock-owner-type: 0 a user, 1 an app, 2 a token */
  lockType: number | null;
  /** nc:lock-owner-editor: the app that holds the lock */
  lockEditor: string | null;
  /** nc:lock-owner-displayname */
  lockOwner: string | null;
  /** nc:lock-owner: the account that holds the lock (none for an app's) */
  lockUser: string | null;
  /** whether oc:permissions lets the user change the file's content (W), or null without them */
  writable: boolean | null;
  /** whether oc:permissions lets the user delete it (D), or null without them */
  deletable: boolean | null;
  /** whether oc:permissions lets the user add files to the folder (C), or null without them */
  creatable: boolean | null;
  /** the server's time (Date header), in ms */
  now: number | null;
}

export type Hint =
  | { kind: 'readonly'; deletable: boolean }
  | { kind: 'nocreate' }
  | { kind: 'sync'; seconds: number }
  | { kind: 'text' }
  /** own: the user's own lock as a user, which binds only other accounts */
  | { kind: 'lock'; owner: string | null; own: boolean };

export const PROPFIND_BODY = '<?xml version="1.0"?>'
  + '<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:prop>'
  + '<d:getlastmodified/><oc:permissions/><nc:upload_time/>'
  + '<nc:lock/><nc:lock-owner-type/><nc:lock-owner/><nc:lock-owner-editor/><nc:lock-owner-displayname/>'
  + '</d:prop></d:propfind>';

/** Whether a file with these WebDAV permissions (oc:permissions, such as 'RGDNVW') may be changed. */
export const writableBy = (permissions: string): boolean => permissions.includes('W');

/** Whether a folder with these WebDAV permissions (such as 'RGDNVCK') takes new files. */
export const creatableBy = (permissions: string): boolean => permissions.includes('C');

// A change within syncSeconds (0: none), or null.
function recent(info: DavInfo, syncSeconds: number, browserNow: number): Hint | null {
  if (syncSeconds <= 0) return null;
  const now = info.now ?? browserNow;
  // Each time on its own: a laptop's clock may run ahead or behind, the upload time is the server's.
  const ages = [info.modified, info.uploaded]
    .filter((t): t is number => t !== null && Number.isFinite(t))
    .map((t) => now - t)
    .filter((age) => Math.abs(age) < syncSeconds * 1000);
  return ages.length > 0 ? { kind: 'sync', seconds: Math.max(0, Math.round(Math.min(...ages.map((a) => Math.max(0, a))) / 1000)) } : null;
}

/** The warnings for a file of user: read only, a lock, then a recent change within syncSeconds (0: none). */
export function decide(info: DavInfo, syncSeconds: number, browserNow: number, user: string | null = null): Hint[] {
  const hints: Hint[] = [];
  if (info.writable === false) hints.push({ kind: 'readonly', deletable: info.deletable === true });
  if (info.locked) {
    hints.push(info.lockType === 1 && info.lockEditor === 'text'
      ? { kind: 'text' }
      : { kind: 'lock', owner: info.lockOwner, own: info.lockType === 0 && user !== null && info.lockUser === user });
  }
  const change = recent(info, syncSeconds, browserNow);
  if (change) hints.push(change);
  return hints;
}

/** The warnings for a folder: no new files in it, then a recent change within syncSeconds. */
export function decideFolder(info: DavInfo, syncSeconds: number, browserNow: number): Hint[] {
  const hints: Hint[] = [];
  if (info.creatable === false) hints.push({ kind: 'nocreate' });
  const change = recent(info, syncSeconds, browserNow);
  if (change) hints.push(change);
  return hints;
}

const NS = { d: 'DAV:', oc: 'http://owncloud.org/ns', nc: 'http://nextcloud.org/ns' } as const;

/** The answer of a PROPFIND with PROPFIND_BODY, read in the browser. */
export function readDav(xml: string, date: string | null): DavInfo {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  // Only properties the server found (status 200); a missing one (no files_lock) has no text.
  const value = (ns: keyof typeof NS, name: string): string | null => {
    for (const element of Array.from(doc.getElementsByTagNameNS(NS[ns], name))) {
      const text = element.textContent?.trim() ?? '';
      if (text !== '') return text;
    }
    return null;
  };
  const number = (text: string | null): number | null => (text !== null && /^-?\d+$/.test(text) ? Number(text) : null);
  const time = (text: string | null): number | null => {
    const ms = text === null ? NaN : Date.parse(text);
    return Number.isFinite(ms) ? ms : null;
  };
  const uploaded = number(value('nc', 'upload_time'));
  const lock = value('nc', 'lock');
  const permissions = value('oc', 'permissions');
  return {
    modified: time(value('d', 'getlastmodified')),
    uploaded: uploaded !== null && uploaded > 0 ? uploaded * 1000 : null,
    locked: lock === '1' || lock === 'true',
    lockType: number(value('nc', 'lock-owner-type')),
    lockEditor: value('nc', 'lock-owner-editor'),
    lockOwner: value('nc', 'lock-owner-displayname'),
    lockUser: value('nc', 'lock-owner'),
    writable: permissions === null ? null : writableBy(permissions),
    deletable: permissions === null ? null : permissions.includes('D'),
    creatable: permissions === null ? null : creatableBy(permissions),
    now: time(date),
  };
}
