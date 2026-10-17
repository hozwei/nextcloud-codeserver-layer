<?php

declare(strict_types=1);

// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\CodeserverLayer\Service;

use OCA\CodeserverLayer\AppInfo\Application;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\Files\IMimeTypeDetector;
use OCP\Files\IMimeTypeLoader;
use OCP\IAppConfig;
use OCP\IDBConnection;
use OCP\Lock\ILockingProvider;
use Psr\Log\LoggerInterface;

/**
 * File types for the code and text formats Nextcloud 34 and 35 do not know, so that Files shows
 * them with Nextcloud's code icon (docs/nextcloud-app.md, "File types").
 *
 * Nextcloud picks a file's icon by its MIME type, which it stores when it scans or writes the file,
 * from the extension. For an extension it does not know that is application/octet-stream and the
 * plain file icon. This app adds MIME types for such extensions to Nextcloud's
 * config/mimetypemapping.json and aliases to its code icon (text/code) to
 * config/mimetypealiases.json, as the Craft Suite Layer (craftsuite_layer) does for its types. It
 * adds only keys nothing else defines, notes in its own configuration what it added, and takes back
 * what is still unchanged when the app is disabled (the uninstall repair step, which Nextcloud runs
 * on every disable). It does not replace Nextcloud's icon provider.
 *
 * Files that exist already get the new type in one pass over the file cache; on disable they get
 * back the type Nextcloud would give them without these entries.
 */
class FileTypes {
	/**
	 * Extension => [MIME type, the type to send instead for downloads or null]. Where Nextcloud has
	 * a type for a related extension (js for mjs, py for pyi), that type; else the name
	 * freedesktop.org's shared-mime-info gives; else text/x-<name>.
	 */
	public const MAPPINGS = [
		'ps1' => ['application/x-powershell', null],
		'psm1' => ['application/x-powershell', null],
		'psd1' => ['application/x-powershell', null],
		'pssc' => ['application/x-powershell', null],
		'psrc' => ['application/x-powershell', null],
		'ps1xml' => ['application/xml', 'text/plain'],
		'vbs' => ['text/vbscript', null],
		'vb' => ['text/x-vb', null],
		'reg' => ['text/x-ms-regedit', null],
		'zsh' => ['text/x-shellscript', null],
		'ksh' => ['text/x-shellscript', null],
		'fish' => ['application/x-fishscript', null],
		'pyw' => ['text/x-python', null],
		'pyi' => ['text/x-python', null],
		'mjs' => ['application/javascript', 'text/plain'],
		'cjs' => ['application/javascript', 'text/plain'],
		'jsx' => ['application/javascript', 'text/plain'],
		// .ts is also MPEG-TS video, which Nextcloud does not know either (.mts is video/MP2T).
		'ts' => ['application/typescript', null],
		'cts' => ['application/typescript', null],
		'tsx' => ['application/typescript', null],
		'vue' => ['text/x-vue', null],
		'svelte' => ['text/x-svelte', null],
		// Never served as a page the browser would render.
		'xhtml' => ['application/xhtml+xml', 'text/plain'],
		'scss' => ['text/x-scss', null],
		'sass' => ['text/x-sass', null],
		'less' => ['text/x-less', null],
		'jsonc' => ['application/json', 'text/plain'],
		'jsonl' => ['application/x-ndjson', null],
		'ndjson' => ['application/x-ndjson', null],
		'xsd' => ['application/xml', 'text/plain'],
		'xsl' => ['application/xslt+xml', 'text/plain'],
		'xslt' => ['application/xslt+xml', 'text/plain'],
		'ini' => ['text/x-ini', null],
		'cfg' => ['text/x-ini', null],
		'properties' => ['text/x-java-properties', null],
		'env' => ['text/x-dotenv', null],
		'bib' => ['text/x-bibtex', null],
		'log' => ['text/x-log', null],
		'diff' => ['text/x-patch', null],
		'patch' => ['text/x-patch', null],
		'cxx' => ['text/x-c++src', null],
		'hxx' => ['text/x-h', null],
		'cs' => ['text/x-csharp', null],
		'kt' => ['text/x-kotlin', null],
		'kts' => ['text/x-kotlin', null],
		'gradle' => ['text/x-gradle', null],
		'groovy' => ['text/x-groovy', null],
		'scala' => ['text/x-scala', null],
		'go' => ['text/x-go', null],
		'rs' => ['text/rust', null],
		'rb' => ['application/x-ruby', null],
		'lua' => ['text/x-lua', null],
		'swift' => ['text/x-swift', null],
		'dart' => ['application/vnd.dart', null],
		'r' => ['text/x-r', null],
		'sql' => ['application/sql', null],
		'dockerfile' => ['text/x-dockerfile', null],
		'mk' => ['text/x-makefile', null],
		'cmake' => ['text/x-cmake', null],
		'tf' => ['text/x-terraform', null],
		'tfvars' => ['text/x-terraform', null],
		'hcl' => ['text/x-hcl', null],
		'nix' => ['text/x-nix', null],
		'j2' => ['text/x-jinja', null],
		'jinja' => ['text/x-jinja', null],
		'graphql' => ['application/graphql', null],
		'gql' => ['application/graphql', null],
		'proto' => ['text/x-protobuf', null],
	];

