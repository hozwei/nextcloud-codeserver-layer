<?php
// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/** @var array $_ */
/** @var \OCP\IL10N $l */
$error = static fn (?string $problem): string => $problem === null ? '' : $problem;
?>
<div id="codeserver-layer-admin" class="section">
	<h2><?php p($l->t('code-server')); ?></h2>
	<p class="settings-hint"><?php p($l->t('Files offers "Open in code-server" for the files in each user\'s code-server folder, which users choose in their personal settings. code-server opens them from its working copy of that folder; a sync between Nextcloud and the working copy is not part of this app.')); ?></p>
<?php if (!$_['enabledForUser']): ?>
	<p class="codeserver-settings__notice" role="note"><?php p($_['groups'] === []
		? $l->t('The app is not enabled for your account, so this page cannot save. Use an account the app is enabled for, or occ config:app:set codeserver_layer.')
		: $l->t('The app is enabled only for the groups %s, and not for your account, so this page cannot save. Use an account in one of these groups, or occ config:app:set codeserver_layer.', [implode(', ', $_['groups'])])); ?></p>
<?php endif; ?>
	<form class="codeserver-settings" novalidate data-enabled="<?php p($_['enabledForUser'] ? 'true' : 'false'); ?>">
		<label for="codeserver-layer-url"><?php p($l->t('Address of code-server')); ?></label>
		<div>
			<input id="codeserver-layer-url" name="url" type="url" value="<?php p($_['url']); ?>" placeholder="https://code.example.com/"
				autocomplete="off" spellcheck="false" aria-describedby="codeserver-layer-url-error codeserver-layer-url-hint">
			<p id="codeserver-layer-url-hint" class="codeserver-settings__hint"><?php p($l->t('As the browser opens it. A sign-in in front of code-server is up to its hosting; this app hands over nothing but the address of the file.')); ?></p>
			<p id="codeserver-layer-url-error" class="codeserver-settings__error" role="alert"><?php p($error($_['urlProblem'])); ?></p>
		</div>

		<label for="codeserver-layer-workspace"><?php p($l->t('Working copy in code-server\'s container')); ?></label>
		<div>
			<input id="codeserver-layer-workspace" name="workspace" type="text" value="<?php p($_['workspace']); ?>" placeholder="/workspace"
				autocomplete="off" spellcheck="false" aria-describedby="codeserver-layer-workspace-error codeserver-layer-workspace-hint">
			<p id="codeserver-layer-workspace-hint" class="codeserver-settings__hint"><?php p($l->t('Where code-server sees each user\'s code-server folder. A file /Projects/My App/a.ps1 in a folder /Projects opens as <working copy>/My App/a.ps1, in the project folder <working copy>/My App.')); ?></p>
			<p id="codeserver-layer-workspace-error" class="codeserver-settings__error" role="alert"><?php p($error($_['workspaceProblem'])); ?></p>
		</div>

		<label for="codeserver-layer-extensions"><?php p($l->t('File extensions')); ?></label>
		<div>
			<textarea id="codeserver-layer-extensions" name="extensions" rows="4" spellcheck="false"
				aria-describedby="codeserver-layer-extensions-error"><?php p($_['extensions']); ?></textarea>
			<button type="button" class="codeserver-settings__restore" data-target="codeserver-layer-extensions" data-value="<?php p($_['defaultExtensions']); ?>"><?php p($l->t('Restore the default list')); ?></button>
			<p id="codeserver-layer-extensions-error" class="codeserver-settings__error" role="alert"></p>
		</div>

		<label for="codeserver-layer-filenames"><?php p($l->t('File names')); ?></label>
		<div>
			<textarea id="codeserver-layer-filenames" name="filenames" rows="2" spellcheck="false"
				aria-describedby="codeserver-layer-filenames-hint codeserver-layer-filenames-error"><?php p($_['filenames']); ?></textarea>
			<button type="button" class="codeserver-settings__restore" data-target="codeserver-layer-filenames" data-value="<?php p($_['defaultFilenames']); ?>"><?php p($l->t('Restore the default list')); ?></button>
			<p id="codeserver-layer-filenames-hint" class="codeserver-settings__hint"><?php p($l->t('Files without an extension, such as Dockerfile or .gitignore, in any letter case. * stands for any characters, as in .env.*')); ?></p>
			<p id="codeserver-layer-filenames-error" class="codeserver-settings__error" role="alert"></p>
		</div>

		<span><?php p($l->t('On a click')); ?></span>
		<div>
			<label class="codeserver-settings__check">
				<input id="codeserver-layer-default-app" name="defaultApp" type="checkbox"<?php if ($_['defaultApp']): ?> checked<?php endif; ?>
					aria-describedby="codeserver-layer-hint">
				<span><?php p($l->t('Default app: a click opens all these files in code-server, also those Nextcloud Text or another app opens otherwise')); ?></span>
			</label>
			<p id="codeserver-layer-hint" class="codeserver-settings__hint" data-hint><?php p($_['hint']); ?></p>
		</div>

		<span id="codeserver-layer-new-label"><?php p($l->t('"+ New" menu')); ?></span>
		<fieldset class="codeserver-settings__entries" aria-labelledby="codeserver-layer-new-label" aria-describedby="codeserver-layer-newEntries-error">
<?php foreach ($_['newEntries'] as $entry): ?>
			<label class="codeserver-settings__check">
				<input type="checkbox" name="newEntries" value="<?php p($entry['id']); ?>"<?php if ($entry['selected']): ?> checked<?php endif; ?>>
				<span><?php p($entry['name']); ?> <span class="codeserver-settings__ext">.<?php p($entry['extension']); ?></span></span>
			</label>
<?php endforeach; ?>
			<p id="codeserver-layer-newEntries-error" class="codeserver-settings__error" role="alert"></p>
		</fieldset>

		<label for="codeserver-layer-sync-hint"><?php p($l->t('Sync warning')); ?></label>
		<div>
			<input id="codeserver-layer-sync-hint" name="syncHintSeconds" type="number" min="0" max="3600" step="1" value="<?php p((string)$_['syncHintSeconds']); ?>"
				aria-describedby="codeserver-layer-sync-hint-hint codeserver-layer-syncHintSeconds-error">
			<p id="codeserver-layer-sync-hint-hint" class="codeserver-settings__hint"><?php p($l->t('Seconds after a change in Nextcloud during which opening the file first warns that code-server may not have the change yet. 0 turns the warning off.')); ?></p>
			<p id="codeserver-layer-syncHintSeconds-error" class="codeserver-settings__error" role="alert"></p>
		</div>

		<span></span>
		<div class="codeserver-settings__actions">
			<button type="submit" class="button primary"<?php if (!$_['enabledForUser']): ?> disabled<?php endif; ?>><?php p($l->t('Save')); ?></button>
			<span class="codeserver-settings__status" role="status" aria-live="polite"></span>
		</div>
	</form>
</div>
