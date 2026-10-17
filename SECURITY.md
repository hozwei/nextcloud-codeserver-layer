<!--
  - SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's private vulnerability reporting: open
the repository's **Security** tab and choose **Report a vulnerability**
([direct link](https://github.com/hozwei/nextcloud-codeserver-layer/security/advisories/new)). Do
not open a public issue for a vulnerability.

Please include what is affected and the version or commit, the steps to reproduce, and what an
attacker gains. We will confirm receipt, keep you informed, and credit you in the advisory unless
you prefer otherwise.

## Scope

In scope: the Nextcloud app in `codeserver_layer/`, the hosting example in `hosting/` (for example a
way past the sign-in that `compose.example.yaml` sets up), the release assets and the workflows in
`.github/workflows/` that build them, and the documentation in `docs/`.

Out of scope, please report to the respective project: vulnerabilities in code-server
([github.com/coder/code-server](https://github.com/coder/code-server)), in Visual Studio Code, in
Nextcloud ([Nextcloud's security policy](https://nextcloud.com/security/)), and the configuration
of a particular code-server, sync or Nextcloud instance, to its operator.

How the app is meant to be secure, and what it does not protect, is in
[docs/security.md](docs/security.md).

## Supported versions

Only the latest [release](https://github.com/hozwei/nextcloud-codeserver-layer/releases) and the
`main` branch are supported. Fixes land on `main` and come out in the next release.
