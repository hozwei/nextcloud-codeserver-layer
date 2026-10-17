<?php

declare(strict_types=1);

// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\CodeserverLayer\Settings;

use OCA\CodeserverLayer\AppInfo\Application;
use OCA\CodeserverLayer\Service\AccountAccess;
use OCA\CodeserverLayer\Service\Config;
use OCA\CodeserverLayer\Service\UserFolder;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IUserSession;
use OCP\Settings\ISettings;
use OCP\Util;

/**
 * The user's folder whose files open in code-server, and account access (templates/personal.php,
 * src/personal.ts). Nextcloud shows personal settings only to users the app is enabled for.
 */
class Personal implements ISettings {
	public function __construct(
		private Config $config,
		private UserFolder $userFolder,
		private AccountAccess $accountAccess,
		private IUserSession $userSession,
	) {
	}

	public function getForm(): TemplateResponse {
		$uid = $this->userSession->getUser()?->getUID() ?? '';
		$path = $uid === '' ? null : $this->userFolder->path($uid);
		Util::addScript(Application::APP_ID, 'personal');
		Util::addStyle(Application::APP_ID, 'settings');
		return new TemplateResponse(Application::APP_ID, 'personal', [
			'folder' => $path ?? '',
			// A folder was set, but it is gone (deleted, in the trash, no longer shared).
			'missing' => $path === null && $uid !== '' && $this->userFolder->id($uid) !== '',
			'urlUsable' => $this->config->urlUsable(),
			'workspaceUsable' => $this->config->workspaceUsable(),
			'workspace' => $this->config->workspace(),
			'account' => $uid !== '' && $this->accountAccess->enabled($uid),
			'accountUsable' => $this->config->accountUsable(),
			'accountWorkspace' => $this->config->accountWorkspace(),
		], '');
	}

	public function getSection(): string {
		return Application::APP_ID;
	}

	public function getPriority(): int {
		return 10;
	}
}
