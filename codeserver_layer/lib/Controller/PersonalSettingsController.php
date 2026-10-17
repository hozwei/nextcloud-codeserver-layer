<?php

declare(strict_types=1);

// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\CodeserverLayer\Controller;

use OCA\CodeserverLayer\AppInfo\Application;
use OCA\CodeserverLayer\Service\AccountAccess;
use OCA\CodeserverLayer\Service\UserFolder;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * Saves the user's own settings (templates/personal.php, src/personal.ts): the folder whose files
 * open in code-server, where an empty folder clears it, and account access. Any user the app is
 * enabled for, for themselves only. A folder that cannot be used saves nothing.
 */
class PersonalSettingsController extends Controller {
	public function __construct(
		IRequest $request,
		private UserFolder $userFolder,
		private AccountAccess $accountAccess,
		private IUserSession $userSession,
		private IL10N $l,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	#[FrontpageRoute(verb: 'POST', url: '/settings/personal')]
	public function save(mixed $folder = '', mixed $account = null): JSONResponse {
		$user = $this->userSession->getUser();
		if ($user === null) {
			return new JSONResponse([], Http::STATUS_UNAUTHORIZED);
		}
		$uid = $user->getUID();
		if (!is_string($folder)) {
			return new JSONResponse(['error' => $this->l->t('This folder does not exist.')], Http::STATUS_BAD_REQUEST);
		}
		if ($account !== null && !is_bool($account)) {
			return new JSONResponse(['error' => $this->l->t('Not a valid choice.')], Http::STATUS_BAD_REQUEST);
		}
		if (trim($folder) === '') {
			$this->userFolder->clear($uid);
		} else {
			$problem = $this->userFolder->set($uid, $folder);
			if ($problem !== null) {
				return new JSONResponse(['error' => $problem], Http::STATUS_BAD_REQUEST);
			}
		}
		if ($account !== null) {
			$this->accountAccess->set($uid, $account);
		}
		return new JSONResponse(['folder' => $this->userFolder->path($uid) ?? '', 'account' => $this->accountAccess->enabled($uid)]);
	}
}
