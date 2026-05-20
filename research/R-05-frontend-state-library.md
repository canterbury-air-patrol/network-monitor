# R-05: Frontend State Library

**Status:** Decided
**Date:** 2026-05-17
**Blocks:** [P2-02] (Initialize Vite + React + TypeScript project; install chosen state library)

> **Note on bundle figures:** Live web search/fetch was unavailable while writing this
> document, so the bundle sizes below are drawn from well-established public figures for
> these libraries' recent major versions. They are accurate to within a few hundred bytes
> for the purpose of a relative comparison, but the project owner should confirm exact
> numbers against npm / bundlephobia / pkg-size.dev at implementation time (see Open
> questions). The *relative ordering* of the three options is stable and not in doubt.

## Context

The frontend is a Vite + React + TypeScript single-page app showing a live 2D Leaflet
map of UAV positions, coverage heatmaps, mission control panels, and signal strength
charts. Live telemetry arrives over a **single WebSocket connection** (per [P2-08], a
native-`WebSocket` `useWebSocket` hook — no socket.io). That telemetry stream must fan
out to several independent, separately-rendered consumers:

- the map base layer / coverage heatmap,
- the UAV marker overlay,
- the per-UAV signal-history charts,
- the alert panel.

The key state-management problem is therefore **high-frequency fan-out**: many telemetry
messages per second, distributed to multiple components that should each re-render only
when *their* slice of state changes. A naive single shared object would re-render every
consumer on every packet.

## Options evaluated

### Option A — Zustand

**Bundle size.** Roughly **~1 KB min+gzip** for the core (`zustand` v5). The vanilla
store and middleware (`devtools`, `subscribeWithSelector`, `persist`) are separately
importable, so you pay only for what you use. This is the smallest of the three options
by a wide margin.

**DevTools support.** First-class. The `devtools` middleware connects the store to the
**Redux DevTools** browser extension, giving state inspection and action logging.
Time-travel/state-replay works for dispatched actions, though it is somewhat less
turn-key than Redux Toolkit's because Zustand actions are plain function calls — you get
the best DevTools experience by naming updates (passing an action name as the third
argument to `set`). Adequate for development; see Open questions on whether time-travel
is needed at all.

**WebSocket state sharing.** Excellent fit. A Zustand store lives outside the React tree,
so the `useWebSocket` hook can write incoming telemetry into the store directly without
needing a Provider or a component to own the connection. Consumers subscribe with
**selectors** (`useStore(s => s.uavs[id].signal)`), and Zustand re-renders a component
only when its selected slice changes (with `useShallow`/equality fns for object slices).
This gives precise, per-slice re-render control essentially for free — exactly what the
multi-consumer telemetry fan-out needs. Non-React code (e.g. the WS hook, an alert
threshold evaluator) can call `store.getState()` / `store.setState()` directly.

**TypeScript ergonomics.** Very good. One `create<State>()(...)` call defines the whole
store with full inference into selectors. Minimal boilerplate — no action types, no
reducers, no dispatch typing. The one known papercut is the `create<T>()(...)` curried
form required to make middleware generics infer correctly, which is a documented,
copy-pasteable pattern.

### Option B — Redux Toolkit (RTK)

**Bundle size.** Roughly **~13–15 KB min+gzip** for `@reduxjs/toolkit` plus
**~1.5 KB** for `react-redux` — call it **~15 KB min+gzip** total. RTK bundles Immer,
Reselect, and the Redux core. If RTK Query is used it adds several more KB. This is the
heaviest option, ~15x Zustand, though still small in absolute terms for an app that will
also ship Leaflet and a charting library.

**DevTools support.** Best-in-class. Redux DevTools integration is automatic with
`configureStore`, and because every state change is a serializable dispatched action,
**time-travel debugging, action replay, and state import/export all work fully and
reliably**. If deep time-travel debugging is a hard requirement, RTK is the strongest.

**WebSocket state sharing.** Works well and is a well-trodden path. The store is global;
the WS hook dispatches actions (or RTK Query's `onCacheEntryAdded` streaming-update
lifecycle handles a socket feed). Consumers read slices via `useSelector` with Reselect
memoization for derived data. The cost is **boilerplate and indirection**: slices,
reducers, action creators, and the discipline of routing every telemetry packet through
a dispatched action. For a firehose of telemetry, that is more ceremony than the problem
needs, though RTK's `createSlice` keeps it manageable.

