<?php

declare(strict_types=1);

// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\CodeserverLayer\Listener;

use OCA\CodeserverLayer\AppInfo\Application;
use OCA\CodeserverLayer\Service\FileTypes;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * Gives the browser the aliases of the file types this app added (src/aliases.ts), on every page
 * of a logged-in user, for everyone: the types apply to all users, and pages that resolve icons
 * themselves (Recommended files, Talk) would show Nextcloud's generic icon for them otherwise.
 *
 * @template-implements IEventListener<BeforeTemplateRenderedEvent>
 */
class AddMimeTypeAliases implements IEventListener {
	public function __construct(
		private FileTypes $fileTypes,
		private IInitialState $initialState,
	) {
	}

	public function handle(Event $event): void {
		if (!$event instanceof BeforeTemplateRenderedEvent || !$event->isLoggedIn()) {
			return;
		}
		$aliases = $this->fileTypes->addedAliases();
		if ($aliases === []) {
			return;
		}
		$this->initialState->provideInitialState('aliases', $aliases);
		Util::addScript(Application::APP_ID, 'aliases');
	}
}
