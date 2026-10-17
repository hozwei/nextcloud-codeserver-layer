<?php

declare(strict_types=1);

// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\CodeserverLayer\Service;

use OCA\CodeserverLayer\AppInfo\Application;
use OCP\Files\IMimeTypeDetector;
use OCP\IAppConfig;
use OCP\IL10N;

/**
 * The administrator's settings and the rules for them: the code-server address, the working copy
 * in its container, where code-server has the whole account for account access, the file types
 * that open in code-server, whether a click opens all of them there (the default app, for the
 * code-server folder and for account access each), the "+ New" entries and the warnings about a
 * recent change. The only place with the default lists, the catalogue of "+ New" entries and the
 * types other apps open.
 */
class Config {
	public const KEY_URL = 'url';
	public const KEY_WORKSPACE = 'workspace';
	public const KEY_EXTENSIONS = 'extensions';
	public const KEY_FILENAMES = 'filenames';
	public const KEY_DEFAULT_APP = 'default_app';
	public const KEY_NEW_ENTRIES = 'new_entries';
	public const KEY_SYNC_HINT = 'sync_hint_seconds';
	public const KEY_ACCOUNT_WORKSPACE = 'account_workspace';
	public const KEY_ACCOUNT_DEFAULT_APP = 'account_default_app';
	public const KEY_ACCOUNT_SYNC_HINT = 'account_sync_hint_seconds';
	public const KEY_ACCOUNT_EXCLUDE = 'account_exclude';

	/**
	 * The text and programming formats code-server opens, by extension (docs/nextcloud-app.md).
	 * Left out on purpose: csv, tsv and svg (Office, Text, the Viewer and other apps open them),
	 * formats code-server cannot highlight without an extension that Open VSX lacks (bicep, json5),
	 * and extensions shared with binary formats (pm: PageMaker, m: several languages).
	 */
	public const DEFAULT_EXTENSIONS = [
		'ps1', 'psm1', 'psd1', 'ps1xml', 'pssc', 'psrc', 'bat', 'cmd', 'vbs', 'vb', 'reg',
		'sh', 'bash', 'zsh', 'ksh', 'fish',
		'py', 'pyw', 'pyi',
		'js', 'mjs', 'cjs', 'jsx', 'ts', 'cts', 'tsx', 'vue', 'svelte', 'html', 'htm', 'xhtml', 'css', 'scss', 'sass', 'less',
		'json', 'jsonc', 'jsonl', 'ndjson', 'yaml', 'yml', 'toml', 'xml', 'xsd', 'xsl', 'xslt', 'ini', 'cfg', 'conf', 'cnf', 'properties', 'env',
		'md', 'markdown', 'txt', 'rst', 'adoc', 'tex', 'bib', 'log', 'diff', 'patch',
		'c', 'h', 'cc', 'cpp', 'cxx', 'hh', 'hpp', 'hxx', 'cs', 'java', 'kt', 'kts', 'gradle', 'groovy', 'scala', 'go', 'rs', 'rb', 'pl', 'php', 'lua', 'swift', 'dart', 'r', 'sql',
		'dockerfile', 'mk', 'cmake', 'tf', 'tfvars', 'hcl', 'nix', 'j2', 'jinja', 'graphql', 'gql', 'proto',
	];

	/**
	 * Files known by their name rather than an extension; Nextcloud gives them no type. '*' stands
	 * for any characters. Matched before the extension, in any letter case.
	 */
	public const DEFAULT_FILENAMES = [
		'.gitignore', '.gitattributes', '.gitmodules', '.editorconfig', '.npmrc', '.env', '.env.*',
		'.bashrc', '.profile', '.zshrc', '.dockerignore', 'Dockerfile', 'Dockerfile.*', 'Containerfile',
		'Makefile', 'GNUmakefile', 'Jenkinsfile', 'Vagrantfile', 'Gemfile', 'Rakefile',
	];

	/**
	 * The types Nextcloud Text opens on a click, through the Viewer: a copy of openMimetypes in
	 * Text's src/helpers/mime.js (the same in Text for Nextcloud 34 and 35). The canary compares it
	 * with Text's development branch (.github/workflows/canary.yml).
	 */
	public const TEXT_TYPES = [
		'text/markdown', 'text/x-web-markdown', 'text/plain', 'application/cmd', 'application/x-empty',
		'application/x-msdos-program', 'application/javascript', 'application/json', 'application/x-perl',
		'application/x-php', 'application/x-tex', 'application/xml', 'application/yaml', 'text/asciidoc',
		'text/css', 'text/html', 'text/org', 'text/x-c', 'text/x-c++src', 'text/x-h', 'text/x-java-source',
		'text/x-ldif', 'text/x-nfo', 'text/x-python', 'text/x-shellscript', 'text/csv',
	];

