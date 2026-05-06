# Phase 2: Dockerized Frontend Setup

> **Requires:** Phase 1 complete.

- [ ] **[P2-01]** Create `build-frontend.sh` wrapping `docker run node:24` for `npm` commands. This script must exist before any other frontend task can run. *(Blocks: all remaining Phase 2 tasks and all subsequent frontend work)*
- [ ] **[P2-02]** Initialize Vite + React + TypeScript project in `frontend/`. *(Requires: [P2-01])*
- [ ] **[P2-03]** Install core dependencies: `leaflet`, `react-leaflet`, `tailwindcss`. *(Requires: [P2-02])*
- [ ] **[P2-04]** Configure Tailwind CSS in the frontend project. *(Requires: [P2-03])*
- [ ] **[P2-05]** Configure `vitest` and `react-testing-library`. *(Requires: [P2-02]; Blocks: [P2-10])*
- [ ] **[P2-06]** Configure Playwright for E2E testing. *(Requires: [P2-02]; Blocks: [P2-11])*
- [ ] **[P2-07]** Create a basic Layout component with a Sidebar and Map area. *(Requires: [P2-03])*
- [ ] **[P2-08]** Implement a `useWebSocket` hook using the native browser `WebSocket` API with automatic reconnection logic. Do not install `socket.io-client` or any WebSocket abstraction library — Django Channels speaks standard WebSocket protocol. *(Requires: [P2-02]; Blocks: [P2-09])*
- [ ] **[P2-09]** Write unit tests for `useWebSocket` hook with Vitest. *(Requires: [P2-05], [P2-08])*
- [ ] **[P2-10]** Create initial Playwright smoke tests for map rendering. *(Requires: [P2-06], [P2-07])*
