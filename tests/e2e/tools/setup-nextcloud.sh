#!/bin/sh
# SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Sets up a test Nextcloud in a Docker container (the official image, with the app in
# custom_apps/codeserver_layer) for the specs nextcloud-*.spec.ts: waits until it is installed,
# adds the group and accounts the specs use, enables the app for the group, and points it to the
# stand-in for code-server. With a craftsuite_layer release archive, unpacks it into custom_apps for
# the test next to the Craft Suite Layer (the spec enables it).
#
#   tests/e2e/tools/setup-nextcloud.sh <container> <nextcloud url> [craftsuite_layer-<v>.tar.gz]
#
# Environment: E2E_PASSWORD_SUFFIX (the accounts' passwords, as in tests/e2e/lib/nextcloud.ts),
# CAPTURE_PORT (the stand-in's port, default 8791).

set -eu
container=$1
url=$2
craft=${3:-}
suffix=${E2E_PASSWORD_SUFFIX:--password-7f3a}
port=${CAPTURE_PORT:-8791}

occ() { docker exec -u www-data "$container" php occ "$@"; }

# The image installs Nextcloud on its first start.
tries=0
until curl -fsS "$url/status.php" 2>/dev/null | grep -q '"installed":true'; do
  tries=$((tries + 1))
  [ "$tries" -lt 120 ] || { echo "Nextcloud at $url did not install in time" >&2; exit 1; }
  sleep 5
done

occ app:disable firstrunwizard >/dev/null 2>&1 || true
occ group:add code >/dev/null 2>&1 || true
occ group:adduser code admin
for user in e2e-user e2e-admin2 e2e-other; do
  docker exec -e OC_PASS="e2e-$user$suffix" -u www-data "$container" php occ user:add --password-from-env "$user" >/dev/null 2>&1 || true
done
occ group:adduser code e2e-user
occ group:adduser admin e2e-admin2
occ app:enable -g code codeserver_layer
occ config:app:set codeserver_layer url --value="http://127.0.0.1:$port/" >/dev/null
occ config:app:set codeserver_layer workspace --value=/workspace >/dev/null

if [ -n "$craft" ]; then
  docker cp "$craft" "$container:/tmp/craftsuite_layer.tar.gz"
  docker exec "$container" sh -c 'tar -xzf /tmp/craftsuite_layer.tar.gz -C /var/www/html/custom_apps && chown -R www-data:www-data /var/www/html/custom_apps/craftsuite_layer'
fi
echo "Nextcloud at $url is set up for the tests."
