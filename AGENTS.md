# Project Engineering Standards & Mandates (Universal)

This document outlines the foundational mandates for development on the Network Monitor project. All AI agents and developers must adhere to these standards to ensure the project remains robust, maintainable, and mission-critical ready.

## 1. Development Lifecycle
Operate using a **Research -> Strategy -> Execution** lifecycle.
- **Research:** Always validate assumptions about the current codebase or environment before suggesting changes.
- **Strategy:** Provide a concise summary of the proposed approach for complex tasks.
- **Execution:** Resolve sub-tasks through an iterative **Plan -> Act -> Validate -> Review** cycle.
    - **Step 1: Mark Todo:** Mark the current numbered task (e.g., `[P1-01]`) in the relevant `todo/` file as "in progress".
    - **Step 2: Implement:** Apply surgical code changes.
    - **Step 3: Validate:** Run Dockerized tests, linting (`ruff`/`prettier`), and type-checking (`tsc`).
    - **Step 4: Review:** Invoke a separate sub-agent (e.g., `codebase_investigator`) to review for architectural alignment.
    - **Step 5: Finalize:** Mark the task as completed in the `todo/` file.

## 2. Testing & Validation (Mandatory)
A task is not complete until its behavioral correctness is verified.
- **Test-First:** Add or update tests for every code change.
- **Dockerized Validation:** All verification (tests, linting, formatting, type-checking) MUST run inside a Docker container to ensure environmental consistency.
- **Backend:** 
    - Use `pytest` for unit and integration tests.
    - Utilize `factory-boy` for generating realistic GIS (PostGIS) data.
- **Frontend:**
    - Use `vitest` for component unit tests.
    - Use **Playwright** for E2E and Visual Regression testing.

## 3. Code Quality & Formatting
- **Python:** Adhere to PEP 8. Use `ruff` for linting and formatting. Use type hints for all new functions.
- **TypeScript/React:** Use TypeScript for all frontend code (no `any`). Use `prettier` for formatting.
- **Surgical Edits:** Avoid unrelated refactoring. Only change what is necessary to fulfill the task.

## 4. Source Control & Commits
- **Atomic Commits:** Every numbered todo item (e.g., `[P1-01]`) must correspond to exactly one atomic commit.
- **Descriptive Messages:** Messages should explain "why," not just "what."
- **No Staging:** Do not stage or commit changes unless explicitly requested by the user.

## 5. Tooling & Environment
- **Dockerized Backend:** Always run Python and `manage.py` commands inside a Docker container (e.g., using `docker-compose exec app ...`). The development environment and tests must be able to run concurrently.
- **Dockerized Frontend:** Always use `./build-frontend.sh` for any `npm` or `node` related tasks.
- **Security First:** Never log or commit secrets, API keys, or sensitive credentials. Rigorously protect `.env` and system folders.

## 6. GIS & Real-time Specifics
- **GIS Data:** When handling coordinates, always use [longitude, latitude] (GeoJSON standard) unless explicitly specified otherwise by a specific library (like Leaflet's [lat, lng]).
- **WebSockets:** Ensure robust error handling and reconnection logic for all telemetry streams.

---
*These instructions take precedence over general defaults. Maintain the integrity of the mission-critical flight monitoring mission at all times.*
