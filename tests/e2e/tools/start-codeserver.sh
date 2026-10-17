#!/bin/sh
# SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Starts code-server for the tests (specs/codeserver.spec.ts) from its standalone release
# (tests/e2e/tools/fetch-codeserver.mjs): on 127.0.0.1, without a sign-in, with its settings,
# extensions and state in a folder of their own, so that nothing goes to ~/.config or ~/.local.
# The machine settings are those of a code-server that works on a synced copy: no autosave, no
# git; and for the tests workspace trust off and no chat panel, which would take the
# keyboard focus.
#
#   tests/e2e/tools/start-codeserver.sh <code-server folder> <state folder> <port> [--foreground]
#
# Without --foreground it starts code-server in the background, waits until it answers and
# writes its process id to <state folder>/code-server.pid.

set -eu
release=$1
state=$2
port=$3
mode=${4:-}

mkdir -p "$state/user-data/Machine" "$state/extensions"
cat > "$state/user-data/Machine/settings.json" <<'EOF'
{
  "files.autoSave": "off",
  "git.enabled": false,
  "security.workspace.trust.enabled": false,
  "workbench.startupEditor": "none",
  "workbench.tips.enabled": false,
  "extensions.ignoreRecommendations": true,
  "extensions.autoCheckUpdates": false,
  "update.mode": "none",
  "telemetry.telemetryLevel": "off",
  "chat.disableAIFeatures": true,
  "workbench.secondarySideBar.defaultVisibility": "hidden"
}
EOF

set -- "$release/bin/code-server" --bind-addr "127.0.0.1:$port" --auth none \
  --disable-telemetry --disable-update-check --disable-workspace-trust --disable-proxy \
  --user-data-dir "$state/user-data" --extensions-dir "$state/extensions" --config "$state/config.yaml"
: > "$state/config.yaml"
# code-server writes its own logs to $XDG_DATA_HOME/code-server/coder-logs whatever --user-data-dir
# says (~/.local/share by default); keep them in the state folder too.
export XDG_DATA_HOME="$state/data"

if [ "$mode" = "--foreground" ]; then
  exec "$@"
fi
"$@" > "$state/code-server.log" 2>&1 &
echo $! > "$state/code-server.pid"
tries=0
until curl -fsS "http://127.0.0.1:$port/healthz" >/dev/null 2>&1; do
  tries=$((tries + 1))
  [ "$tries" -lt 60 ] || { cat "$state/code-server.log" >&2; echo "code-server did not start" >&2; exit 1; }
  sleep 1
done
echo "code-server on http://127.0.0.1:$port/"