**TypeScript ergonomics.** Good and mature, but more setup than Zustand: you must define
and export `RootState` and `AppDispatch` types and create pre-typed `useAppSelector` /
`useAppDispatch` hooks (the documented pattern). `createSlice` infers action payload
types well. Net: solid typing, noticeably more boilerplate per unit of state.

### Option C — React Context + useReducer

**Bundle size.** **0 bytes added.** Both `useReducer` and `createContext` are built into
React. Unbeatable on this axis.

**DevTools support.** Effectively none out of the box. React DevTools can inspect the
Context value as a component prop, but there is **no action log, no time-travel, no
state-diff history**. You would have to hand-roll logging middleware around the reducer.
This is the weakest option for debugging.

**WebSocket state sharing.** This is where Context + useReducer is the **wrong tool for
this specific app.** Context has no selector mechanism: **every component consuming a
context re-renders whenever any part of that context value changes.** With telemetry
arriving many times per second and four-plus distinct consumers, the whole subtree tied
to the telemetry context would re-render on every packet. Mitigations exist — splitting
into many narrow contexts (one per UAV? per concern?), wrapping consumers in
`React.memo`, or adding `use-context-selector` (which is itself a third-party dependency
that partly defeats the "zero dependency" appeal) — but they add real complexity and are
easy to get subtly wrong. Context also requires a Provider in the tree, so the
`useWebSocket` hook must live inside that Provider, coupling connection lifecycle to
component lifecycle.

**TypeScript ergonomics.** Reasonable for a single small reducer (discriminated-union
action types infer cleanly). It scales poorly: multiple contexts mean multiple
`createContext` defaults, null-checks or assertion helpers on every `useContext`, and
manually written typed wrapper hooks. More hand-written boilerplate than Zustand once the
state is non-trivial.

## Comparison table

| Criterion | Zustand | Redux Toolkit | Context + useReducer |
|---|---|---|---|
| Bundle size (min+gzip, approx.) | **~1 KB** | ~15 KB (RTK + react-redux) | **0 KB** |
| DevTools / state inspection | Good (Redux DevTools via middleware) | **Excellent (automatic)** | Poor (no log/history) |
| Time-travel debugging | Workable, needs named actions | **Full, reliable** | None without hand-rolling |
| Per-slice re-renders (fan-out) | **Built-in selectors** | Built-in (`useSelector` + Reselect) | **None** — whole subtree re-renders |
| WS store outside React tree | **Yes** (no Provider needed) | Yes | No (Provider required) |
| TS boilerplate | **Minimal** | Moderate (RootState/Dispatch, typed hooks) | Moderate, scales poorly |
| Type inference | Excellent | Good | Good for one reducer |
| Ecosystem / longevity | Strong, very widely adopted | Very strong, official Redux | N/A (built-in) |
| Learning curve | Low | Moderate | Low (but easy to misuse here) |

## Recommendation

**Adopt Zustand.**

It is the best fit for this app's defining constraint — distributing a high-frequency
WebSocket telemetry stream to multiple independently-rendering map and panel components —
while being the smallest dependency of the three and the lightest in TypeScript
boilerplate.

## Reasoning

**Why Zustand wins.**

1. **Telemetry fan-out is a selector problem, and selectors are Zustand's core feature.**
   Each consumer (map layer, marker overlay, signal charts, alert panel) subscribes to
   exactly the slice it needs and re-renders only when that slice changes. With dozens of
   UAVs updating several times per second, this per-slice precision is the difference
   between a smooth map and a janky one — and it requires no extra libraries or wrapping.
2. **The store lives outside React.** The native-`WebSocket` `useWebSocket` hook from
   [P2-08] can write straight into the store via `setState`, and an alert-threshold
   evaluator can read it via `getState()`, with no Provider and no coupling of the socket
   connection to a component's lifecycle. This keeps the connection model clean.