	/** The "+ New" entries: id => extension. Their names come from newEntryName(). */
	public const NEW_ENTRIES = [
		'ps1' => 'ps1', 'psm1' => 'psm1', 'yaml' => 'yaml', 'json' => 'json', 'sh' => 'sh', 'py' => 'py',
		'md' => 'md', 'txt' => 'txt', 'toml' => 'toml', 'ini' => 'ini', 'xml' => 'xml', 'html' => 'html',
		'css' => 'css', 'js' => 'js', 'ts' => 'ts', 'sql' => 'sql', 'bat' => 'bat', 'cmd' => 'cmd',
	];
	public const DEFAULT_NEW_ENTRIES = ['ps1', 'psm1', 'yaml', 'json', 'sh', 'py'];
	public const DEFAULT_SYNC_HINT = 60;
	// A mount such as rclone's keeps a folder's listing for its directory cache time (rclone's
	// --dir-cache-time, often 1 min) and the kernel a file's attributes for a second more.
	public const DEFAULT_ACCOUNT_SYNC_HINT = 65;
	public const MAX_SYNC_HINT = 3600;

	public function __construct(
		private IAppConfig $appConfig,
		private IMimeTypeDetector $detector,
		private IL10N $l,
	) {
	}

	public function url(): string {
		return $this->appConfig->getValueString(Application::APP_ID, self::KEY_URL, '');
	}

	public function workspace(): string {
		return $this->appConfig->getValueString(Application::APP_ID, self::KEY_WORKSPACE, '');
	}

	/** @return list<string> */
	public function extensions(): array {
		$parsed = self::parseExtensions($this->appConfig->getValueString(Application::APP_ID, self::KEY_EXTENSIONS, implode(',', self::DEFAULT_EXTENSIONS)));
		return $parsed[1] === null ? $parsed[0] : array_values(array_filter($parsed[0], fn (string $e) => self::isExtension($e)));
	}

	/** @return list<string> */
	public function filenames(): array {
		$parsed = self::parseFilenames($this->appConfig->getValueString(Application::APP_ID, self::KEY_FILENAMES, implode(',', self::DEFAULT_FILENAMES)));
		return $parsed[1] === null ? $parsed[0] : array_values(array_filter($parsed[0], fn (string $n) => self::isFilename($n)));
	}

	public function defaultApp(): bool {
		return $this->appConfig->getValueBool(Application::APP_ID, self::KEY_DEFAULT_APP, false);
	}

	/** @return list<string> ids from NEW_ENTRIES */
	public function newEntries(): array {
		$value = $this->appConfig->getValueString(Application::APP_ID, self::KEY_NEW_ENTRIES, implode(',', self::DEFAULT_NEW_ENTRIES));
		return array_values(array_filter(self::items($value), fn (string $id) => isset(self::NEW_ENTRIES[$id])));
	}

	public function syncHintSeconds(): int {
		$value = $this->appConfig->getValueInt(Application::APP_ID, self::KEY_SYNC_HINT, self::DEFAULT_SYNC_HINT);
		return max(0, min(self::MAX_SYNC_HINT, $value));
	}

	/** Where code-server has the whole account of a user with account access ('/nextcloud'), or ''. */
	public function accountWorkspace(): string {
		return $this->appConfig->getValueString(Application::APP_ID, self::KEY_ACCOUNT_WORKSPACE, '');
	}

	public function accountDefaultApp(): bool {
		return $this->appConfig->getValueBool(Application::APP_ID, self::KEY_ACCOUNT_DEFAULT_APP, false);
	}

	public function accountSyncHintSeconds(): int {
		$value = $this->appConfig->getValueInt(Application::APP_ID, self::KEY_ACCOUNT_SYNC_HINT, self::DEFAULT_ACCOUNT_SYNC_HINT);
		return max(0, min(self::MAX_SYNC_HINT, $value));
	}

	/**
	 * The folders of the account that code-server does not have where it has the account: its
	 * mount leaves them out (such as a folder with a working copy of its own). Usable ones only.
	 *
	 * @return list<string> paths in the users' files, such as /Projects
	 */
	public function accountExclude(): array {
		return self::parseFolders($this->appConfig->getValueString(Application::APP_ID, self::KEY_ACCOUNT_EXCLUDE, ''))[0];
	}

	/** Whether the address is set and usable: without it the app offers nothing. */
	public function urlUsable(): bool {
		$url = $this->url();
		return $url !== '' && $this->urlProblem($url) === null;
	}

	/** Whether the working copy is set and usable: without it no code-server folder opens. */
	public function workspaceUsable(): bool {
		$workspace = $this->workspace();
		return $workspace !== '' && $this->workspaceProblem($workspace) === null;
	}

	/** Whether the place of the whole account is set and usable: without it there is no account access. */
	public function accountUsable(): bool {
		$workspace = $this->accountWorkspace();
		return $workspace !== '' && $this->accountWorkspaceProblem($workspace) === null;
	}

