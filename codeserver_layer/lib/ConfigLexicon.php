<?php

declare(strict_types=1);

// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\CodeserverLayer;

use OCA\CodeserverLayer\Service\AccountAccess;
use OCA\CodeserverLayer\Service\Config;
use OCA\CodeserverLayer\Service\FileTypes;
use OCA\CodeserverLayer\Service\UserFolder;
use OCP\Config\Lexicon\Entry;
use OCP\Config\Lexicon\ILexicon;
use OCP\Config\Lexicon\Strictness;
use OCP\Config\ValueType;
use OCP\IAppConfig;

/**
 * The app's configuration keys. Nextcloud uses this for the type and default of each key and
 * shows the definitions in occ config:app:get --details; an unknown key (a typo in occ) is
 * refused and logged (Strictness::WARNING).
 */
class ConfigLexicon implements ILexicon {
	public function getStrictness(): Strictness {
		return Strictness::WARNING;
	}

	public function getAppConfigs(): array {
		// All but file_types are read on every Files page, so none is lazy.
		return [
			new Entry(
				key: Config::KEY_URL,
				type: ValueType::STRING,
				defaultRaw: '',
				definition: 'Address of code-server as the browser opens it, e.g. https://code.example.com/ (https; http only on localhost)',
				note: 'occ does not check the address; an unusable one leaves Files without the entries. The admin settings page checks it.',
			),
			new Entry(
				key: Config::KEY_WORKSPACE,
				type: ValueType::STRING,
				defaultRaw: '',
				definition: 'Absolute path of the working copy in code-server\'s container, the copy of each user\'s code-server folder, e.g. /workspace',
			),
			new Entry(
				key: Config::KEY_EXTENSIONS,
				type: ValueType::STRING,
				defaultRaw: implode(',', Config::DEFAULT_EXTENSIONS),
				definition: 'File extensions that open in code-server, separated by commas',
			),
			new Entry(
				key: Config::KEY_FILENAMES,
				type: ValueType::STRING,
				defaultRaw: implode(',', Config::DEFAULT_FILENAMES),
				definition: 'File names that open in code-server, separated by commas; * stands for any characters',
			),
			new Entry(
				key: Config::KEY_DEFAULT_APP,
				type: ValueType::BOOL,
				defaultRaw: false,
				definition: 'Whether code-server is the default app: a click in Files opens all the listed files in it, also those Nextcloud Text or another app opens otherwise',
			),
			new Entry(
				key: Config::KEY_NEW_ENTRIES,
				type: ValueType::STRING,
				defaultRaw: implode(',', Config::DEFAULT_NEW_ENTRIES),
				definition: 'Entries in the "+ New" menu of Files, separated by commas, from: ' . implode(', ', array_keys(Config::NEW_ENTRIES)),
			),
			new Entry(
				key: Config::KEY_SYNC_HINT,
				type: ValueType::INT,
				defaultRaw: Config::DEFAULT_SYNC_HINT,
				definition: 'Seconds after a change in Nextcloud during which opening a file warns that the working copy may not have it yet; 0 turns the warning off',
			),
			new Entry(
				key: Config::KEY_ACCOUNT_WORKSPACE,
				type: ValueType::STRING,
				defaultRaw: '',
				definition: 'Absolute path in code-server\'s container where code-server has the whole account of a user with account access, e.g. /nextcloud/files; empty: no account access',
				note: 'This place holds one account\'s files: only the user whose account it is should turn on account access (occ codeserver_layer:account).',
			),
			new Entry(
				key: Config::KEY_ACCOUNT_DEFAULT_APP,
				type: ValueType::BOOL,
				defaultRaw: false,
				definition: 'Whether code-server is the default app for account access: a click anywhere outside the code-server folder opens all the listed files in it, also those Nextcloud Text or another app opens otherwise',
			),
			new Entry(
				key: Config::KEY_ACCOUNT_SYNC_HINT,
				type: ValueType::INT,
				defaultRaw: Config::DEFAULT_ACCOUNT_SYNC_HINT,
				definition: 'Seconds after a change in Nextcloud during which opening a file through account access warns that code-server may not have it yet (at least the mount\'s directory cache time); 0 turns the warning off',
			),
			new Entry(
				key: Config::KEY_ACCOUNT_EXCLUDE,
				type: ValueType::STRING,
				defaultRaw: '',
				definition: 'Folders of the account that code-server does not have at account_workspace (its mount leaves them out), one path per line, e.g. /Projects; account access offers nothing in them',
				note: 'A mount that leaves a folder out may still write into it; without this, a file there would open as missing and saving it would replace the one in Nextcloud.',
			),
			new Entry(
				key: FileTypes::KEY,
				type: ValueType::STRING,
				defaultRaw: '',
				definition: 'The MIME type mappings and aliases this app added to Nextcloud\'s config/mimetypemapping.json and mimetypealiases.json (JSON); it removes them when it is disabled',
				// Read on every page of a logged-in user (src/aliases.ts), so not lazy.
				lazy: false,
				flags: IAppConfig::FLAG_INTERNAL,
			),
		];
	}

	public function getUserConfigs(): array {
		return [
			new Entry(
				key: UserFolder::KEY,
				type: ValueType::STRING,
				defaultRaw: '',
				definition: 'File id of the user\'s folder whose files open in code-server (set in the personal settings or with occ codeserver_layer:folder)',
			),
			new Entry(
				key: AccountAccess::KEY,
				type: ValueType::BOOL,
				defaultRaw: false,
				definition: 'Account access: whether files anywhere in the user\'s account open in code-server, from account_workspace (set in the personal settings or with occ codeserver_layer:account)',
			),
		];
	}
}