	/**
	 * Every new type, and the two types Nextcloud has without an alias, straight to the code icon.
	 * Straight, not through another alias: the icon provider behind Files' /core/mimeicon resolves
	 * aliases in one pass in the list's order, and entries from config/ come after Nextcloud's.
	 */
	public const ALIASES = [
		'application/x-powershell' => 'text/code',
		'application/cmd' => 'text/code',
		'application/x-msdos-program' => 'text/code',
		'text/vbscript' => 'text/code',
		'text/x-vb' => 'text/code',
		'text/x-ms-regedit' => 'text/code',
		'application/x-fishscript' => 'text/code',
		'application/typescript' => 'text/code',
		'text/x-vue' => 'text/code',
		'text/x-svelte' => 'text/code',
		'application/xhtml+xml' => 'text/code',
		'text/x-scss' => 'text/code',
		'text/x-sass' => 'text/code',
		'text/x-less' => 'text/code',
		'application/x-ndjson' => 'text/code',
		'application/xslt+xml' => 'text/code',
		'text/x-ini' => 'text/code',
		'text/x-java-properties' => 'text/code',
		'text/x-dotenv' => 'text/code',
		'text/x-bibtex' => 'text/code',
		'text/x-log' => 'text/code',
		'text/x-patch' => 'text/code',
		'text/x-csharp' => 'text/code',
		'text/x-kotlin' => 'text/code',
		'text/x-gradle' => 'text/code',
		'text/x-groovy' => 'text/code',
		'text/x-scala' => 'text/code',
		'text/x-go' => 'text/code',
		'text/rust' => 'text/code',
		'application/x-ruby' => 'text/code',
		'text/x-lua' => 'text/code',
		'text/x-swift' => 'text/code',
		'application/vnd.dart' => 'text/code',
		'text/x-r' => 'text/code',
		'application/sql' => 'text/code',
		'text/x-dockerfile' => 'text/code',
		'text/x-makefile' => 'text/code',
		'text/x-cmake' => 'text/code',
		'text/x-terraform' => 'text/code',
		'text/x-hcl' => 'text/code',
		'text/x-nix' => 'text/code',
		'text/x-jinja' => 'text/code',
		'application/graphql' => 'text/code',
		'text/x-protobuf' => 'text/code',
	];

	/** Where this app notes the entries it added (JSON: {"mappings": {...}, "aliases": {...}}). */
	public const KEY = 'file_types';
	private const LOCK = 'codeserver_layer/mimetype-config';
	// The Craft Suite Layer writes the same two files under this lock (its lib/Service/FileTypes.php).
	// Taken first, so that the two apps never read and rewrite the files at the same time; it takes
	// only its own, so this order cannot deadlock.
	private const CRAFT_LOCK = 'craftsuite_layer/mimetype-config';

	public function __construct(
		private IMimeTypeDetector $detector,
		private IMimeTypeLoader $loader,
		private IDBConnection $db,
		private IAppConfig $appConfig,
		private ILockingProvider $locking,
		private LoggerInterface $logger,
	) {
	}

