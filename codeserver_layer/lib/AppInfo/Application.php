<?php

declare(strict_types=1);

// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\CodeserverLayer\AppInfo;

use OCA\CodeserverLayer\ConfigLexicon;
use OCA\CodeserverLayer\Listener\AddMimeTypeAliases;
use OCA\CodeserverLayer\Listener\LoadFilesScripts;
use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;

/**
 * Entry point of the app. Nextcloud finds this class through <namespace> in appinfo/info.xml
 * (OCA\<namespace>\AppInfo\Application), so the two must stay in sync.
 */
class Application extends App implements IBootstrap {
	public const APP_ID = 'codeserver_layer';

	public function __construct() {
		parent::__construct(self::APP_ID);
	}

	public function register(IRegistrationContext $context): void {
		// "Open in code-server" and the "+ New" entries in Files. The event class belongs to the
		// Files app; the listener only runs when Files renders its page.
		$context->registerEventListener(LoadAdditionalScriptsEvent::class, LoadFilesScripts::class);
		// The aliases of the file types this app added, for the pages that pick icons in the browser.
		$context->registerEventListener(BeforeTemplateRenderedEvent::class, AddMimeTypeAliases::class);
		// Declares the app's keys (Nextcloud 32+): type, default and a description for occ.
		$context->registerConfigLexicon(ConfigLexicon::class);
	}

	public function boot(IBootContext $context): void {
		// Deliberately empty: boot() runs on every request that loads the app, so the work belongs
		// in event listeners, which run only when needed.
	}
}
