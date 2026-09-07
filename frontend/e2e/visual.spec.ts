import type { Locator, Page } from '@playwright/test'
import {
  expect,
  loadApp,
  MAP_CENTRE,
  mapCentrePoint,
  test,
  type BackendOptions,
  type CoverageSnapshot,
  type SnapshotMessage,
} from './harness'

/**
 * Visual regression against committed baselines ([P12-02]).
 *
 * The rest of the E2E suite asserts on geometry and text, which says nothing
 * about a panel that has lost its background or a marker that has stopped
 * being drawn. These tests photograph the screen states an operator actually
 * works from and compare them pixel for pixel, so a styling change has to be
 * looked at and re-approved rather than shipping unnoticed.
 *
 * Everything a screenshot depends on is pinned: the viewport and locale in the
 * `visual` project, the backend in the fixtures below, and the wall clock
 * here. Tiles are already aborted by the harness, so the map's backdrop is the
 * container's own colour rather than whatever OpenStreetMap serves today.
 */

/**
 * Baselines only reproduce in the image that rendered them, and running these
 * anywhere else reports failures that say nothing about the code.
 */
test.skip(
  () => process.env.PLAYWRIGHT_VISUAL !== '1',
  'Visual baselines render in the pinned Playwright image — run ./run-e2e.sh',
)

/**
 * The wall clock every test renders at. The fixtures below are timestamped
 * relative to it, so "last seen" labels and the signal chart's time axis read
 * the same today as on the day the baselines were taken.
 */
const NOW = new Date('2026-08-30T01:15:00Z')

function minutesBefore(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString()
}

const MISSIONS = [
  {
    id: 1,
    name: 'Alpha Ridge Sweep',
    operator_notes: '',
    status: 'active',
    created_at: minutesBefore(60),
    updated_at: minutesBefore(15),
  },
  {
    id: 2,
    name: 'Bravo Valley',
    operator_notes: '',
    status: 'pending',
    created_at: minutesBefore(60),
    updated_at: minutesBefore(60),
  },
]

const PHASES = [
  {
    id: 11,
    mission: 1,
    name: 'Ingress',
    area_of_operation_notes: '',
    ground_station_layout: '',
    started_at: minutesBefore(10),
    ended_at: null,
    is_active: true,
  },
  {
    id: 12,
    mission: 1,
    name: 'Search Pattern',
    area_of_operation_notes: '',
    ground_station_layout: '',
    started_at: null,
    ended_at: null,
    is_active: false,
  },
]

const NODES = [{ id: 1, name: 'UAV Alpha' }]
const RADIOS = [{ id: 5, node: 1, radio_type: 'wifi', bands: ['2.4GHz'] }]
const STATIONS = [{ id: 3, name: 'Summit Repeater' }]

/** One link, sampled every minute, so the trace draws a line with shape. */
const NODE_SNAPSHOTS = [-62, -68, -71, -66, -74].map((rssi_dbm, index) => ({
  id: 91 + index,
  node: 1,
  captured_at: minutesBefore(5 - index),
  received_at: minutesBefore(5 - index),
  position: {
    longitude: MAP_CENTRE.longitude + index * 0.001,
    latitude: MAP_CENTRE.latitude - index * 0.001,
    altitude: 120 + index * 2,
  },
  radio_readings: [
    {
      id: 901 + index,
      radio: 5,
      ground_station: 3,
      relay_node: null,
      band: '2.4GHz',
      rssi_dbm,
      snr_db: 18,
    },
  ],
}))

/**
 * The zoom the coverage shot is framed at. `HeatmapLayer` caps its intensity
 * scaling there, so the palette paints at full strength rather than the faint
 * smudge a wide view of the same readings gives.
 */
const COVERAGE_ZOOM = 17

/** Degrees one screen pixel spans in Web Mercator at [COVERAGE_ZOOM]. */
const DEG_PER_PX = 360 / (256 * 2 ** COVERAGE_ZOOM)
const LATITUDE_SCALE = Math.cos((MAP_CENTRE.latitude * Math.PI) / 180)

