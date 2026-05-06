# Network Monitor Project Instructions

This project follows strict engineering standards to ensure reliability for UAV monitoring. **All development must adhere to the foundational mandates defined in [AGENTS.md](./AGENTS.md).**

## Core Mandates Summary

1.  **Docker Execution:** Always run Python, `pytest`, and frontend tasks inside Docker.
2.  **Parallel Environments:** Dev server and tests must run concurrently.
3.  **Mandatory Review:** Every task must be reviewed by a separate agent context or peer before being marked complete.
4.  **Atomic Commits:** Each commit represents one logical change; multiple commits may touch the same file.
5.  **Migrations:** Generate, inspect, apply, and verify reversibility after every model change.
6.  **Engineering Standards:** See [AGENTS.md](./AGENTS.md) for the full specification.

## Useful Commands

*   `docker-compose up`: Start the development environment.
*   `docker-compose exec app python manage.py makemigrations`: Generate migrations.
*   `docker-compose exec app python manage.py migrate`: Apply migrations.
*   `docker-compose run --rm test`: Run backend tests.
*   `./build-frontend.sh`: Build/test frontend (created in [P2-01]).
