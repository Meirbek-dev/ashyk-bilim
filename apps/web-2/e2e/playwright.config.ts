import { defineConfig, devices } from '@playwright/test'

// The gate run (G-06) targets the built image on the seeded stand: E2E_BASE_URL=https://<stand>.
// Without it the suite drives `vp dev` against the local API (agent iteration, spec 9).
const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:3000'
// Fixtures read the stand through the generated SDK, which loads the web's env module: give it the stand's address.
process.env['PUBLIC_ORIGIN'] ??= baseURL
process.env['INTERNAL_API_URL'] ??= baseURL

export default defineConfig({
  testDir: './specs',
  outputDir: '../test-results',
  // Short output for agents (8.4): one line per test; a failure prints the trace path, not the trace.
  reporter: 'line',
  retries: 0,
  forbidOnly: true,
  fullyParallel: true,
  use: {
    baseURL,
    locale: 'ru-RU',
    timezoneId: 'Asia/Almaty',
    trace: 'retain-on-failure',
    // The stand serves a self-signed certificate so that Secure cookies work (spec 9).
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'firefox', grep: /@smoke/, use: devices['Desktop Firefox'] },
    { name: 'webkit', grep: /@smoke/, use: devices['Desktop Safari'] },
  ],
  webServer: process.env['E2E_BASE_URL']
    ? undefined
    : { command: 'vp dev', cwd: '..', url: baseURL, reuseExistingServer: true, timeout: 120_000 },
})
