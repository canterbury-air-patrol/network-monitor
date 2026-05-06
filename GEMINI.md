# Network Monitor Project Instructions

This project follows strict engineering standards to ensure reliability for UAV monitoring. **All development must adhere to the foundational mandates defined in [AGENTS.md](./AGENTS.md).**

## Core Mandates Summary

1.  **Docker Execution:** Always run Python, `pytest`, and frontend tasks inside Docker.
2.  **Parallel Environments:** Dev server and tests must run concurrently.
3.  **Mandatory Review:** Every commit must be reviewed by a sub-agent.
4.  **Atomic Commits:** One commit per numbered `todo/` item.
5.  **Engineering Standards:** See [AGENTS.md](./AGENTS.md) for the full specification.

## Useful Commands

*   `docker-compose up`: Start the development environment.
*   `docker-compose exec app python manage.py migrate`: Run migrations.
*   `docker-compose run --rm test`: Run backend tests.
*   `./build-frontend.sh`: Build/Test frontend.
