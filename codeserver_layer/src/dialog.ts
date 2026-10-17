// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Small dialogs and messages for Files, with the browser's <dialog> and Nextcloud's CSS variables
// (css/files.css). Files' own name dialog is internal to Files, and @nextcloud/vue would bundle
// Vue into the script that every Files page loads. The texts are set with textContent only.

let counter = 0;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

interface Button {
  label: string;
  primary?: boolean;
  value: string;
}

/**
 * Opens a modal dialog and resolves with the value of the button pressed, or null when it was
 * dismissed (Escape). The buttons are real clicks, so a button may open a window.
 */
function show(title: string, body: HTMLElement[], buttons: Button[], onClick?: (value: string) => boolean): Promise<string | null> {
  const id = `codeserver-layer-dialog-${++counter}`;
  const dialog = element('dialog', 'codeserver-dialog');
  dialog.setAttribute('aria-labelledby', `${id}-title`);
  const heading = element('h2', 'codeserver-dialog__title', title);
  heading.id = `${id}-title`;
  const actions = element('div', 'codeserver-dialog__actions');
  dialog.append(heading, ...body, actions);
  return new Promise((resolve) => {
    let result: string | null = null;
    for (const button of buttons) {
      const el = element('button', button.primary ? 'button primary' : 'button', button.label);
      el.type = 'button';
      el.dataset.value = button.value;
      el.addEventListener('click', () => {
        if (onClick && !onClick(button.value)) return;
        result = button.value;
        dialog.close();
      });
      actions.append(el);
    }
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/**
 * Asks the user to confirm; resolves true for the confirm button. confirmAction runs within that
 * button's click (with the click's user activation), before the dialog closes.
 */
export async function confirmDialog(title: string, lines: string[], confirm: string, cancel: string, confirmAction?: () => void): Promise<boolean> {
  const body = lines.map((line) => element('p', 'codeserver-dialog__text', line));
  const value = await show(title, body, [{ label: cancel, value: 'cancel' }, { label: confirm, value: 'ok', primary: true }], (v) => {
    if (v === 'ok') confirmAction?.();
    return true;
  });
  return value === 'ok';
}

/**
 * Asks for a file name with a fixed extension. validate() returns the problem with a name, or null;
 * accept() runs within the click on the confirm button (or the Enter key), with the name.
 */
export function nameDialog(options: {
  title: string;
  label: string;
  value: string;
  extension: string;
  confirm: string;
  cancel: string;
  validate: (stem: string) => string | null;
  accept: (stem: string) => void;
}): Promise<string | null> {
  const id = `codeserver-layer-name-${++counter}`;
  const field = element('div', 'codeserver-dialog__field');
  const label = element('label', 'codeserver-dialog__label', options.label);
  label.htmlFor = id;
  const row = element('div', 'codeserver-dialog__row');
  const input = element('input', 'codeserver-dialog__input');
  input.id = id;
  input.type = 'text';
  input.value = options.value;
  input.autocomplete = 'off';
  input.spellcheck = false;
  const ext = element('span', 'codeserver-dialog__ext', `.${options.extension}`);
  row.append(input, ext);
  const error = element('p', 'codeserver-dialog__error');
  error.id = `${id}-error`;
  error.setAttribute('role', 'alert');
  input.setAttribute('aria-describedby', error.id);
  field.append(label, row, error);

  const check = (): boolean => {
    const problem = options.validate(input.value);
    error.textContent = problem ?? '';
    input.setAttribute('aria-invalid', problem === null ? 'false' : 'true');
    const button = field.closest('dialog')?.querySelector<HTMLButtonElement>('button[data-value="ok"]');
    if (button) button.disabled = problem !== null;
    return problem === null;
  };
  input.addEventListener('input', check);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    field.closest('dialog')?.querySelector<HTMLButtonElement>('button[data-value="ok"]')?.click();
  });

  const result = show(options.title, [field], [{ label: options.cancel, value: 'cancel' }, { label: options.confirm, value: 'ok', primary: true }], (value) => {
    if (value !== 'ok') return true;
    if (!check()) return false;
    options.accept(input.value);
    return true;
  }).then((value) => (value === 'ok' ? input.value : null));
  check();
  input.focus();
  input.select();
  return result;
}

/** A message at the bottom of the page that goes after a while; also read out by screen readers. */
export function toast(text: string, ms = 8000): void {
  const el = element('div', 'codeserver-toast', text);
  el.setAttribute('role', 'status');
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}
