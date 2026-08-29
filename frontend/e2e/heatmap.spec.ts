import type { Page } from '@playwright/test'
import {
  expect,
  heatLayer,
  heatPixel,
  loadApp,
  MAP_CENTRE,
  mapCentrePoint,
  test,
  uavMarkers,
  type CoverageSnapshot,
  type Pixel,
  type Point,
} from './harness'

/**
 * `HeatmapLayer` caps its intensity scaling at zoom 17, and below that
 * `leaflet.heat` halves every reading's weight per zoom level. Serving the
 * view at the cap keeps the painted colour a function of RSSI alone, which is
 * what these tests are reading.
 */
const HEAT_ZOOM = 17

/** Degrees one screen pixel spans in Web Mercator at [HEAT_ZOOM]. */
const DEG_PER_PX = 360 / (256 * 2 ** HEAT_ZOOM)

/** An excellent link and a weak one, on the RSSI scale `rssi.ts` maps from. */
const STRONG_DBM = -40
const WEAK_DBM = -85

/** Wider than the 40 px the layer blurs a point over, so blobs stay separable. */
const SEPARATION_PX = 150

interface Report {
  /** Where the snapshot was captured, as a screen offset from the map centre. */
  east?: number
  north?: number
  /** One RSSI per radio link reported from that position. */
  links: number[]
}

/** Snapshots positioned by where they should land on screen, not by coordinate. */
function coverage(...reports: Report[]): CoverageSnapshot[] {
  const latitudeScale = Math.cos((MAP_CENTRE.latitude * Math.PI) / 180)
  return reports.map(({ east = 0, north = 0, links }) => ({
    position: {
      latitude: MAP_CENTRE.latitude + north * DEG_PER_PX * latitudeScale,
      longitude: MAP_CENTRE.longitude + east * DEG_PER_PX,
      altitude: 120,
    },
    radio_readings: links.map((rssi_dbm) => ({ rssi_dbm })),
  }))
}

/** The viewport point a report positioned this way is expected to paint. */
function reportedAt(centre: Point, { east = 0, north = 0 }: Partial<Report>) {
  return { x: centre.x + east, y: centre.y - north }
}

/** What the layer painted at `point`, once it has painted anything there. */
async function painted(page: Page, point: Point): Promise<Pixel> {
  await expect
    .poll(async () => (await heatPixel(page, point)).alpha)
    .toBeGreaterThan(0)
  return heatPixel(page, point)
}

async function expectClear(page: Page, point: Point): Promise<void> {
  expect((await heatPixel(page, point)).alpha).toBe(0)
}

