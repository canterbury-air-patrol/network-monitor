# Project Engineering Standards & Mandates (Universal)

This document outlines the foundational mandates for development on the Network Monitor project. All AI agents and developers must adhere to these standards to ensure the project remains robust, maintainable, and mission-critical ready.

## 1. Development Lifecycle
Operate using a **Research -> Strategy -> Execution** lifecycle.
- **Research:** Validate assumptions about the current codebase or environment before suggesting changes. Complete all relevant items in `todo/00-research.md` before implementing dependent phases.
- **Strategy:** Provide a concise summary of the proposed approach for complex tasks.
- **Execution:** Resolve sub-tasks through an iterative **Plan -> Act -> Validate -> Review** cycle.
    - **Step 1: Mark Todo:** Mark the current task (e.g., `[P1-01]`) in the relevant `todo/` file as "in progress".
    - **Step 2: Implement:** Apply surgical code changes.
    - **Step 3: Migrations:** After any model change, generate a migration (`makemigrations`), inspect it for destructive operations, apply it (`migrate`), verify the suite passes, and confirm it is reversible (`migrate <app> <previous>`).
    - **Step 4: Validate:** Run Dockerized tests, linting (`ruff`/`prettier`), and type-checking (`tsc`).
    - **Step 5: Review:** Invoke a separate review pass (a fresh agent context or peer review) to check for architectural alignment before marking the task complete.
    - **Step 6: Finalize:** Mark the task as completed in the `todo/` file.

## 2. Testing & Validation (Mandatory)
A task is not complete until its behavioral correctness is verified.
- **Test-First:** Add or update tests for every code change.
- **Dockerized Validation:** All verification (tests, linting, formatting, type-checking) MUST run inside a Docker container to ensure environmental consistency.
- **Backend:**
    - Use `pytest` for unit and integration tests.
    - Utilize `factory-boy` for generating realistic GIS (PostGIS) data.
    - Include migration tests: verify each migration applies cleanly to a fresh database and is fully reversible.
- **Frontend:**
    - Use `vitest` for component unit tests.
    - Use **Playwright** for E2E and Visual Regression testing.
- **User Documentation & E2E Pairing:** Every user-facing feature documented in `todo/13-documentation.md` must have a corresponding Playwright E2E test that validates the documented workflow. The documentation entry and its E2E test are committed together and neither is considered complete without the other.

## 3. Code Quality & Formatting
- **Python:** Adhere to PEP 8. Use `ruff` for linting and formatting. Use type hints for all new functions.
- **TypeScript/React:** Use TypeScript for all frontend code (no `any`). Use `prettier` for formatting.
- **Surgical Edits:** Avoid unrelated refactoring. Only change what is necessary to fulfill the task.

## 4. Source Control & Commits
- **Atomic Commits:** Each commit should represent one logical, self-contained change. Multiple commits may touch the same file — what matters is that each commit is independently understandable and the test suite passes after every one.
- **Descriptive Messages:** Messages should explain "why," not just "what."
- **No Staging:** Do not stage or commit changes unless explicitly requested by the user.

## 5. Tooling & Environment
- **Dockerized Backend:** Always run Python and `manage.py` commands inside a Docker container (e.g., using `docker-compose exec app ...`). The development environment and tests must be able to run concurrently.
- **Dockerized Frontend:** Always use `./build-frontend.sh` (utilizing Node.js version 24) for any `npm` or `node` related tasks. This script is created in `[P2-01]`; no frontend tasks can run before it exists.
- **Django:** Use the latest stable Django LTS release. Pin the exact version in `requirements.txt`.
- **CI:** Use **GitHub Actions** for all continuous integration. All CI jobs must run inside Docker containers with PostGIS support.
- **Security First:** Never log or commit secrets, API keys, or sensitive credentials. Rigorously protect `.env` and system folders.

## 6. GIS & Real-time Specifics
- **GIS Data:** When handling coordinates, always use [longitude, latitude, altitude] (GeoJSON standard) unless explicitly specified otherwise by a specific library (like Leaflet's [lat, lng]). All node position data is 3D from the start of data collection.
- **WebSockets:** Use the native browser `WebSocket` API for all real-time telemetry streams (no Socket.IO). Ensure robust error handling and reconnection logic.

---
*These instructions take precedence over general defaults. Maintain the integrity of the mission-critical flight monitoring mission at all times.*