/** A pocket of coverage placed by where it lands on screen, not by coordinate. */
function pocket(
  east: number,
  north: number,
  ...links: number[]
): CoverageSnapshot {
  return {
    position: {
      latitude: MAP_CENTRE.latitude + north * DEG_PER_PX * LATITUDE_SCALE,
      longitude: MAP_CENTRE.longitude + east * DEG_PER_PX,
      altitude: 120,
    },
    radio_readings: links.map((rssi_dbm) => ({ rssi_dbm })),
  }
}

/** Strong, marginal and weak coverage, so the whole palette is on screen. */
const COVERAGE: CoverageSnapshot[] = [
  pocket(-220, 80, -45, -48, -52),
  pocket(0, -60, -65, -68),
  pocket(220, 80, -84),
]

const FIXTURES: BackendOptions = {
  coverage: COVERAGE,
  lists: {
    '/missions/': MISSIONS,
    '/phases/': PHASES,
    '/nodes/': NODES,
    '/radios/': RADIOS,
    '/stations/': STATIONS,
    '/snapshots/?node=1': NODE_SNAPSHOTS,
  },
}

/**
 * Load the app with the clock held at [NOW]. Only `Date` is frozen, not the
 * timers behind it: Leaflet and the heat layer paint on their own schedule and
 * would never finish under a stopped clock.
 */
async function loadStable(page: Page, options: BackendOptions = FIXTURES) {
  await page.clock.setFixedTime(NOW)
  return loadApp(page, options)
}

/** A telemetry frame for a node last heard from `agoMinutes` ago. */
function frame(
  node: { node_id: number; node_name: string },
  { agoMinutes = 0, east = 0, north = 0, altitude = 120 } = {},
): SnapshotMessage {
  return {
    ...node,
    captured_at: minutesBefore(agoMinutes),
    position: {
      longitude: MAP_CENTRE.longitude + east,
      latitude: MAP_CENTRE.latitude + north,
      altitude,
    },
  }
}

/** The map's own area, framed without the sidebar or the signal panel. */
function mapArea(page: Page): Locator {
  return page.getByTestId('map-area')
}

/**
 * Wait for the coverage layer to have painted. `leaflet.heat` renders on an
 * animation frame after the map settles, and a screenshot taken before that
 * catches an empty canvas.
 */
async function expectCoveragePainted(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>(
            'canvas.leaflet-heatmap-layer',
          )
          const context = canvas?.getContext('2d')
          if (!canvas || !context) return 0
          const { data } = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          )
          let painted = 0
          for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted++
          return painted
        }),
      { message: 'the coverage layer never painted' },
    )
    .toBeGreaterThan(0)
}

/** Pin a station at the map centre, leaving the roster populated. */
async function pinStation(page: Page) {
  await page.getByTestId('pinning-mode-toggle').click()
  const centre = await mapCentrePoint(page)
  await page.mouse.click(centre.x, centre.y)
  await expect(page.getByTestId('ground-station-form')).toBeVisible()
  await page.getByLabel('Name').fill('Summit Repeater')
  await page.getByLabel(/Altitude/).fill('320')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('ground-station-list')).toBeVisible()
}

test('the live map on load', async ({ page }) => {
  await loadStable(page)
  await expect(page.getByTestId('active-mission-indicator')).toContainText(
    'Alpha Ridge Sweep',
  )
  await expect(page.getByTestId('phase-list')).toBeVisible()
  await expectCoveragePainted(page)

  await expect(page).toHaveScreenshot('live-map.png')
})

test('the coverage heatmap', async ({ page }) => {
  await loadStable(page, { ...FIXTURES, zoom: COVERAGE_ZOOM })
  await expectCoveragePainted(page)

  await expect(mapArea(page)).toHaveScreenshot('coverage-heatmap.png')
})

test('the sidebar with a station on the roster', async ({ page }) => {
  await loadStable(page)
  await pinStation(page)

  await expect(page.getByTestId('sidebar')).toHaveScreenshot('sidebar.png')
})

test('the ground station capture form', async ({ page }) => {
  await loadStable(page)
  await page.getByTestId('pinning-mode-toggle').click()
  const centre = await mapCentrePoint(page)
  await page.mouse.click(centre.x, centre.y)

  await expect(page.getByTestId('ground-station-form')).toHaveScreenshot(
    'station-form.png',
  )
})

