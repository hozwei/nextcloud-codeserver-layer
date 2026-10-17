// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// build.mjs loads SVG files as text: the icons of the Files entries are inline SVG strings.

declare module '*.svg' {
  const svg: string;
  export default svg;
}
