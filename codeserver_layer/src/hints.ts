// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Whether to warn before a file opens in code-server, which works on a working copy that a sync
// keeps in step with Nextcloud:
// - "still syncing": the file changed in Nextcloud moments ago, so the working copy may not have the
//   change yet. Every WebDAV upload sets nc:upload_time to the server's time; getlastmodified takes
//   the client's time (X-OC-MTime), and Nextcloud Text saves without an upload. Either counts.
// - "open in Nextcloud Text" or "locked": Text locks a file while it is open there (as the app
//   'text', with files_lock), and a sync cannot upload the file while it is locked.
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
  /** the server's time (Date header), in ms */
  now: number | null;
}

export type Hint =
  | { kind: 'sync'; seconds: number }
  | { kind: 'text' }
  | { kind: 'lock'; owner: string | null };

export const PROPFIND_BODY = '<?xml version="1.0"?>'
  + '<d:propfind xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns"><d:prop>'
  + '<d:getlastmodified/><nc:upload_time/><nc:lock/><nc:lock-owner-type/><nc:lock-owner-editor/><nc:lock-owner-displayname/>'
  + '</d:prop></d:propfind>';

/** The warnings for a file: a lock first, then a recent change within syncSeconds (0: none). */
export function decide(info: DavInfo, syncSeconds: number, browserNow: number): Hint[] {
  const hints: Hint[] = [];
  if (info.locked) {
    hints.push(info.lockType === 1 && info.lockEditor === 'text' ? { kind: 'text' } : { kind: 'lock', owner: info.lockOwner });
  }
  if (syncSeconds > 0) {
    const now = info.now ?? browserNow;
    // Each time on its own: a laptop's clock may run ahead or behind, the upload time is the server's.
    const ages = [info.modified, info.uploaded]
      .filter((t): t is number => t !== null && Number.isFinite(t))
      .map((t) => now - t)
      .filter((age) => Math.abs(age) < syncSeconds * 1000);
    if (ages.length > 0) hints.push({ kind: 'sync', seconds: Math.max(0, Math.round(Math.min(...ages.map((a) => Math.max(0, a))) / 1000)) });
  }
  return hints;
}

const NS = { d: 'DAV:', nc: 'http://nextcloud.org/ns' } as const;

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
  return {
    modified: time(value('d', 'getlastmodified')),
    uploaded: uploaded !== null && uploaded > 0 ? uploaded * 1000 : null,
    locked: lock === '1' || lock === 'true',
    lockType: number(value('nc', 'lock-owner-type')),
    lockEditor: value('nc', 'lock-owner-editor'),
    lockOwner: value('nc', 'lock-owner-displayname'),
    now: time(date),
  };
}
