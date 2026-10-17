// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Administration settings: sends the form (templates/admin.php) to AdminSettingsController and
// shows the result. The server checks every field and saves nothing if one is not acceptable; after
// a save it says what a click in Files opens now, in the code-server folder and with account
// access. Saving needs a recent password confirmation; Nextcloud's own dialog asks for it when
// needed.

import { generateUrl } from '@nextcloud/router';
import { t } from './l10n.ts';

interface PasswordConfirmation {
  requirePasswordConfirmation(callback: () => void, options?: object, rejectCallback?: () => void): void;
}

interface Answer {
  errors?: Record<string, string>;
  hint?: string;
  accountHint?: string;
  extensions?: string;
  filenames?: string;
  url?: string;
  workspace?: string;
  accountWorkspace?: string;
  accountExclude?: string;
  syncHintSeconds?: string;
  accountSyncHintSeconds?: string;
  message?: string;
}

const root = document.querySelector<HTMLElement>('#codeserver-layer-admin');
const form = root?.querySelector<HTMLFormElement>('form');
const status = root?.querySelector<HTMLElement>('.codeserver-settings__status');
const FIELDS = [
  'url', 'workspace', 'extensions', 'filenames', 'defaultApp', 'newEntries', 'syncHintSeconds',
  'accountWorkspace', 'accountExclude', 'accountDefaultApp', 'accountSyncHintSeconds',
] as const;

// Nextcloud's password dialog (OC.PasswordConfirmation, in Nextcloud 34 and 35). Without it the
// server answers 403 when a confirmation is due, and the status line says so.
function confirmPassword(): Promise<void> {
  const pc = (window as unknown as { OC?: { PasswordConfirmation?: PasswordConfirmation } }).OC?.PasswordConfirmation;
  if (!pc) return Promise.resolve();
  return new Promise((resolve, reject) => pc.requirePasswordConfirmation(resolve, {}, () => reject(new Error('cancelled'))));
}

function field<T extends HTMLElement>(name: string): T | null {
  return form?.querySelector<T>(`[name="${name}"]`) ?? null;
}

function showErrors(errors: Record<string, string>): void {
  for (const name of FIELDS) {
    const message = errors[name] ?? '';
    const error = root?.querySelector<HTMLElement>(`#codeserver-layer-${name}-error`);
    if (error) error.textContent = message;
    const input = field(name);
    if (message) input?.setAttribute('aria-invalid', 'true');
    else input?.removeAttribute('aria-invalid');
  }
}

async function save(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (!form || !status) return;
  const button = form.querySelector<HTMLButtonElement>('button[type=submit]');
  if (button) button.disabled = true;
  status.textContent = t('codeserver_layer', 'Saving …');
  try {
    await confirmPassword();
    const res = await fetch(generateUrl('/apps/codeserver_layer/settings/admin'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', requesttoken: document.head.dataset.requesttoken ?? '' },
      body: JSON.stringify({
        url: field<HTMLInputElement>('url')?.value ?? '',
        workspace: field<HTMLInputElement>('workspace')?.value ?? '',
        extensions: field<HTMLTextAreaElement>('extensions')?.value ?? '',
        filenames: field<HTMLTextAreaElement>('filenames')?.value ?? '',
        defaultApp: field<HTMLInputElement>('defaultApp')?.checked ?? false,
        newEntries: [...form.querySelectorAll<HTMLInputElement>('input[name="newEntries"]:checked')].map((input) => input.value),
        syncHintSeconds: field<HTMLInputElement>('syncHintSeconds')?.value.trim() ?? '',
        accountWorkspace: field<HTMLInputElement>('accountWorkspace')?.value ?? '',
        accountDefaultApp: field<HTMLInputElement>('accountDefaultApp')?.checked ?? false,
        accountSyncHintSeconds: field<HTMLInputElement>('accountSyncHintSeconds')?.value.trim() ?? '',
        accountExclude: field<HTMLTextAreaElement>('accountExclude')?.value ?? '',
      }),
    });
    const body = (await res.json().catch(() => ({}))) as Answer;
    showErrors(body.errors ?? {});
    if (res.ok) {
      const hint = root?.querySelector<HTMLElement>('#codeserver-layer-hint');
      if (hint && body.hint) hint.textContent = body.hint;
      const accountHint = root?.querySelector<HTMLElement>('#codeserver-layer-account-hint');
      if (accountHint && body.accountHint) accountHint.textContent = body.accountHint;
      // What the server stored: a trailing slash added or taken off, the lists cleaned up.
      for (const name of ['url', 'workspace', 'accountWorkspace', 'accountExclude', 'extensions', 'filenames', 'syncHintSeconds', 'accountSyncHintSeconds'] as const) {
        const input = field<HTMLInputElement | HTMLTextAreaElement>(name);
        const value = body[name];
        if (input && typeof value === 'string') input.value = value;
      }
      status.textContent = t('codeserver_layer', 'Saved');
    } else if (body.errors) {
      status.textContent = t('codeserver_layer', 'Nothing was saved. Correct the marked fields.');
    } else if (res.status === 403) {
      status.textContent = t('codeserver_layer', 'Nothing was saved: confirm your password and try again.');
    } else if (res.status === 412 || res.status === 404) {
      // Nextcloud refuses an app's routes to an account the app is not enabled for: 412, or 404
      // where the server has no local memory cache.
      status.textContent = t('codeserver_layer', 'Nothing was saved: the app is not enabled for your account. Use an account in a group the app is enabled for, or occ config:app:set codeserver_layer.');
    } else {
      status.textContent = body.message
        ? t('codeserver_layer', 'Nothing was saved: {message}', { message: body.message })
        : t('codeserver_layer', 'Nothing was saved: the server answered HTTP {status}.', { status: res.status });
    }
  } catch (err) {
    status.textContent = err instanceof Error && err.message === 'cancelled'
      ? t('codeserver_layer', 'Nothing was saved: the password was not confirmed.')
      : t('codeserver_layer', 'Nothing was saved: the connection to the server failed.');
  } finally {
    if (button) button.disabled = form.dataset.enabled === 'false';
  }
}

for (const restore of root?.querySelectorAll<HTMLButtonElement>('.codeserver-settings__restore') ?? []) {
  restore.addEventListener('click', () => {
    const target = document.getElementById(restore.dataset.target ?? '') as HTMLTextAreaElement | null;
    if (target) target.value = restore.dataset.value ?? '';
  });
}
form?.addEventListener('submit', (event) => void save(event));
