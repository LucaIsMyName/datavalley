#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing $1. Install it before deploying." >&2
    exit 1
  fi
}

need node
need npm
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)' || {
  echo "Node.js 22 or newer is required" >&2
  exit 1
}

if [[ ! -f .env ]]; then
  echo "Copy .env.example to .env and set secrets before deploying." >&2
  exit 1
fi

npm ci
npm run build --workspace @datavalley/web
npm run migrate
echo "Build and migrations finished."
echo "Run the API with: npm run start -w @datavalley/api"
echo "Run the worker with: npm run start -w @datavalley/worker"
echo "Serve apps/web/dist behind the reverse proxy documented in docs/deploy.md"
if [[ "${INSTALL_SYSTEMD:-}" == "1" ]]; then
  sudo cp deploy/datavalley-api.service deploy/datavalley-worker.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now datavalley-api datavalley-worker
fi
