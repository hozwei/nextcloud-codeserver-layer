<?php

declare(strict_types=1);

// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\CodeserverLayer\Command;

use OCA\CodeserverLayer\Service\UserFolder;
use OCP\IUserManager;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

/**
 * occ codeserver_layer:folder <user> [<path>] [--clear]: shows, sets or clears a user's folder
 * whose files open in code-server. The path is the folder's path in the user's files; it is
 * stored as the folder's file id, as in the personal settings.
 */
class Folder extends Command {
	public function __construct(
		private UserFolder $userFolder,
		private IUserManager $userManager,
	) {
		parent::__construct();
	}

	protected function configure(): void {
		$this->setName('codeserver_layer:folder')
			->setDescription('Show, set or clear the folder of a user whose files open in code-server')
			->addArgument('user', InputArgument::REQUIRED, 'The user id')
			->addArgument('path', InputArgument::OPTIONAL, 'The folder\'s path in the user\'s files, such as /Projects')
			->addOption('clear', null, InputOption::VALUE_NONE, 'Clear the folder: no files open in code-server for the user');
	}

	protected function execute(InputInterface $input, OutputInterface $output): int {
		$uid = (string)$input->getArgument('user');
		if (!$this->userManager->userExists($uid)) {
			$output->writeln("<error>No user $uid.</error>");
			return 1;
		}
		$path = $input->getArgument('path');
		if ($input->getOption('clear')) {
			if ($path !== null) {
				$output->writeln('<error>Give either a path or --clear.</error>');
				return 1;
			}
			$this->userFolder->clear($uid);
			$output->writeln("Cleared the code-server folder of $uid.");
			return 0;
		}
		if ($path !== null) {
			$problem = $this->userFolder->set($uid, (string)$path);
			if ($problem !== null) {
				$output->writeln("<error>$problem</error>");
				return 1;
			}
		}
		$id = $this->userFolder->id($uid);
		if ($id === '') {
			$output->writeln("$uid has no code-server folder.");
			return $path === null ? 0 : 1;
		}
		$resolved = $this->userFolder->path($uid);
		$output->writeln($resolved === null
			? "The code-server folder of $uid (file id $id) no longer exists."
			: "The code-server folder of $uid: $resolved (file id $id)");
		return $resolved === null ? 1 : 0;
	}
}