	/**
	 * Adds the mappings and aliases nothing else defines, keeps those added before, and gives
	 * existing files the new types. Runs on every enable and app update (repair steps).
	 *
	 * @return string what was done, for the repair step's output
	 */
	public function register(): string {
		return $this->locked(fn () => $this->registerLocked())
			?? 'The MIME type configuration is locked by another run (see the log): the code file types are not registered.';
	}

	private function registerLocked(): string {
		$owned = $this->owned();
		$mappings = $this->detector->getAllMappings();
		$aliases = $this->detector->getAllAliases();
		$wantMappings = [];
		foreach (self::MAPPINGS as $ext => $value) {
			$current = $mappings[$ext] ?? null;
			if ($current === null || (isset($owned['mappings'][$ext]) && self::sameMapping($current, $owned['mappings'][$ext]))) {
				$wantMappings[$ext] = $value;
			}
		}
		$wantAliases = [];
		foreach (self::ALIASES as $type => $alias) {
			$current = $aliases[$type] ?? null;
			if ($current === null || ($owned['aliases'][$type] ?? null) === $current) {
				$wantAliases[$type] = $alias;
			}
		}
		[$now, $ok] = $this->write($owned, $wantMappings, $wantAliases);
		$this->setOwned($now);
		$types = array_map(fn (array $value) => $value[0], $now['mappings']);
		$changed = $this->retype($types);
		return $ok ? sprintf('%d file types and %d aliases registered, %d existing files retyped.', count($now['mappings']), count($now['aliases']), $changed)
			: 'Nextcloud\'s config folder cannot be written (see the log): the code file types are registered only in part, if at all.';
	}

	/**
	 * Takes back the entries this app added that are still unchanged, and gives the files with
	 * those extensions the type Nextcloud gives them without the entries. Runs on every disable.
	 */
	public function unregister(): string {
		return $this->locked(fn () => $this->unregisterLocked())
			?? 'The MIME type configuration is locked by another run (see the log): the code file types stay registered.';
	}

	private function unregisterLocked(): string {
		$owned = $this->owned();
		if ($owned['mappings'] === [] && $owned['aliases'] === []) {
			return 'No code file types to remove.';
		}
		// What the extensions are without this app's entries: another app's own registration (it
		// differs from ours in Nextcloud's list), else the administrator's or Nextcloud's default,
		// else nothing. The files get those types first: should that fail, the entries stay, and the
		// files keep types Nextcloud still knows.
		$mappings = $this->detector->getAllMappings();
		$defaults = $this->readJson(\OC::$SERVERROOT . '/resources/config/mimetypemapping.dist.json') ?? [];
		$config = $this->readJson($this->configPath('mimetypemapping.json')) ?? [];
		$types = [];
		foreach ($owned['mappings'] as $ext => $ours) {
			$current = $mappings[$ext] ?? null;
			$other = $current !== null && !self::sameMapping($current, $ours) ? $current[0] : null;
			$admin = isset($config[$ext]) && $config[$ext] != self::stored($ours) ? $config[$ext][0] ?? null : null;
			$fallback = $admin ?? $defaults[$ext][0] ?? null;
			$types[(string)$ext] = (string)($other ?? (is_string($fallback) ? $fallback : 'application/octet-stream'));
		}
		$changed = $this->retype($types);
		[$now, $ok] = $this->write($owned, [], []);
		$this->setOwned($now);
		return $ok ? sprintf('Code file types removed, %d files retyped.', $changed)
			: sprintf('%d files retyped, but Nextcloud\'s config folder cannot be written (see the log): the code file types stay registered.', $changed);
	}

	/**
	 * The aliases this app added (type => icon name), for pages whose script resolves icons itself
	 * (src/aliases.ts): Nextcloud's own list there comes from occ maintenance:mimetype:update-js.
	 *
	 * @return array<string, string>
	 */
	public function addedAliases(): array {
		return $this->owned()['aliases'];
	}