/**
 * Let anything the coverage fetch set off reach the canvas: React renders, the
 * layer hands its points to `leaflet.heat`, which draws on the next frame.
 * Only needed where the expected outcome is an unpainted map, which is also
 * what a map that has not drawn yet looks like.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 5
        const tick = () =>
          frames-- > 0 ? requestAnimationFrame(tick) : resolve()
        tick()
      }),
  )
}

test('shows coverage on load without the operator switching a layer on', async ({
  page,
}) => {
  await loadApp(page, {
    zoom: HEAT_ZOOM,
    coverage: coverage({ links: [STRONG_DBM] }),
  })

  // Coverage is the primary display: unlike the UAV overlay it has no switch,
  // and it is on the map as soon as there are readings to draw
  await expect(heatLayer(page)).toBeVisible()
  await expect(heatLayer(page)).toHaveCount(1)

  const centre = await mapCentrePoint(page)
  await painted(page, centre)

  // Beyond the blur radius the map is left alone, so the paint marks a
  // reported position rather than washing the whole pane
  await expectClear(page, { x: centre.x + SEPARATION_PX, y: centre.y })
})

test('paints nothing where no coverage has been reported', async ({ page }) => {
  const coverageFetched = page.waitForResponse((res) =>
    res.url().includes('/api/v1/snapshots/'),
  )
  await loadApp(page, { zoom: HEAT_ZOOM })

  await expect(heatLayer(page)).toBeVisible()
  await coverageFetched
  await settle(page)

  // An empty answer must read as "no coverage here", not as a layer that
  // failed to load and not as coverage the operator can rely on
  const centre = await mapCentrePoint(page)
  for (const offset of [0, -SEPARATION_PX, SEPARATION_PX])
    await expectClear(page, { x: centre.x + offset, y: centre.y })
})

test('paints a strong link hotter than a weak one', async ({ page }) => {
  const strong = { east: SEPARATION_PX, links: [STRONG_DBM] }
  const weak = { east: -SEPARATION_PX, links: [WEAK_DBM] }
  await loadApp(page, { zoom: HEAT_ZOOM, coverage: coverage(strong, weak) })

  const centre = await mapCentrePoint(page)
  const hot = await painted(page, reportedAt(centre, strong))
  const cold = await painted(page, reportedAt(centre, weak))

  // Both positions report, so both are drawn — the difference an operator
  // reads is the colour: the gradient runs blue at the edge of coverage to red
  // where the link is excellent
  expect(hot.alpha).toBeGreaterThan(cold.alpha)
  expect(hot.red).toBeGreaterThan(hot.blue)
  expect(cold.blue).toBeGreaterThan(cold.red)

  // Neither blob has spread across the gap between them
  await expectClear(page, centre)
})

test('stacks every link reported from the same position', async ({ page }) => {
  const many = { east: SEPARATION_PX, links: Array<number>(4).fill(WEAK_DBM) }
  const one = { east: -SEPARATION_PX, links: [WEAK_DBM] }
  await loadApp(page, { zoom: HEAT_ZOOM, coverage: coverage(many, one) })

  const centre = await mapCentrePoint(page)
  const stacked = await painted(page, reportedAt(centre, many))
  const single = await painted(page, reportedAt(centre, one))

  // Every radio link is its own heat point, so a position holding four weak
  // links reads as well covered, while one holding a single link of the same
  // strength stays at the cold end of the gradient
  expect(stacked.alpha).toBeGreaterThan(single.alpha)
  expect(stacked.red).toBeGreaterThan(stacked.blue)
  expect(single.blue).toBeGreaterThan(single.red)
})

test('keeps the coverage aligned with the map after a pan', async ({
  page,
}) => {
  await loadApp(page, {
    zoom: HEAT_ZOOM,
    coverage: coverage({ links: [STRONG_DBM] }),
  })

  const centre = await mapCentrePoint(page)
  await painted(page, centre)

  const panned = { x: centre.x - SEPARATION_PX, y: centre.y }
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.down()
  await page.mouse.move(panned.x, panned.y, { steps: 10 })
  // Leaflet throws the map into an inertial glide when the pointer is still
  // moving as it lifts, which would carry the coverage past where it is
  // expected below
  await page.waitForTimeout(100)
  await page.mouse.up()

  // The layer redraws from scratch on every `moveend`; the coverage has to
  // come back under the ground it was reported over
  await painted(page, panned)
  await expectClear(page, centre)
})

test('keeps coverage on the map when the UAV overlay is switched on', async ({
  page,
}) => {
  const telemetry = await loadApp(page, {
    zoom: HEAT_ZOOM,
    coverage: coverage({ links: [STRONG_DBM] }),
  })
  const centre = await mapCentrePoint(page)
  const before = await painted(page, centre)

  await page.getByRole('checkbox', { name: 'UAV positions' }).click()
  await telemetry.send({
    node_id: 1,
    node_name: 'UAV Alpha',
    captured_at: new Date().toISOString(),
    position: { ...MAP_CENTRE, altitude: 120 },
  })
  await expect(uavMarkers(page)).toHaveCount(1)

  // The secondary overlay draws over the coverage; it must not disturb it
  expect(await heatPixel(page, centre)).toEqual(before)
})
