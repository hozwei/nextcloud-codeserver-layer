<?php

declare(strict_types=1);

// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\CodeserverLayer\Listener;

use OCA\CodeserverLayer\AppInfo\Application;
use OCA\CodeserverLayer\Service\AccountAccess;
use OCA\CodeserverLayer\Service\Config;
use OCA\CodeserverLayer\Service\UserFolder;
use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCP\App\IAppManager;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\IUserSession;
use OCP\Util;

/**
 * Adds "Open in code-server" and the "+ New" entries to Files (src/files.ts). Files dispatches
 * the event only on its own page for a logged-in user; public share pages do not, so the entries
 * never appear there. Nextcloud runs the listeners of an app that is enabled only for some groups
 * for every user, so this one checks the group itself. It adds nothing without a usable address,
 * or when neither place opens a file for the user: the code-server folder (a usable working copy
 * and a folder of the user's that still exists) or account access (a usable place of the whole
 * account, turned on by the user).
 *
 * @template-implements IEventListener<LoadAdditionalScriptsEvent>
 */
class LoadFilesScripts implements IEventListener {
	public function __construct(
		private Config $config,
		private UserFolder $userFolder,
		private AccountAccess $accountAccess,
		private IInitialState $initialState,
		private IAppManager $appManager,
		private IUserSession $userSession,
	) {
	}

	public function handle(Event $event): void {
		$user = $this->userSession->getUser();
		if (!$event instanceof LoadAdditionalScriptsEvent || $user === null
			|| !$this->appManager->isEnabledForUser(Application::APP_ID, $user) || !$this->config->urlUsable()) {
			return;
		}
		$uid = $user->getUID();
		$folder = $this->config->workspaceUsable() ? $this->userFolder->path($uid) : null;
		$account = $this->config->accountUsable() && $this->accountAccess->enabled($uid);
		if ($folder === null && !$account) {
			return;
		}
		$extensions = $this->config->extensions();
		$newEntries = [];
		foreach ($this->config->newEntries() as $id) {
			$newEntries[] = ['id' => $id, 'extension' => Config::NEW_ENTRIES[$id], 'name' => $this->config->newEntryName($id)];
		}
		$side = function (bool $defaultApp, int $syncHintSeconds) use ($extensions): array {
			$split = $this->config->clickAndMenu($extensions, $defaultApp);
			return ['click' => $split['click'], 'menu' => $split['menu'], 'defaultApp' => $defaultApp, 'syncHintSeconds' => $syncHintSeconds];
		};
		$this->initialState->provideInitialState('files', [
			'url' => Config::normalizeUrl($this->config->url()),
			'filenames' => $this->config->filenames(),
			'newEntries' => $newEntries,
			'folder' => $folder === null ? null : [
				'path' => $folder,
				'workspace' => $this->config->workspace(),
				...$side($this->config->defaultApp(), $this->config->syncHintSeconds()),
			],
			'account' => !$account ? null : [
				'workspace' => $this->config->accountWorkspace(),
				'exclude' => $this->config->accountExclude(),
				...$side($this->config->accountDefaultApp(), $this->config->accountSyncHintSeconds()),
			],
		]);
		// An init script runs before Files renders its list; it also loads the translations.
		Util::addInitScript(Application::APP_ID, 'files');
		Util::addStyle(Application::APP_ID, 'files');
	}
}
