import {
  expect,
  test as base,
  type Locator,
  type Page,
  type WebSocketRoute,
} from '@playwright/test'

export interface Coordinates {
  latitude: number
  longitude: number
}

/** Somewhere over Christchurch; any fixed point the tests can measure from. */
export const MAP_CENTRE: Coordinates = { latitude: -43.53, longitude: 172.62 }
export const MAP_ZOOM = 13

const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] }

/**
 * Serve the REST surface the app reads on load, so what the map shows depends
 * only on what a test pushes over the telemetry socket.
 *
 * The viewport is served as a mission override because that is the one source
 * `resolveInitialView` applies immediately — a plain default waits out the
 * geolocation grace period first, which would leave the map on its built-in
 * view for the first three seconds of every test.
 */
export async function stubBackend(
  page: Page,
  view: { centre?: Coordinates; zoom?: number } = {},
): Promise<void> {
  const centre = view.centre ?? MAP_CENTRE
  const zoom = view.zoom ?? MAP_ZOOM

  // Tiles are scenery: the assertions are all on marker geometry, and waiting
  // on openstreetmap.org would make the suite depend on the network
  await page.route('**/tile.openstreetmap.org/**', (route) => route.abort())

  await page.route('**/api/v1/**', (route) => {
    const json = route.request().url().includes('/settings/map/')
      ? { center: centre, zoom, source: 'mission', mission: 1 }
      : EMPTY_PAGE
    return route.fulfill({ json })
  })
}

/** A telemetry frame as the consumer broadcasts it ([P1-17]). */
export interface SnapshotMessage {
  node_id: number
  node_name: string
  captured_at: string
  position: { longitude: number; latitude: number; altitude: number }
}

export interface Telemetry {
  /** Push one frame to the app, as the WebSocket consumer would. */
  send: (message: SnapshotMessage) => Promise<void>
}

/**
 * Stand in for the `/ws/nodes/` consumer. Nothing here calls
 * `connectToServer`, so the app talks to this handler alone and the suite
 * needs no running backend.
 *
 * Must be installed before `page.goto`: the app opens the socket on mount.
 */
export async function mockTelemetry(page: Page): Promise<Telemetry> {
  // React's strict-mode double mount opens a connection, drops it and opens
  // another, and the hook reconnects on its own after a close, so the app is
  // not reachable on whichever socket happened to be opened first — only on
  // the one currently open.
  const open: WebSocketRoute[] = []

  await page.routeWebSocket(/\/ws\/nodes\/$/, (ws) => {
    open.push(ws)
    ws.onClose(() => {
      const index = open.indexOf(ws)
      if (index !== -1) open.splice(index, 1)
    })
  })

  async function liveSocket(): Promise<WebSocketRoute> {
    const deadline = Date.now() + 10_000
    for (;;) {
      const ws = open.at(-1)
      if (ws) return ws
      if (Date.now() > deadline)
        throw new Error('app opened no telemetry socket')
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  return {
    send: async (message) => {
      const ws = await liveSocket()
      ws.send(JSON.stringify(message))
    },
  }
}

/**
 * Live UAV markers. Leaflet draws the default teardrop as an `<img>`, while
 * ground station pins and the stale-node glyphs are `divIcon`s, so this counts
 * UAVs that are currently reporting and nothing else.
 */
export function uavMarkers(page: Page): Locator {
  return page.locator('img.leaflet-marker-icon')
}

export interface Point {
  x: number
  y: number
}

/**
 * The map coordinate a marker is claiming, in viewport pixels. The default
 * icon is anchored at the tip of the teardrop — bottom centre of its box —
 * which is where Leaflet has projected the node's position.
 */
export async function markerAnchor(marker: Locator): Promise<Point> {
  const box = await marker.boundingBox()
  if (!box) throw new Error('marker is not visible')
  return { x: box.x + box.width / 2, y: box.y + box.height }
}

/** Viewport pixel the map is centred on, i.e. where its centre coordinate lands. */
export async function mapCentrePoint(page: Page): Promise<Point> {
  const box = await page.locator('.leaflet-container').boundingBox()
  if (!box) throw new Error('map is not visible')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

export function pixelsApart(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * A loaded map with a stubbed backend and the telemetry socket in the test's
 * hands. The fixture navigates, so anything that must be in place before the
 * app opens its socket belongs here rather than in a test body.
 */
export const test = base.extend<{ telemetry: Telemetry }>({
  telemetry: async ({ page }, use) => {
    await stubBackend(page)
    const telemetry = await mockTelemetry(page)
    await page.goto('/')
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await use(telemetry)
  },
})

export { expect }
