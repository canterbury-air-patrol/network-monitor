# Network Monitor Project Instructions

This project follows strict engineering standards to ensure reliability for UAV monitoring.

## Core Mandates

1.  **Docker Execution:** 
    *   **Backend:** Always run Python, `pytest`, and `manage.py` inside a Docker container.
        *   Use `docker-compose exec app <command>` for running commands in the active dev environment.
        *   Use `docker-compose run --rm test` for isolated test runs.
    *   **Frontend:** Always use `./build-frontend.sh` for `npm`/`node` tasks.
2.  **Parallel Environments:** The development server (`docker-compose up`) and the test suite must be able to run concurrently.
3.  **Testing:** 100% test coverage is required for all new logic. Use `pytest` and `factory-boy`.
4.  **Standards:** Adhere to [AGENTS.md](./AGENTS.md) for detailed architectural and quality standards.

## Useful Commands

*   `docker-compose up`: Start the development environment.
*   `docker-compose exec app python manage.py migrate`: Run migrations.
*   `docker-compose run --rm test`: Run backend tests.
*   `./build-frontend.sh`: Build/Test frontend.
