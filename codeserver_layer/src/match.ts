// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Which files open in code-server, and how: by file name first (Dockerfile, .env.*), then by
// extension, both in any letter case. The extension is what Nextcloud types a file by: the part
// after the last dot, where a dot at the start does not count (.gitignore has none).

export type Kind = 'click' | 'menu';

export interface Formats {
  /** Extensions a click opens in code-server. */
  click: string[];
  /** Extensions only the file's menu opens in code-server: another app takes the click. */
  menu: string[];
  /** File names, with '*' for any characters; a click opens them in code-server. */
  filenames: string[];
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

const patterns = new Map<string, RegExp>();

/** Whether name matches one of the file names, in any letter case; '*' stands for any characters. */
export function matchesFilename(filenames: string[], name: string): boolean {
  return filenames.some((pattern) => {
    let re = patterns.get(pattern);
    if (!re) {
      re = new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'iu');
      patterns.set(pattern, re);
    }
    return re.test(name);
  });
}

/** How a file of this name opens in code-server, or null when it does not. */
export function kindOf(formats: Formats, name: string): Kind | null {
  if (matchesFilename(formats.filenames, name)) return 'click';
  const ext = extensionOf(name);
  if (ext === '') return null;
  if (formats.click.includes(ext)) return 'click';
  if (formats.menu.includes(ext)) return 'menu';
  return null;
}