	/** The address as the browser takes it: with a trailing slash. */
	public static function normalizeUrl(string $url): string {
		$url = trim($url);
		return $url === '' || str_ends_with($url, '/') ? $url : $url . '/';
	}

	/** Why $url cannot be the code-server address, or null. */
	public function urlProblem(string $url): ?string {
		if (strlen($url) > 2000 || preg_match('/[\x00-\x20\x7f]/', $url) === 1) {
			return $this->l->t('Not a valid address.');
		}
		$parts = parse_url($url);
		if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
			return $this->l->t('Not a valid address.');
		}
		$scheme = strtolower($parts['scheme']);
		$host = strtolower($parts['host']);
		if (!self::validHost($host)) {
			return $this->l->t('The host name is not valid. Use letters, digits, hyphens and dots, or an IP address.');
		}
		$local = $host === 'localhost' || $host === '[::1]' || preg_match('/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/', $host) === 1;
		if (isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])
			|| str_contains($url, '?') || str_contains($url, '#')
			|| !($scheme === 'https' || ($scheme === 'http' && $local))) {
			return $this->l->t('Use an https:// address without user name, password, ?query or #fragment (http:// only on localhost).');
		}
		return null;
	}

	/** A host name of letters, digits and hyphens (international names too), a dotted IPv4 address or an IPv6 address in brackets. */
	private static function validHost(string $host): bool {
		if (preg_match('/^\[([^\]]+)\]$/', $host, $m) === 1) {
			return filter_var($m[1], FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false;
		}
		if (preg_match('/^[\d.]+$/', $host) === 1) {
			return filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false;
		}
		foreach (explode('.', $host) as $label) {
			if ($label === '' || strlen($label) > 63 || preg_match('/^[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}-]*[\p{L}\p{N}\p{M}])?$/u', $label) !== 1) {
				return false;
			}
		}
		return strlen($host) <= 253;
	}

	/** The working copy as stored: without a trailing slash. */
	public static function normalizeWorkspace(string $path): string {
		$path = trim($path);
		return strlen($path) > 1 ? rtrim($path, '/') : $path;
	}

	/** Why $path cannot be the working copy in code-server's container, or null. */
	public function workspaceProblem(string $path): ?string {
		return self::validPath($path) ? null : $this->l->t('Use an absolute path in code-server\'s container, such as /workspace, without . or .. and without a slash at the end.');
	}

	/** Why $path cannot be where code-server has the whole account, or null. */
	public function accountWorkspaceProblem(string $path): ?string {
		return self::validPath($path) ? null : $this->l->t('Use an absolute path in code-server\'s container, such as /nextcloud/files, without . or .. and without a slash at the end.');
	}

	/** Absolute, not / itself, without a slash at the end, empty, . or .. segments, control characters or backslashes. */
	private static function validPath(string $path): bool {
		return $path !== '' && $path[0] === '/' && $path !== '/' && strlen($path) <= 1000
			&& preg_match('/[\x00-\x1f\x7f\\\\]/', $path) !== 1
			&& !str_ends_with($path, '/')
			&& !in_array('', array_slice(explode('/', $path), 1), true)
			&& array_intersect(['.', '..'], explode('/', $path)) === [];
	}

	/** @return list<string> the items of a list separated by commas, spaces or lines */
	public static function items(string $value): array {
		return array_values(array_unique(array_filter(preg_split('/[\s,]+/', trim($value)) ?: [], fn (string $item) => $item !== '')));
	}

	public static function isExtension(string $ext): bool {
		return preg_match('/^[a-z0-9][a-z0-9+_-]{0,31}$/', $ext) === 1;
	}

	public static function isFilename(string $name): bool {
		return strlen($name) <= 250 && preg_match('/^[^\/\\\\\x00-\x20\x7f,]+$/', $name) === 1 && $name !== '*' && $name !== '.' && $name !== '..';
	}

	/**
	 * The extensions in $value (a leading dot is dropped, letter case does not matter), and what is
	 * wrong with them, or null.
	 *
	 * @return array{0: list<string>, 1: ?string}
	 */
	public static function parseExtensions(string $value): array {
		$list = [];
		$bad = [];
		foreach (self::items($value) as $item) {
			$ext = strtolower(ltrim($item, '.'));
			if (self::isExtension($ext)) {
				$list[] = $ext;
			} else {
				$bad[] = $item;
			}
		}
		return [array_values(array_unique($list)), $bad === [] ? null : implode(' ', $bad)];
	}

	/**
	 * The folders in $value, one per line, as paths in the users' files ('Projects/' becomes
	 * '/Projects'), and the lines that are none (the root, . or .. segments, control characters,
	 * backslashes), or null.
	 *
	 * @return array{0: list<string>, 1: ?string}
	 */
	public static function parseFolders(string $value): array {
		$list = [];
		$bad = [];
		foreach (preg_split('/\R/', $value) ?: [] as $line) {
			$line = trim($line);
			if ($line === '') {
				continue;
			}
			$path = '/' . trim($line, '/');
			if ($path === '/' || strlen($path) > 4000 || preg_match('/[\x00-\x1f\x7f\\\\]/', $path) === 1
				|| array_intersect(['.', '..'], explode('/', $path)) !== [] || in_array('', array_slice(explode('/', $path), 1), true)) {
				$bad[] = $line;
			} else {
				$list[] = $path;
			}
		}
		return [array_values(array_unique($list)), $bad === [] ? null : implode(', ', $bad)];
	}

	/** @return array{0: list<string>, 1: ?string} the file names in $value, and the invalid ones or null */
	public static function parseFilenames(string $value): array {
		$list = [];
		$bad = [];
		foreach (self::items($value) as $item) {
			if (self::isFilename($item)) {
				$list[] = $item;
			} else {
				$bad[] = $item;
			}
		}
		return [array_values(array_unique($list)), $bad === [] ? null : implode(' ', $bad)];
	}

	/**
	 * Splits the extensions into those a click opens in code-server and those only in the menu.
	 * Like the Craft layer's own and shared types: a type another app in Nextcloud opens on a click
	 * (Nextcloud Text, the Viewer, a PDF viewer, an office app) is shared, and goes to the click
	 * only when the administrator made code-server the default app. File names are always the app's
	 * own: Nextcloud gives them no type.
	 *
	 * @param list<string> $extensions
	 * @return array{click: list<string>, menu: list<string>, shared: list<string>}
	 */
	public function clickAndMenu(array $extensions, bool $defaultApp): array {
		$shared = array_values(array_filter($extensions, fn (string $ext) => $this->opensElsewhere($this->detector->detectPath('file.' . $ext))));
		$own = array_values(array_diff($extensions, $shared));
		return $defaultApp
			? ['click' => $extensions, 'menu' => [], 'shared' => $shared]
			: ['click' => $own, 'menu' => $shared, 'shared' => $shared];
	}

	/** Whether another app in Nextcloud opens files of this type on a click. */
	private function opensElsewhere(string $mime): bool {
		if (in_array($mime, self::TEXT_TYPES, true) || $mime === 'application/pdf'
			|| str_starts_with($mime, 'image/') || str_starts_with($mime, 'video/') || str_starts_with($mime, 'audio/')) {
			return true;
		}
		$aliases = $this->detector->getAllAliases();
		$seen = 0;
		while (isset($aliases[$mime]) && $seen++ < 10) {
			$mime = $aliases[$mime];
		}
		return str_starts_with($mime, 'x-office/');
	}

	/**
	 * What a click opens in code-server with the current lists, as the default app or not: the
	 * lines under the checkboxes for the code-server folder and for account access.
	 */
	public function hint(bool $defaultApp): string {
		$split = $this->clickAndMenu($this->extensions(), $defaultApp);
		if ($defaultApp) {
			return $this->l->t('A click opens all these files in code-server. Where Nextcloud Text opens them otherwise, it stays in the file\'s menu as "View".');
		}
		if ($split['menu'] === []) {
			return $this->l->t('A click opens all these files in code-server.');
		}
		return $this->l->t('A click opens these in code-server: %1$s, and the file names in the list. The others (%2$s) open in Nextcloud Text or another app on a click, and in code-server from the file\'s menu.', [
			$split['click'] === [] ? '–' : implode(' ', $split['click']),
			implode(' ', $split['menu']),
		]);
	}

	/** The name of a "+ New" entry, which Files also proposes as the file name. */
	public function newEntryName(string $id): string {
		return match ($id) {
			'ps1' => $this->l->t('New PowerShell script'),
			'psm1' => $this->l->t('New PowerShell module'),
			'yaml' => $this->l->t('New YAML file'),
			'json' => $this->l->t('New JSON file'),
			'sh' => $this->l->t('New shell script'),
			'py' => $this->l->t('New Python script'),
			'md' => $this->l->t('New Markdown file'),
			'txt' => $this->l->t('New text file'),
			'toml' => $this->l->t('New TOML file'),
			'ini' => $this->l->t('New INI file'),
			'xml' => $this->l->t('New XML file'),
			'html' => $this->l->t('New HTML file'),
			'css' => $this->l->t('New CSS file'),
			'js' => $this->l->t('New JavaScript file'),
			'ts' => $this->l->t('New TypeScript file'),
			'sql' => $this->l->t('New SQL file'),
			'bat' => $this->l->t('New batch file'),
			'cmd' => $this->l->t('New command script'),
			default => $id,
		};
	}
}
