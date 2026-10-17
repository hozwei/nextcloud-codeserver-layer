<?php

declare(strict_types=1);

// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\CodeserverLayer\Controller;

use OCA\CodeserverLayer\AppInfo\Application;
use OCA\CodeserverLayer\Service\Config;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\PasswordConfirmationRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IAppConfig;
use OCP\IL10N;
use OCP\IRequest;

/**
 * Saves the administrator's settings (templates/admin.php, src/admin.ts). Administrators only (no
 * NoAdminRequired), with a recent password confirmation: the address decides where the links in
 * Files point. Every field is checked first; one bad field saves nothing.
 *
 * Like every route of an app, Nextcloud refuses it for an administrator the app is not enabled for
 * (412, or 404 without a local memory cache); the settings page says so before (Settings/Admin.php).
 */
class AdminSettingsController extends Controller {
	public function __construct(
		IRequest $request,
		private Config $config,
		private IAppConfig $appConfig,
		private IL10N $l,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[PasswordConfirmationRequired]
	#[FrontpageRoute(verb: 'POST', url: '/settings/admin')]
	public function save(
		mixed $url = '',
		mixed $workspace = '',
		mixed $extensions = '',
		mixed $filenames = '',
		mixed $defaultApp = false,
		mixed $newEntries = [],
		mixed $syncHintSeconds = Config::DEFAULT_SYNC_HINT,
	): JSONResponse {
		$errors = [];

		$url = is_string($url) ? Config::normalizeUrl($url) : null;
		if ($url === null) {
			$errors['url'] = $this->l->t('Not a valid address.');
		} elseif ($url !== '') {
			$problem = $this->config->urlProblem($url);
			if ($problem !== null) {
				$errors['url'] = $problem;
			}
		}

		$workspace = is_string($workspace) ? Config::normalizeWorkspace($workspace) : null;
		if ($workspace === null) {
			$errors['workspace'] = $this->l->t('Use an absolute path in code-server\'s container, such as /workspace, without . or .. and without a slash at the end.');
		} elseif ($workspace !== '') {
			$problem = $this->config->workspaceProblem($workspace);
			if ($problem !== null) {
				$errors['workspace'] = $problem;
			}
		}

		[$extensionList, $badExtensions] = is_string($extensions) ? Config::parseExtensions($extensions) : [[], '?'];
		if ($badExtensions !== null) {
			$errors['extensions'] = $this->l->t('Not a file extension: %s. Use letters, digits, + - and _.', [$badExtensions]);
		}
		[$filenameList, $badFilenames] = is_string($filenames) ? Config::parseFilenames($filenames) : [[], '?'];
		if ($badFilenames !== null) {
			$errors['filenames'] = $this->l->t('Not a file name: %s. File names have no slashes, spaces or commas.', [$badFilenames]);
		}

		if (!is_bool($defaultApp)) {
			$errors['defaultApp'] = $this->l->t('Not a valid choice.');
		}

		$entries = is_array($newEntries) ? array_values(array_unique(array_filter($newEntries, 'is_string'))) : null;
		if ($entries === null || array_diff($entries, array_keys(Config::NEW_ENTRIES)) !== []) {
			$errors['newEntries'] = $this->l->t('Not a valid choice.');
		}

		$seconds = is_int($syncHintSeconds) || (is_string($syncHintSeconds) && preg_match('/^\d{1,4}$/', $syncHintSeconds) === 1)
			? (int)$syncHintSeconds : -1;
		if ($seconds < 0 || $seconds > Config::MAX_SYNC_HINT) {
			$errors['syncHintSeconds'] = $this->l->t('Use a number of seconds from 0 to %s.', [(string)Config::MAX_SYNC_HINT]);
		}

		if ($errors !== []) {
			return new JSONResponse(['errors' => $errors], Http::STATUS_BAD_REQUEST);
		}

		$this->setOrDelete(Config::KEY_URL, (string)$url);
		$this->setOrDelete(Config::KEY_WORKSPACE, (string)$workspace);
		$this->appConfig->setValueString(Application::APP_ID, Config::KEY_EXTENSIONS, implode(',', $extensionList));
		$this->appConfig->setValueString(Application::APP_ID, Config::KEY_FILENAMES, implode(',', $filenameList));
		$this->appConfig->setValueBool(Application::APP_ID, Config::KEY_DEFAULT_APP, (bool)$defaultApp);
		$this->appConfig->setValueString(Application::APP_ID, Config::KEY_NEW_ENTRIES, implode(',', (array)$entries));
		$this->appConfig->setValueInt(Application::APP_ID, Config::KEY_SYNC_HINT, $seconds);

		return new JSONResponse([
			'url' => $url,
			'workspace' => $workspace,
			'extensions' => implode(' ', $extensionList),
			'filenames' => implode(' ', $filenameList),
			'hint' => $this->config->hint(),
		]);
	}

	private function setOrDelete(string $key, string $value): void {
		if ($value === '') {
			$this->appConfig->deleteKey(Application::APP_ID, $key);
		} else {
			$this->appConfig->setValueString(Application::APP_ID, $key, $value);
		}
	}
}
