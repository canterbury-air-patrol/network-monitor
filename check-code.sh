#!/bin/bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# Resolve ruff: prefer venv, fall back to Docker (no local install needed)
if [ -x venv/bin/ruff ]; then
    RUFF=(venv/bin/ruff)
elif command -v docker &>/dev/null; then
    echo "Note: ruff not found in venv — using Docker (run setup.sh to install locally)"
    RUFF=(docker compose run --rm --no-deps test ruff)
else
    echo "Error: ruff not found in venv and Docker is unavailable. Run setup.sh first." >&2
    exit 1
fi

FAILED=0

run_check() {
    local label="$1"; shift
    echo ""
    echo "==> $label"
    if "$@"; then
        echo "    OK"
    else
        FAILED=$((FAILED + 1))
    fi
}

# --- Backend ---
run_check "ruff lint"   "${RUFF[@]}" check .
run_check "ruff format" "${RUFF[@]}" format --check .

# --- Frontend ---
# Enabled once the frontend build system is set up (todo/02-frontend.md [P2-01])
if [ -f frontend/package.json ]; then
    if [ -x build-frontend.sh ]; then
        run_check "prettier format" ./build-frontend.sh prettier --check "src/**/*.{ts,tsx}"
    else
        echo ""
        echo "==> Frontend: skipped (build-frontend.sh not yet created)"
    fi
fi

# --- Summary ---
echo ""
if [ "$FAILED" -eq 0 ]; then
    echo "All checks passed."
else
    echo "$FAILED check(s) failed."
    exit 1
fi
