<?php

declare(strict_types=1);

// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\CodeserverLayer\Listener;

use OCA\CodeserverLayer\AppInfo\Application;
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
 * for every user, so this one checks the group itself. It adds nothing without a usable address
 * and working copy, or without a folder of the user's that still exists.
 *
 * @template-implements IEventListener<LoadAdditionalScriptsEvent>
 */
class LoadFilesScripts implements IEventListener {
	public function __construct(
		private Config $config,
		private UserFolder $userFolder,
		private IInitialState $initialState,
		private IAppManager $appManager,
		private IUserSession $userSession,
	) {
	}

	public function handle(Event $event): void {
		$user = $this->userSession->getUser();
		if (!$event instanceof LoadAdditionalScriptsEvent || $user === null
			|| !$this->appManager->isEnabledForUser(Application::APP_ID, $user) || !$this->config->usable()) {
			return;
		}
		$folder = $this->userFolder->path($user->getUID());
		if ($folder === null) {
			return;
		}
		$defaultApp = $this->config->defaultApp();
		$split = $this->config->clickAndMenu($this->config->extensions(), $defaultApp);
		$newEntries = [];
		foreach ($this->config->newEntries() as $id) {
			$newEntries[] = ['id' => $id, 'extension' => Config::NEW_ENTRIES[$id], 'name' => $this->config->newEntryName($id)];
		}
		$this->initialState->provideInitialState('files', [
			'url' => Config::normalizeUrl($this->config->url()),
			'workspace' => $this->config->workspace(),
			'folder' => $folder,
			'click' => $split['click'],
			'menu' => $split['menu'],
			'filenames' => $this->config->filenames(),
			'defaultApp' => $defaultApp,
			'newEntries' => $newEntries,
			'syncHintSeconds' => $this->config->syncHintSeconds(),
		]);
		// An init script runs before Files renders its list; it also loads the translations.
		Util::addInitScript(Application::APP_ID, 'files');
		Util::addStyle(Application::APP_ID, 'files');
	}
}
