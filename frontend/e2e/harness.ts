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

/** A stored snapshot as the coverage heatmap reads it ([P3-02]). */
export interface CoverageSnapshot {
  position: Coordinates & { altitude: number }
  /** One heat point is drawn per reading, all at the snapshot's position. */
  radio_readings: { rssi_dbm: number }[]
}

export interface BackendOptions {
  centre?: Coordinates
  zoom?: number
  /** Snapshots the map's coverage query returns; empty means no coverage. */
  coverage?: CoverageSnapshot[]
  /**
   * Results for any other list endpoint, keyed by a fragment of the request
   * URL — `'/missions/'`, `'/radios/?node=1'`. The longest matching key wins,
   * so a key can also answer one query of an endpoint the defaults handle.
   */
  lists?: Record<string, unknown[]>
}

function pageOf(results: unknown[]) {
  return { count: results.length, next: null, previous: null, results }
}

/**
 * Serve the REST surface the app reads on load, so what the map shows depends
 * only on the coverage served here and what a test pushes over the telemetry
 * socket.
 *
 * The viewport is served as a mission override because that is the one source
 * `resolveInitialView` applies immediately — a plain default waits out the
 * geolocation grace period first, which would leave the map on its built-in
 * view for the first three seconds of every test.
 */
export async function stubBackend(
  page: Page,
  {
    centre = MAP_CENTRE,
    zoom = MAP_ZOOM,
    coverage = [],
    lists = {},
  }: BackendOptions = {},
): Promise<void> {
  const keys = Object.keys(lists).sort((a, b) => b.length - a.length)

  // Tiles are scenery: the assertions are all on marker and canvas geometry,
  // and waiting on openstreetmap.org would make the suite depend on the network
  await page.route('**/tile.openstreetmap.org/**', (route) => route.abort())

  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url()
    if (url.includes('/settings/map/'))
      return route.fulfill({
        json: { center: centre, zoom, source: 'mission', mission: 1 },
      })
    const key = keys.find((fragment) => url.includes(fragment))
    if (key !== undefined) return route.fulfill({ json: pageOf(lists[key]) })
    return route.fulfill({
      json: pageOf(url.includes('/snapshots/') ? coverage : []),
    })
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
 * The coverage heatmap ([P3-02]). `leaflet.heat` paints one canvas over the
 * whole map pane, so the layer being on screen says nothing about what it
 * drew — read the pixels for that.
 */
export function heatLayer(page: Page): Locator {
  return page.locator('canvas.leaflet-heatmap-layer')
}

export interface Pixel {
  red: number
  green: number
  blue: number
  /** 0 where the layer painted nothing. */
  alpha: number
}

/**
 * What the coverage layer painted at a viewport point. Reading the canvas
 * rather than a screenshot keeps the answer independent of the tiles and of
 * any marker drawn over the top.
 */
export async function heatPixel(page: Page, point: Point): Promise<Pixel> {
  return page.evaluate(({ x, y }) => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      'canvas.leaflet-heatmap-layer',
    )
    if (!canvas) throw new Error('the map has no coverage layer')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('the coverage layer has no 2d context')

    // The canvas is sized in CSS pixels and untransformed, but scale anyway so
    // the reading survives a device pixel ratio other than 1
    const box = canvas.getBoundingClientRect()
    const px = Math.round(((x - box.left) * canvas.width) / box.width)
    const py = Math.round(((y - box.top) * canvas.height) / box.height)
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height)
      throw new Error(`(${x}, ${y}) is outside the coverage layer`)

    const [red, green, blue, alpha] = context.getImageData(px, py, 1, 1).data
    return { red, green, blue, alpha }
  }, point)
}

/**
 * Load the app onto a stubbed backend with the telemetry socket in the test's
 * hands. Everything that must be in place before the app opens its socket or
 * fetches its first coverage happens here, so a test that varies either calls
 * this itself rather than taking the `telemetry` fixture.
 */
export async function loadApp(
  page: Page,
  options: BackendOptions = {},
): Promise<Telemetry> {
  await stubBackend(page, options)
  const telemetry = await mockTelemetry(page)
  await page.goto('/')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  return telemetry
}

/** A loaded map on the default view, serving no coverage. */
export const test = base.extend<{ telemetry: Telemetry }>({
  telemetry: async ({ page }, use) => {
    await use(await loadApp(page))
  },
})

export { expect }
