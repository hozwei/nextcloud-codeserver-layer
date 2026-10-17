// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Names of new files from "+ New". Files are synced to desktop clients, Windows ones among them,
// so a name must also be valid there, whatever the server allows: none of < > : " / \ | ? * or a
// control character, no reserved device name (CON, PRN, AUX, NUL, COM0-9, LPT0-9, also with an
// extension and with a superscript digit), no dot or space at the end. And it must differ from the
// names in the folder in any letter case: Windows and macOS clients cannot hold Test.ps1 and
// test.ps1 side by side. Nextcloud allows 250 bytes (UTF-8).
// No DOM and no @nextcloud packages here: the unit tests run it in Node.js.

export type NameProblem = 'empty' | 'character' | 'reserved' | 'end' | 'long' | 'taken';

export const MAX_BYTES = 250;

/** stem with the extension appended; an extension the user typed already is not doubled. */
export function withExtension(stem: string, extension: string): string {
  const name = stem.trim();
  const suffix = `.${extension}`;
  return name.toLowerCase().endsWith(suffix.toLowerCase()) ? name.slice(0, -suffix.length) + suffix : name + suffix;
}

/** What makes name unusable on Windows clients, or null. */
export function windowsProblem(name: string): NameProblem | null {
  if (name.trim() === '') return 'empty';
  // eslint-disable-next-line no-control-regex
  if (/[<>:"/\\|?*\u0000-\u001f\u007f]/.test(name)) return 'character';
  if (/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\.|$)/iu.test(name.trim())) return 'reserved';
  if (/[. ]$/.test(name)) return 'end';
  if (new TextEncoder().encode(name).length > MAX_BYTES) return 'long';
  return null;
}

const comparable = (name: string) => name.normalize('NFC').toLowerCase();

/** Whether a name in others is the same as name in any letter case. */
export function isTaken(name: string, others: string[]): boolean {
  const wanted = comparable(name);
  return others.some((other) => comparable(other) === wanted);
}

/**
 * name, or the first of "<stem> (1).<ext>", "<stem> (2).<ext>", ... that no name in others has in
 * any letter case (the form Files' getUniqueName proposes, which compares exactly).
 */
export function freeName(name: string, others: string[]): string {
  if (!isTaken(name, others)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 1; ; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!isTaken(candidate, others)) return candidate;
  }
}

/**
 * The name of a new file from what the user typed (stem) and the entry's extension, and what is
 * wrong with it in a folder with these names, or null.
 */
export function newName(stem: string, extension: string, others: string[]): { name: string; problem: NameProblem | null } {
  const name = withExtension(stem, extension);
  if (name.slice(0, -(extension.length + 1)).trim() === '') return { name, problem: 'empty' };
  return { name, problem: windowsProblem(name) ?? (isTaken(name, others) ? 'taken' : null) };
}
