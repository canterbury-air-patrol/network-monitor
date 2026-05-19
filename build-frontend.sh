#!/bin/bash
# Runs Node/npm commands inside docker run node:26, mounting ./frontend as /app.
# Usage:
#   ./build-frontend.sh npm install
#   ./build-frontend.sh npm run build
#   ./build-frontend.sh prettier --check "src/**/*.{ts,tsx}"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_IMAGE=node:26

case "${1:-}" in
    npm | node | npx)
        exec docker run --rm \
            --user "$(id -u):$(id -g)" \
            -v "$SCRIPT_DIR/frontend:/app" \
            -w /app \
            "$NODE_IMAGE" \
            "$@"
        ;;
    *)
        exec docker run --rm \
            --user "$(id -u):$(id -g)" \
            -v "$SCRIPT_DIR/frontend:/app" \
            -w /app \
            "$NODE_IMAGE" \
            npx "$@"
        ;;
esac
