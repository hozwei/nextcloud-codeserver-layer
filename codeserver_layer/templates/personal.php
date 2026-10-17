<?php
// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/** @var array $_ */
/** @var \OCP\IL10N $l */
?>
<div id="codeserver-layer-personal" class="section">
	<h2><?php p($l->t('code-server')); ?></h2>
	<p class="settings-hint"><?php p($l->t('The folder whose files open in code-server: the one code-server has a working copy of. Files offers "Open in code-server" for the files in it, and "+ New" entries that create a file in code-server.')); ?></p>
<?php if (!$_['usable']): ?>
	<p class="codeserver-settings__notice" role="note"><?php p($l->t('An administrator has yet to set the address of code-server and its working copy. Until then, Files offers nothing.')); ?></p>
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
			<p id="codeserver-layer-folder-hint" class="codeserver-settings__hint"><?php p($l->t('Its path in your files. Leave it empty for no folder. The app keeps the folder itself, so renaming or moving it changes nothing.')); ?></p>
			<p id="codeserver-layer-folder-error" class="codeserver-settings__error" role="alert"></p>
		</div>
		<span></span>
		<div class="codeserver-settings__actions">
			<button type="submit" class="button primary"><?php p($l->t('Save')); ?></button>
			<span class="codeserver-settings__status" role="status" aria-live="polite"></span>
		</div>
	</form>
	<p class="settings-hint"><?php p($l->t('Do not edit a file in Nextcloud Text and in code-server at the same time. Text locks a file while it is open there; if you save it in code-server meanwhile, the sync cannot upload it.')); ?></p>
</div>
