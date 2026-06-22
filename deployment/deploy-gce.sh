#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/olof_andersson/archive.prove.email}"
SERVICE_NAME="${SERVICE_NAME:-archive-prove-email}"
BRANCH="${BRANCH:-main}"

NODE_DIRS=(
  "$HOME/node-v22.22.0-linux-x64/bin"
  "$HOME/node-v22.2.0-linux-x64/bin"
  "/opt/node-v22.22.0-linux-x64/bin"
  "/opt/node-v22.2.0-linux-x64/bin"
)

for node_dir in "${NODE_DIRS[@]}"; do
  if [ -x "$node_dir/node" ]; then
    export PATH="$node_dir:$PATH"
    break
  fi
done

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22 is not installed or not on PATH" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is not installed or not on PATH" >&2
  exit 1
fi

cd "$REPO_DIR"

git fetch origin
git pull --ff-only origin "$BRANCH"

set -a
[ -f "$REPO_DIR/.env" ] && . "$REPO_DIR/.env"
[ -f "$REPO_DIR/.env.production" ] && . "$REPO_DIR/.env.production"
[ -f "$HOME/archive-prove-email.runtime.env" ] && . "$HOME/archive-prove-email.runtime.env"
set +a

pnpm install --frozen-lockfile

export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE:-1536}"
pnpm build

if [ ! -f "$REPO_DIR/.next/BUILD_ID" ]; then
  echo "Next.js build did not produce .next/BUILD_ID" >&2
  exit 1
fi

sudo install -m 0644 "$REPO_DIR/deployment/$SERVICE_NAME.service" "/etc/systemd/system/$SERVICE_NAME.service"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl is-active --quiet "$SERVICE_NAME"
git rev-parse HEAD
