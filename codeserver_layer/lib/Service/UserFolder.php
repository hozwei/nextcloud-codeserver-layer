<?php

declare(strict_types=1);

// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\CodeserverLayer\Service;

use OCA\CodeserverLayer\AppInfo\Application;
use OCP\Config\IUserConfig;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IL10N;
use Psr\Log\LoggerInterface;

/**
 * Each user's folder whose files open in code-server: the folder that code-server's working copy
 * mirrors. Kept as its file id, so it follows renames and moves; resolved to its path on every
 * Files page. Set by the user in the personal settings, or by an administrator with occ
 * (lib/Command/Folder.php), as only the user can pick a folder of their own in the browser.
 */
class UserFolder {
	public const KEY = 'folder';

	public function __construct(
		private IUserConfig $userConfig,
		private IRootFolder $rootFolder,
		private IL10N $l,
		private LoggerInterface $logger,
	) {
	}

	/** The stored file id, as digits, or ''. */
	public function id(string $uid): string {
		$id = $this->userConfig->getValueString($uid, Application::APP_ID, self::KEY, '');
		return preg_match('/^\d{1,20}$/', $id) === 1 ? $id : '';
	}

	/**
	 * The folder's path in the user's files ('/Projects', '/' for their root), or null when none is
	 * set or it no longer exists (deleted, in the trash, no longer shared with them).
	 */
	public function path(string $uid): ?string {
		$id = $this->id($uid);
		if ($id === '') {
			return null;
		}
		try {
			$userFolder = $this->rootFolder->getUserFolder($uid);
			$node = $userFolder->getFirstNodeById((int)$id);
			if (!$node instanceof Folder || !$node->isReadable()) {
				return null;
			}
			$path = $userFolder->getRelativePath($node->getPath());
			return is_string($path) ? ($path === '' ? '/' : $path) : null;
		} catch (\Throwable $e) {
			$this->logger->info('The code-server folder of a user could not be resolved', ['app' => Application::APP_ID, 'exception' => $e]);
			return null;
		}
	}

	/**
	 * Sets the folder at $path in the user's files ('Projects', '/Projects/', ...). Returns what is
	 * wrong with it, or null when it was stored.
	 */
	public function set(string $uid, string $path): ?string {
		$path = '/' . trim(trim($path), '/');
		if (strlen($path) > 4000 || preg_match('/[\x00-\x1f\x7f]/', $path) === 1) {
			return $this->l->t('This folder does not exist.');
		}
		try {
			$node = $this->rootFolder->getUserFolder($uid)->get($path);
		} catch (NotFoundException) {
			return $this->l->t('This folder does not exist.');
		}
		if (!$node instanceof Folder) {
			return $this->l->t('This is a file, not a folder.');
		}
		if (!$node->isReadable()) {
			return $this->l->t('You may not read this folder.');
		}
		$this->userConfig->setValueString($uid, Application::APP_ID, self::KEY, (string)$node->getId());
		return null;
	}

	public function clear(string $uid): void {
		$this->userConfig->deleteUserConfig($uid, Application::APP_ID, self::KEY);
	}
}
