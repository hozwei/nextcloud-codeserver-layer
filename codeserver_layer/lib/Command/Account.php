<?php

declare(strict_types=1);

// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\CodeserverLayer\Command;

use OCA\CodeserverLayer\Service\AccountAccess;
use OCA\CodeserverLayer\Service\Config;
use OCP\IUserManager;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

/**
 * occ codeserver_layer:account <user> [on|off]: shows or sets a user's account access, with which
 * files anywhere in the user's account open in code-server, as in the personal settings.
 */
class Account extends Command {
	public function __construct(
		private AccountAccess $accountAccess,
		private Config $config,
		private IUserManager $userManager,
	) {
		parent::__construct();
	}

	protected function configure(): void {
		$this->setName('codeserver_layer:account')
			->setDescription('Show or set whether files anywhere in a user\'s account open in code-server (account access)')
			->addArgument('user', InputArgument::REQUIRED, 'The user id')
			->addArgument('state', InputArgument::OPTIONAL, 'on or off');
	}

	protected function execute(InputInterface $input, OutputInterface $output): int {
		$uid = (string)$input->getArgument('user');
		if (!$this->userManager->userExists($uid)) {
			$output->writeln("<error>No user $uid.</error>");
			return 1;
		}
		$state = $input->getArgument('state');
		if ($state !== null) {
			$on = match (strtolower((string)$state)) {
				'on', 'true', 'yes', '1' => true,
				'off', 'false', 'no', '0' => false,
				default => null,
			};
			if ($on === null) {
				$output->writeln('<error>Give on or off.</error>');
				return 1;
			}
			$this->accountAccess->set($uid, $on);
		}
		$on = $this->accountAccess->enabled($uid);
		$output->writeln("Account access of $uid: " . ($on ? 'on' : 'off'));
		if ($on) {
			$output->writeln($this->config->accountUsable()
				? 'code-server has the account at ' . $this->config->accountWorkspace()
				: 'account_workspace is not set or not usable, so files outside the code-server folder still open nothing.');
		}
		return 0;
	}
}
