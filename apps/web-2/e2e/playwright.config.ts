import { defineConfig, devices } from '@playwright/test'

// The gate run (G-06) targets the built image on the seeded stand: E2E_BASE_URL=https://<stand>.
// Without it the suite drives `vp dev` against the local API (agent iteration, spec 9): E2E_DEV_URL names a running one
// (`just e2e-dev`), else one is started on :3000.
const baseURL = process.env['E2E_BASE_URL'] ?? process.env['E2E_DEV_URL'] ?? 'http://127.0.0.1:3000'
// Fixtures read the stand through the generated SDK, which loads the web's env module: give it the stand's address.
process.env['PUBLIC_ORIGIN'] ??= baseURL
process.env['INTERNAL_API_URL'] ??= baseURL

export default defineConfig({
  testDir: './specs',
  // Against `vp dev`: compiles every route once before the specs (cold first loads, F-2).
  globalSetup: './global-setup.ts',
  // `just e2e[-dev]` gives each run its own (tmp/e2e/<run>/test-results): parallel runs do not delete each other's traces.
  outputDir: process.env['E2E_OUTPUT_DIR'] ?? '../test-results',
  // Short output for agents (8.4): one line per test; a failure prints the trace path, not the trace.
  reporter: 'line',
  // CI: one retry, so one flaky test does not cost a shard rerun (~10 min); the summary still lists it as flaky.
  // Locally a failure fails at once.
  retries: process.env['CI'] ? 1 : 0,
  forbidOnly: true,
  fullyParallel: true,
  use: {
    baseURL,
    locale: 'ru-RU',
    timezoneId: 'Asia/Almaty',
    trace: 'retain-on-failure',
    // E2E_INSECURE=1: the stand's self-signed certificate (https, so the Secure session cookie works; spec 9).
    // The fixtures' Node fetch trusts it through NODE_EXTRA_CA_CERTS (`just web2-e2e`).
    ignoreHTTPSErrors: process.env['E2E_INSECURE'] === '1',
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