test('UAV markers, live and lost', async ({ page }) => {
  const telemetry = await loadStable(page)
  await page.getByLabel('UAV positions').check()

  await telemetry.send(frame({ node_id: 1, node_name: 'UAV Alpha' }))
  // Silent well past the lost timeout, which is the state that paints a
  // permanent label over the map
  await telemetry.send(
    frame(
      { node_id: 2, node_name: 'UAV Bravo' },
      { agoMinutes: 10, east: 0.02, north: -0.01, altitude: 90 },
    ),
  )
  await expect(page.locator('.leaflet-tooltip')).toContainText('UAV Bravo')
  await expectCoveragePainted(page)

  await expect(mapArea(page)).toHaveScreenshot('uav-markers.png')
})

test('a UAV popup', async ({ page }) => {
  const telemetry = await loadStable(page)
  await page.getByLabel('UAV positions').check()
  await telemetry.send(frame({ node_id: 1, node_name: 'UAV Alpha' }))
  await page.locator('img.leaflet-marker-icon').click()
  // Leaflet fades the popup in, and half-faded is not the state to photograph
  await expect(page.locator('.leaflet-popup')).toHaveCSS('opacity', '1')

  await expect(page.locator('.leaflet-popup')).toHaveScreenshot('uav-popup.png')
})

test('the expanded signal history panel', async ({ page }) => {
  await loadStable(page)
  await page.getByTestId('signal-charts-toggle').click()
  await expect(page.getByTestId('signal-chart')).toBeVisible()
  await expect(page.getByTestId('signal-legend')).toBeVisible()
  // Tick labels are the last thing the lazily loaded chart paints
  await expect(
    page.locator('.recharts-cartesian-axis-tick-value').first(),
  ).toBeVisible()

  await expect(page.getByTestId('signal-charts')).toHaveScreenshot(
    'signal-history.png',
  )
})

test('the imperial unit selection', async ({ page }) => {
  await loadStable(page)
  await pinStation(page)
  await page.getByTestId('unit-altitude-ft').click()
  await page.getByTestId('unit-distance-mi').click()
  await expect(page.locator('.leaflet-control-scale-line')).toHaveText(
    /(ft|mi)$/,
  )

  // The unit controls sit below the roster, past the fold of a field laptop's
  // screen, so the panel is scrolled to rather than left where a click on the
  // last button happened to leave it.
  await page
    .getByTestId('sidebar')
    .evaluate((el) => el.scrollTo(0, el.scrollHeight))

  await expect(page.getByTestId('sidebar')).toHaveScreenshot(
    'imperial-sidebar.png',
  )
  await expect(page.locator('.leaflet-control-scale')).toHaveScreenshot(
    'imperial-scale-bar.png',
  )
})

test('the notice for a failed map overlay', async ({ page }) => {
  const telemetry = await loadStable(page)
  await page.getByLabel('UAV positions').check()

  // Leaflet rejects a non-numeric latitude, which crashes the UAV overlay
  // alone — exactly the failure the notice exists to report.
  await telemetry.send({
    ...frame({ node_id: 1, node_name: 'UAV Alpha' }),
    position: { longitude: 172.62, latitude: 'not a latitude', altitude: 120 },
  } as unknown as SnapshotMessage)
  await expect(page.getByTestId('map-degraded')).toBeVisible()
  await expectCoveragePainted(page)

  await expect(mapArea(page)).toHaveScreenshot('degraded-overlay.png')
})

test('a crashed sidebar panel', async ({ page }) => {
  // `results` is what `fetchMissions` hands to `missions.find`, so a string
  // crashes MissionControl's render and nothing else.
  await loadStable(page, {
    ...FIXTURES,
    lists: { ...FIXTURES.lists, '/missions/': 'not a list' as unknown as [] },
  })
  await expect(page.getByTestId('panel-error')).toBeVisible()

  await expect(page.getByTestId('sidebar')).toHaveScreenshot('panel-error.png')
})
