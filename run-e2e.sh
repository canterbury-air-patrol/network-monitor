#!/bin/bash
# Runs the Playwright E2E suite inside the image that matches the pinned
# @playwright/test version — build-frontend.sh's node image ships no browsers,
# and the visual regression baselines ([P12-02]) only reproduce here.
#
# Usage:
#   ./run-e2e.sh                          # the whole suite
#   ./run-e2e.sh --project=visual         # visual regression only
#   ./run-e2e.sh --update-snapshots       # re-take the committed baselines
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The image tag has to track the installed Playwright exactly: a browser build
# the test runner did not expect renders different pixels, when it runs at all.
VERSION="$(node -p 'require("./frontend/node_modules/@playwright/test/package.json").version' 2>/dev/null || true)"
if [ -z "$VERSION" ]; then
    VERSION="$(sed -n 's/.*"@playwright\/test": "[^0-9]*\([0-9.]*\)".*/\1/p' \
        "$SCRIPT_DIR/frontend/package.json")"
fi
if [ -z "$VERSION" ]; then
    echo "Error: could not determine the pinned @playwright/test version." >&2
    exit 1
fi

exec docker run --rm \
    --user "$(id -u):$(id -g)" \
    --ipc=host \
    -v "$SCRIPT_DIR/frontend:/app" \
    -w /app \
    -e HOME=/tmp \
    -e PLAYWRIGHT_VISUAL=1 \
    "mcr.microsoft.com/playwright:v${VERSION}-noble" \
    npx playwright test "$@"
