import type { Page } from '@playwright/test'
import {
  expect,
  loadApp,
  MAP_CENTRE,
  mapCentrePoint,
  test,
  uavMarkers,
  type SnapshotMessage,
} from './harness'

/** 320 m, which the displays round to 1050 ft. */
const STATION_ALTITUDE_M = '320'

/** 120 m, which the displays round to 394 ft. */
const UAV_ALTITUDE_M = 120

function frame(altitude: number): SnapshotMessage {
  return {
    node_id: 1,
    node_name: 'UAV Alpha',
    captured_at: new Date().toISOString(),
    position: { ...MAP_CENTRE, altitude },
  }
}

/** Pin a station at the map centre, in whatever unit the form is asking for. */
async function pinStation(page: Page, altitude: string) {
  await page.getByTestId('pinning-mode-toggle').click()
  const centre = await mapCentrePoint(page)
  await page.mouse.click(centre.x, centre.y)
  await expect(page.getByTestId('ground-station-form')).toBeVisible()
  await page.getByLabel('Name').fill('Summit Repeater')
  await page.getByLabel(/Altitude/).fill(altitude)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('ground-station-list')).toBeVisible()
}

/** The UAV popup, which reports the node's altitude ([P3-14]). */
async function openUAVPopup(page: Page) {
  await page.getByRole('checkbox', { name: 'UAV positions' }).click()
  await expect(uavMarkers(page)).toHaveCount(1)
  await uavMarkers(page).click()
  return page.locator('.leaflet-popup-content')
}

/** Leaflet draws one scale line per unit system it was asked for. */
function scaleBar(page: Page) {
  return page.locator('.leaflet-control-scale-line')
}

test('shows altitudes and the scale in SI until asked otherwise', async ({
  page,
  telemetry,
}) => {
  await telemetry.send(frame(UAV_ALTITUDE_M))
  await pinStation(page, STATION_ALTITUDE_M)

  await expect(page.getByTestId('unit-altitude-m')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByTestId('ground-station-list')).toContainText('320 m')
  await expect(await openUAVPopup(page)).toContainText('Alt: 120 m')
  await expect(scaleBar(page)).toHaveCount(1)
  await expect(scaleBar(page)).toHaveText(/\d+(\.\d+)?\s?(m|km)$/)
})

test('switches every altitude display to feet at once', async ({
  page,
  telemetry,
}) => {
  await telemetry.send(frame(UAV_ALTITUDE_M))
  await pinStation(page, STATION_ALTITUDE_M)
  const popup = await openUAVPopup(page)

  await page.getByTestId('unit-altitude-ft').click()

  // The map, the roster and the form all follow the one preference — and the
  // stored station is unchanged underneath, so the conversion is the display's
  await expect(popup).toContainText('Alt: 394 ft')
  await expect(page.getByTestId('ground-station-list')).toContainText('1050 ft')
  await page.getByRole('button', { name: 'Edit Summit Repeater' }).click()
  await expect(page.getByLabel(/Altitude/)).toHaveValue('1049.9')
  await expect(page.getByLabel('Altitude (ft)')).toBeVisible()
})

test('takes a new station in feet and shows it back in metres', async ({
  page,
}) => {
  await loadApp(page)
  await page.getByTestId('unit-altitude-ft').click()
  await pinStation(page, '1050')

  await expect(page.getByTestId('ground-station-list')).toContainText('1050 ft')

  await page.getByTestId('unit-altitude-m').click()

  await expect(page.getByTestId('ground-station-list')).toContainText('320 m')
})

test('switches the map scale bar to miles', async ({ page }) => {
  await loadApp(page)
  await expect(scaleBar(page)).toHaveText(/(m|km)$/)

  await page.getByTestId('unit-distance-mi').click()

  await expect(scaleBar(page)).toHaveCount(1)
  await expect(scaleBar(page)).toHaveText(/\d+(\.\d+)?\s?(ft|mi)$/)
})

test('remembers the units for the next session', async ({ page }) => {
  await loadApp(page)
  await pinStation(page, STATION_ALTITUDE_M)
  await page.getByTestId('unit-altitude-ft').click()
  await page.getByTestId('unit-distance-mi').click()

  await page.reload()
  await expect(page.locator('.leaflet-container')).toBeVisible()

  await expect(page.getByTestId('unit-altitude-ft')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByTestId('unit-distance-mi')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByTestId('ground-station-list')).toContainText('1050 ft')
  await expect(scaleBar(page)).toHaveText(/(ft|mi)$/)
})
