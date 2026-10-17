// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Personal settings: the user's folder whose files open in code-server (templates/personal.php).
// "Choose …" uses Nextcloud's folder picker through OC.dialogs.filepicker (deprecated since
// Nextcloud 27.1, still in 34 and 35); without it the path can be typed.

import { generateUrl } from '@nextcloud/router';
import { t } from './l10n.ts';

type FilePicker = (title: string, callback: (path: string) => void, multiselect: boolean, mimetype: string[],
  modal: boolean, type: number, path?: string, options?: object) => void;

const root = document.querySelector<HTMLElement>('#codeserver-layer-personal');
const form = root?.querySelector<HTMLFormElement>('form');
const input = root?.querySelector<HTMLInputElement>('#codeserver-layer-folder');
const error = root?.querySelector<HTMLElement>('#codeserver-layer-folder-error');
const status = root?.querySelector<HTMLElement>('.codeserver-settings__status');
const pick = root?.querySelector<HTMLButtonElement>('.codeserver-settings__pick');

const filepicker = (window as unknown as { OC?: { dialogs?: { filepicker?: FilePicker } } }).OC?.dialogs?.filepicker;
if (pick && input) {
  if (typeof filepicker !== 'function') {
    pick.hidden = true;
  } else {
    pick.addEventListener('click', () => {
      // 1: choose; only folders can be chosen with this filter.
      filepicker.call((window as unknown as { OC: { dialogs: object } }).OC.dialogs, t('codeserver_layer', 'Choose your code-server folder'), (path) => {
        input.value = path;
      }, false, ['httpd/unix-directory'], true, 1, input.value || '/', { allowDirectoryChooser: true });
    });
  }
}

async function save(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (!form || !input || !status || !error) return;
  const button = form.querySelector<HTMLButtonElement>('button[type=submit]');
  if (button) button.disabled = true;
  status.textContent = t('codeserver_layer', 'Saving …');
  try {
    const res = await fetch(generateUrl('/apps/codeserver_layer/settings/personal'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', requesttoken: document.head.dataset.requesttoken ?? '' },
      body: JSON.stringify({ folder: input.value }),
    });
    const body = (await res.json().catch(() => ({}))) as { folder?: string; error?: string };
    error.textContent = body.error ?? '';
    if (body.error) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    if (res.ok) {
      input.value = body.folder ?? '';
      status.textContent = t('codeserver_layer', 'Saved');
    } else {
      status.textContent = body.error
        ? t('codeserver_layer', 'Nothing was saved.')
        : t('codeserver_layer', 'Nothing was saved: the server answered HTTP {status}.', { status: res.status });
    }
  } catch {
    status.textContent = t('codeserver_layer', 'Nothing was saved: the connection to the server failed.');
  } finally {
    if (button) button.disabled = false;
  }
}

form?.addEventListener('submit', (event) => void save(event));
