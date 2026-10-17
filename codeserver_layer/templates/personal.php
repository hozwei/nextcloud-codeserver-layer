<?php
// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/** @var array $_ */
/** @var \OCP\IL10N $l */
?>
<div id="codeserver-layer-personal" class="section">
	<h2><?php p($l->t('code-server')); ?></h2>
	<p class="settings-hint"><?php p($l->t('The folder whose files open in code-server: the one code-server has a working copy of. Files offers "Open in code-server" for the files in it, and "+ New" entries that create a file in code-server.')); ?></p>
<?php if (!$_['urlUsable']): ?>
	<p class="codeserver-settings__notice" role="note"><?php p($l->t('An administrator has yet to set the address of code-server. Until then, Files offers nothing.')); ?></p>
<?php elseif (!$_['workspaceUsable'] && !$_['accountUsable']): ?>
	<p class="codeserver-settings__notice" role="note"><?php p($l->t('An administrator has yet to set where code-server has your files. Until then, Files offers nothing.')); ?></p>
<?php elseif (!$_['workspaceUsable']): ?>
	<p class="codeserver-settings__notice" role="note"><?php p($l->t('An administrator has yet to set where code-server has its working copy. Until then, the folder below has no effect.')); ?></p>
<?php endif; ?>
<?php if ($_['missing']): ?>
	<p class="codeserver-settings__notice" role="note"><?php p($l->t('The folder you chose no longer exists. Choose it again.')); ?></p>
<?php endif; ?>
	<form class="codeserver-settings" novalidate>
		<label for="codeserver-layer-folder"><?php p($l->t('Folder')); ?></label>
		<div>
			<div class="codeserver-settings__row">
				<input id="codeserver-layer-folder" name="folder" type="text" value="<?php p($_['folder']); ?>" placeholder="/Projects"
					autocomplete="off" spellcheck="false" aria-describedby="codeserver-layer-folder-error codeserver-layer-folder-hint">
				<button type="button" class="codeserver-settings__pick"><?php p($l->t('Choose …')); ?></button>
			</div>
			<p id="codeserver-layer-folder-hint" class="codeserver-settings__hint"><?php p($l->t('Its path in your files. Leave it empty for no folder. The app follows the folder when you rename or move it; code-server\'s working copy may not, so ask whoever runs code-server first.')); ?></p>
			<p id="codeserver-layer-folder-error" class="codeserver-settings__error" role="alert"></p>
		</div>
		<span><?php p($l->t('Account access')); ?></span>
		<div>
			<label class="codeserver-settings__check">
				<input id="codeserver-layer-account" name="account" type="checkbox"<?php if ($_['account']): ?> checked<?php endif; ?><?php if (!$_['accountUsable'] && !$_['account']): ?> disabled<?php endif; ?>
					aria-describedby="codeserver-layer-account-hint">
				<span><?php p($l->t('All my files: open files from anywhere in my account in code-server')); ?></span>
			</label>
			<p id="codeserver-layer-account-hint" class="codeserver-settings__hint"><?php p($_['accountUsable']
				? $l->t('code-server has the files of one account at %s. Turn this on only if that account is yours: files outside the folder above then open there, each on its own in a window without a folder, and a folder from its menu.', [$_['accountWorkspace']])
				: $l->t('An administrator has yet to set where code-server has your whole account.')); ?></p>
		</div>
		<span></span>
		<div class="codeserver-settings__actions">
			<button type="submit" class="button primary"><?php p($l->t('Save')); ?></button>
			<span class="codeserver-settings__status" role="status" aria-live="polite"></span>
		</div>
	</form>
	<p class="settings-hint"><?php p($l->t('Do not edit a file in Nextcloud Text and in code-server at the same time. Text locks a file while it is open there, and Nextcloud refuses what you save in code-server meanwhile; through account access, the save reaches Nextcloud once the lock ends, and then replaces the changes made in Text.')); ?></p>
</div>