3. **Lowest cost on the two "ergonomics" axes the project explicitly cares about.**
   ~1 KB of bundle and a single `create()` call with full type inference — no action
   types, no `RootState`/`AppDispatch` plumbing, no typed-hook boilerplate.
4. **DevTools are good enough.** The `devtools` middleware gives state inspection and an
   action log through the Redux DevTools extension during development, which covers
   normal debugging needs.

**Why Redux Toolkit was rejected.** RTK is an excellent, mature library and its
automatic, fully-reliable time-travel debugging is genuinely the best of the three. But
for this app it costs ~15x the bundle of Zustand and imposes meaningfully more
boilerplate (slices, dispatched actions for every telemetry update, `RootState`/
`AppDispatch` typing, pre-typed hooks). Routing a firehose of telemetry packets through
dispatched actions is more ceremony than the problem warrants. RTK earns its weight in
large apps with complex cross-cutting state, server-cache management (RTK Query),
audit-style action logs, or teams already standardized on Redux — none of which is a
stated requirement here. The deciding factor is whether full time-travel debugging is a
hard requirement (see Open questions); absent that, RTK's main advantage does not apply.

**Why React Context + useReducer was rejected.** Its 0-byte cost is attractive, but
Context has **no selective subscription**: every consumer of a context re-renders on
every change to that context's value. With high-frequency telemetry feeding four-plus
consumers, this produces avoidable whole-subtree re-renders and map jank. The standard
mitigations (many narrow contexts, pervasive `React.memo`, or adding
`use-context-selector`) reintroduce complexity and a dependency, eroding the only real
advantage. Context is well suited to low-frequency, rarely-changing app state (theme,
auth/session, current user) and may still be used for that — but it is the wrong
mechanism for the live telemetry hot path, which is precisely what [R-05] is about.

## Owner responses — 2026-05-18

1. **Time-travel / mission-replay in production:** Yes, wanted — but must live on a **separate page/route** and must not be accessible from the live mission view to prevent accidental activation during an operation. Zustand confirmed; the replay page will use an isolated store slice or a separate store instance. Zustand's `devtools` middleware covers dev debugging; the replay UI is a product feature built on top of the store, not a devtools concern.
2. **Mission playback through the same store:** The replay page is a separate route, so it can have its own store instance driven by historical telemetry without risk of contaminating the live store.
3. **Server-cache:** Deferred to [P2-02] implementation. TanStack Query is the preferred pairing.

**Decision: Zustand confirmed. [R-05] closed.**

---

## Open questions

1. **Is time-travel / action-replay debugging required in *production*, not just dev?**
   If yes — e.g. for post-incident reconstruction of an operator's session, or if it
   overlaps with the Phase 11 audit-logging requirement — that materially strengthens the
   case for Redux Toolkit, whose serializable-action model makes this turn-key. If
   time-travel is only a development convenience, Zustand's `devtools` middleware is
   sufficient and the recommendation stands firmly. **Project owner to confirm.**
2. **Confirm exact current bundle sizes at implementation time.** Live npm/bundlephobia
   data was not available while writing this; verify `zustand`, `@reduxjs/toolkit`, and
   `react-redux` sizes against the versions actually installed. This will not change the
   ordering, only the precise numbers cited.
3. **Server-cache management strategy.** This document covers *client/UI and live-stream*
   state only. REST data fetched from DRF (mission lists, device registries, historical
   queries) is a separate concern. Decide whether to use **TanStack Query** for that
   server-cache layer (pairs cleanly with Zustand and is the common pairing) or **RTK
   Query** (which would pull in Redux Toolkit anyway and could tilt the decision back
   toward RTK for consistency). If RTK Query is chosen for server data, reconsider
   standardizing on RTK for everything.
4. **Should mission playback (Phase 9) replay through the same store?** If recorded
   missions are replayed by feeding historical telemetry back through the live store,
   confirm the store shape designed now can be driven by both the live WS feed and a
   playback source. This is a store-design note for [P2-02], not a blocker for the
   library choice.
5. **Persistence of UI state.** If any client state (selected UAV, map viewport, panel
   layout) should survive reloads, plan to use Zustand's `persist` middleware (small,
   built in). No decision needed now; flagged so it is not missed.