	/**
	 * Runs $work under the Craft Suite Layer's lock and this app's lock on the MIME type
	 * configuration, from reading what it owns to noting it again; null if another run holds one.
	 *
	 * @param callable(): string $work
	 */
	private function locked(callable $work): ?string {
		$held = [];
		try {
			foreach ([self::CRAFT_LOCK, self::LOCK] as $lock) {
				$this->locking->acquireLock($lock, ILockingProvider::LOCK_EXCLUSIVE);
				$held[] = $lock;
			}
		} catch (\Throwable $e) {
			$this->logger->warning('Could not lock the MIME type configuration', ['app' => Application::APP_ID, 'exception' => $e]);
			$this->release($held);
			return null;
		}
		try {
			return $work();
		} finally {
			$this->release($held);
		}
	}

	/** @param list<string> $held */
	private function release(array $held): void {
		foreach (array_reverse($held) as $lock) {
			$this->locking->releaseLock($lock, ILockingProvider::LOCK_EXCLUSIVE);
		}
	}

	/**
	 * Writes the wanted entries into the config files and removes this app's earlier entries that
	 * are no longer wanted, all only where the file still holds what this app wrote. Returns what
	 * this app owns afterwards (for a file it could not change, what it owned before) and whether
	 * both files could be read and written.
	 *
	 * @param array{mappings: array<string, array{0: string, 1: ?string}>, aliases: array<string, string>} $owned
	 * @param array<string, array{0: string, 1: ?string}> $mappings
	 * @param array<string, string> $aliases
	 * @return array{0: array{mappings: array<string, array{0: string, 1: ?string}>, aliases: array<string, string>}, 1: bool}
	 */
	private function write(array $owned, array $mappings, array $aliases): array {
		$result = $owned;
		$ok = true;
		foreach ([['mimetypemapping.json', 'mappings', $mappings], ['mimetypealiases.json', 'aliases', $aliases]] as [$name, $kind, $wanted]) {
			$path = $this->configPath($name);
			$data = file_exists($path) ? $this->readJson($path) : [];
			if ($data === null) {
				$this->logger->warning('Not changing ' . $path . ': it is not a JSON object', ['app' => Application::APP_ID]);
				$ok = false;
				continue;
			}
			$before = $data;
			$mine = [];
			foreach ($owned[$kind] as $key => $value) {
				// Ours and unchanged, but no longer wanted: removed. Changed meanwhile: left alone.
				if (!array_key_exists($key, $wanted) && array_key_exists($key, $data) && $data[$key] == self::stored($value)) {
					unset($data[$key]);
				}
			}
			foreach ($wanted as $key => $value) {
				$ours = array_key_exists($key, $owned[$kind]) && ($data[$key] ?? null) == self::stored($owned[$kind][$key]);
				if (!array_key_exists($key, $data) || $ours) {
					$data[$key] = self::stored($value);
					$mine[$key] = $value;
				}
			}
			if ($data !== $before && !$this->writeJson($path, $data)) {
				$ok = false;
				continue; // unchanged: what it owned before still holds
			}
			$result[$kind] = $mine;
		}
		return [$result, $ok];
	}

	/**
	 * Gives the files with the extensions in $types (extension => MIME type) that type, in one
	 * pass over the file cache, and returns how many it changed. Also sets the major type
	 * (mimepart), which Nextcloud's searches by type use.
	 *
	 * @param array<string, string> $types
	 */
	private function retype(array $types): int {
		if ($types === []) {
			return 0;
		}
		$select = $this->db->getQueryBuilder();
		$names = [];
		foreach (array_keys($types) as $ext) {
			$names[] = $select->expr()->like($select->func()->lower('name'), $select->createNamedParameter('%.' . $this->db->escapeLikeParameter((string)$ext)));
		}
		$select->select('fileid', 'name', 'mimetype')
			->from('filecache')
			->where($select->expr()->orX(...$names))
			->andWhere($select->expr()->neq('mimetype', $select->createNamedParameter($this->loader->getId('httpd/unix-directory'), IQueryBuilder::PARAM_INT)));
		$result = $select->executeQuery();
		$byType = [];
		while (($row = $result->fetch()) !== false) {
			$type = $types[self::extension((string)$row['name'])] ?? null;
			if ($type !== null && (int)$row['mimetype'] !== $this->loader->getId($type)) {
				$byType[$type][] = (int)$row['fileid'];
			}
		}
		$result->closeCursor();
		$changed = 0;
		foreach ($byType as $type => $ids) {
			$id = $this->loader->getId($type);
			$part = $this->loader->getId(explode('/', $type)[0]);
			foreach (array_chunk($ids, 1000) as $chunk) {
				$update = $this->db->getQueryBuilder();
				$update->update('filecache')
					->set('mimetype', $update->createNamedParameter($id, IQueryBuilder::PARAM_INT))
					->set('mimepart', $update->createNamedParameter($part, IQueryBuilder::PARAM_INT))
					->where($update->expr()->in('fileid', $update->createNamedParameter($chunk, IQueryBuilder::PARAM_INT_ARRAY)));
				$changed += $update->executeStatement();
			}
		}
		return $changed;
	}

