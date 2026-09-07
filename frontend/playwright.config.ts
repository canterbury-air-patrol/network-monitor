import { defineConfig, devices } from '@playwright/test'

/**
 * The visual regression project ([P12-02]) compares against baselines
 * committed to the repository, and a screenshot is only reproducible in the
 * environment that rendered it: font rasterisation, the bundled fonts
 * themselves and Chromium's build all move the pixels. That environment is the
 * pinned `mcr.microsoft.com/playwright` image, which `run-e2e.sh` and CI both
 * run the suite in — and which is what sets `PLAYWRIGHT_VISUAL`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  // One baseline per screen state, not one per platform: the reference
  // environment is pinned, so a platform suffix would only invite a second set
  // of baselines nobody can regenerate.
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      // Text and canvas edges land on a slightly different subpixel between
      // runs; a handful of pixels is antialiasing, a changed control is not.
      maxDiffPixelRatio: 0.002,
      // Tighter than the 0.2 default, which passes a colour shift big enough
      // to matter here: the display codes link state by colour, so a marker
      // that changes shade has changed meaning.
      threshold: 0.05,
      // Baselines are stored at CSS size, so a host with a scaled display
      // still compares against the same image.
      scale: 'css',
      animations: 'disabled',
      caret: 'hide',
    },
  },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /visual\.spec\.ts/,
    },
    {
      name: 'visual',
      testMatch: /visual\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        // Everything the screenshots depend on is stated rather than
        // inherited: the viewport frames the layout, the pixel ratio fixes the
        // raster, and the clock labels in the signal panel are formatted by
        // the browser's locale and zone.
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
