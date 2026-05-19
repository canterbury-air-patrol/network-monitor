import { expect, test } from '@playwright/test'

test('layout renders sidebar and map area', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('sidebar')).toBeVisible()
  await expect(page.getByTestId('map-area')).toBeVisible()
})

test('sidebar shows app title', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('sidebar')).toContainText('Network Monitor')
})