	/** The extension Nextcloud types a file by: after the last dot, not a leading one, in lower case. */
	public static function extension(string $name): string {
		$dot = strrpos($name, '.');
		return $dot === false || $dot === 0 ? '' : strtolower(substr($name, $dot + 1));
	}

	/** @return array{mappings: array<string, array{0: string, 1: ?string}>, aliases: array<string, string>} */
	private function owned(): array {
		$owned = json_decode($this->appConfig->getValueString(Application::APP_ID, self::KEY, ''), true);
		$mappings = [];
		foreach ((array)($owned['mappings'] ?? []) as $ext => $value) {
			if (is_string($ext) && is_array($value) && is_string($value[0] ?? null)) {
				$mappings[$ext] = [$value[0], is_string($value[1] ?? null) ? $value[1] : null];
			}
		}
		$aliases = array_filter((array)($owned['aliases'] ?? []), fn ($value, $key) => is_string($key) && is_string($value), ARRAY_FILTER_USE_BOTH);
		return ['mappings' => $mappings, 'aliases' => $aliases];
	}

	/** @param array{mappings: array<string, array{0: string, 1: ?string}>, aliases: array<string, string>} $owned */
	private function setOwned(array $owned): void {
		if ($owned['mappings'] === [] && $owned['aliases'] === []) {
			$this->appConfig->deleteKey(Application::APP_ID, self::KEY);
		} else {
			$this->appConfig->setValueString(Application::APP_ID, self::KEY, json_encode($owned, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
		}
	}

	/**
	 * A mapping or alias as config/*.json hold it: an alias is a string, a mapping a list of the
	 * type and, if there is one, the type to send instead.
	 *
	 * @param string|array{0: string, 1: ?string} $value
	 * @return string|list<string>
	 */
	private static function stored(string|array $value): string|array {
		return is_string($value) ? $value : array_values(array_filter($value, fn ($type) => $type !== null));
	}

	/**
	 * @param array<array-key, mixed>|null $current
	 * @param array{0: string, 1: ?string} $ours
	 */
	private static function sameMapping(?array $current, array $ours): bool {
		return $current !== null && ($current[0] ?? null) === $ours[0] && ($current[1] ?? null) === $ours[1];
	}

	private function configPath(string $name): string {
		// Nextcloud reads its custom MIME type files from its config folder (\OC::$configDir, which
		// ends with a slash).
		return \OC::$configDir . $name;
	}

	/** @return array<array-key, mixed>|null */
	private function readJson(string $path): ?array {
		$text = @file_get_contents($path);
		if ($text === false) {
			return null;
		}
		$data = json_decode($text, true);
		return is_array($data) ? $data : null;
	}

	/** @param array<array-key, mixed> $data */
	private function writeJson(string $path, array $data): bool {
		// A file left without entries goes: it would only say what Nextcloud has without it.
		if ($data === []) {
			return @unlink($path) || !file_exists($path);
		}
		// Written next to the file and renamed over it, so Nextcloud never reads half a file.
		$temp = $path . '.codeserver-layer.tmp';
		$json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
		if ($json === false || @file_put_contents($temp, $json . "\n") === false || !@rename($temp, $path)) {
			@unlink($temp);
			$this->logger->warning('Could not write ' . $path, ['app' => Application::APP_ID]);
			return false;
		}
		return true;
	}
}
