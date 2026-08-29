import type { Page } from '@playwright/test'
import {
  expect,
  MAP_CENTRE,
  mapCentrePoint,
  markerAnchor,
  pixelsApart,
  test,
  uavMarkers,
  type SnapshotMessage,
} from './harness'

const ALPHA = { node_id: 1, node_name: 'UAV Alpha' }
const BRAVO = { node_id: 2, node_name: 'UAV Bravo' }

/**
 * A frame for `node`, positioned as an offset from the map centre in degrees.
 * Positive `north` and `east` move the marker up and right on screen, which is
 * what the movement assertions read.
 *
 * `captured_at` defaults to now: marker styling ([P3-14]) keys off the age of
 * the newest capture, and these tests are about placement, not staleness.
 */
function frame(
  node: { node_id: number; node_name: string },
  {
    north = 0,
    east = 0,
    altitude = 120,
    ageMs = 0,
  }: { north?: number; east?: number; altitude?: number; ageMs?: number } = {},
): SnapshotMessage {
  return {
    ...node,
    captured_at: new Date(Date.now() - ageMs).toISOString(),
    position: {
      latitude: MAP_CENTRE.latitude + north,
      longitude: MAP_CENTRE.longitude + east,
      altitude,
    },
  }
}

function overlayToggle(page: Page) {
  return page.getByRole('checkbox', { name: 'UAV positions' })
}

test('keeps UAV markers off the map until the overlay is switched on', async ({
  page,
  telemetry,
}) => {
  await telemetry.send(frame(ALPHA))

  // Coverage is the primary display; UAV position is a secondary overlay and
  // ships switched off
  await expect(overlayToggle(page)).not.toBeChecked()
  await expect(uavMarkers(page)).toHaveCount(0)

  await overlayToggle(page).click()

  // The marker appearing now is what proves the frame above was delivered and
  // deliberately withheld, rather than never having arrived at all
  await expect(page.getByTitle(ALPHA.node_name)).toBeVisible()
})

test('places a marker where the node says it is', async ({
  page,
  telemetry,
}) => {
  await overlayToggle(page).click()
  await telemetry.send(frame(ALPHA, { altitude: 145 }))

  const marker = page.getByTitle(ALPHA.node_name)
  await expect(marker).toBeVisible()

  // The node is reporting the map's centre coordinate, so its marker must be
  // drawn on the centre of the map pane
  const centre = await mapCentrePoint(page)
  await expect
    .poll(async () => pixelsApart(await markerAnchor(marker), centre))
    .toBeLessThan(2)

  await marker.click()
  const popup = page.locator('.leaflet-popup-content')
  await expect(popup).toContainText(ALPHA.node_name)
  await expect(popup).toContainText('Live')
  await expect(popup).toContainText('Alt: 145 m')
})

test('moves the marker as the UAV flies, leaving no trail behind', async ({
  page,
  telemetry,
}) => {
  await overlayToggle(page).click()
  await telemetry.send(frame(ALPHA))

  const marker = page.getByTitle(ALPHA.node_name)
  await expect(marker).toBeVisible()
  const start = await markerAnchor(marker)

  await telemetry.send(frame(ALPHA, { north: 0.01, east: 0.01, altitude: 260 }))

  await expect
    .poll(async () => (await markerAnchor(marker)).x)
    .toBeGreaterThan(start.x + 10)
  // Screen y grows downwards, so flying north walks the marker up the pane
  expect((await markerAnchor(marker)).y).toBeLessThan(start.y - 10)

  // The one marker moved; a second was not added for the new position
  await expect(uavMarkers(page)).toHaveCount(1)
  await marker.click()
  await expect(page.locator('.leaflet-popup-content')).toContainText(
    'Alt: 260 m',
  )
})

test('holds position when a device flushes an older buffered snapshot', async ({
  page,
  telemetry,
}) => {
  await overlayToggle(page).click()
  await telemetry.send(frame(ALPHA))

  const marker = page.getByTitle(ALPHA.node_name)
  await expect(marker).toBeVisible()
  const centre = await mapCentrePoint(page)

  // A recovered link carries its buffered backlog with it ([P1-17]); an
  // arrival older than what is on screen must not drag the UAV backwards
  // along its own track
  await telemetry.send(frame(ALPHA, { north: -0.02, east: -0.02, ageMs: 5000 }))

  // Frames are delivered in order, so Bravo showing up means the stale Alpha
  // frame has already been through the store
  await telemetry.send(frame(BRAVO, { north: 0.01 }))
  await expect(page.getByTitle(BRAVO.node_name)).toBeVisible()

  expect(pixelsApart(await markerAnchor(marker), centre)).toBeLessThan(2)
})

test('tracks each UAV separately', async ({ page, telemetry }) => {
  await overlayToggle(page).click()
  await telemetry.send(frame(ALPHA))
  await telemetry.send(frame(BRAVO, { east: 0.02 }))

  const alpha = page.getByTitle(ALPHA.node_name)
  const bravo = page.getByTitle(BRAVO.node_name)
  await expect(uavMarkers(page)).toHaveCount(2)

  const alphaStart = await markerAnchor(alpha)
  const bravoStart = await markerAnchor(bravo)
  expect(bravoStart.x).toBeGreaterThan(alphaStart.x + 10)

  await telemetry.send(frame(BRAVO, { east: 0.04 }))

  await expect
    .poll(async () => (await markerAnchor(bravo)).x)
    .toBeGreaterThan(bravoStart.x + 10)
  expect(pixelsApart(await markerAnchor(alpha), alphaStart)).toBeLessThan(1)
})

test('clears the markers when the overlay is switched off', async ({
  page,
  telemetry,
}) => {
  await overlayToggle(page).click()
  await telemetry.send(frame(ALPHA))
  await expect(uavMarkers(page)).toHaveCount(1)

  await overlayToggle(page).click()
  await expect(uavMarkers(page)).toHaveCount(0)

  // Telemetry keeps arriving while the overlay is hidden, so switching it back
  // on must show the node where it is now, not where it was
  await telemetry.send(frame(ALPHA, { east: 0.02 }))
  await overlayToggle(page).click()

  const marker = page.getByTitle(ALPHA.node_name)
  await expect(marker).toBeVisible()
  const centre = await mapCentrePoint(page)
  expect((await markerAnchor(marker)).x).toBeGreaterThan(centre.x + 10)
})
