<?php

declare(strict_types=1);

// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\CodeserverLayer\Service;

use OCA\CodeserverLayer\AppInfo\Application;
use OCP\Config\IUserConfig;

/**
 * Account access, per user: whether files anywhere in the user's account open in code-server,
 * from where code-server has the whole account (Config::accountWorkspace()). Off by default, as
 * that place holds one account's files: only the user whose account code-server has should turn
 * it on. Set in the personal settings, or by an administrator with occ (lib/Command/Account.php).
 */
class AccountAccess {
	public const KEY = 'account';

	public function __construct(
		private IUserConfig $userConfig,
	) {
	}

	public function enabled(string $uid): bool {
		return $this->userConfig->getValueBool($uid, Application::APP_ID, self::KEY, false);
	}

	public function set(string $uid, bool $on): void {
		if ($on) {
			$this->userConfig->setValueBool($uid, Application::APP_ID, self::KEY, true);
		} else {
			$this->userConfig->deleteUserConfig($uid, Application::APP_ID, self::KEY);
		}
	}
}
