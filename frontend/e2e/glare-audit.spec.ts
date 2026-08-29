import { expect, test } from '@playwright/test'
import { loadApp, mapCentrePoint, type SnapshotMessage } from './harness'
import { auditGlare, expectGlareReady } from './glare'

/**
 * The "High-Glare" UI audit ([P3-16]).
 *
 * Every screen state the operator can reach in the field is walked with the
 * probe in `glare.ts`: text has to clear WCAG AA against what is really
 * painted behind it, and every control has to be 44 px in both directions so
 * it can be hit with gloves on. Because the probe reads the rendered page, a
 * new panel is covered the moment a test opens it — the audit does not go
 * stale the way a checklist of class names would.
 */

/**
 * OpenStreetMap's attribution. It is the tile provider's required credit, a
 * line of inline legal text rather than a control the operator ever uses, and
 * Leaflet renders it at a fixed size we do not own.
 */
const EXCLUDE = ['.leaflet-control-attribution']

const MISSIONS = [
  {
    id: 1,
    name: 'Alpha Ridge Sweep',
    operator_notes: '',
    status: 'active',
    created_at: '2026-08-30T01:00:00Z',
    updated_at: '2026-08-30T01:00:00Z',
  },
  {
    id: 2,
    name: 'Bravo Valley',
    operator_notes: '',
    status: 'pending',
    created_at: '2026-08-30T01:00:00Z',
    updated_at: '2026-08-30T01:00:00Z',
  },
]

