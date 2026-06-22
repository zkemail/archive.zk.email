#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/olof_andersson/archive.prove.email}"
SERVICE_NAME="${SERVICE_NAME:-archive-prove-email}"
BRANCH="${BRANCH:-main}"
ARTIFACT_PATH="${ARTIFACT_PATH:-$HOME/archive-prove-email-standalone.tgz}"

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

cd "$REPO_DIR"

git fetch origin
git pull --ff-only origin "$BRANCH"

set -a
[ -f "$REPO_DIR/.env" ] && . "$REPO_DIR/.env"
[ -f "$REPO_DIR/.env.production" ] && . "$REPO_DIR/.env.production"
[ -f "$HOME/archive-prove-email.runtime.env" ] && . "$HOME/archive-prove-email.runtime.env"
set +a

if [ -f "$ARTIFACT_PATH" ]; then
  tmp_extract="$(mktemp -d)"
  trap 'rm -rf "$tmp_extract"' EXIT

  tar -xzf "$ARTIFACT_PATH" -C "$tmp_extract"

  if [ ! -f "$tmp_extract/.next/standalone/server.js" ]; then
    echo "Standalone artifact is missing .next/standalone/server.js" >&2
    exit 1
  fi

  rm -rf "$REPO_DIR/.next/standalone"
  mkdir -p "$REPO_DIR/.next"
  cp -a "$tmp_extract/.next/standalone" "$REPO_DIR/.next/standalone"
  rm -f "$ARTIFACT_PATH"
elif [ ! -f "$REPO_DIR/.next/standalone/server.js" ]; then
  echo "No standalone artifact found at $ARTIFACT_PATH and no existing standalone build is installed" >&2
  exit 1
fi

if [ ! -f "$REPO_DIR/.next/standalone/server.js" ]; then
  echo "Standalone build is missing .next/standalone/server.js" >&2
  exit 1
fi

sudo install -m 0644 "$REPO_DIR/deployment/$SERVICE_NAME.service" "/etc/systemd/system/$SERVICE_NAME.service"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl is-active --quiet "$SERVICE_NAME"

if command -v nginx >/dev/null 2>&1 && [ -f "$REPO_DIR/deployment/$SERVICE_NAME.nginx" ]; then
  sudo install -m 0644 "$REPO_DIR/deployment/$SERVICE_NAME.nginx" "/etc/nginx/sites-available/$SERVICE_NAME"
  sudo ln -sf "/etc/nginx/sites-available/$SERVICE_NAME" "/etc/nginx/sites-enabled/$SERVICE_NAME"
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t
  sudo systemctl enable --now nginx
  sudo systemctl reload nginx
fi

git rev-parse HEAD
