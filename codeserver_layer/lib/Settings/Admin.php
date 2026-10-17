<?php

declare(strict_types=1);

// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\CodeserverLayer\Settings;

use OCA\CodeserverLayer\AppInfo\Application;
use OCA\CodeserverLayer\Service\Config;
use OCP\App\IAppManager;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IGroupManager;
use OCP\Settings\ISettings;
use OCP\Util;

/**
 * The administrator's form (templates/admin.php, src/admin.ts), rendered on the server; the script
 * submits it to AdminSettingsController and shows the result.
 *
 * Nextcloud shows admin settings also to an administrator the app is not enabled for, but refuses
 * the app's routes to them (HTTP 412). The page says so instead of a bare error on saving.
 */
class Admin implements ISettings {
	public function __construct(
		private Config $config,
		private IAppManager $appManager,
		private IGroupManager $groupManager,
	) {
	}

	public function getForm(): TemplateResponse {
		$url = $this->config->url();
		$workspace = $this->config->workspace();
		$accountWorkspace = $this->config->accountWorkspace();
		$selected = $this->config->newEntries();
		$entries = [];
		foreach (array_keys(Config::NEW_ENTRIES) as $id) {
			$entries[] = ['id' => $id, 'extension' => Config::NEW_ENTRIES[$id], 'name' => $this->config->newEntryName($id), 'selected' => in_array($id, $selected, true)];
		}
		$groups = [];
		foreach ($this->appManager->getAppRestriction(Application::APP_ID) as $gid) {
			$groups[] = $this->groupManager->get($gid)?->getDisplayName() ?? $gid;
		}
		Util::addScript(Application::APP_ID, 'admin');
		Util::addStyle(Application::APP_ID, 'settings');
		return new TemplateResponse(Application::APP_ID, 'admin', [
			'url' => $url,
			'urlProblem' => $url === '' ? null : $this->config->urlProblem($url),
			'workspace' => $workspace,
			'workspaceProblem' => $workspace === '' ? null : $this->config->workspaceProblem($workspace),
			'extensions' => implode(' ', $this->config->extensions()),
			'defaultExtensions' => implode(' ', Config::DEFAULT_EXTENSIONS),
			'filenames' => implode(' ', $this->config->filenames()),
			'defaultFilenames' => implode(' ', Config::DEFAULT_FILENAMES),
			'defaultApp' => $this->config->defaultApp(),
			'newEntries' => $entries,
			'syncHintSeconds' => $this->config->syncHintSeconds(),
			'hint' => $this->config->hint($this->config->defaultApp()),
			'accountWorkspace' => $accountWorkspace,
			'accountWorkspaceProblem' => $accountWorkspace === '' ? null : $this->config->accountWorkspaceProblem($accountWorkspace),
			'accountDefaultApp' => $this->config->accountDefaultApp(),
			'accountSyncHintSeconds' => $this->config->accountSyncHintSeconds(),
			'accountExclude' => implode("\n", $this->config->accountExclude()),
			'accountHint' => $this->config->hint($this->config->accountDefaultApp()),
			'enabledForUser' => $this->appManager->isEnabledForUser(Application::APP_ID),
			'groups' => $groups,
		], '');
	}

	public function getSection(): string {
		return Application::APP_ID;
	}

	public function getPriority(): int {
		return 10;
	}
}