const PHASES = [
  {
    id: 11,
    mission: 1,
    name: 'Ingress',
    area_of_operation_notes: '',
    ground_station_layout: '',
    started_at: '2026-08-30T01:05:00Z',
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

/** Two captures per link, so the trace has a line rather than a single dot. */
const NODE_SNAPSHOTS = [
  {
    id: 91,
    node: 1,
    captured_at: '2026-08-30T01:10:00Z',
    received_at: '2026-08-30T01:10:01Z',
    position: { longitude: 172.62, latitude: -43.53, altitude: 120 },
    radio_readings: [
      {
        id: 901,
        radio: 5,
        ground_station: 3,
        relay_node: null,
        band: '2.4GHz',
        rssi_dbm: -62,
        snr_db: 18,
      },
    ],
  },
  {
    id: 92,
    node: 1,
    captured_at: '2026-08-30T01:11:00Z',
    received_at: '2026-08-30T01:11:01Z',
    position: { longitude: 172.621, latitude: -43.531, altitude: 122 },
    radio_readings: [
      {
        id: 902,
        radio: 5,
        ground_station: 3,
        relay_node: null,
        band: '2.4GHz',
        rssi_dbm: -71,
        snr_db: 11,
      },
    ],
  },
]

const FIXTURES = {
  lists: {
    '/missions/': MISSIONS,
    '/phases/': PHASES,
    '/nodes/': NODES,
    '/radios/': RADIOS,
    '/stations/': STATIONS,
    '/snapshots/?node=1': NODE_SNAPSHOTS,
  },
}

/** Pin a station at the map centre and name it, leaving the roster populated. */
async function pinStation(page: import('@playwright/test').Page) {
  await page.getByTestId('pinning-mode-toggle').click()
  const centre = await mapCentrePoint(page)
  await page.mouse.click(centre.x, centre.y)
  await expect(page.getByTestId('ground-station-form')).toBeVisible()
  await page.getByLabel('Name').fill('Summit Repeater')
  await page.getByLabel('Altitude (m)').fill('320')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('ground-station-list')).toBeVisible()
}

test('the live map and sidebar are glare-ready on load', async ({ page }) => {
  await loadApp(page, FIXTURES)
  await expect(page.getByTestId('active-mission-indicator')).toContainText(
    'Alpha Ridge Sweep',
  )
  await expect(page.getByTestId('phase-list')).toBeVisible()

  const report = await expectGlareReady(page, { exclude: EXCLUDE })
  // A state that rendered nothing would pass both checks in silence
  expect(report.counted.targets).toBeGreaterThan(5)
  expect(report.counted.contrast).toBeGreaterThan(10)
})

test('the ground station form is glare-ready', async ({ page }) => {
  await loadApp(page, FIXTURES)
  await page.getByTestId('pinning-mode-toggle').click()
  const centre = await mapCentrePoint(page)
  await page.mouse.click(centre.x, centre.y)
  await expect(page.getByTestId('ground-station-form')).toBeVisible()

  // Pinning mode also restyles the sidebar button, so audit the whole page
  await expectGlareReady(page, { exclude: EXCLUDE })
})

test('the station roster and its edit form are glare-ready', async ({
  page,
}) => {
  await loadApp(page, FIXTURES)
  await pinStation(page)

  await expectGlareReady(page, { exclude: EXCLUDE })

  await page.getByRole('button', { name: 'Edit Summit Repeater' }).click()
  await expect(page.getByTestId('ground-station-form')).toBeVisible()
  await expectGlareReady(page, { exclude: EXCLUDE })
})

test('the station map popup is glare-ready', async ({ page }) => {
  await loadApp(page, FIXTURES)
  await pinStation(page)

  // The station's mast glyph is a divIcon; Leaflet's teardrop is an <img>
  await page.locator('div.leaflet-marker-icon').first().click()
  // Leaflet fades the popup in, and half-faded text is not what ships
  await expect(page.locator('.leaflet-popup')).toHaveCSS('opacity', '1')

  await expectGlareReady(page, { root: '.leaflet-popup' })
})

test('the expanded signal history panel is glare-ready', async ({ page }) => {
  await loadApp(page, FIXTURES)
  await page.getByTestId('signal-charts-toggle').click()
  await expect(page.getByTestId('signal-chart')).toBeVisible()
  await expect(page.getByTestId('signal-legend')).toBeVisible()
  // Tick labels are the last thing the lazy chart chunk paints
  await expect(
    page.locator('.recharts-cartesian-axis-tick-value').first(),
  ).toBeVisible()

  await expectGlareReady(page, { root: '[data-testid="signal-charts"]' })
})

test('a crashed panel reports itself legibly', async ({ page }) => {
  // `results` is what `fetchMissions` hands to `missions.find`, so a string
  // crashes MissionControl's render and nothing else.
  await loadApp(page, {
    ...FIXTURES,
    lists: { ...FIXTURES.lists, '/missions/': 'not a list' as unknown as [] },
  })
  await expect(page.getByTestId('panel-error')).toBeVisible()

  await expectGlareReady(page, { exclude: EXCLUDE })
})

test('the degraded-overlay notice over the map is glare-ready', async ({
  page,
}) => {
  const telemetry = await loadApp(page, FIXTURES)
  await page.getByLabel('UAV positions').check()

  // Leaflet rejects a non-numeric latitude, which crashes the UAV overlay
  // alone — exactly the failure the notice exists to report.
  await telemetry.send({
    node_id: 1,
    node_name: 'UAV Alpha',
    captured_at: new Date().toISOString(),
    position: {
      longitude: 172.62,
      latitude: 'not a latitude',
      altitude: 120,
    },
  } as unknown as SnapshotMessage)
  await expect(page.getByTestId('map-degraded')).toBeVisible()

  await expectGlareReady(page, { exclude: EXCLUDE })
})

test('UAV markers are glare-ready, live and stale alike', async ({ page }) => {
  const telemetry = await loadApp(page, FIXTURES)
  await page.getByLabel('UAV positions').check()

  const captured = (agoMs: number) => new Date(Date.now() - agoMs).toISOString()

  await telemetry.send({
    node_id: 1,
    node_name: 'UAV Alpha',
    captured_at: captured(0),
    position: { longitude: 172.62, latitude: -43.53, altitude: 120 },
  })
  // Far enough back that the node reads as lost, which is the state that
  // paints a permanent label over the map
  await telemetry.send({
    node_id: 2,
    node_name: 'UAV Bravo',
    captured_at: captured(60 * 60 * 1000),
    position: { longitude: 172.63, latitude: -43.54, altitude: 90 },
  })
  await expect(page.locator('.leaflet-tooltip')).toContainText('UAV Bravo')

  // A broken icon still measures 44 px and still passes every contrast check
  // — the browser just draws the alt text where the teardrop should be — so
  // the live marker is asked whether its image actually decoded.
  const teardrop = page.locator('img.leaflet-marker-icon')
  await expect(teardrop).toHaveCount(1)
  expect(
    await teardrop.evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0)

  await expectGlareReady(page, { exclude: EXCLUDE })
})

test('the probe measures contrast and target size correctly', async ({
  page,
}) => {
  await page.setContent(`
    <div style="background: #1e293b; padding: 8px">
      <p style="color: rgba(255, 255, 255, 0.4); font-size: 12px">faint</p>
      <p style="color: #ffffff; font-size: 12px">bright</p>
      <button style="width: 40px; height: 40px">small</button>
      <button style="width: 44px; height: 44px">big</button>
    </div>
  `)

  const report = await auditGlare(page)

  expect(report.contrast.map((f) => f.sample)).toEqual(['faint'])
  // White at 40% over #1e293b is about 3.6:1 — under AA, above AA-large
  expect(report.contrast[0].ratio).toBeGreaterThan(3.4)
  expect(report.contrast[0].ratio).toBeLessThan(3.8)
  expect(report.targets.map((f) => f.element)).toEqual([
    expect.stringContaining('"small"'),
  ])
})
